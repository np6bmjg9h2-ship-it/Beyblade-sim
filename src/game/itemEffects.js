// Reactive item effects: triggers on real battle events from traits (and
// synergies, which arrive as plain data on the participant). Every effect
// goes through what the game already simulates: timed modifier channels, the
// spirit meter, the shared next-hit lock-stress multiplier and the
// simulation's spin restore (booked to the energy ledger). Cooldowns and
// per-round limits keep triggers from chaining; the RNG is seeded from the
// battle, so battles and replays repeat exactly.
//
// Order inside one impact: abilities, then Rift statuses, then item effects.

import { Rng, mixSeeds } from '../core/rng.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { effMag, requirementsMet, HEAVY_HIT } from '../systems/effectSpec.js';
import * as dm from '../core/dmath.js';

const MIN_HIT = 0.008; // N·s: lighter touches never trigger anything
const EDGE_IN = 0.78, EDGE_OUT = 0.6; // fraction of the stadium radius

// Reactive traits on a set of { slot, item } (best magnitude per trait id).
export function collectReactive(items, parts = null) {
  const best = new Map();
  for (const { item } of items) {
    if (!item?.base) continue;
    for (const t of [...(item.traits || []), ...(item.special ? [item.special] : [])]) {
      const d = TRAIT_INDEX[t.id];
      if (!d?.react) continue;
      if (d.requires && !requirementsMet(d.requires, parts)) continue;
      const mag = effMag(d, t, item);
      const prev = best.get(t.id);
      if (!prev || prev.mag < mag) best.set(t.id, { id: 'trait:' + t.id, name: d.name, origin: 'trait', mag, r: d.react(mag) });
    }
  }
  return [...best.values()];
}

export function hasItemEffects(fighters) {
  return fighters.some((f) => (f.p.reactive?.length) || collectReactive(f.items, null).length);
}

export class ItemEffects {
  constructor(battle) {
    this.b = battle;
    this.rng = new Rng(mixSeeds(battle.seed, battle.round, 'items'));
    this.list = battle.fighters.map((f) => [...(f.p.reactive || []), ...collectReactive(f.items, f.assembly?.parts)]
      .map((e) => ({ ...e, ready: 0, uses: 0, stacks: 0, fired: 0 })));
    this.state = battle.fighters.map(() => ({ armed: 0, speed: 0, low: {}, edge: false }));
    this.off = [
      battle.on('ability', (e) => this.onEvent(e.fighter, 'ability')),
      battle.on('technique', (e) => { if ((e.name === 'dash' && e.phase !== 'windup') || e.name === 'counter') this.onEvent(e.fighter, e.name); }),
    ];
  }

  dispose() { for (const off of this.off) off(); this.off = []; }

  // Trigger counts for the "what powered your top" breakdown.
  report(fi) { return this.list[fi].filter((e) => e.fired).map((e) => ({ id: e.id, name: e.name, origin: e.origin, fired: e.fired })); }

  fire(f, e) {
    const t = this.b.battleTime;
    if (e.uses >= e.r.limit || t < e.ready) return false;
    if (e.r.chance < 1 && !this.rng.chance(e.r.chance)) return false;
    e.ready = t + e.r.cooldown;
    e.uses++; e.fired++;
    const x = e.r.effect;
    if (x.deltas) {
      e.stacks = x.stacks > 1 ? Math.min(x.stacks, (f.mods.hasTimed(e.id) ? e.stacks : 0) + 1) : 1;
      f.mods.addTimed(e.id, e.stacks > 1 ? `${e.name} ×${e.stacks}` : e.name, x.deltas.map(([c, v]) => [c, v * e.stacks]), x.duration, e.origin);
    }
    if (x.spirit) f.ability.gain(x.spirit);
    if (x.stress) this.state[f.index].armed = Math.max(this.state[f.index].armed, x.stress);
    let energy = 0; // spin energy restored (the ledger nets it with ability costs)
    if (x.spin && f.top.active) {
      const top = f.top, w = top.spinAbs, w2 = Math.min(top.maxSpinRate, w + x.spin * top.maxSpinRate);
      if (w2 > w) energy = this.b.sim.restoreSpin(top, 0.5 * top.I3 * (w2 * w2 - w * w));
    }
    this.b.emit('itemEffect', { fighter: f, id: e.id, name: e.name, origin: e.origin, energy });
    return true;
  }

  onEvent(f, on, J = 0) {
    if (!f?.top?.active || !this.list[f.index]) return;
    for (const e of this.list[f.index]) {
      if (e.r.on !== on) continue;
      if (J && J < Math.max(MIN_HIT, e.r.min || 0)) continue;
      this.fire(f, e);
    }
  }

  // Before the simulation step: keep armed hits armed, remember speeds for
  // "who hit whom", and watch spin and edge thresholds.
  preTick() {
    const R = this.b.arena.radius;
    for (const f of this.b.fighters) {
      const top = f.top;
      if (!top?.active || !f.launch?.launched) continue;
      const S = this.state[f.index];
      if (S.armed) top.nextHitStressMul = Math.max(top.nextHitStressMul || 1, S.armed);
      S.speed = dm.hypot(top.v.x, top.v.z);
      if (this.b.phase !== 'battle') continue;
      const spin = top.spinFraction();
      for (const e of this.list[f.index]) {
        if (e.r.on === 'lowSpin' && !S.low[e.id] && spin < e.r.value) { S.low[e.id] = true; this.fire(f, e); }
      }
      const r = dm.hypot(top.p.x, top.p.z) / R;
      if (r > EDGE_IN) S.edge = true;
      else if (S.edge && r < EDGE_OUT) { S.edge = false; this.onEvent(f, 'edgeEscape'); }
    }
  }

  onImpact(fa, fb, ev) {
    const J = ev.impulse;
    for (const [f, o] of [[fa, fb], [fb, fa]]) {
      const S = this.state[f.index];
      if (S.armed) { S.armed = 0; f.top.nextHitStressMul = 1; }
      if (J < MIN_HIT) continue;
      this.onEvent(f, 'hit', J);
      if (J >= HEAVY_HIT) {
        this.onEvent(f, 'heavyHit', J);
        // struck: the opponent was the faster top going into the hit
        if (this.state[o.index].speed > S.speed) this.onEvent(f, 'struck', J);
      }
    }
  }

  onWall(f, ev) { if (ev.impulse >= MIN_HIT) this.onEvent(f, 'wall', ev.impulse); }

  onLockSlip(f) { this.onEvent(f, 'lockSlip'); }
}
