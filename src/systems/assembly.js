// Top assembly: converts a set of part instances into the physical spec used
// by the simulation (mass, centre of mass, inertia, contact layers, tip,
// lock) and validates architecture compatibility.
//
// Inputs are either base part definitions or item instances
// ({ base, stats, traits, durability, maxDurability, tuning, ... }).
// Durability, rolled stats, physical traits and tuning all change the
// numbers here, so the simulation always runs on the actual assembled object.

import { PART_INDEX, ARCHITECTURES, SLOTS } from '../data/parts.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { TUNING_INDEX } from '../data/tuning.js';
import { UPGRADE_INDEX } from '../data/upgrades.js';
import { DEG } from '../core/math.js';
import { GRAVITY } from '../physics/topBody.js';

const MM = 0.001;
const G = 0.001;

export function conditionOf(item) {
  if (!item || item.maxDurability == null) return 1;
  return Math.max(0, Math.min(1, item.durability / item.maxDurability));
}

export function conditionBand(c) {
  if (c >= 0.9) return { id: 'pristine', name: 'Pristine' };
  if (c >= 0.7) return { id: 'good', name: 'Good' };
  if (c >= 0.45) return { id: 'worn', name: 'Worn' };
  if (c >= 0.2) return { id: 'damaged', name: 'Damaged' };
  return { id: 'critical', name: 'Critical' };
}

// Merge base definition + rolled stats + physical traits + tuning + wear.
export function resolvePart(entry) {
  if (!entry) return null;
  const isItem = !!entry.base;
  const base = isItem ? PART_INDEX[entry.base] : entry;
  if (!base) throw new Error('Unknown part base ' + entry.base);
  const def = structuredClone(base);
  const notes = [];
  if (isItem) {
    if (entry.stats) for (const [k, v] of Object.entries(entry.stats)) def[k] = v;
    // physical traits change the part itself
    for (const t of entry.traits || []) applyPhysicalTrait(def, t, notes);
    if (entry.special) applyPhysicalTrait(def, entry.special, notes);
    for (const tu of entry.tuning || []) {
      const td = TUNING_INDEX[tu];
      if (td && td.apply) { td.apply(def); notes.push(td.name); }
    }
    for (const u of entry.upgrades || []) {
      const ud = UPGRADE_INDEX[u];
      if (ud && ud.apply) { ud.apply(def); notes.push(ud.name); }
    }
  }
  const c = isItem ? conditionOf(entry) : 1;
  applyWear(def, c);
  def._condition = c;
  def._notes = notes;
  def._item = isItem ? entry : null;
  return def;
}

function applyPhysicalTrait(def, t, notes) {
  const td = TRAIT_INDEX[t.id];
  if (!td || td.kind !== 'physical' || !td.physical) return;
  td.physical(def, t.mag ?? 1);
  notes.push(td.name);
}

function applyWear(def, c) {
  const w = 1 - c;
  if (w <= 0) return;
  switch (def.slot) {
    case 'ring':
      def.faceAngle = (def.faceAngle || 0) * (0.72 + 0.28 * c); // chipped blade faces
      def.restitution *= 0.86 + 0.14 * c;
      def.ecc = (def.ecc || 0) + w * 0.14; // material loss unbalances the ring
      break;
    case 'disc':
      def.ecc = (def.ecc || 0) + w * 0.1; // bent disc
      break;
    case 'core':
      def.ecc = (def.ecc || 0) + w * 0.06;
      break;
    case 'lock':
      def.threshold *= 0.55 + 0.45 * c; // worn teeth slip sooner
      break;
    case 'tip':
      if (def.wear === 'sharp') { def.ballRadius += w * 1.0; def.patchRadius += w * 0.25; def.mu *= 1 + w * 0.5; }
      else if (def.wear === 'ball') { def.flatRadius += w * 1.4; def.patchRadius += w * 0.2; }
      else if (def.wear === 'flat') { def.flatRadius += w * 0.6; def.mu *= 0.88 + 0.12 * c; }
      else if (def.wear === 'rubber') { def.mu *= 0.68 + 0.32 * c; def.patchRadius += w * 0.2; }
      break;
    case 'aux':
      def._auxStrength = 0.55 + 0.45 * c;
      break;
    default:
  }
}

// ------------------------------------------------------------------ validation

export function validateBuild(build, opts = {}) {
  const errors = [], warnings = [];
  const P = {};
  for (const slot of SLOTS) {
    if (build[slot]) {
      try { P[slot] = resolvePart(build[slot]); } catch (e) { errors.push(e.message); }
    }
  }
  for (const req of ['ring', 'core', 'disc', 'lock', 'tip']) {
    if (!P[req]) errors.push(`Missing ${req === 'ring' ? 'attack ring' : req === 'tip' ? 'performance tip' : req}.`);
  }
  if (errors.length) return { ok: false, errors, warnings, parts: P };
  const arch = P.core.arch;
  const A = ARCHITECTURES[arch];
  if (!P.ring.arch.includes(arch)) errors.push(`${P.ring.name} does not fit the ${A.name} frame of ${P.core.name}.`);
  if (!P.lock.arch.includes(arch)) errors.push(`${P.lock.name} does not fit the ${A.name} frame.`);
  if (P.tip.socket !== P.lock.tipSocket) {
    errors.push(`${P.tip.name} needs a ${P.tip.socket}-socket lock; ${P.lock.name} has a ${P.lock.tipSocket} socket.`);
  }
  if (A.maxDiscThickness && P.disc.thickness > A.maxDiscThickness + 1e-9) {
    errors.push(`${P.disc.name} (${P.disc.thickness.toFixed(1)} mm) is too thick for the ${A.name} frame (max ${A.maxDiscThickness} mm).`);
  }
  if (P.aux) {
    if (P.aux.mount === 'skirt' && !P.disc.auxPort) errors.push(`${P.aux.name} needs a disc with a skirt mount (e.g. Orbit Disc).`);
    if (P.aux.mount === 'band' && !P.lock.auxPort) errors.push(`${P.aux.name} needs a lock with a band mount (e.g. Stabilizer Lock).`);
    if (P.aux.mount === 'crown' && arch === 'apex') errors.push(`${P.aux.name} cannot be mounted on the low Apex frame.`);
  }
  const mass = SLOTS.reduce((s, k) => s + (P[k]?.mass || 0), 0);
  if (mass > A.maxMass + 1e-9) errors.push(`Total mass ${mass.toFixed(1)} g exceeds the ${A.name} limit of ${A.maxMass} g.`);
  // warnings
  const spin = opts.spin;
  if (spin && P.ring.spin !== 'dual' && P.ring.spin !== spin) {
    warnings.push(`${P.ring.name} is designed for ${P.ring.spin === 'R' ? 'right' : 'left'} spin; a ${spin === 'R' ? 'right' : 'left'}-spin launch strikes with the trailing ramps instead of the blade faces.`);
  }
  if (opts.launcher) {
    const lm = opts.launcher.spinMech;
    if (spin && lm !== 'dual' && lm !== spin) errors.push(`The launcher's spin mechanism only launches ${lm === 'R' ? 'right' : 'left'} spin.`);
  }
  for (const k of SLOTS) {
    const p = P[k];
    if (p && p._item && p._item.durability <= 0) errors.push(`${p.name} is broken — repair it in the Workshop (Basic Service is free).`);
    else if (p && p._condition < 0.2) warnings.push(`${p.name} is in Critical condition — its physical properties are degraded.`);
  }
  if (P.core.ecc + (P.disc.ecc || 0) > 0.3) warnings.push('Strong mass imbalance: expect vibration and an erratic path.');
  return { ok: errors.length === 0, errors, warnings, parts: P, mass };
}

// ------------------------------------------------------------------ assembly

function annulusK(rIn, rOut, dist) {
  const ku = 0.5 * (rIn * rIn + rOut * rOut);
  if (dist >= 0) return ku + dist * (rOut * rOut - ku);
  return ku + dist * (ku - rIn * rIn);
}

export function assembleTop(build, opts = {}) {
  const v = validateBuild(build, opts);
  if (!v.ok && !opts.force) {
    const err = new Error('Invalid build: ' + v.errors.join(' '));
    err.validation = v;
    throw err;
  }
  const P = v.parts;
  const arch = ARCHITECTURES[P.core.arch];
  const bodies = []; // { name, m, z, Ia, It, ecc }

  // stack heights (mm), tip end at z = 0
  const tipLen = P.tip.length;
  const lockH = P.lock.height * (arch.heightMul ?? 1);
  const zTip = tipLen * 0.55;
  const zLock0 = tipLen;
  const zDisc0 = zLock0 + lockH * 0.75; // disc sits over the lock's upper flange
  const zRing0 = zDisc0 + P.disc.thickness * 0.85;
  const zRingC = zRing0 + P.ring.thickness * 0.5;
  const zCore0 = zRing0 + P.ring.thickness * 0.35;

  const push = (name, mG, zMm, Ia, It, eccMm = 0) => bodies.push({ name, m: mG * G, z: zMm * MM, Ia, It, ecc: eccMm * MM });

  // tip: solid cylinder
  {
    const m = P.tip.mass * G, r = P.tip.bodyRadius * 0.7 * MM, L = tipLen * MM;
    push('tip', P.tip.mass, zTip, 0.5 * m * r * r, (m * (3 * r * r + L * L)) / 12);
  }
  // lock: thick-walled cylinder
  {
    const m = P.lock.mass * G, r1 = P.lock.radius * 0.45 * MM, r2 = P.lock.radius * MM, H = lockH * MM;
    const ka = annulusK(r1, r2, 0);
    push('lock', P.lock.mass, zLock0 + lockH * 0.5, m * ka, 0.5 * m * ka + (m * H * H) / 12);
  }
  // disc
  {
    const m = P.disc.mass * G, r1 = P.disc.rIn * MM, r2 = P.disc.rOut * MM, T = P.disc.thickness * MM;
    const ka = annulusK(r1, r2, P.disc.massDist);
    push('disc', P.disc.mass, zDisc0 + P.disc.thickness * 0.5, m * ka, 0.5 * m * ka + (m * T * T) / 12, P.disc.ecc || 0);
  }
  // ring (blade mass: use mean of base and tip radius for the outer edge)
  {
    const m = P.ring.mass * G, r1 = P.ring.rIn * MM;
    const rEff = (P.ring.blades > 0 ? 0.5 * (P.ring.rBase + P.ring.rOut) : P.ring.rOut) * MM;
    const T = P.ring.thickness * MM;
    const ka = annulusK(r1, rEff, P.ring.massDist);
    push('ring', P.ring.mass, zRingC, m * ka, 0.5 * m * ka + (m * T * T) / 12, P.ring.ecc || 0);
  }
  // core: solid cylinder on top of the ring hub
  {
    const m = P.core.mass * G, r = P.core.radius * MM, H = P.core.height * MM;
    push('core', P.core.mass, zCore0 + P.core.height * 0.5, 0.5 * m * r * r, (m * (3 * r * r + H * H)) / 12, P.core.ecc || 0);
  }
  // aux
  let auxLayer = null;
  if (P.aux) {
    const a = P.aux, m = a.mass * G;
    if (a.layer) {
      const zBase = a.mount === 'skirt' ? zDisc0 + P.disc.thickness * 0.5 : zRingC;
      const zc = zBase + (a.layer.zOffset || 0);
      const r2 = a.layer.radius * MM, r1 = (a.layer.radius - 3) * MM;
      const ka = annulusK(r1, r2, 0.3);
      push('aux', a.mass, zc, m * ka, 0.5 * m * ka);
      auxLayer = { ...a.layer, zMm: zc };
    } else if (a.ringRadius) {
      const zc = a.lowMount ? zLock0 + lockH * 0.2 : zLock0 + lockH * 0.5;
      const r1 = a.ringRadius[0] * MM, r2 = a.ringRadius[1] * MM;
      const ka = annulusK(r1, r2, 0.3);
      push('aux', a.mass, zc, m * ka, 0.5 * m * ka);
    } else {
      push('aux', a.mass, zRingC, m * annulusK(12 * MM, 20 * MM, 0), 0.5 * m * annulusK(12 * MM, 20 * MM, 0));
    }
  }

  const M = bodies.reduce((s, b) => s + b.m, 0);
  const zCom = bodies.reduce((s, b) => s + b.m * b.z, 0) / M;
  const I3 = bodies.reduce((s, b) => s + b.Ia, 0);
  const I1 = bodies.reduce((s, b) => s + b.It + b.m * (b.z - zCom) ** 2, 0);
  const ecc = bodies.reduce((s, b) => s + b.m * b.ecc, 0) / M; // COM offset from geometric axis

  const rel = (zMm) => zMm * MM - zCom;

  // contact layers
  const damp = P.aux?.damp ? 1 - (1 - P.aux.damp) * (P.aux._auxStrength ?? 1) : 1;
  const layers = [];
  layers.push({
    id: 'ring', part: 'ring', attack: true,
    z: rel(zRingC), radius: P.ring.rOut * MM, baseRadius: (P.ring.blades > 0 ? P.ring.rBase : P.ring.rOut) * MM,
    blades: P.ring.blades, bladeWidth: P.ring.bladeWidth, hand: P.ring.spin === 'R' ? -1 : P.ring.spin === 'L' ? 1 : 0,
    faceAngle: (P.ring.faceAngle || 0) * DEG, slope: (P.ring.slope || 0) * DEG, thickness: P.ring.thickness * MM,
    restitution: P.ring.restitution * damp, friction: P.ring.friction, catch: P.ring.catch, freeSpin: P.ring.freeSpin || 0,
  });
  if (P.disc.contact) {
    layers.push({
      id: 'disc', part: 'disc', attack: false, z: rel(zDisc0 + P.disc.thickness * 0.5),
      radius: P.disc.rOut * MM, baseRadius: P.disc.rOut * MM, blades: 0, faceAngle: 0, slope: 0,
      thickness: P.disc.thickness * MM, restitution: P.disc.contactRestitution ?? 0.45, friction: P.disc.contactFriction ?? 0.25, catch: 0.1, freeSpin: 0,
    });
  }
  if (auxLayer) {
    const s = P.aux._auxStrength ?? 1;
    layers.push({
      id: 'aux', part: 'aux', attack: !!auxLayer.faceAngle, z: rel(auxLayer.zMm), radius: auxLayer.radius * MM,
      baseRadius: (auxLayer.blades ? auxLayer.radius - 1.5 : auxLayer.radius) * MM, blades: auxLayer.blades || 0,
      bladeWidth: auxLayer.bladeWidth ?? 0.55, hand: 0, faceAngle: (auxLayer.faceAngle || 0) * DEG, slope: (auxLayer.slope || 0) * DEG * s,
      thickness: auxLayer.thickness * MM, restitution: auxLayer.restitution, friction: auxLayer.friction, catch: auxLayer.catch ?? 0.2,
      freeSpin: (auxLayer.freeSpin || 0) * s,
    });
  }

  // hull rims for body/floor scraping when tilted
  const hull = [
    { z: rel(tipLen * 0.85), radius: P.tip.bodyRadius * MM, friction: 0.45 },
    { z: rel(zLock0), radius: P.lock.radius * MM, friction: P.lock.hullFriction ?? 0.5 }, // rollers roll
    { z: rel(zDisc0), radius: P.disc.rOut * MM, friction: 0.5 },
    { z: rel(zRing0), radius: (P.ring.blades > 0 ? P.ring.rBase : P.ring.rOut) * MM, friction: 0.55 },
  ];

  const radius = Math.max(...layers.map((l) => l.radius), P.disc.rOut * MM);
  const topZ = zCore0 + P.core.height;
  const aeroC = (P.ring.aero || 0.015) + 0.004 + (P.aux?.layer && !P.aux.layer.freeSpin ? 0.004 : 0);
  const aero = 1.6 * aeroC * Math.pow(radius, 5);

  const spec = {
    mass: M, I3, I1, axisOffset: [-ecc, 0, 0],
    tip: {
      endZ: -zCom,
      ballRadius: P.tip.ballRadius * MM,
      flatRadius: P.tip.flatRadius * MM,
      mu: P.tip.mu,
      patchRadius: P.tip.patchRadius * MM,
      compliance: Math.max(0.1, P.tip.compliance),
      restitution: P.tip.restitution ?? 1,
    },
    layers, hull,
    burst: { notches: P.lock.notches, threshold: P.lock.threshold * 1e-4, recovery: P.lock.recovery },
    aero, linDrag: 6e-4, radius, height: topZ * MM,
    comHeight: zCom, eccentricity: ecc,
    geometry: { tipLen, lockH, zLock0, zDisc0, zRing0, zRingC, zCore0, topZ },
    mech: mechanisms(P),
  };

  const summary = summarize(spec, P);
  return { spec, summary, parts: P, validation: v };
}

// Moving parts of the classic series (physics/mechanisms.js), metres.
const tipMm = (o) => {
  const t = {};
  if (o.mu != null) t.mu = o.mu;
  for (const k of ['ballRadius', 'flatRadius', 'patchRadius']) if (o[k] != null) t[k] = o[k] * MM;
  return t;
};
export function magnetPole(item) { return item?.pole === 'S' ? 'S' : 'N'; }
function mechanisms(P) {
  const m = {};
  if (P.disc.magnet) m.magnet = { pole: magnetPole(P.disc._item) === 'S' ? -1 : 1, strength: P.disc.magnet.strength ?? 1 };
  if (P.tip.spring) m.spring = { absorb: P.tip.spring.absorb ?? 0.25, hop: P.tip.spring.hop ?? 0.5, minImpulse: P.tip.spring.minImpulse ?? 0.012 };
  if (P.tip.clutch) { const c = P.tip.clutch; m.clutch = { ...c, tip: c.tip ? tipMm(c.tip) : null }; }
  if (P.tip.shift) m.shift = { below: P.tip.shift.below ?? 0.5, tip: tipMm(P.tip.shift.tip || {}) };
  return Object.keys(m).length ? m : null;
}

// Physical summary for the UI. Every figure comes from the assembled spec.
export function summarize(spec, P) {
  const g = GRAVITY;
  const h = -spec.tip.endZ;
  const Ipivot = spec.I1 + spec.mass * h * h;
  // sleeping-top stability criterion: I3^2 w^2 > 4 I_pivot m g h
  const wCrit = Math.sqrt((4 * Ipivot * spec.mass * g * h) / (spec.I3 * spec.I3));
  const refEnergy = 2.6; // J, reference launch energy
  const w0 = Math.sqrt((2 * refEnergy) / spec.I3);
  // free-spin estimate on a standard floor (upright, no contacts)
  const rEff = (2 / 3) * spec.tip.flatRadius * 0.4 + spec.tip.patchRadius;
  const tauTip = spec.tip.mu * spec.mass * g * rEff;
  let w = w0, t = 0;
  const dt = 0.05;
  while (w > wCrit && t < 600) {
    const dw = ((tauTip + spec.aero * w * w) / spec.I3) * dt;
    w -= dw; t += dt;
  }
  const ring = spec.layers[0];
  return {
    massG: spec.mass * 1000,
    I3: spec.I3, I1: spec.I1,
    I3gcm2: spec.I3 * 1e7, // g*cm^2
    comMm: h * 1000,
    eccMm: spec.eccentricity * 1000,
    reachMm: spec.radius * 1000,
    faceDeg: (ring.faceAngle * 180) / Math.PI,
    slopeDeg: (ring.slope * 180) / Math.PI,
    blades: ring.blades,
    restitution: ring.restitution,
    contactFriction: ring.friction,
    catch: ring.catch,
    tipMu: spec.tip.mu,
    tipFlatMm: spec.tip.flatRadius * 1000,
    tipBallMm: spec.tip.ballRadius * 1000,
    tipSpinDragTorque: tauTip,
    aero: spec.aero,
    lockNotches: spec.burst.notches,
    lockThreshold: spec.burst.threshold,
    lockRecovery: spec.burst.recovery,
    critSpin: wCrit,
    refLaunchSpin: w0,
    estSpinTime: t,
    heightMm: spec.height * 1000,
  };
}
