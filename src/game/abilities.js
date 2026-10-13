// Ability runtime for one fighter: the spirit meter, Spirit Chip abilities and
// the built-in battle techniques (dash, brace, counter stance, spirit guard,
// spirit surge). Every effect is a defined physical change with an explicit
// energy source:
//   dash/force    -> velocity bought with spin energy (60% conversion)
//   shockwave     -> impulse on the opponent, energy injected from the spirit meter
//   restore       -> spin energy injected from the spirit meter after a channel
//   mods/lift     -> timed modifier channels read by the physics
// All injected energy is booked to the top's 'ability' ledger entry.

import { Vec3, clamp } from '../core/math.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { GRAVITY } from '../physics/topBody.js';
import * as dm from '../core/dmath.js';

export const SPIRIT_MAX = 100;
const DASH_EFF = 0.6;

export const TECHNIQUE_DEFS = {
  dash: { name: 'Dash', cooldown: 2.2, speed: 0.42, desc: 'Spirit-step in the stick direction (toward the opponent with no input). Costs spin.' },
  brace: { name: 'Grip Brace', desc: 'Hold: tip grip +35% and tip drag +40%. Resists knockback at a stamina cost.' },
  counter: { name: 'Counter Stance', cooldown: 1.2, whiff: 2.2, window: 0.22, staggerT: 0.6, staggerGuard: 2, desc: 'A 0.22 s window: if the opponent strikes you inside it, the hit is countered (restitution when struck +45%, 1.6× lock stress back, +25 spirit, wobble damping after) and the striker staggers (steering −50% for 0.6 s). Your own strikes and even clashes never trigger it. A miss locks it for 2.2 s.' },
  guard: { name: 'Spirit Guard', cost: 25, cooldown: 4, duration: 2, desc: '25 spirit: lock strength +40% and wobble damping +5/s for 2 s.' },
  surge: { name: 'Spirit Surge', cost: 25, cooldown: 4, duration: 2.5, desc: '25 spirit: steering force +60% and steering efficiency +50% for 2.5 s.' },
};

export const PASSIVE_SPIRIT = 1.0; // per second
const _v = new Vec3();

export class AbilityRuntime {
  constructor({ fighter, beast, sim, skills = {}, rules = {} }) {
    this.f = fighter;
    this.sim = sim;
    this.beastState = beast || null; // { id, bondLevel, awakened }
    this.beast = beast ? BEAST_INDEX[beast.id] : null;
    this.skills = skills;
    this.enabled = rules.abilities !== false;
    this.spirit = 0;
    this.cool = { signature: 0, secondary: 0, ultimate: 0, dash: 0, counter: 0, guard: 0, surge: 0 };
    this.channel = null; // { remaining, energy, name, interruptible }
    this.counter = null; // { remaining, def, source }
    this.nextHit = null; // { remaining, stressMul, id }
    this.forces = []; // { dir, magnitude, remaining }
    this.bracing = false;
    this.log = [];
    this.lastActivation = null;
    this.bondPower = beast ? 1 + (beast.bondLevel >= 7 ? 0.08 : 0) : 1;
  }

  // ------------------------------------------------------------ queries

  slotDef(slot) {
    if (!this.beast) return null;
    const d = this.beast.abilities[slot];
    if (!d) return null;
    if (slot === 'secondary' && (this.beastState.bondLevel || 1) < (d.bond || 0)) return null;
    if (slot === 'ultimate' && !this.beastState.awakened) return null;
    return d;
  }

  costOf(slot) {
    const d = this.slotDef(slot);
    if (!d) return Infinity;
    return d.cost * (1 - (this.skills.abilityCost || 0));
  }

  canActivate(slot, ctx = {}) {
    if (!this.enabled) return { ok: false, reason: 'Abilities disabled' };
    const top = this.f.top;
    if (!top.active) return { ok: false, reason: 'Not spinning' };
    const d = this.slotDef(slot);
    if (!d) return { ok: false, reason: slot === 'ultimate' ? 'Not awakened' : 'Locked' };
    if (this.cool[slot] > 0) return { ok: false, reason: 'Cooldown' };
    if (this.spirit + 1e-6 < this.costOf(slot)) return { ok: false, reason: 'Low spirit' };
    if (this.channel) return { ok: false, reason: 'Channelling' };
    if (d.condition?.spinBelow && top.spinFraction() > d.condition.spinBelow) return { ok: false, reason: `Needs spin below ${Math.round(d.condition.spinBelow * 100)}%` };
    return { ok: true };
  }

  // ------------------------------------------------------------ spirit

  gain(amount) {
    const mul = this.f.top.mods.abilityCharge * (1 + (this.skills.spiritGain || 0));
    this.spirit = clamp(this.spirit + amount * mul, 0, SPIRIT_MAX);
  }

  // ------------------------------------------------------------ activation

  activate(slot, ctx) {
    const chk = this.canActivate(slot, ctx);
    if (!chk.ok) return chk;
    const d = this.slotDef(slot);
    this.spirit -= this.costOf(slot);
    const cdCut = (this.skills.abilityCooldown || 0) + (slot === 'signature' ? this.skills.signatureCooldown || 0 : 0);
    this.cool[slot] = d.cooldown * Math.max(0.2, 1 - cdCut);
    const durMul = this.f.top.mods.abilityDuration * (1 + (this.skills.abilityDuration || 0));
    const power = this.f.top.mods.abilityPower * this.bondPower * (1 + (this.skills.abilityPower || 0));
    for (const op of d.ops) this.runOp(op, d, ctx, durMul, power, slot);
    this.lastActivation = { slot, def: d, time: this.sim.time };
    this.f.stats.abilitiesUsed = (this.f.stats.abilitiesUsed || 0) + 1;
    this.f.battle.emit('ability', { fighter: this.f, slot, def: d, beast: this.beast });
    return { ok: true };
  }

  runOp(op, d, ctx, durMul, power, slot) {
    const f = this.f, top = f.top, mods = f.mods;
    const key = `${slot}:${d.id}`;
    switch (op.op) {
      case 'mods':
        mods.addTimed(key, d.name, op.deltas.map(([c, v]) => [c, v * (c === 'faceAngle' ? power : 1)]), op.duration * durMul, 'ability');
        break;
      case 'lift':
        mods.addTimed(key + ':lift', d.name, [['liftForce', op.value]], op.duration * durMul, 'ability');
        break;
      case 'dash': {
        const dir = this.direction(op.dir, ctx);
        if (dir) this.sim.applyDash(top, dir, op.speed * power, DASH_EFF * top.mods.steerEfficiency);
        break;
      }
      case 'force':
        this.forces.push({ dir: op.dir, magnitude: op.magnitude * power, remaining: op.duration * durMul });
        break;
      case 'shockwave': {
        const opp = ctx.opponent?.top;
        if (opp && opp.active) {
          const hit = this.sim.applyShockwave(top, opp, op.impulse * power, op.range);
          if (hit) {
            f.stats.abilityHits = (f.stats.abilityHits || 0) + 1;
            f.battle.emit('abilityHit', { fighter: f, target: ctx.opponent, def: d, impulse: hit });
          }
        }
        f.battle.emit('shockwave', { fighter: f, range: op.range, def: d });
        break;
      }
      case 'restore':
        if (op.channel > 0) this.channel = { remaining: op.channel, energy: op.energy * power, name: d.name, interruptible: op.interruptible !== false };
        else this.sim.restoreSpin(top, op.energy * power);
        break;
      case 'counter':
        this.counter = { remaining: op.window * durMul, op, def: d, source: 'beast' };
        mods.addTimed('counterWindow', d.name, op.deltas.filter(([c]) => c === 'restitutionWhenHit'), op.window * durMul, 'ability');
        top.nextHitStressMul = op.stressMul;
        break;
      case 'nextHit':
        this.nextHit = { remaining: op.window * durMul, stressMul: op.stressMul, def: d };
        top.nextHitStressMul = op.stressMul;
        if (op.deltas) mods.addTimed(key + ':armed', d.name, op.deltas, op.window * durMul, 'ability');
        break;
      default:
    }
  }

  direction(kind, ctx) {
    const top = this.f.top;
    if (kind === 'opponent' && ctx.opponent?.top) {
      const o = ctx.opponent.top;
      // lead the target slightly
      _v.set(o.p.x + o.v.x * 0.08 - top.p.x, 0, o.p.z + o.v.z * 0.08 - top.p.z);
      if (_v.length() > 1e-4) return _v.normalize().clone();
      return null;
    }
    if (kind === 'stick') {
      const s = ctx.steer;
      if (s && dm.hypot(s.x, s.z) > 0.2) return new Vec3(s.x, 0, s.z).normalize();
      // no input: dash toward the opponent
      return this.direction('opponent', ctx);
    }
    if (kind === 'tangent') {
      const r = dm.hypot(top.p.x, top.p.z);
      if (r < 1e-3) return new Vec3(1, 0, 0);
      const s = -top.spinDir;
      return new Vec3((-top.p.z / r) * s, 0, (top.p.x / r) * s);
    }
    if (kind === 'center') {
      _v.set(-top.p.x, 0, -top.p.z);
      return _v.length() > 1e-4 ? _v.normalize().clone() : null;
    }
    return null;
  }

  // ------------------------------------------------------------ techniques

  technique(name, ctx) {
    const f = this.f, top = f.top, mods = f.mods;
    if (!top.active) return false;
    const T = TECHNIQUE_DEFS[name];
    const sk = this.skills;
    switch (name) {
      case 'dash': {
        if (this.cool.dash > 0) return false;
        const dir = this.direction('stick', ctx);
        if (!dir) return false;
        this.sim.applyDash(top, dir, T.speed * (1 + (sk.dashPower || 0)), DASH_EFF * top.mods.steerEfficiency);
        this.cool.dash = T.cooldown * (1 - (sk.dashCooldown || 0));
        f.stats.dashes = (f.stats.dashes || 0) + 1;
        f.battle.emit('technique', { fighter: f, name: 'dash', dir });
        return true;
      }
      case 'counter': {
        if (this.cool.counter > 0 || this.counter) return false;
        const win = T.window + (sk.counterWindow || 0);
        this.counter = { remaining: win, op: { deltas: [['nutationDamping', 8]], duration: 0.5, stressMul: 1.6, spirit: 25, stagger: true }, def: { name: T.name, id: 'counterStance' }, source: 'technique' };
        mods.addTimed('counterWindow', T.name, [['restitutionWhenHit', 0.45 + (sk.counterPower || 0)]], win, 'technique');
        top.nextHitStressMul = 1.6;
        f.battle.emit('technique', { fighter: f, name: 'counter' });
        return true;
      }
      case 'guard': {
        if (this.cool.guard > 0 || this.spirit < T.cost) return false;
        this.spirit -= T.cost; this.cool.guard = T.cooldown;
        mods.addTimed('spiritGuard', T.name, [['burstThreshold', 0.4], ['nutationDamping', 5]], T.duration * (1 + (sk.techniqueDuration || 0)), 'technique');
        f.battle.emit('technique', { fighter: f, name: 'guard' });
        return true;
      }
      case 'surge': {
        if (this.cool.surge > 0 || this.spirit < T.cost) return false;
        this.spirit -= T.cost; this.cool.surge = T.cooldown;
        mods.addTimed('spiritSurge', T.name, [['steerForce', 0.6], ['steerEfficiency', 0.5]], T.duration * (1 + (sk.techniqueDuration || 0)), 'technique');
        f.battle.emit('technique', { fighter: f, name: 'surge' });
        return true;
      }
      default: return false;
    }
  }

  setBrace(on) {
    const mods = this.f.mods;
    if (on && this.f.top.active) {
      if (!this.bracing) this.f.battle.emit('technique', { fighter: this.f, name: 'brace' });
      mods.addTimed('brace', 'Grip Brace', [['tipFriction', 0.35 + (this.skills.bracePower || 0)], ['tipSpinDrag', 0.4]], 0.1, 'technique');
    }
    this.bracing = on;
  }

  // ------------------------------------------------------------ per tick

  update(dt, ctx) {
    for (const k in this.cool) if (this.cool[k] > 0) this.cool[k] = Math.max(0, this.cool[k] - dt);
    const top = this.f.top;
    // passive spirit charge while spinning (was 2.0/s: abilities came on a
    // timer; now most spirit comes from striking, countering and launching)
    if (top.active && this.enabled) this.gain(dt * PASSIVE_SPIRIT);
    // channel
    if (this.channel) {
      this.channel.remaining -= dt;
      if (this.channel.remaining <= 0) {
        const e = this.sim.restoreSpin(top, this.channel.energy);
        this.f.battle.emit('restore', { fighter: this.f, energy: e, name: this.channel.name });
        this.channel = null;
      }
    }
    // counter window
    if (this.counter) {
      this.counter.remaining -= dt;
      if (this.counter.remaining <= 0) {
        // whiff
        this.cool.counter = this.counter.source === 'technique' ? TECHNIQUE_DEFS.counter.whiff : this.cool.counter;
        top.nextHitStressMul = 1;
        this.counter = null;
        this.f.battle.emit('counterWhiff', { fighter: this.f });
      }
    }
    if (this.nextHit) {
      this.nextHit.remaining -= dt;
      if (this.nextHit.remaining <= 0) { this.nextHit = null; top.nextHitStressMul = 1; }
    }
    // sustained forces -> top.extForce (paid from spin inside the simulation)
    if (!top.extForce) top.extForce = new Vec3();
    top.extForce.set(0, 0, 0);
    top.extForceSource = 'spin';
    for (const fo of this.forces) {
      fo.remaining -= dt;
      const dir = this.direction(fo.dir, ctx);
      if (dir && top.contactTip) top.extForce.addScaled(dir, fo.magnitude * top.mass * GRAVITY);
    }
    this.forces = this.forces.filter((x) => x.remaining > 0);
  }

  // Called by the battle for each top/top impact this fighter took part in.
  // struck: the opponent was the striker (battle.js decides; false when this
  // top struck or the two met evenly). Counters trigger only when struck.
  onImpact(ev, opponentAbility, struck = true) {
    const f = this.f;
    // channelled restore is interrupted by a hit
    if (this.channel && this.channel.interruptible) {
      f.battle.emit('interrupted', { fighter: f, name: this.channel.name });
      this.channel = null;
    }
    // counter triggers: only on a hit the opponent made
    if (this.counter && struck) {
      const op = this.counter.op;
      f.mods.removeTimed('counterWindow');
      if (op.deltas) f.mods.addTimed('counterFollow', this.counter.def.name, op.deltas.filter(([c]) => c !== 'restitutionWhenHit'), op.duration || 0.5, 'ability');
      if (op.spirit) this.gain(op.spirit);
      if (op.shockwave && opponentAbility) this.sim.applyShockwave(f.top, opponentAbility.f.top, op.shockwave, 0.14);
      // the striker staggers (no re-stagger within staggerGuard seconds)
      const T = TECHNIQUE_DEFS.counter, of = opponentAbility?.f, now = f.battle.battleTime;
      if (op.stagger && of && !(now < (opponentAbility.staggerGuardUntil ?? -1))) {
        of.mods.addTimed('countered', 'Countered', [['steerForce', -0.5]], T.staggerT, 'ability');
        opponentAbility.staggerGuardUntil = now + T.staggerGuard;
        f.battle.emit('staggered', { fighter: of, by: f });
      }
      f.stats.counters = (f.stats.counters || 0) + 1;
      this.cool.counter = this.counter.source === 'technique' ? TECHNIQUE_DEFS.counter.cooldown : this.cool.counter;
      f.battle.emit('counter', { fighter: f, def: this.counter.def });
      this.counter = null;
    }
    if (this.nextHit) {
      f.battle.emit('nextHitLanded', { fighter: f, def: this.nextHit.def });
      this.nextHit = null;
    }
    f.top.nextHitStressMul = 1;
  }
}
