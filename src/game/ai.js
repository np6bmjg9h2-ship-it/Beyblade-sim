// AI controller. Produces the same control frame a human produces. It
// observes the battle through a delayed snapshot buffer (reaction time) and
// re-plans at a personality-specific interval rather than every frame.

import { Vec3, clamp } from '../core/math.js';
import { Rng, mixSeeds } from '../core/rng.js';
import { scaledProfile } from '../data/aiProfiles.js';
import { TECHNIQUE_INDEX } from '../data/launchers.js';
import { aiReleaseCharge, MAX_LEAN } from './launch.js';
import * as dm from '../core/dmath.js';
import { TECHNIQUE_DEFS } from './abilities.js';
import { openness, PUNISH_WINDOW } from './skillRules.js';

const CLASH_BAND = 0.15; // as battle.js: a striker must close this much faster
// run-up geometry (m, centre to centre): strike from between near and far so
// the 0.15 s coil completes before contact; hold at `hold` while recharging
const RUNUP = { near: 0.085, far: 0.17, hold: 0.115 };

const TWEAK_LIMITS = { reaction: [0.06, 1] };
export function applyTweaks(P, tweaks) {
  for (const [k, v] of Object.entries(tweaks)) {
    if (typeof P[k] !== 'number') continue;
    const [lo, hi] = TWEAK_LIMITS[k] || [0, 0.98];
    P[k] = Math.max(lo, Math.min(hi, P[k] + v));
  }
  return P;
}

export function emptyControls() {
  return {
    steer: new Vec3(), dash: false, brace: false, counter: false,
    ability1: false, ability2: false, ultimate: false, tactical1: false, tactical2: false,
  };
}

export class AIController {
  constructor({ profile = 'balanced', difficulty = 1, seed = 1, knownTechniques, tweaks = null, adaptRounds = false } = {}) {
    this.profile = typeof profile === 'string' ? scaledProfile(profile, difficulty) : { ...profile };
    // rival adaptation: bounded behavioural nudges only (never physics)
    if (tweaks) applyTweaks(this.profile, tweaks);
    this.adaptRounds = adaptRounds || this.profile.id === 'elite';
    this.adaptLog = [];
    this.rng = new Rng(seed);
    // a separate stream for reading the opponent, so adding reads doesn't
    // reshuffle every other AI decision
    this.rngRead = new Rng(mixSeeds(seed, 'read'));
    // judgment: how often the AI plays the sensible spin-budget game (holds,
    // takes run-ups, strikes openings) instead of a novice's chase-and-dash.
    // Behaviour only; its own stream so the other streams stay unchanged.
    this.judge = clamp((difficulty - 0.45) / 0.85, 0, 1);
    this.rngJudge = new Rng(mixSeeds(seed, 'judge'));
    this.sensible = false;
    this.aimDash = false;
    this.knownTechniques = knownTechniques || null;
    this.history = []; // { t, opp:{p,v,spinFrac,spirit}, me }
    this.plan = 'center';
    this.planT = 0;
    this.nextDecision = 0;
    this.steerTarget = new Vec3();
    this.steer = new Vec3();
    this.counteredApproach = false;
    this.braceUntil = 0;
    this.wantDash = false;
    this.wantCounter = false;
    this.counterAt = null; // a counter press scheduled from a windup read
    this.readWindupT = null;
    this.wantAbility = null;
    this.noise = new Vec3();
    this.pushDir = new Vec3(1, 0, 0);
  }

  // Between rounds, adaptive AIs adjust to how the last round was lost or won.
  adaptBetweenRounds({ won, how, oppStats }) {
    if (!this.adaptRounds) return null;
    const t = {};
    let note = null;
    if (!won && how === 'out') { t.edgeCaution = 0.12; t.centerPref = 0.1; note = 'plays further from the edge'; }
    else if (!won && how === 'burst') { t.aggression = -0.08; t.counterSkill = 0.1; note = 'avoids head-on lock damage'; }
    else if (!won && (how === 'spin' || how === 'decision')) { t.steerEconomy = 0.1; t.aggression = this.profile.aggression > 0.5 ? 0.08 : -0.08; note = this.profile.aggression > 0.5 ? 'presses harder before spin runs out' : 'saves more spin'; }
    else if (won && oppStats && oppStats.dashes > 3) { t.counterSkill = 0.06; note = 'watches for dashes'; }
    if (!note) return null;
    applyTweaks(this.profile, t);
    this.adaptLog.push(note);
    return note;
  }

  // ------------------------------------------------------------ launch

  chooseLaunch(ctx) {
    const P = this.profile;
    const rng = this.rng;
    const { arena, side, gear, spinOptions, oppSpin, spawnAngle = 0 } = ctx;
    const techs = (P.technique || ['normal']).filter((t) => !TECHNIQUE_INDEX[t]?.adv || (this.knownTechniques ? this.knownTechniques.includes(t) : true));
    const danger = arena.danger || 0;
    // dangerous stadiums: cautious AIs prefer controlled launches
    let tech = techs.length ? rng.pick(techs) : 'normal';
    if (danger > 0.3 && techs.includes('controlled') && rng.chance(P.edgeCaution * danger)) tech = 'controlled';
    // a stamina or defense player who knows the spin race starts it with a
    // full-power upright release (a controlled launch gives up 10% energy)
    const fullPower = danger <= 0.3 && P.aggression < 0.35 && this.rngJudge.chance(this.judge ** 1.5);
    if (fullPower) tech = 'normal';
    const rBase = (P.centerPref > 0.7 ? 0.035 : P.aggression > 0.7 ? 0.09 : 0.06) * (1 - 0.4 * danger);
    const ang = spawnAngle + (side === 0 ? Math.PI : 0);
    const a = ang + rng.range(-0.5, 0.5);
    const x = dm.cos(a) * (rBase + rng.range(-0.01, 0.02));
    const z = dm.sin(a) * (rBase + rng.range(-0.01, 0.02));
    // lean toward the centre/opponent for aggressive builds
    // banked launches curve hard on flat tips: lean less where exits are open
    const leanMul = clamp(1 - danger * (0.35 + 0.6 * P.edgeCaution), 0.15, 1);
    const lean = fullPower ? 0 : clamp(P.lean * leanMul + rng.range(-0.03, 0.03), 0, MAX_LEAN);
    const dir = dm.atan2(-z, -x) + rng.range(-0.4, 0.4);
    // spin: technical AIs may pick opposite spin if their launcher allows
    let spin = spinOptions[0];
    if (spinOptions.length > 1 && oppSpin && P.steerSkill > 0.8 && rng.chance(0.5)) {
      spin = spinOptions.find((s) => s !== oppSpin) || spin;
    }
    let risk = P.risk > 0.8 ? 0.6 : 0;
    let aim = { x, z, lean, dir };
    // a skilled blader takes the clean launch unless the stadium is open
    // (Standard 0.40 qualifies, Edgebreaker and Skyfall do not): full-power
    // normal release on a circling line 7 cm out (the default human launch),
    // no overcharge gamble. Tilted, controlled and centre launches give up
    // energy the spin race never pays back. Own stream draw, after the others.
    // (centre players keep their own spot: holding the middle is their game)
    if (danger <= 0.45 && P.centerPref <= 0.7 && this.rngJudge.chance(this.judge ** 1.5)) {
      tech = 'normal'; risk = 0;
      const along = spin === 'L' ? -Math.PI / 2 : Math.PI / 2;
      aim = { x: dm.cos(ang) * 0.07, z: dm.sin(ang) * 0.07, lean: 0.12, dir: ang + along };
    }
    const rel = aiReleaseCharge(rng, P.launchSkill, gear, tech, risk);
    // release timing relative to SPIN! (seconds)
    const releaseOffset = Math.abs(rng.gauss(0.04, 0.12 * (1 - P.launchSkill))) - 0.02;
    return { aim, technique: tech, spin, charge: rel.charge, releaseOffset };
  }

  // ------------------------------------------------------------ battle

  observe(t, me, opp, meSpirit, oppSpirit, oppWindup = null, oppOpen = 0) {
    this.history.push({
      t,
      opp: { p: opp.p.clone(), v: opp.v.clone(), spinFrac: opp.spinFraction(), active: opp.active, spirit: oppSpirit,
        windup: oppWindup ? { dx: oppWindup.dir.x, dz: oppWindup.dir.z, startT: oppWindup.startT } : null, open: oppOpen },
      me: { p: me.p.clone(), v: me.v.clone(), spinFrac: me.spinFraction(), spirit: meSpirit },
    });
    while (this.history.length > 2 && this.history[1].t <= t - this.profile.reaction) this.history.shift();
  }

  delayed() { return this.history[0]; }

  // A coiling dash is the clearest read in the game (the HUD shows it). Seen
  // `reaction` late: if it is aimed at me and close, the AI either schedules
  // a counter so the window covers the landing, or sidesteps when its counter
  // is not ready. Once per windup, landing with probability counterSkill.
  readWindup(time, snap, me, ability, P) {
    const w = snap.opp.windup;
    if (!w || w.startT === this.readWindupT) return;
    this.readWindupT = w.startT;
    const dx = me.top.p.x - snap.opp.p.x, dz = me.top.p.z - snap.opp.p.z, d = dm.hypot(dx, dz);
    if (d < 1e-4 || d > 0.16 || (w.dx * dx + w.dz * dz) / d < 0.8) return;
    if (!this.rngRead.chance(P.counterSkill || 0)) return;
    this.counteredApproach = true; // no reflex press on top of the read
    const T = TECHNIQUE_DEFS;
    if (ability && ability.cool.counter <= 0 && !ability.counter) {
      const gap = Math.max(0, d - 0.05);
      const landing = w.startT + T.dash.windup + gap / T.dash.speed;
      this.counterAt = Math.max(time, landing - T.counter.window * 0.6);
    } else {
      this.plan = 'evade';
      this.nextDecision = Math.max(this.nextDecision, time + 0.3);
    }
  }

  // Counter as a read, checked every tick: from what it saw `reaction`
  // seconds ago, the AI predicts when the opponent's strike lands and presses
  // so the counter window covers it. Only when the opponent is the striker
  // (counters never fire on your own hits or clashes); once per approach,
  // landing with probability counterSkill, so the AI also misses.
  readCounter(time, snap, me, opp, P) {
    if (!(P.counterSkill > 0)) return;
    const sm = snap.me, so = snap.opp;
    const dx = so.p.x - sm.p.x, dz = so.p.z - sm.p.z, d = dm.hypot(dx, dz);
    if (d < 1e-4) return;
    const oppToward = -(dx * so.v.x + dz * so.v.z) / d, myToward = (dx * sm.v.x + dz * sm.v.z) / d;
    const closing = oppToward + myToward;
    const gap = d - (me.top.spec.radius + opp.top.spec.radius);
    if (gap > 0.08 || closing < 0.05) { this.counteredApproach = false; return; }
    if (this.counteredApproach || oppToward - myToward < CLASH_BAND || closing < 0.15) return;
    const ttc = gap / closing - (time - snap.t); // seconds until contact, now
    if (ttc < TECHNIQUE_DEFS.counter.window * 0.75 && ttc > -0.02) {
      this.counteredApproach = true;
      // a reflex on raw closing speed lands half as often as a windup read
      if (this.rngRead.chance(P.counterSkill * 0.5)) this.wantCounter = true;
    }
  }

  update(dt, ctx) {
    const c = emptyControls();
    const P = this.profile;
    const { time, me, opp, arena, ability, oppAbility } = ctx;
    if (P.passive) return c;
    this.observe(time, me.top, opp.top, ability.spirit, oppAbility?.spirit ?? 0, oppAbility?.windup, openness(opp.top, opp.assembly?.summary?.critSpin).degree);
    const snap = this.delayed();
    if (!snap || !me.top.active) return c;

    const R = arena.radius;
    const myP = me.top.p, myV = me.top.v;
    const oP = snap.opp.p, oV = snap.opp.v;
    const dx = oP.x - myP.x, dz = oP.z - myP.z;
    const dist = dm.hypot(dx, dz);
    const relVx = oV.x - myV.x, relVz = oV.z - myV.z;
    const closing = dist > 1e-4 ? -(dx * relVx + dz * relVz) / dist : 0;
    const myR = dm.hypot(myP.x, myP.z) / R;
    const oppR = dm.hypot(oP.x, oP.z) / R;
    const mySpin = me.top.spinFraction();
    const oppSpin = snap.opp.spinFrac;
    this.readWindup(time, snap, me, ability, P);
    if (this.counterAt !== null && time >= this.counterAt) { this.wantCounter = true; this.counterAt = null; }
    this.readCounter(time, snap, me, opp, P);

    // contact awareness: compare how much spin each side lost around recent
    // collisions (HUD-visible spin fractions); positive = contacts hurt me
    if (me.stats.impacts !== this.lastImpacts) {
      if (!this.contactWatch) this.contactWatch = { t: time, my: mySpin, opp: oppSpin };
      this.lastImpacts = me.stats.impacts;
    }
    if (this.contactWatch && time - this.contactWatch.t > 0.6) {
      const d = (this.contactWatch.my - mySpin) - (this.contactWatch.opp - oppSpin);
      this.exchange = (this.exchange ?? 0) * 0.65 + d * 0.35;
      this.contactWatch = null;
    }

    this.planTime = this.planTime || {};
    this.planTime[this.plan] = (this.planTime[this.plan] || 0) + dt;

    if (time >= this.nextDecision) {
      this.nextDecision = time + P.decisionInterval * this.rng.range(0.8, 1.2);
      this.decide({ time, dist, closing, myR, oppR, mySpin, oppSpin, snap, me, oppF: opp, arena, ability, oppAbility });
    }

    // steering target per plan
    const T = this.steerTarget.set(0, 0, 0);
    let coast = false;
    const lead = 0.12 + 0.1 * P.steerSkill;
    const px = oP.x + oV.x * lead, pz = oP.z + oV.z * lead;
    switch (this.plan) {
      case 'attack': {
        if (this.runup) {
          // run-up: hold a striking distance on the centre side of the
          // opponent while the dash recharges, instead of grinding into it
          const oR = dm.hypot(oP.x, oP.z);
          let ux = dist > 1e-4 ? -dx / dist : 1, uz = dist > 1e-4 ? -dz / dist : 0;
          if (oR > 1e-3) { const w = 1.5 * oR / R; ux -= oP.x / oR * w; uz -= oP.z / oR * w; }
          const ul = Math.max(1e-4, dm.hypot(ux, uz));
          const tx = oP.x + ux / ul * RUNUP.hold, tz = oP.z + uz / ul * RUNUP.hold;
          // there: let the bowl roll it back in (free speed for the strike)
          if (dm.hypot(tx - myP.x, tz - myP.z) > 0.025) T.set(tx - myP.x, 0, tz - myP.z);
          else coast = true;
        } else T.set(px - myP.x, 0, pz - myP.z);
        break;
      }
      case 'koPush': {
        // get behind the opponent relative to the push direction (toward the
        // nearest exit, or straight outward) and drive through it
        const d = this.pushDir;
        const behindX = oP.x - d.x * 0.045, behindZ = oP.z - d.z * 0.045;
        const toBehind = dm.hypot(behindX - myP.x, behindZ - myP.z);
        if (toBehind > 0.03) T.set(behindX - myP.x, 0, behindZ - myP.z);
        else T.set(d.x, 0, d.z);
        break;
      }
      case 'evade': {
        // move perpendicular to the opponent line, biased toward the centre
        const nx = -dz, nz = dx;
        const sgn = (nx * -myP.x + nz * -myP.z) >= 0 ? 1 : -1;
        T.set(nx * sgn, 0, nz * sgn).normalize();
        T.x += -myP.x * 3; T.z += -myP.z * 3;
        break;
      }
      case 'recover': T.set(-myP.x, 0, -myP.z); break;
      case 'center': {
        // if the opponent already holds the centre, settle just beside it
        // instead of grinding into it
        const oR = dm.hypot(oP.x, oP.z);
        let cx = 0, cz = 0;
        if (oR < 0.06) { const ux = oR > 1e-3 ? oP.x / oR : 1, uz = oR > 1e-3 ? oP.z / oR : 0; cx = oP.x - ux * 0.075; cz = oP.z - uz * 0.075; }
        T.set(cx - myP.x, 0, cz - myP.z);
        if (dm.hypot(cx - myP.x, cz - myP.z) < 0.02) T.set(0, 0, 0);
        break;
      }
      case 'circle': {
        const r = Math.max(1e-3, dm.hypot(myP.x, myP.z));
        T.set(-myP.z / r * -me.top.spinDir, 0, myP.x / r * -me.top.spinDir);
        T.x += -myP.x * 2; T.z += -myP.z * 2;
        break;
      }
      default:
    }
    // Velocity control: steer toward (desired velocity - current velocity) so
    // the top brakes, cancels drift and then heads for the target, instead of
    // pushing sideways while it orbits the rim.
    const mag = T.length();
    const myR0 = dm.hypot(myP.x, myP.z);
    let desSpeed = { attack: this.runup ? 0.3 : 0.5 + 0.45 * P.aggression, koPush: 0.85, evade: 0.45, recover: 0.4, center: 0.3, circle: 0.3 }[this.plan] ?? 0.3;
    if (this.plan === 'center' || this.plan === 'recover') desSpeed = Math.min(desSpeed, myR0 * 2.5);
    const ux = mag > 1e-4 ? T.x / mag : 0, uz = mag > 1e-4 ? T.z / mag : 0;
    const gain = 4 + 2 * P.steerSkill; // 1 / response time (s)
    T.set((ux * desSpeed - myV.x) * gain, 0, (uz * desSpeed - myV.z) * gain);
    const tl = T.length();
    if (tl > 1) T.scale(1 / tl);
    // steering economy: endurance AIs only steer firmly when it matters
    const urgent = this.plan === 'recover' || this.plan === 'koPush' || this.plan === 'evade' || (this.plan === 'attack' && !this.runup);
    T.scale(urgent ? 1 : 1 - P.steerEconomy * 0.6);
    if (!urgent && T.length() < 0.25 * P.steerEconomy) T.set(0, 0, 0);
    // a sensible player rests the stick while holding a calm spot: no
    // steering spend at all until it drifts
    const rest = coast || (this.conserving && this.evenMatch && (this.plan === 'center' || this.plan === 'circle')) || (this.sensible && !urgent && myR0 < 0.45 * R && dm.hypot(myV.x, myV.z) < 0.18);
    if (rest) T.set(0, 0, 0);
    // imperfect steering: low-frequency noise inversely proportional to skill
    if (this.rng.chance(0.05)) this.noise.set(this.rng.gauss(0, 1), 0, this.rng.gauss(0, 1)).scale((1 - P.steerSkill) * 0.45);
    if (!rest) T.add(this.noise);
    // smooth like a thumb on a stick
    const k = clamp(dt * (6 + 10 * P.steerSkill), 0, 1);
    this.steer.x += (T.x - this.steer.x) * k;
    this.steer.z += (T.z - this.steer.z) * k;
    const sm = dm.hypot(this.steer.x, this.steer.z);
    if (sm > 1) this.steer.scale(1 / sm);
    c.steer.copy(this.steer);

    // reflex actions
    if (this.wantDash) {
      c.dash = true; this.wantDash = false;
      // a deliberate strike: the stick points at where the target will be
      // (the dash latches the stick direction)
      if (this.aimDash) {
        const ax = px - myP.x, az = pz - myP.z, al = dm.hypot(ax, az);
        if (al > 1e-4) c.steer.set(ax / al, 0, az / al);
        this.aimDash = false;
      }
    }
    if (this.wantCounter) { c.counter = true; this.wantCounter = false; }
    if (time < this.braceUntil) c.brace = true;
    if (this.wantAbility) { c[this.wantAbility] = true; this.wantAbility = null; }
    return c;
  }

  decide(s) {
    const P = this.profile;
    const rng = this.rng;
    const { dist, closing, myR, oppR, mySpin, oppSpin, me, ability, oppAbility } = s;
    const spinLead = mySpin - oppSpin;
    // readRace: judge the spin race by who would stop first if nobody touched
    // anybody: the share of launch spin each top has left times how long that
    // top can spin (its build's free-spin estimate, which a player reads off
    // the part cards). A top that would outlast its opponent keeps away from
    // it; one that would not, presses for a knock-out.
    let proj = null;
    // a sensible decision this time? (higher difficulty: more often)
    this.sensible = this.rngJudge.chance(this.judge ** 1.5);
    if (P.readRace || this.sensible) {
      const est = this.est || (this.est = { my: me.assembly?.summary?.estSpinTime || 0, opp: s.oppF?.assembly?.summary?.estSpinTime || 0 });
      if (est.my > 0 && est.opp > 0) {
        const myLeft = mySpin * est.my, oppLeft = oppSpin * est.opp;
        proj = clamp((myLeft - oppLeft) / Math.max(myLeft, oppLeft, 1), -1, 1);
      }
    }
    // pressWhenBehind (0..1): a top losing the spin race can only win by a
    // knock-out or shatter, so pressing personalities attack harder when behind
    // instead of retreating (0 keeps the classic "retreat when behind").
    const press = P.pressWhenBehind || 0;
    const behind = Math.max(0, -(proj ?? spinLead));
    const u = {};
    // contacts that cost more spin than they take (0..1)
    const bad = clamp((this.exchange || 0) * 18, 0, 1);
    // a race-reader stops pressing when its hits are losing the exchange:
    // more contact would only lose the race faster
    const pressK = P.readRace ? (1 - bad) * (1 - bad) : 1;
    u.attack = P.aggression * (1 + spinLead * 1.5) + press * behind * 2 * pressK + (dist < 0.12 ? 0.15 : 0);
    u.koPush = oppR > 0.5 ? P.aggression * 0.8 + P.risk * 0.6 + (oppR - 0.5) * 2 : 0;
    u.evade = (spinLead < -0.08 ? (1 - P.aggression) * 0.9 * (1 - press) : 0) + (closing > 0.5 && dist < 0.1 ? (1 - P.aggression) * 0.6 : 0);
    u.center = P.centerPref * (1 - P.aggression) + 0.1;
    // recover early when drifting outward fast (predicted position), sooner in open stadiums
    const danger = s.arena.danger || 0;
    const myP = me.top.p, myV = me.top.v;
    const R = s.arena.radius;
    const vOut = (myP.x * myV.x + myP.z * myV.z) / Math.max(1e-4, dm.hypot(myP.x, myP.z));
    const predR = myR + Math.max(0, vOut) * (P.reaction + P.decisionInterval) / R;
    const edgeLine = 0.78 - 0.18 * danger;
    u.recover = predR > edgeLine ? P.edgeCaution * 1.6 + (predR - edgeLine) * 3 : 0;
    u.circle = P.aggression > 0.4 && P.aggression < 0.85 ? 0.25 : 0;
    // contacts that cost more spin than they take: back off (less so for brawlers)
    if (bad > 0) {
      u.attack *= 1 - bad * (1 - 0.6 * P.aggression);
      u.evade += bad * 0.6 * (1 - P.aggression);
    }
    // late battle: whoever is ahead on spin plays safe
    if (spinLead > 0.15 && mySpin < 0.35) { u.evade += 0.4; u.attack *= 0.6; }
    // a race-reader that will outlast its opponent stops trading hits
    if (proj != null && proj > 0.12) { u.attack *= 0.35; u.koPush *= 0.5; u.center += 0.45 + proj; }
    // ...and one that would be outlasted leaves its comfortable spot to fight
    if (proj != null && proj < -0.15) u.center *= 0.5;
    // reads (HUD-visible, seen `reaction` late, each a chance so the AI also
    // misses): an open opponent (wobbling, critical, airborne) is worth
    // attacking, and so is one that just whiffed a counter or had its dash
    // broken (its counter is locked for 2.2 s)
    const readSkill = P.readSkill ?? Math.min(0.95, 0.35 + 0.5 * (P.counterSkill || 0));
    this.opening = false;
    const openDeg = s.snap.opp.open || 0;
    if (openDeg > 0 && this.rngRead.chance(readSkill)) { u.attack += 0.8 * openDeg; this.opening = true; }
    const since = s.time - (oppAbility?.exposedAt ?? -9);
    if (since > P.reaction && since < TECHNIQUE_DEFS.counter.whiff && this.rngRead.chance(readSkill)) { u.attack += 1.0 * readSkill; this.opening = true; }
    // Matchup read (part cards): contact only pays a top that would lose the
    // untouched spin race by a clear margin (an attacker against an outlaster).
    // In a mirror, or against a top it outlasts, every steer and dash is spin
    // given away, so a sensible blader conserves whatever its personality.
    const est0 = this.est;
    const contactPays = !!est0 && est0.my > 0 && est0.opp > 0 && est0.my < est0.opp * 0.85;
    // even matchup (spin times within 15%): resting beats any spend
    this.evenMatch = !!est0 && est0.my > 0 && est0.opp > 0 && !contactPays && est0.opp > est0.my * 0.85;
    const lead = proj ?? spinLead;
    const mustRisk = lead < -0.15; // losing the race: only a finish wins it
    // ...until it falls behind: then only a finish wins it
    // (falling a little behind in an even matchup is launch noise: chasing it
    // only loses the race faster, so the even-matchup conserver keeps waiting)
    const conserver = P.aggression < 0.35 || (this.sensible && !contactPays);
    this.conserving = this.sensible && conserver && (!contactPays || !mustRisk);
    if (this.sensible) {
      // spin budget: every steer and dash is paid in spin, and a strike costs
      // the striker more than the struck top. Spend only where it pays.
      u.circle = 0;
      // a defense or stamina top that is behind still gains nothing by
      // ramming (it pays more than it deals): it keeps waiting for openings
      if (!this.opening && (!mustRisk || conserver)) {
        if (conserver) { u.attack = 0; u.koPush *= oppR > 0.65 ? 0.6 : 0; u.center += 0.3; }
        if (lead > 0.08) { u.attack *= 0.25; u.koPush *= 0.5; u.center += 0.4 + lead; }
      }
      if (mustRisk && !conserver) u.attack += 0.3;
      // a conserving blader in an even matchup spends only on a finish it can
      // see: an open top near the rim. Dodging and chasing cost more spin than
      // the hits they avoid or land.
      if (this.conserving) {
        if (!(this.opening && oppR > 0.55)) u.attack = 0;
        if (oppR < 0.75) u.koPush = 0;
        if (!(closing > 0.5 && dist < 0.1)) u.evade = 0; // still dodge a strike already coming
      }
    }
    // hysteresis
    u[this.plan] = (u[this.plan] || 0) + 0.12;
    let best = 'center', bv = -1;
    for (const [k, v] of Object.entries(u)) if (v > bv) { bv = v; best = k; }
    if (best !== this.plan) { this.plan = best; this.planT = 0; }

    const opp = s.snap.opp;
    // push direction for knock-outs: toward the nearest exit if one is close in angle
    {
      const arena = s.arena;
      const oa = dm.atan2(opp.p.z, opp.p.x);
      let best = null, bestD = 1e9;
      for (const o of arena.openings) {
        let dAng = Math.abs(((o.center - oa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dAng < bestD) { bestD = dAng; best = o; }
      }
      const R = arena.radius;
      if (best && bestD < 1.2) this.pushDir.set(dm.cos(best.center) * R - opp.p.x, 0, dm.sin(best.center) * R - opp.p.z).normalize();
      else { const r = Math.max(1e-3, dm.hypot(opp.p.x, opp.p.z)); this.pushDir.set(opp.p.x / r, 0, opp.p.z / r); }
    }
    const dashReady = !ability || (ability.cool.dash <= 0 && !ability.windup);
    this.runup = this.sensible && this.plan === 'attack' && (!dashReady || dist < RUNUP.near);
    if (this.sensible) {
      // a run-up strike: from between near and far, with the coil finishing
      // before contact, and only when worth it (an opening, a ring-out line,
      // or a race that has to be turned around)
      if (this.plan === 'attack' && dashReady && dist > RUNUP.near && dist < RUNUP.far) {
        const exposedNow = since > P.reaction && since < PUNISH_WINDOW + P.reaction;
        const worth = this.opening || exposedNow || mustRisk || oppR > 0.45 || (!conserver && this.rngJudge.chance(P.dashUse * 0.45));
        if (worth && closing > -0.1) { this.wantDash = true; this.aimDash = true; }
      }
    } else {
      // a novice mashes dash whenever it is up, even point-blank
      if (this.plan === 'attack' && dashReady && dist < 0.14 && this.rngJudge.chance((1 - this.judge) * 0.5)) this.wantDash = true;
      // dash: committed attack inside striking range
      if (this.plan === 'attack' && dist > 0.045 && dist < 0.14 && rng.chance(P.dashUse * 0.35)) this.wantDash = true;
      // an opening is worth committing to, from further out
      if (this.plan === 'attack' && this.opening && dist > 0.045 && dist < 0.2 && this.rngRead.chance(0.3 + 0.5 * P.dashUse)) this.wantDash = true;
    }
    if (this.plan === 'koPush' && dist < 0.08) {
      // only dash when lined up behind the opponent along the push direction
      const ax = (opp.p.x - me.top.p.x) / Math.max(1e-4, dist), az = (opp.p.z - me.top.p.z) / Math.max(1e-4, dist);
      if (ax * this.pushDir.x + az * this.pushDir.z > 0.8 && rng.chance(P.dashUse * 0.6)) this.wantDash = true;
    }
    // brace when about to be hit near the edge
    if (closing > 0.35 && dist < 0.09 && myR > 0.55 && rng.chance(P.edgeCaution)) this.braceUntil = s.snap.t + 0.6;
    // abilities
    this.decideAbility(s);
  }

  decideAbility(s) {
    const P = this.profile;
    if (P.abilityStyle === 'none') return;
    const { dist, closing, myR, oppR, mySpin, ability } = s;
    const rng = this.rng;
    const sig = ability.slotDef('signature');
    const sec = ability.slotDef('secondary');
    const ult = ability.slotDef('ultimate');
    const good = (def) => {
      if (!def) return false;
      switch (def.category) {
        case 'attack': {
          const sw = def.ops.find((o) => o.op === 'shockwave');
          if (sw) return dist < sw.range * 0.85 && (oppR > 0.5 || P.abilityStyle === 'aggressive');
          const dash = def.ops.find((o) => o.op === 'dash');
          if (dash) return dist > 0.05 && dist < 0.18;
          const nh = def.ops.find((o) => o.op === 'nextHit');
          if (nh) return dist < 0.12 && (closing > 0 || this.plan === 'attack');
          return dist < 0.1;
        }
        case 'defense': return (closing > 0.35 && dist < 0.12) || (mySpin < 0.4 && def.ops.some((o) => o.op === 'mods' && o.deltas.some(([c]) => c === 'tipSpinDrag')));
        case 'counter': return closing > 0.4 && dist < 0.09;
        case 'recovery': return mySpin < 0.45 && dist > 0.1;
        case 'movement': return this.plan === 'evade' || this.plan === 'recover' || (this.plan === 'attack' && dist > 0.1) || myR > 0.8;
        case 'ultimate': return mySpin < 0.25 || (dist < 0.12 && P.abilityStyle !== 'conservative');
        default: return false;
      }
    };
    const eager = P.abilityStyle === 'aggressive' ? 0.6 : P.abilityStyle === 'opportunistic' ? 0.45 : 0.3;
    if (ult && ability.canActivate('ultimate').ok && good(ult) && rng.chance(eager)) { this.wantAbility = 'ultimate'; return; }
    if (sig && ability.canActivate('signature').ok && good(sig) && rng.chance(eager)) { this.wantAbility = 'ability1'; return; }
    if (sec && ability.canActivate('secondary').ok && good(sec) && rng.chance(eager * 0.7)) { this.wantAbility = 'ability2'; return; }
    // spirit techniques
    if (ability.spirit > 60 && myR > 0.6 && closing > 0.3 && rng.chance(0.3)) this.wantAbility = 'tactical1';
    else if (ability.spirit > 70 && this.plan === 'koPush' && rng.chance(0.3)) this.wantAbility = 'tactical2';
  }
}
