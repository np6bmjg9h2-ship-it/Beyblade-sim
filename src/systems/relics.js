// Relics: earning (checked from the save's own records, so relics already
// earned in older saves arrive on the next save or load), the item each one
// becomes, and recasting one that was lost. Relics are unique: one per save.

import { RELICS, RELIC_INDEX, RECAST_COST } from '../data/relics.js';
import { PART_INDEX } from '../data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX } from '../data/launchers.js';
import { mixSeeds } from '../core/rng.js';
import { createItem } from './items.js';
import { addItem } from './loot.js';

const baseDef = (id) => PART_INDEX[id] || LAUNCHER_INDEX[id] || CABLE_INDEX[id] || null;

export function relicProgress(profile, def) {
  const [have, need] = def.earn.progress(profile);
  return { have, need, met: have >= need };
}

// Every relic with its state for the Journal.
export function relicStatus(profile) {
  const earned = profile.relics?.earned || {};
  const owned = new Set(Object.values(profile.inventory || {}).map((i) => i.relic).filter(Boolean));
  return RELICS.map((def) => ({ def, earned: !!earned[def.id], earnedAt: earned[def.id]?.at || null, owned: owned.has(def.id), ...relicProgress(profile, def) }));
}

// The item a relic becomes: perfect tolerances, fixed traits, its signature.
export function createRelicItem(profile, id, source = 'Relic') {
  const def = RELIC_INDEX[id];
  if (!def) throw new Error('Unknown relic ' + id);
  const n = (profile.relics.casts[id] = (profile.relics.casts[id] || 0) + 1);
  const it = createItem({
    base: def.base, rarity: 'relic', level: Math.max(20, profile.player?.level || 1), perfect: true,
    seed: mixSeeds(profile.seeds?.loot || 1, 'relic', id, n),
    traits: def.traits.map(([tid, mag]) => ({ id: tid, mag })), special: { id: def.signature, mag: 1 }, set: null, source,
  });
  it.relic = id;
  it.title = def.name;
  it.visual = { color: def.color, accent: def.accent, finish: 'prism' };
  return it;
}

// Grant every relic whose path is complete and that this save hasn't earned
// yet. Returns the new items (the caller announces them).
export function checkRelics(profile) {
  const R = profile.relics || (profile.relics = { earned: {}, casts: {} });
  R.earned = R.earned || {};
  R.casts = R.casts || {};
  const got = [];
  for (const def of RELICS) {
    if (R.earned[def.id] || !baseDef(def.base)) continue;
    let met = false;
    try { met = relicProgress(profile, def).met; } catch { met = false; }
    if (!met) continue;
    const it = createRelicItem(profile, def.id, `Relic: ${def.earn.text.replace(/\.$/, '')}`);
    addItem(profile, it);
    R.earned[def.id] = { at: Date.now() };
    got.push(it);
  }
  return got;
}

// An earned relic that is no longer in the inventory can be cast again.
export function canRecast(profile, id) {
  const st = relicStatus(profile).find((s) => s.def.id === id);
  if (!st) return { ok: false, reason: 'Unknown relic' };
  if (!st.earned) return { ok: false, reason: 'Earn this relic first' };
  if (st.owned) return { ok: false, reason: 'You already have it' };
  return { ok: true };
}

export function recastRelic(profile, id, { canAfford, pay }) {
  const c = canRecast(profile, id);
  if (!c.ok) return c;
  if (!canAfford(profile, RECAST_COST)) return { ok: false, reason: 'Not enough resources' };
  pay(profile, RECAST_COST);
  const it = createRelicItem(profile, id, 'Relic: recast');
  addItem(profile, it);
  return { ok: true, item: it, cost: RECAST_COST };
}

export { RELICS, RELIC_INDEX, RECAST_COST };
