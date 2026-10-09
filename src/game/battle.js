// Battle controller: one match between two fighters.
//
// Flow per round: setup (aim/technique/spin) -> countdown (charge during
// 3-2-1, release at IGNITE) -> battle (fixed-tick simulation, controls,
// abilities, modifiers) -> finishing (slow motion) -> roundOver -> ... ->
// matchOver. Runs identically headless (AI vs AI, tests, tournament sims)
// and in the browser (renderer/UI subscribe to events).

import { Emitter } from '../core/events.js';
import { Rng, mixSeeds } from '../core/rng.js';
import { Vec3, clamp } from '../core/math.js';
import { Arena } from '../physics/arena.js';
import { TopBody } from '../physics/topBody.js';
import { Simulation, TICK } from '../physics/simulation.js';
import { ARENA_INDEX } from '../data/arenas.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { assembleTop } from '../systems/assembly.js';
import { ModifierStack, collectTraitSources } from '../systems/modifiers.js';
import { AbilityRuntime } from './abilities.js';
import { resolveLaunchGear, ChargeMeter, computeLaunch, MAX_LEAN, LAUNCH_RING } from './launch.js';
import { AIController, emptyControls } from './ai.js';

export const FORMATS = {
  single: { id: 'single', name: 'Single Round', roundsToWin: 1 },
  bo3: { id: 'bo3', name: 'Best of 3', roundsToWin: 2 },
  bo5: { id: 'bo5', name: 'Best of 5', roundsToWin: 3 },
  points: { id: 'points', name: 'Points Race (4)', pointsToWin: 4 },
};
export const FINISH_POINTS = { spin: 1, out: 2, burst: 2, decision: 1 };
export const FINISH_NAMES = { spin: 'Spin Finish', out: 'Ring Out', burst: 'Shatter Finish', decision: 'Judge Decision', draw: 'Draw' };

const COUNTDOWN = 3.0;
const FALSE_START = COUNTDOWN - 0.15;
const AUTO_RELEASE = COUNTDOWN + 2.0;
const SAMPLE_DT = 0.1;
const MAX_ROUNDS = 9;

// Durability tuning: points (of 100) lost per event
const WEAR = {
  impactK: 6, impactJ0: 0.04, // ring damage per N*s above J0
  wallK: 4, wallJ0: 0.05,
  clickLock: 0.8, burstLock: 3.0, burstRing: 1.0,
  tipPerMeter: 0.03, tipPerSecond: 0.006,
  scrapePerSecond: 0.3,
};

class Fighter {
  constructor(battle, p, index) {
    this.battle = battle;
    this.p = p;
    this.index = index;
    this.id = p.id || 'f' + index;
    this.name = p.name || `Fighter ${index + 1}`;
    this.human = !!p.human;
    this.stats = {
      roundsWon: 0, points: 0, impacts: 0, impulseTotal: 0, impulseMax: 0, wallHits: 0, perfectLaunches: 0,
      launches: [], spinTime: 0, distance: 0, abilitiesUsed: 0, abilityHits: 0, counters: 0, dashes: 0,
      lockClicksTaken: 0, lockClicksDealt: 0, finishes: { spin: 0, out: 0, burst: 0, decision: 0 },
      losses: { spin: 0, out: 0, burst: 0, decision: 0 }, maxSpin: 0, heavyHitsTaken: 0, comebacks: 0,
      energy: {}, wear: {}, wearCauses: {}, roundsFought: 0, minSpinFracInWin: 1,
    };
    this.controller = this.human ? null : new AIController({ profile: p.ai || 'balanced', difficulty: p.difficulty ?? 1, seed: mixSeeds(battle.seed, index, 'ai'), knownTechniques: p.knownTechniques });
    this.controls = emptyControls();
    this.top = null;
    this.mods = null;
    this.ability = null;
    this.launch = null;
    this.lastCollision = -10;
    this.spirit = 0;
  }

  get items() {
    const b = this.p.build || {};
    return Object.entries(b).filter(([, it]) => it).map(([slot, item]) => ({ slot, item }));
  }
}

export class Battle extends Emitter {
  constructor(opts) {
    super();
    this.opts = opts;
    this.seed = opts.seed ?? ((Math.random() * 2 ** 31) | 0);
    this.rng = new Rng(this.seed);
    this.arenaDef = ARENA_INDEX[opts.arenaId] || ARENA_INDEX.standard;
    this.arena = new Arena(this.arenaDef);
    this.format = FORMATS[opts.format] || FORMATS.bo3;
    this.roundTime = opts.roundTime ?? 120;
    this.rules = { abilities: true, durability: true, slowmo: true, decisionAtTime: true, ...(opts.rules || {}) };
    this.mode = opts.mode || 'quick';
    this.fighters = opts.participants.map((p, i) => new Fighter(this, p, i));
    this.round = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.roundResults = [];
    this.notable = [];
    this.telemetry = [];
    this.timeScale = 1;
    this.slowmoT = 0;
    this.acc = 0;
    this.paused = false;
    this.sim = null;
    this.battleTime = 0;
    this.result = null;
    this.ignited = false;
    this.headless = !!opts.headless;
    this.cameraYaw = 0;
  }

  // ------------------------------------------------------------ round setup

  startRound() {
    this.round++;
    this.phase = this.fighters.some((f) => f.human) ? 'setup' : 'countdown';
    this.phaseT = 0;
    this.battleTime = 0;
    this.ignited = false;
    this.roundFinishes = [];
    this.roundSamples = [];
    this.roundNotable = [];
    const tops = [];
    for (const f of this.fighters) {
      const p = f.p;
      const asm = assembleTop(p.build, { spin: p.spin || 'R', launcher: p.launcherBase });
      f.assembly = asm;
      f.top = new TopBody(asm.spec, { id: f.id, side: f.index });
      f.top.lockCondition = 1;
      f.mods = new ModifierStack();
      for (const src of collectTraitSources(f.items)) f.mods.add(src);
      for (const src of p.modSources || []) f.mods.add(src);
      this.addBeastSources(f);
      f.ability = new AbilityRuntime({ fighter: f, beast: p.beast, sim: null, skills: p.skillMods || {}, rules: this.rules });
      f.gear = resolveLaunchGear(p.launcher, p.cable, { launchMods: p.launchMods });
      f.roundWear = {};
      f.roundWearCauses = {};
      f.lastCollision = -10;
      f.hadLowSpin = false;
      const spinOpts = f.gear.spinMech === 'dual' ? ['R', 'L'] : [f.gear.spinMech];
      f.launch = {
        aim: { x: (f.index === 0 ? -1 : 1) * 0.07, z: 0, lean: 0.12, dir: f.index === 0 ? 0 : Math.PI },
        technique: p.technique || 'normal',
        spin: spinOpts.includes(p.spin) ? p.spin : spinOpts[0],
        spinOptions: spinOpts,
        meter: null, released: false, releaseTime: null, result: null, confirmed: !f.human, launched: false,
        falseStart: false, ai: null,
      };
      tops.push(f.top);
    }
    // AI launch plans (made blind: they don't see the human's setup)
    for (const f of this.fighters) {
      if (f.human) continue;
      const opp = this.fighters[1 - f.index];
      const plan = f.controller.chooseLaunch({ arena: this.arena, side: f.index, gear: f.gear, spinOptions: f.launch.spinOptions, oppSpin: opp.p.spin });
      f.launch.aim = plan.aim;
      f.launch.technique = plan.technique;
      f.launch.spin = plan.spin;
      f.launch.ai = plan;
    }
    for (const f of this.fighters) f.launch.meter = new ChargeMeter(f.gear, f.launch.technique);
    this.sim = new Simulation({ arena: this.arena, tops });
    for (const f of this.fighters) f.ability.sim = this.sim;
    this.emit('roundStart', { round: this.round, phase: this.phase });
  }

  addBeastSources(f) {
    const b = f.p.beast;
    if (!b) return;
    const def = BEAST_INDEX[b.id];
    if (!def) return;
    const k = (b.bondLevel || 1) >= 5 ? 1.5 : 1;
    f.mods.add({ id: 'beast:' + def.passive.id, name: def.passive.name, origin: 'beast', cond: def.passive.cond, deltas: def.passive.deltas.map(([c, v]) => [c, v * k]) });
    // resonance: core affinity or a matching set piece
    const aff = f.assembly?.parts?.core?.affinity;
    const res = def.resonance;
    let resonant = false;
    if (res && aff && res.affinity.includes(aff)) resonant = true;
    if (res?.set && f.items.some(({ item }) => item?.set === res.set)) resonant = true;
    if (resonant) {
      // the universal Resonant core gives half strength except to Orrery
      const scale = aff === 'spirit' && def.id !== 'orrery' && !(res?.set && f.items.some(({ item }) => item?.set === res.set)) ? 0.5 : 1;
      f.mods.add({ id: 'resonance:' + def.id, name: 'Resonance', origin: 'resonance', cond: { type: 'always' }, deltas: res.deltas.map(([c, v]) => [c, v * scale]) });
      f.resonant = true;
    } else f.resonant = false;
  }

  // ------------------------------------------------------------ human launch API

  setAim(i, aim) {
    const L = this.fighters[i].launch;
    if (L.released) return;
    const r = Math.hypot(aim.x, aim.z);
    const maxR = Math.min(LAUNCH_RING, this.arena.radius * 0.62);
    if (r > maxR) { aim.x *= maxR / r; aim.z *= maxR / r; }
    aim.lean = clamp(aim.lean, 0, MAX_LEAN);
    L.aim = aim;
  }
  setTechnique(i, techId) {
    const L = this.fighters[i].launch;
    if (L.released) return;
    L.technique = techId;
    L.meter.setTechnique(techId);
  }
  setSpin(i, spin) {
    const L = this.fighters[i].launch;
    if (L.released || !L.spinOptions.includes(spin)) return;
    L.spin = spin;
  }
  confirmSetup(i) {
    this.fighters[i].launch.confirmed = true;
    if (this.phase === 'setup' && this.fighters.every((f) => f.launch.confirmed)) {
      this.phase = 'countdown';
      this.phaseT = 0;
      this.emit('countdownStart', {});
    }
  }
  chargeInput(i, holding, amount = 1) { this.fighters[i]._chargeHold = holding; this.fighters[i]._chargeAmt = amount; }
  release(i) {
    const f = this.fighters[i];
    if (this.phase !== 'countdown' && this.phase !== 'battle') return;
    if (f.launch.released) return;
    this.doRelease(f, f.launch.meter.charge);
  }

  doRelease(f, charge) {
    const L = f.launch;
    L.released = true;
    L.releaseTime = this.phaseT;
    L.meter.released = true;
    if (this.phase === 'countdown' && this.phaseT < FALSE_START) L.falseStart = true;
    const opp = this.fighters[1 - f.index];
    const res = computeLaunch({
      gear: f.gear, techId: L.technique, charge, aim: L.aim, spinDir: L.spin, topSpec: f.top.spec,
      rng: new Rng(mixSeeds(this.seed, this.round, f.index, 'launch')), arena: this.arena,
      opponentAim: opp.launch.aim, skillMods: f.p.skillMods,
    });
    if (L.falseStart) {
      res.energy *= 0.8;
      res.spin *= Math.sqrt(0.8);
      res.quality.label = 'False Start';
    }
    L.result = res;
    this.emit('release', { fighter: f, result: res });
  }

  spawnTop(f) {
    const L = f.launch;
    const r = L.result;
    // spin direction can change the assembled warnings but not geometry
    f.top.launch({ tipPos: r.tipPos, axis: r.axis, spin: r.spin, velocity: r.velocity });
    f.top.maxSpinRate = Math.abs(r.spin);
    L.launched = true;
    const q = r.quality;
    f.stats.launches.push({ round: this.round, label: q.label, perfect: q.perfect, energy: r.energy, spin: Math.abs(r.spin), tilt: q.tiltDeg, technique: q.technique, techniqueSuccess: q.techniqueSuccess, poorAngle: q.poorAngle });
    if (q.perfect) { f.stats.perfectLaunches++; f.ability.gain(20); }
    else if (q.label === 'Good') f.ability.gain(8);
    f.stats.maxSpin = Math.max(f.stats.maxSpin, Math.abs(r.spin));
    // wear from the launch itself
    if (this.rules.durability) {
      this.addWear(f, 'launcher.drive', r.wear.drive, 'launch stress');
      this.addWear(f, 'launcher.trigger', r.wear.trigger, 'launch stress');
      this.addWear(f, 'launcher.grip', r.wear.grip, 'launch stress');
      this.addWear(f, 'cable', r.wear.cable, q.label === 'Overcharge' || q.label === 'Misfire' ? 'overcharged launch' : 'launch stress');
    }
    this.emit('launch', { fighter: f, result: r });
  }

  // ------------------------------------------------------------ main update

  update(realDt, humanControls = []) {
    if (this.paused || this.phase === 'matchOver') return;
    if (this.phase === 'intro') { this.startRound(); return; }
    const dt = Math.min(realDt, 0.1);
    this.phaseT += dt;
    if (this.phase === 'setup') return;
    if (this.phase === 'countdown') { this.updateCountdown(dt); }
    if (this.phase === 'roundOver') {
      if (this.headless || this.autoAdvance) { if (this.phaseT > 0.1) this.nextRound(); }
      return;
    }
    if (this.phase === 'battle' || this.phase === 'finishing' || (this.phase === 'countdown' && this.ignited)) {
      // slow-motion handling (simulation stays fixed-step; fewer ticks per real second)
      if (this.slowmoT > 0) { this.slowmoT -= dt; if (this.slowmoT <= 0) this.timeScale = 1; }
      this.acc += dt * this.timeScale;
      let n = 0;
      while (this.acc >= TICK && n < 12) {
        this.acc -= TICK;
        this.tick(humanControls);
        n++;
        if (this.phase === 'roundOver' || this.phase === 'matchOver') break;
      }
      if (n >= 12) this.acc = 0; // never spiral
    }
  }

  updateCountdown(dt) {
    const t = this.phaseT;
    const prevSec = Math.ceil(COUNTDOWN - (t - dt));
    const sec = Math.ceil(COUNTDOWN - t);
    if (sec !== prevSec && sec > 0) this.emit('countdown', { n: sec });
    for (const f of this.fighters) {
      const L = f.launch;
      if (L.released) continue;
      if (f.human) {
        L.meter.update(dt, !!f._chargeHold, f._chargeAmt ?? 1);
      } else {
        // AI: charge up to its planned value and release at its planned time
        const plan = L.ai;
        const releaseAt = COUNTDOWN + plan.releaseOffset;
        const chargeStart = Math.max(0, releaseAt - plan.charge / f.gear.chargeRate);
        if (t >= chargeStart) L.meter.update(dt, L.meter.charge < plan.charge, 1);
        if (t >= releaseAt) this.doRelease(f, plan.charge);
      }
      if (!L.released && t >= AUTO_RELEASE) this.doRelease(f, L.meter.charge);
    }
    if (!this.ignited && t >= COUNTDOWN) {
      this.ignited = true;
      this.emit('ignite', {});
    }
    if (this.ignited) {
      for (const f of this.fighters) {
        const L = f.launch;
        if (L.released && !L.launched && t >= Math.max(COUNTDOWN, L.releaseTime)) this.spawnTop(f);
      }
      if (this.fighters.every((f) => f.launch.launched)) {
        this.phase = 'battle';
        this.emit('battleStart', {});
      }
    }
  }

  // one fixed simulation tick
  tick(humanControls) {
    const sim = this.sim;
    const [A, B] = this.fighters;
    const time = this.battleTime;
    for (const f of this.fighters) {
      if (!f.launch.launched) continue;
      const opp = this.fighters[1 - f.index];
      let c;
      if (f.human) c = humanControls[f.index] || emptyControls();
      else c = f.controller.update(TICK, { time, me: f, opp, arena: this.arena, ability: f.ability, oppAbility: opp.ability });
      f.controls = c;
      this.applyControls(f, opp, c);
    }
    for (const f of this.fighters) {
      if (!f.launch.launched) continue;
      const opp = this.fighters[1 - f.index];
      f.ability.update(TICK, { opponent: opp.launch.launched ? opp : null, steer: f.controls.steer });
      f.mods.tick(TICK);
      f.mods.evaluate(this.conditionContext(f, opp), f.top.mods);
    }
    const events = sim.tick();
    if (this.phase === 'battle' || this.phase === 'countdown') this.battleTime += TICK;
    this.processEvents(events);
    this.sample();
    if (this.phase === 'finishing') {
      this.finishT += TICK;
      if (this.finishT > 1.4) this.endRound();
    } else if (this.phase === 'battle' && this.rules.decisionAtTime && this.battleTime >= this.roundTime) {
      this.decision();
    }
  }

  applyControls(f, opp, c) {
    const top = f.top;
    if (!top.active) { top.control.steer.set(0, 0, 0); return; }
    top.control.steer.set(c.steer.x, 0, c.steer.z);
    if (this.phase === 'finishing') return;
    const ctx = { opponent: opp.launch.launched ? opp : null, steer: c.steer };
    f.ability.setBrace(!!c.brace);
    if (c.dash) f.ability.technique('dash', ctx);
    if (c.counter) f.ability.technique('counter', ctx);
    if (c.tactical1) f.ability.technique('guard', ctx);
    if (c.tactical2) f.ability.technique('surge', ctx);
    if (c.ultimate) f.ability.activate('ultimate', ctx);
    if (c.ability1) f.ability.activate('signature', ctx);
    if (c.ability2) f.ability.activate('secondary', ctx);
  }

  conditionContext(f, opp) {
    const t = f.top, o = opp.top;
    const R = this.arena.radius;
    const dx = o.p.x - t.p.x, dz = o.p.z - t.p.z;
    const d = Math.hypot(dx, dz);
    const closing = d > 1e-4 ? -(dx * (o.v.x - t.v.x) + dz * (o.v.z - t.v.z)) / d : 0;
    return {
      spinFrac: t.spinFraction(), oppSpinFrac: o.active ? o.spinFraction() : 0,
      speed: Math.hypot(t.v.x, t.v.z), rFrac: Math.hypot(t.p.x, t.p.z) / R, oppRFrac: Math.hypot(o.p.x, o.p.z) / R,
      approaching: o.active && closing > 0.25 && d < 0.09, time: this.battleTime, sinceCollision: this.battleTime - f.lastCollision,
      surfaceTag: this.arena.bandTagAt(t.lastTipPoint.x, t.lastTipPoint.z) || this.arena.surfaceTag,
      oppositeSpin: o.spinDir !== t.spinDir, abilityActive: !!f.ability.lastActivation && f.mods.timed.some((x) => x.origin === 'ability'),
    };
  }

  // ------------------------------------------------------------ events

  fighterOf(top) { return this.fighters.find((f) => f.top === top); }

  processEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'impact': case 'grind': this.onTopContact(e); break;
        case 'wall': case 'wallGrind': this.onWall(e); break;
        case 'lockClick': {
          const f = this.fighterOf(e.top);
          const n = e.count || 1;
          f.stats.lockClicksTaken += n;
          this.fighters[1 - f.index].stats.lockClicksDealt += n;
          if (this.rules.durability) this.addWear(f, 'lock', WEAR.clickLock * n, 'lock slipped a notch');
          this.emit('lockClick', { fighter: f, notches: e.notches, max: e.max });
          break;
        }
        case 'finish': this.onFinish(e); break;
        case 'shockwaveHit': {
          const f = this.fighterOf(e.top);
          f.lastCollision = this.battleTime;
          this.emit('shockwaveHit', { fighter: f, impulse: e.impulse });
          break;
        }
        case 'recovered': this.emit('physicsRecovered', { fighter: this.fighterOf(e.top) }); break;
        default:
      }
    }
  }

  onTopContact(e) {
    const fa = this.fighterOf(e.A), fb = this.fighterOf(e.B);
    const J = e.impulse;
    for (const f of [fa, fb]) {
      f.lastCollision = this.battleTime;
      if (e.type === 'impact') {
        f.stats.impacts++;
        f.stats.impulseTotal += J;
        f.stats.impulseMax = Math.max(f.stats.impulseMax, J);
        if (J > 0.06) f.stats.heavyHitsTaken++;
        f.ability.gain(Math.min(25, J * 220));
      } else f.ability.gain(Math.min(2, J * 60));
    }
    if (e.type === 'impact') {
      fa.ability.onImpact(e, fb.ability);
      fb.ability.onImpact(e, fa.ability);
      const critical = J > 0.06;
      const ev = { A: fa, B: fb, impulse: J, approach: e.approach, point: e.point, normal: e.normal, faceA: e.faceA, faceB: e.faceB, critical, time: this.battleTime, round: this.round, energy: e.energy };
      this.lastImpact = ev;
      this.roundNotable.push(ev);
      this.emit('impact', ev);
      if (critical && this.rules.slowmo && !this.headless) { this.timeScale = 0.3; this.slowmoT = 0.35; }
    } else {
      this.emit('grind', { A: fa, B: fb, impulse: J, point: e.point });
    }
    // durability: the struck layers take damage proportional to impulse above a threshold
    if (this.rules.durability) {
      const over = Math.max(0, J - WEAR.impactJ0);
      if (over > 0) {
        for (const [f, layer] of [[fa, e.layerA], [fb, e.layerB]]) {
          const part = layer?.part || 'ring';
          const dmg = WEAR.impactK * over;
          this.addWear(f, part, dmg, 'collision impacts');
          if (part === 'ring') this.addWear(f, 'core', dmg * 0.15, 'collision impacts');
          if (part === 'ring') this.addWear(f, 'disc', dmg * 0.25, 'transmitted impact');
        }
      }
    }
  }

  onWall(e) {
    const f = this.fighterOf(e.top);
    if (e.type === 'wall') { f.stats.wallHits++; this.emit('wall', { fighter: f, impulse: e.impulse, point: e.point, normal: e.normal }); }
    if (this.rules.durability) {
      const over = Math.max(0, e.impulse - WEAR.wallJ0);
      if (over > 0) this.addWear(f, e.layer?.part || 'ring', WEAR.wallK * over, 'wall impacts');
    }
  }

  addWear(f, part, amount, cause) {
    if (amount <= 0) return;
    f.roundWear[part] = (f.roundWear[part] || 0) + amount;
    const k = part + '|' + cause;
    f.roundWearCauses[k] = (f.roundWearCauses[k] || 0) + amount;
  }

  onFinish(e) {
    const f = this.fighterOf(e.top);
    this.roundFinishes.push({ fighter: f, how: e.how, time: this.battleTime });
    this.emit('topFinished', { fighter: f, how: e.how });
    if (this.phase === 'battle') {
      // resolve at the end of this tick (both may finish on the same tick)
      this.phase = 'finishing';
      this.finishT = 0;
      if (this.rules.slowmo && !this.headless) { this.timeScale = 0.35; this.slowmoT = 1.0; }
      const winner = this.fighters.find((x) => x !== f);
      const how = e.how === 'out' ? 'out' : e.how === 'burst' ? 'burst' : 'spin';
      this.pendingResult = { winner, loser: f, how, rawHow: e.how };
    } else if (this.phase === 'finishing' && this.pendingResult && this.finishT < TICK * 1.5) {
      // simultaneous finish on the same tick -> draw
      this.pendingResult = { winner: null, loser: null, how: 'draw', rawHow: 'draw' };
    }
  }

  decision() {
    const [A, B] = this.fighters;
    const margin = (f) => f.top.active ? f.top.spinAbs / Math.max(1, f.assembly.summary.critSpin) : 0;
    const ma = margin(A), mb = margin(B);
    let winner = null, loser = null;
    if (Math.abs(ma - mb) > 0.02) { winner = ma > mb ? A : B; loser = winner === A ? B : A; }
    this.pendingResult = { winner, loser, how: winner ? 'decision' : 'draw', rawHow: 'decision', margins: [ma, mb] };
    this.phase = 'finishing';
    this.finishT = 0.6;
  }

  // ------------------------------------------------------------ round end

  endRound() {
    const res = this.pendingResult || { winner: null, loser: null, how: 'draw' };
    this.pendingResult = null;
    const { winner, loser, how } = res;
    if (winner) {
      const pts = FINISH_POINTS[how] || 1;
      winner.stats.roundsWon++;
      winner.stats.points += pts;
      winner.stats.finishes[how]++;
      loser.stats.losses[how]++;
      if (winner.hadLowSpin) winner.stats.comebacks++;
    }
    for (const f of this.fighters) {
      f.stats.roundsFought++;
      if (f.launch.launched) f.stats.spinTime += f.top.active ? this.battleTime : (this.roundFinishes.find((x) => x.fighter === f)?.time ?? this.battleTime);
      f.stats.distance += f.top.telemetry?.distance || 0;
      for (const [k, v] of Object.entries(f.top.ledger || {})) f.stats.energy[k] = (f.stats.energy[k] || 0) + v;
      if (how === 'burst' && f === loser && this.rules.durability) { this.addWear(f, 'lock', WEAR.burstLock, 'shattered'); this.addWear(f, 'ring', WEAR.burstRing, 'shattered'); }
      // tip wear from travel and spin time
      if (this.rules.durability && f.launch.launched) {
        const tipW = WEAR.tipPerMeter * (f.top.telemetry?.distance || 0) * (1 + f.top.spec.tip.mu) + WEAR.tipPerSecond * this.battleTime;
        this.addWear(f, 'tip', tipW, 'floor friction');
      }
      for (const [k, v] of Object.entries(f.roundWear)) f.stats.wear[k] = (f.stats.wear[k] || 0) + v;
      for (const [k, v] of Object.entries(f.roundWearCauses)) f.stats.wearCauses[k] = (f.stats.wearCauses[k] || 0) + v;
    }
    this.roundNotable.sort((a, b) => b.impulse - a.impulse);
    this.notable.push(...this.roundNotable.slice(0, 3));
    const explanation = this.explain(res);
    const rr = {
      round: this.round, winner: winner ? winner.index : null, how, explanation, time: this.battleTime,
      launches: this.fighters.map((f) => f.launch.result?.quality),
      ledgers: this.fighters.map((f) => ({ ...(f.top.ledger || {}) })),
      wear: this.fighters.map((f) => ({ ...f.roundWear })),
    };
    this.roundResults.push(rr);
    this.phase = 'roundOver';
    this.phaseT = 0;
    this.timeScale = 1;
    this.emit('roundEnd', rr);
    if (this.matchDecided()) this.finishMatch();
  }

  matchDecided() {
    if (this.round >= MAX_ROUNDS) return true;
    if (this.format.pointsToWin) return this.fighters.some((f) => f.stats.points >= this.format.pointsToWin);
    return this.fighters.some((f) => f.stats.roundsWon >= this.format.roundsToWin);
  }

  nextRound() {
    if (this.phase === 'matchOver') return;
    if (this.matchDecided()) { this.finishMatch(); return; }
    this.startRound();
  }

  finishMatch() {
    if (this.result) return;
    const [A, B] = this.fighters;
    const key = (f) => this.format.pointsToWin ? f.stats.points : f.stats.roundsWon;
    let winner = null;
    if (key(A) !== key(B)) winner = key(A) > key(B) ? A : B;
    else if (A.stats.points !== B.stats.points) winner = A.stats.points > B.stats.points ? A : B;
    this.phase = 'matchOver';
    this.notable.sort((a, b) => b.impulse - a.impulse);
    this.result = {
      winner: winner ? winner.index : null,
      winnerName: winner?.name || null,
      format: this.format.id, arena: this.arenaDef.id, rounds: this.roundResults,
      score: this.fighters.map((f) => ({ rounds: f.stats.roundsWon, points: f.stats.points })),
      fighters: this.fighters.map((f) => ({ id: f.id, name: f.name, human: f.human, stats: f.stats })),
      notable: this.notable.slice(0, 5).map((n) => ({ round: n.round, time: n.time, impulse: n.impulse, approach: n.approach, by: n.faceA >= n.faceB ? n.A.index : n.B.index })),
      telemetry: this.telemetry,
      seed: this.seed,
    };
    this.emit('matchEnd', this.result);
  }

  // Human-readable explanation of how the round was decided.
  explain(res) {
    const { winner, loser, how } = res;
    if (!winner) {
      if (res.rawHow === 'decision') return 'Time expired with both tops equally stable — the round is a draw.';
      return 'Both tops finished on the same instant — the round is a draw.';
    }
    const L = loser.top;
    const led = L.ledger || {};
    const spent = Object.entries(led).filter(([k, v]) => v < 0 && k !== 'numerical').map(([k, v]) => [k, -v]).sort((a, b) => b[1] - a[1]);
    const total = spent.reduce((s, [, v]) => s + v, 0) || 1;
    const NAMES = { tipFriction: 'tip friction', collision: 'collisions', wall: 'wall contacts', drag: 'air drag', control: 'steering', scrape: 'body scraping', damping: 'wobble damping', ability: 'abilities', floor: 'landings' };
    const top2 = spent.slice(0, 2).map(([k, v]) => `${NAMES[k] || k} ${Math.round((v / total) * 100)}%`).join(', ');
    switch (how) {
      case 'spin': {
        const crit = loser.assembly.summary.critSpin;
        if (res.rawHow === 'toppled') return `${loser.name} lost stability: its spin fell toward the ${Math.round(crit)} rad/s stability threshold, the axis wobbled past recovery and the body hit the floor. Spin energy lost to ${top2}.`;
        return `${loser.name} ran out of spin. Spin energy lost to ${top2}.`;
      }
      case 'out': {
        const R = this.arena.radius;
        const ang = Math.atan2(L.p.z, L.p.x);
        const exit = this.arena.openingAt(ang);
        const where = exit ? 'through an exit' : 'over the wall';
        const last = [...this.roundNotable].sort((a, b) => b.time - a.time)[0];
        const hit = last && this.battleTime - last.time < 1.5 ? ` after a ${last.impulse.toFixed(3)} N·s collision` : '';
        return `${loser.name} was knocked out of the stadium ${where}${hit}. (Stadium radius ${(R * 100).toFixed(0)} cm.)`;
      }
      case 'burst': {
        const n = L.spec.burst.notches;
        const last = [...this.roundNotable].sort((a, b) => b.time - a.time)[0];
        return `${loser.name}'s lock assembly slipped all ${n} notches under counter-rotational strikes and shattered${last ? ` — the final strike was ${last.impulse.toFixed(3)} N·s` : ''}.`;
      }
      case 'decision': {
        const [ma, mb] = res.margins;
        const wm = winner.index === 0 ? ma : mb, lm = winner.index === 0 ? mb : ma;
        return `Time limit (${this.roundTime}s) reached. Judges compare spin relative to each top's stability threshold: ${winner.name} ${wm.toFixed(2)}× vs ${loser.name} ${lm.toFixed(2)}×.`;
      }
      default: return '';
    }
  }

  // ------------------------------------------------------------ telemetry

  sample() {
    if (!this._sampleT) this._sampleT = 0;
    this._sampleT += TICK;
    for (const f of this.fighters) {
      if (f.top.active && f.top.spinFraction() < 0.2) f.hadLowSpin = true;
    }
    if (this._sampleT < SAMPLE_DT) return;
    this._sampleT = 0;
    const s = { round: this.round, t: +this.battleTime.toFixed(2), f: [] };
    for (const f of this.fighters) {
      const t = f.top;
      s.f.push({
        spin: +t.spinAbs.toFixed(1), frac: +t.spinFraction().toFixed(3), speed: +Math.hypot(t.v.x, t.v.z).toFixed(3),
        tilt: +(t.tilt * 57.2958).toFixed(2), notches: +t.burstNotches.toFixed(2), spirit: +f.ability.spirit.toFixed(1),
        eRot: +t.rotationalEnergy().toFixed(4), eLin: +t.linearEnergy().toFixed(4), x: +t.p.x.toFixed(4), z: +t.p.z.toFixed(4),
        active: t.active,
      });
    }
    this.telemetry.push(s);
    if (this.telemetry.length > 6000) this.telemetry.shift();
  }

  // ------------------------------------------------------------ headless helper

  // Run the whole match without rendering (AI vs AI, tests, tournament sims).
  runHeadless(maxSeconds = 1200) {
    this.headless = true;
    let guard = 0;
    while (this.phase !== 'matchOver' && guard < maxSeconds * 60) {
      this.update(1 / 60, []);
      if (this.phase === 'setup') for (const f of this.fighters) this.confirmSetup(f.index);
      guard++;
    }
    if (this.phase !== 'matchOver') this.finishMatch();
    return this.result;
  }
}
