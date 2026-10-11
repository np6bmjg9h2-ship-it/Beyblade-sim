// AI controller. Produces the same control frame a human produces. It
// observes the battle through a delayed snapshot buffer (reaction time) and
// re-plans at a personality-specific interval rather than every frame.

import { Vec3, clamp } from '../core/math.js';
import { Rng } from '../core/rng.js';
import { scaledProfile } from '../data/aiProfiles.js';
import { TECHNIQUE_INDEX } from '../data/launchers.js';
import { aiReleaseCharge, MAX_LEAN } from './launch.js';

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
    const { arena, side, gear, spinOptions, oppSpin } = ctx;
    const techs = (P.technique || ['normal']).filter((t) => !TECHNIQUE_INDEX[t]?.adv || (this.knownTechniques ? this.knownTechniques.includes(t) : true));
    const danger = arena.danger || 0;
    // dangerous stadiums: cautious AIs prefer controlled launches
    let tech = techs.length ? rng.pick(techs) : 'normal';
    if (danger > 0.3 && techs.includes('controlled') && rng.chance(P.edgeCaution * danger)) tech = 'controlled';
    const rBase = (P.centerPref > 0.7 ? 0.035 : P.aggression > 0.7 ? 0.09 : 0.06) * (1 - 0.4 * danger);
    const ang = side === 0 ? Math.PI : 0;
    const a = ang + rng.range(-0.5, 0.5);
    const x = Math.cos(a) * (rBase + rng.range(-0.01, 0.02));
    const z = Math.sin(a) * (rBase + rng.range(-0.01, 0.02));
    // lean toward the centre/opponent for aggressive builds
    // banked launches curve hard on flat tips: lean less where exits are open
    const leanMul = clamp(1 - danger * (0.35 + 0.6 * P.edgeCaution), 0.15, 1);
    const lean = clamp(P.lean * leanMul + rng.range(-0.03, 0.03), 0, MAX_LEAN);
    const dir = Math.atan2(-z, -x) + rng.range(-0.4, 0.4);
    // spin: technical AIs may pick opposite spin if their launcher allows
    let spin = spinOptions[0];
    if (spinOptions.length > 1 && oppSpin && P.steerSkill > 0.8 && rng.chance(0.5)) {
      spin = spinOptions.find((s) => s !== oppSpin) || spin;
    }
    const risk = P.risk > 0.8 ? 0.6 : 0;
    const rel = aiReleaseCharge(rng, P.launchSkill, gear, tech, risk);
    // release timing relative to IGNITE (seconds)
    const releaseOffset = Math.abs(rng.gauss(0.04, 0.12 * (1 - P.launchSkill))) - 0.02;
    return { aim: { x, z, lean, dir }, technique: tech, spin, charge: rel.charge, releaseOffset };
  }

  // ------------------------------------------------------------ battle

  observe(t, me, opp, meSpirit, oppSpirit) {
    this.history.push({
      t,
      opp: { p: opp.p.clone(), v: opp.v.clone(), spinFrac: opp.spinFraction(), active: opp.active, spirit: oppSpirit },
      me: { p: me.p.clone(), v: me.v.clone(), spinFrac: me.spinFraction(), spirit: meSpirit },
    });
    while (this.history.length > 2 && this.history[1].t <= t - this.profile.reaction) this.history.shift();
  }

  delayed() { return this.history[0]; }

  update(dt, ctx) {
    const c = emptyControls();
    const P = this.profile;
    const { time, me, opp, arena, ability, oppAbility } = ctx;
    if (P.passive) return c;
    this.observe(time, me.top, opp.top, ability.spirit, oppAbility?.spirit ?? 0);
    const snap = this.delayed();
    if (!snap || !me.top.active) return c;

    const R = arena.radius;
    const myP = me.top.p, myV = me.top.v;
    const oP = snap.opp.p, oV = snap.opp.v;
    const dx = oP.x - myP.x, dz = oP.z - myP.z;
    const dist = Math.hypot(dx, dz);
    const relVx = oV.x - myV.x, relVz = oV.z - myV.z;
    const closing = dist > 1e-4 ? -(dx * relVx + dz * relVz) / dist : 0;
    const myR = Math.hypot(myP.x, myP.z) / R;
    const oppR = Math.hypot(oP.x, oP.z) / R;
    const mySpin = me.top.spinFraction();
    const oppSpin = snap.opp.spinFrac;

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
      this.decide({ dist, closing, myR, oppR, mySpin, oppSpin, snap, me, arena, ability, oppAbility });
    }

    // steering target per plan
    const T = this.steerTarget.set(0, 0, 0);
    const lead = 0.12 + 0.1 * P.steerSkill;
    const px = oP.x + oV.x * lead, pz = oP.z + oV.z * lead;
    switch (this.plan) {
      case 'attack': T.set(px - myP.x, 0, pz - myP.z); break;
      case 'koPush': {
        // get behind the opponent relative to the push direction (toward the
        // nearest exit, or straight outward) and drive through it
        const d = this.pushDir;
        const behindX = oP.x - d.x * 0.045, behindZ = oP.z - d.z * 0.045;
        const toBehind = Math.hypot(behindX - myP.x, behindZ - myP.z);
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
        const oR = Math.hypot(oP.x, oP.z);
        let cx = 0, cz = 0;
        if (oR < 0.06) { const ux = oR > 1e-3 ? oP.x / oR : 1, uz = oR > 1e-3 ? oP.z / oR : 0; cx = oP.x - ux * 0.075; cz = oP.z - uz * 0.075; }
        T.set(cx - myP.x, 0, cz - myP.z);
        if (Math.hypot(cx - myP.x, cz - myP.z) < 0.02) T.set(0, 0, 0);
        break;
      }
      case 'circle': {
        const r = Math.max(1e-3, Math.hypot(myP.x, myP.z));
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
    const myR0 = Math.hypot(myP.x, myP.z);
    let desSpeed = { attack: 0.5 + 0.45 * P.aggression, koPush: 0.85, evade: 0.45, recover: 0.4, center: 0.3, circle: 0.3 }[this.plan] ?? 0.3;
    if (this.plan === 'center' || this.plan === 'recover') desSpeed = Math.min(desSpeed, myR0 * 2.5);
    const ux = mag > 1e-4 ? T.x / mag : 0, uz = mag > 1e-4 ? T.z / mag : 0;
    const gain = 4 + 2 * P.steerSkill; // 1 / response time (s)
    T.set((ux * desSpeed - myV.x) * gain, 0, (uz * desSpeed - myV.z) * gain);
    const tl = T.length();
    if (tl > 1) T.scale(1 / tl);
    // steering economy: endurance AIs only steer firmly when it matters
    const urgent = this.plan === 'recover' || this.plan === 'koPush' || this.plan === 'evade' || this.plan === 'attack';
    T.scale(urgent ? 1 : 1 - P.steerEconomy * 0.6);
    if (!urgent && T.length() < 0.25 * P.steerEconomy) T.set(0, 0, 0);
    // imperfect steering: low-frequency noise inversely proportional to skill
    if (this.rng.chance(0.05)) this.noise.set(this.rng.gauss(0, 1), 0, this.rng.gauss(0, 1)).scale((1 - P.steerSkill) * 0.45);
    T.add(this.noise);
    // smooth like a thumb on a stick
    const k = clamp(dt * (6 + 10 * P.steerSkill), 0, 1);
    this.steer.x += (T.x - this.steer.x) * k;
    this.steer.z += (T.z - this.steer.z) * k;
    const sm = Math.hypot(this.steer.x, this.steer.z);
    if (sm > 1) this.steer.scale(1 / sm);
    c.steer.copy(this.steer);

    // reflex actions
    if (this.wantDash) { c.dash = true; this.wantDash = false; }
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
    // pressWhenBehind (0..1): a top losing the spin race can only win by a
    // knock-out or shatter, so pressing personalities attack harder when behind
    // instead of retreating (0 keeps the classic "retreat when behind").
    const press = P.pressWhenBehind || 0;
    const behind = Math.max(0, -spinLead);
    const u = {};
    u.attack = P.aggression * (1 + spinLead * 1.5) + press * behind * 2 + (dist < 0.12 ? 0.15 : 0);
    u.koPush = oppR > 0.5 ? P.aggression * 0.8 + P.risk * 0.6 + (oppR - 0.5) * 2 : 0;
    u.evade = (spinLead < -0.08 ? (1 - P.aggression) * 0.9 * (1 - press) : 0) + (closing > 0.5 && dist < 0.1 ? (1 - P.aggression) * 0.6 : 0);
    u.center = P.centerPref * (1 - P.aggression) + 0.1;
    // recover early when drifting outward fast (predicted position), sooner in open stadiums
    const danger = s.arena.danger || 0;
    const myP = me.top.p, myV = me.top.v;
    const R = s.arena.radius;
    const vOut = (myP.x * myV.x + myP.z * myV.z) / Math.max(1e-4, Math.hypot(myP.x, myP.z));
    const predR = myR + Math.max(0, vOut) * (P.reaction + P.decisionInterval) / R;
    const edgeLine = 0.78 - 0.18 * danger;
    u.recover = predR > edgeLine ? P.edgeCaution * 1.6 + (predR - edgeLine) * 3 : 0;
    u.circle = P.aggression > 0.4 && P.aggression < 0.85 ? 0.25 : 0;
    // contacts that cost more spin than they take: back off (less so for brawlers)
    const bad = clamp((this.exchange || 0) * 18, 0, 1);
    if (bad > 0) {
      u.attack *= 1 - bad * (1 - 0.6 * P.aggression);
      u.evade += bad * 0.6 * (1 - P.aggression);
    }
    // late battle: whoever is ahead on spin plays safe
    if (spinLead > 0.15 && mySpin < 0.35) { u.evade += 0.4; u.attack *= 0.6; }
    // hysteresis
    u[this.plan] = (u[this.plan] || 0) + 0.12;
    let best = 'center', bv = -1;
    for (const [k, v] of Object.entries(u)) if (v > bv) { bv = v; best = k; }
    if (best !== this.plan) { this.plan = best; this.planT = 0; }

    const opp = s.snap.opp;
    // push direction for knock-outs: toward the nearest exit if one is close in angle
    {
      const arena = s.arena;
      const oa = Math.atan2(opp.p.z, opp.p.x);
      let best = null, bestD = 1e9;
      for (const o of arena.openings) {
        let dAng = Math.abs(((o.center - oa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dAng < bestD) { bestD = dAng; best = o; }
      }
      const R = arena.radius;
      if (best && bestD < 1.2) this.pushDir.set(Math.cos(best.center) * R - opp.p.x, 0, Math.sin(best.center) * R - opp.p.z).normalize();
      else { const r = Math.max(1e-3, Math.hypot(opp.p.x, opp.p.z)); this.pushDir.set(opp.p.x / r, 0, opp.p.z / r); }
    }
    // dash: committed attack inside striking range
    if (this.plan === 'attack' && dist > 0.045 && dist < 0.14 && rng.chance(P.dashUse * 0.35)) this.wantDash = true;
    if (this.plan === 'koPush' && dist < 0.08) {
      // only dash when lined up behind the opponent along the push direction
      const ax = (opp.p.x - me.top.p.x) / Math.max(1e-4, dist), az = (opp.p.z - me.top.p.z) / Math.max(1e-4, dist);
      if (ax * this.pushDir.x + az * this.pushDir.z > 0.8 && rng.chance(P.dashUse * 0.6)) this.wantDash = true;
    }
    // counter an incoming strike
    if (closing > 0.45 && dist < 0.08 && !this.counteredApproach) {
      this.counteredApproach = true;
      if (rng.chance(P.counterSkill)) this.wantCounter = true;
    }
    if (closing < 0.1 || dist > 0.12) this.counteredApproach = false;
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
