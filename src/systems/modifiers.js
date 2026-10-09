// Modifier stack: turns traits, set bonuses, skills, Bit-Beast passives,
// resonance and active abilities into the per-tick modifier channels that the
// physics reads (TopBody.mods). Rules:
//   * duplicate traits never stack (highest magnitude wins)
//   * mul channels: 1 + sum(deltas), add channels: sum(deltas), then clamped
//   * conditional sources apply only while their battle condition holds

import { CHANNEL_LIMITS, TRAIT_INDEX } from '../data/traits.js';
import { defaultMods } from '../physics/topBody.js';
import { conditionOf } from './assembly.js';

export function collectTraitSources(items) {
  // items: array of { slot, item } (item instances). Returns sources.
  const best = new Map();
  for (const { slot, item } of items) {
    if (!item || !item.base) continue;
    for (const t of [...(item.traits || []), ...(item.special ? [item.special] : [])]) {
      const d = TRAIT_INDEX[t.id];
      if (!d || d.kind !== 'conditional') continue;
      const prev = best.get(t.id);
      if (!prev || prev.mag < t.mag) best.set(t.id, { ...t, slot, item });
    }
  }
  const out = [];
  for (const t of best.values()) {
    const d = TRAIT_INDEX[t.id];
    out.push({
      id: 'trait:' + t.id, name: d.name, origin: 'trait', cond: d.cond || { type: 'always' },
      deltas: d.fx(t.mag ?? 1), slot: t.slot, itemUid: t.item.uid, item: t.item,
    });
  }
  return out;
}

export function evaluateCondition(cond, ctx, src) {
  switch (cond.type) {
    case 'always': return true;
    case 'opponentApproaching': return ctx.approaching;
    case 'spinAbove': return ctx.spinFrac > cond.value;
    case 'spinBelow': return ctx.spinFrac < cond.value;
    case 'nearEdge': return ctx.rFrac > 0.72;
    case 'opponentNearEdge': return ctx.oppRFrac > 0.72;
    case 'center': return ctx.rFrac < 0.3;
    case 'slowMoving': return ctx.speed < 0.15;
    case 'fastMoving': return ctx.speed > 0.55;
    case 'surface': return cond.value.includes(ctx.surfaceTag);
    case 'afterCollision': return ctx.sinceCollision < 1.0;
    case 'lateBattle': return ctx.time > 40;
    case 'earlyBattle': return ctx.time < 8;
    case 'critical': return src?.item ? conditionOf(src.item) < 0.2 : false;
    case 'oppositeSpin': return ctx.oppositeSpin;
    case 'abilityActive': return ctx.abilityActive;
    case 'opponentFaster': return ctx.oppSpinFrac > ctx.spinFrac;
    default: return false;
  }
}

export class ModifierStack {
  constructor() {
    this.sources = []; // persistent (traits, sets, skills, beast)
    this.timed = []; // { id, name, deltas, remaining, origin }
    this.active = new Set(); // ids active last evaluation (for UI)
  }

  add(src) { this.sources.push(src); }

  addTimed(id, name, deltas, duration, origin = 'ability') {
    const ex = this.timed.find((t) => t.id === id);
    if (ex) { ex.remaining = Math.max(ex.remaining, duration); ex.deltas = deltas; return ex; }
    const t = { id, name, deltas, remaining: duration, origin };
    this.timed.push(t);
    return t;
  }

  removeTimed(id) { this.timed = this.timed.filter((t) => t.id !== id); }

  hasTimed(id) { return this.timed.some((t) => t.id === id); }

  tick(dt) {
    for (const t of this.timed) t.remaining -= dt;
    this.timed = this.timed.filter((t) => t.remaining > 0);
  }

  // Compute channels into `out` (TopBody.mods).
  evaluate(ctx, out = defaultMods()) {
    const sums = {};
    this.active.clear();
    const addDeltas = (deltas) => {
      for (const [ch, v] of deltas) sums[ch] = (sums[ch] || 0) + v;
    };
    for (const s of this.sources) {
      if (evaluateCondition(s.cond, ctx, s)) { addDeltas(s.deltas); this.active.add(s.id); }
    }
    for (const t of this.timed) { addDeltas(t.deltas); this.active.add(t.id); }
    for (const [ch, lim] of Object.entries(CHANNEL_LIMITS)) {
      const s = sums[ch] || 0;
      const v = lim.type === 'mul' ? 1 + s : s;
      out[ch] = Math.max(lim.min, Math.min(lim.max, v));
    }
    return out;
  }
}
