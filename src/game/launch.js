// Launch model: player input -> initial physical conditions.
//
// Charge: holding the charge input winds the drive (rate set by launcher,
// cable length and traits). Release timing is judged against a perfect window
// near 92% charge; past 100% the launch is overcharged (more energy, more
// angle error, extra wear) until the misfire point. Energy determines spin via
// E = 1/2 I3 w^2. Aim (launch position, launcher lean and direction) plus
// technique and equipment condition set the initial axis tilt and velocity.

import { Vec3, clamp, DEG } from '../core/math.js';
import { LAUNCHER_INDEX, CABLE_INDEX, TECHNIQUE_INDEX } from '../data/launchers.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { TUNING_INDEX } from '../data/tuning.js';
import { UPGRADE_INDEX } from '../data/upgrades.js';
import * as dm from '../core/dmath.js';

export const PERFECT_CENTER = 0.92;
export const BASE_MISFIRE = 1.12;
export const MAX_LEAN = 25 * DEG;
export const LAUNCH_RING = 0.13; // max launch radius (m)

const condOf = (cur, max = 100) => clamp((cur ?? max) / max, 0, 1);

// Merge launcher + cable items (or bases) into effective launch gear.
export function resolveLaunchGear(launcher, cable, extra = {}) {
  const lBase = launcher?.base ? (launcher.def || LAUNCHER_INDEX[launcher.base]) : launcher || LAUNCHER_INDEX.launcher_spark;
  const cBase = cable?.base ? CABLE_INDEX[cable.base] : cable || CABLE_INDEX.cable_standard;
  const L = structuredClone(lBase);
  const C = structuredClone(cBase);
  if (launcher?.stats) Object.assign(L, structuredClone(launcher.stats));
  if (cable?.stats) Object.assign(C, structuredClone(cable.stats));
  const mods = { power: 0, window: 0, consistency: 0, chargeRate: 0, perfectBonus: 0, missPenalty: 0, techniqueVar: 0, controlledConsistency: 0, overcharge: 0, wear: 0, overchargeWear: 0 };
  const addLaunch = (o) => { if (o) for (const k in o) mods[k] = (mods[k] || 0) + o[k]; };
  addLaunch(L.mods); // built into the launcher itself (classic series)
  for (const it of [launcher, cable]) {
    if (!it?.base) continue;
    const seen = new Map();
    for (const t of [...(it.traits || []), ...(it.special ? [it.special] : [])]) {
      const d = TRAIT_INDEX[t.id];
      if (!d?.launch) continue;
      if (!seen.has(t.id) || seen.get(t.id).mag < t.mag) seen.set(t.id, t);
    }
    for (const t of seen.values()) addLaunch(TRAIT_INDEX[t.id].launch(t.mag ?? 1));
    for (const tu of it.tuning || []) addLaunch(TUNING_INDEX[tu]?.launch);
    for (const u of it.upgrades || []) addLaunch(UPGRADE_INDEX[u]?.launch);
  }
  addLaunch(extra.launchMods);
  // per-component wear
  const lp = launcher?.parts || {};
  const drive = condOf(lp.drive), trigger = condOf(lp.trigger), grip = condOf(lp.grip);
  const body = launcher?.maxDurability ? condOf(launcher.durability, launcher.maxDurability) : 1;
  const cableC = cable?.maxDurability ? condOf(cable.durability, cable.maxDurability) : 1;
  return {
    launcher: L, cable: C, mods,
    condition: { drive, trigger, grip, body, cable: cableC },
    spinMech: L.spinMech,
    fixedPower: !!L.fixedPower, // wound spring: charge stops at 100%
    speedMul: L.speedMul || 1,
    readout: !!L.readout,
    // physical outputs
    energyMax: L.drive.force * C.length * L.transfer.efficiency * C.efficiency * (0.8 + 0.2 * drive) * (0.9 + 0.1 * cableC) * (1 + mods.power),
    chargeRate: L.chargeRate * (0.3 / C.length) * (1 + mods.chargeRate) * (0.85 + 0.15 * body),
    window: L.trigger.window * (1 + mods.window) * (0.6 + 0.4 * trigger),
    jitter: L.trigger.jitter * (1 + (1 - trigger) * 2),
    // angle error (radians, 1 sigma)
    sigma: (5.5 * DEG) * (1.35 - L.grip.stability) * (1.35 - C.directional) * (1 + (1 - grip) * 1.2) * (1 + (1 - cableC) * 1.5)
      * Math.max(0.3, 1 - mods.consistency) * (L.stabilizer ? 1 - L.stabilizer.tiltReduce : 1),
    misfire: L.fixedPower ? 1 : BASE_MISFIRE + mods.overcharge,
  };
}

export function techniqueWindow(gear, techId) {
  const T = TECHNIQUE_INDEX[techId] || TECHNIQUE_INDEX.normal;
  return gear.window * T.window;
}

// Real-time charge meter driven by the hold input.
export class ChargeMeter {
  constructor(gear, techId) {
    this.gear = gear;
    this.tech = TECHNIQUE_INDEX[techId] || TECHNIQUE_INDEX.normal;
    this.charge = 0;
    this.holding = false;
    this.released = false;
    this.window = techniqueWindow(gear, this.tech.id);
  }
  setTechnique(techId) {
    this.tech = TECHNIQUE_INDEX[techId] || TECHNIQUE_INDEX.normal;
    this.window = techniqueWindow(this.gear, this.tech.id);
  }
  update(dt, holding, triggerAmount = 1) {
    if (this.released) return this.charge;
    this.holding = holding;
    if (holding) {
      const rate = this.gear.chargeRate * (this.charge > 1 ? 0.55 : 1) * clamp(0.35 + 0.65 * triggerAmount, 0.35, 1);
      this.charge = Math.min(this.gear.fixedPower ? 1 : this.gear.misfire + 0.05, this.charge + rate * dt);
    } else if (this.charge > 0) {
      // charge bleeds off if the player lets go of the trigger without releasing
      this.charge = Math.max(0, this.charge - 0.4 * dt);
    }
    return this.charge;
  }
  zones() {
    return { perfectLo: PERFECT_CENTER - this.window, perfectHi: PERFECT_CENTER + this.window, over: 1, misfire: this.gear.misfire };
  }
}

// Judge a release at charge c. Returns timing data used by computeLaunch.
export function judgeRelease(gear, techId, c) {
  const T = TECHNIQUE_INDEX[techId] || TECHNIQUE_INDEX.normal;
  const w = techniqueWindow(gear, techId);
  const dev = c - PERFECT_CENTER;
  let label, energyMul, varMul;
  if (!gear.fixedPower && c >= gear.misfire) { label = 'Misfire'; energyMul = 0.45; varMul = 3.2; }
  else if (Math.abs(dev) <= w) { label = 'Perfect'; energyMul = c + 0.04 + gear.mods.perfectBonus; varMul = 0.35; }
  else if (c > 1) { label = 'Overcharge'; energyMul = 1 + (c - 1) * 1.25; varMul = 1 + (c - 1) * 9; }
  else if (c >= 0.75) { label = 'Good'; energyMul = c; varMul = 1 + gear.mods.missPenalty; }
  else { label = 'Weak'; energyMul = Math.max(0.25, c); varMul = 1.35 + gear.mods.missPenalty; }
  if (T.perfectOnly && label !== 'Perfect') varMul *= 2.4;
  return { label, energyMul, varMul, deviation: dev, window: w, perfect: label === 'Perfect' };
}

// Compute the physical launch.
//  aim: { x, z, lean (rad), dir (rad) }   spinDir: 'R' | 'L'
export function computeLaunch({ gear, techId, charge, aim, spinDir, topSpec, rng, arena, opponentAim, skillMods }) {
  const T = TECHNIQUE_INDEX[techId] || TECHNIQUE_INDEX.normal;
  const judge = judgeRelease(gear, techId, charge);
  // release jitter: the actual release point wobbles by trigger jitter
  const cEff = clamp(charge + rng.gauss(0, gear.jitter * 0.5), 0, gear.fixedPower ? 1 : gear.misfire + 0.1);
  let energy = gear.energyMax * T.power * judge.energyMul * (cEff / Math.max(0.01, charge));
  if (T.perfectOnly && judge.perfect) energy *= 1.0;
  if (T.perfectOnly && !judge.perfect) energy *= 0.85;
  energy *= 1 + (skillMods?.launchPower || 0);
  energy = clamp(energy, 0.15, 5.5);
  const spinSign = spinDir === 'L' ? 1 : -1;
  const spin = spinSign * Math.sqrt((2 * energy) / topSpec.I3);

  // angle error
  let techVar = T.var;
  if (T.id === 'controlled') techVar *= Math.max(0.3, 1 - (gear.mods.controlledConsistency || 0));
  if (T.adv || T.id !== 'normal') techVar *= Math.max(0.4, 1 + gear.mods.techniqueVar);
  techVar *= gear.cable.compat?.[T.id] ?? 1;
  const sigma = gear.sigma * techVar * judge.varMul * Math.max(0.3, 1 - (skillMods?.launchConsistency || 0));
  const errMag = Math.abs(rng.gauss(0, sigma));
  const errDir = rng.range(0, Math.PI * 2);

  // intended lean (technique scales it), phantom perfect = upright
  let lean = clamp(clamp(aim.lean, 0, MAX_LEAN) * T.lean, 0, MAX_LEAN);
  if (T.perfectOnly && judge.perfect) lean = 0;
  const lx = dm.sin(lean) * dm.cos(aim.dir) + dm.sin(errMag) * dm.cos(errDir);
  const lz = dm.sin(lean) * dm.sin(aim.dir) + dm.sin(errMag) * dm.sin(errDir);
  const ly = Math.sqrt(Math.max(0.05, 1 - lx * lx - lz * lz));
  const axis = new Vec3(lx, ly, lz).normalize();
  const totalTilt = dm.acos(clamp(axis.y, -1, 1));

  // position (clamped to the launch ring)
  let px = aim.x, pz = aim.z;
  const pr = dm.hypot(px, pz);
  const maxR = Math.min(LAUNCH_RING, arena.radius * 0.62);
  if (pr > maxR) { px *= maxR / pr; pz *= maxR / pr; }
  const floorY = arena.heightAtR(dm.hypot(px, pz));
  const tipPos = new Vec3(px, floorY + 0.012, pz);

  // initial velocity: launch speed along the lean direction, technique-shaped
  const baseSpeed = 0.15 + 0.9 * dm.sin(lean);
  let vx = dm.cos(aim.dir) * baseSpeed * T.speed * 0.6;
  let vz = dm.sin(aim.dir) * baseSpeed * T.speed * 0.6;
  if (T.tangential) {
    const r = Math.max(0.02, dm.hypot(px, pz));
    const s = 0.6 * T.speed * 0.6 * (-spinSign);
    vx = (-pz / r) * s; vz = (px / r) * s;
  }
  if (T.aimed && opponentAim) {
    const dx = opponentAim.x - px, dz = opponentAim.z - pz;
    const d = Math.max(0.01, dm.hypot(dx, dz));
    const s = 1.0;
    vx = (dx / d) * s; vz = (dz / d) * s;
  }
  // a catapult launcher throws the top out faster
  vx *= gear.speedMul || 1; vz *= gear.speedMul || 1;
  // angle error also kicks the release sideways
  vx += dm.sin(errMag) * dm.cos(errDir) * 0.8;
  vz += dm.sin(errMag) * dm.sin(errDir) * 0.8;
  const velocity = new Vec3(vx, -0.25, vz);

  let label = judge.label;
  const poorAngle = totalTilt > 16 * DEG && !(T.id === 'bank' || T.id === 'lance');
  // wear (fractions of 100-point durability)
  const tw = T.wear * (1 + (gear.mods.wear || 0));
  let wDrive = 0.12 * tw, wTrigger = 0.1 * tw, wGrip = 0.06 * tw, wCable = 0.15 * tw;
  if (label === 'Overcharge') { wDrive *= 5; wCable *= 6 * (1 + (gear.mods.overchargeWear || 0)); wTrigger *= 3; }
  if (label === 'Misfire') { wDrive *= 4; wCable *= 14; wTrigger *= 6; }

  return {
    spin, axis, velocity, tipPos, energy,
    quality: {
      label, perfect: judge.perfect, poorAngle, charge, deviation: judge.deviation, window: judge.window,
      tiltDeg: totalTilt / DEG, errorDeg: errMag / DEG, technique: T.id, techniqueName: T.name,
      techniqueSuccess: T.adv ? (T.perfectOnly ? judge.perfect : judge.label === 'Perfect' || judge.label === 'Good') : null,
    },
    wear: { drive: wDrive, trigger: wTrigger, grip: wGrip, cable: wCable },
  };
}

// AI release model: aims for the perfect centre with a skill-dependent error.
export function aiReleaseCharge(rng, skill, gear, techId, risk = 0) {
  const w = techniqueWindow(gear, techId);
  const target = PERFECT_CENTER + risk * 0.06;
  const sd = (1 - skill) * 0.09 + 0.004;
  let c = target + rng.gauss(0, sd);
  // skilled AIs never hold into a misfire on purpose
  c = clamp(c, 0.4, gear.misfire - 0.01 * skill);
  return { charge: c, window: w };
}
