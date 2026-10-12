// Item validation: checks an item instance before it enters an inventory or
// a battle, and on every save load (impossible or corrupted items are
// quarantined by systems/profile.js, never silently deleted). Limits are
// generous enough for every legitimate source: loot, store, crafting, the
// Forge, Rift engraving, trait transfers, prototypes and old saves.

import { RARITY_INDEX } from '../data/rarity.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { SET_INDEX } from '../data/sets.js';
import { SLOTS } from '../data/parts.js';
import { baseOf } from './items.js';
import { resolvePart } from './assembly.js';

const ALL_SLOTS = [...SLOTS, 'launcher', 'cable'];
const MAX_TRAITS = 6;
// sane physical bounds for a resolved part (mm, g)
const BOUNDS = { mass: [0.05, 80], rOut: [1, 30], radius: [1, 30], mu: [0, 2], notches: [1, 12], thickness: [0.1, 20], length: [1, 25] };

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
function allFinite(o, depth = 0) {
  if (o == null) return true;
  if (typeof o === 'number') return Number.isFinite(o);
  if (typeof o !== 'object' || depth > 3) return true;
  return Object.values(o).every((v) => allFinite(v, depth + 1));
}

export function validateItem(it) {
  const errors = [];
  const warnings = [];
  if (!it || typeof it !== 'object') return { ok: false, errors: ['not an item'], warnings };
  if (typeof it.uid !== 'string' || !it.uid) errors.push('missing uid');
  const base = baseOf(it);
  if (!base) errors.push(`unknown base ${it.base}`);
  else if (base.slot !== it.slot) errors.push(`slot ${it.slot} does not match its base (${base.slot})`);
  if (!ALL_SLOTS.includes(it.slot)) errors.push(`unknown slot ${it.slot}`);
  if (!RARITY_INDEX[it.rarity]) errors.push(`unknown rarity ${it.rarity}`);
  if (!finite(it.level) || it.level < 1 || it.level > 60) errors.push(`level ${it.level} out of range`);
  const traits = Array.isArray(it.traits) ? it.traits : null;
  if (!traits) errors.push('traits missing');
  else {
    if (traits.length > MAX_TRAITS) errors.push(`${traits.length} traits (max ${MAX_TRAITS})`);
    const seen = new Set(), groups = new Set();
    for (const t of traits) {
      const d = TRAIT_INDEX[t?.id];
      if (!d) { errors.push(`unknown trait ${t?.id}`); continue; }
      if (!finite(t.mag) || t.mag < 0 || t.mag > 1.0001) errors.push(`${t.id} magnitude ${t.mag}`);
      if (seen.has(t.id)) errors.push(`duplicate trait ${t.id}`);
      seen.add(t.id);
      if (!d.slots.includes(it.slot)) warnings.push(`${t.id} is not a ${it.slot} trait`);
      if (d.group) { if (groups.has(d.group)) warnings.push(`two ${d.group} traits`); groups.add(d.group); }
    }
  }
  if (it.special) {
    const d = TRAIT_INDEX[it.special.id];
    if (!d) errors.push(`unknown special ${it.special.id}`);
    else if (!finite(it.special.mag ?? 1)) errors.push('special magnitude');
  }
  if (it.set && !SET_INDEX[it.set]) errors.push(`unknown set ${it.set}`);
  if (!finite(it.maxDurability) || it.maxDurability < 1 || it.maxDurability > 1000) errors.push(`max durability ${it.maxDurability}`);
  if (!finite(it.durability) || it.durability < 0 || it.durability > (it.maxDurability || 0) + 1e-6) errors.push(`durability ${it.durability}`);
  if (it.xp != null && (!finite(it.xp) || it.xp < 0)) errors.push(`xp ${it.xp}`);
  if (!allFinite(it.stats)) errors.push('rolled stats are not numbers');
  if (it.def && (!allFinite(it.def) || it.def.slot !== it.slot)) errors.push('prototype definition is invalid');
  // physics: the part must resolve to sane numbers
  if (!errors.length && base && SLOTS.includes(it.slot)) {
    try {
      const p = resolvePart(it);
      for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
        if (p[k] == null) continue;
        if (!finite(p[k]) || p[k] < lo || p[k] > hi) errors.push(`${k} ${p[k]} outside ${lo}..${hi}`);
      }
    } catch (e) { errors.push('does not resolve: ' + e.message); }
  }
  return { ok: errors.length === 0, errors, warnings };
}
