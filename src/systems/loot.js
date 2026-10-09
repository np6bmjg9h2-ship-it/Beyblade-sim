// Loot generation. Drops are deterministic per profile (loot seed + counter),
// so any drop can be reproduced for debugging from its stored seed. Sources
// carry a tier (0-4) that shifts rarity odds and part availability, and a
// pool that favours specific part families (targeted loot: beating a
// defensive rival favours defensive parts, a solar tournament favours Solar
// Dominion pieces, and so on).

import { Rng, mixSeeds } from '../core/rng.js';
import { PARTS } from '../data/parts.js';
import { LAUNCHERS, CABLES } from '../data/launchers.js';
import { RARITIES, rarityRank } from '../data/rarity.js';
import { createItem } from './items.js';

export const SLOT_WEIGHTS = { ring: 22, tip: 20, disc: 16, lock: 12, core: 12, aux: 6, launcher: 6, cable: 6 };
const ALL_BASES = [...PARTS, ...LAUNCHERS, ...CABLES];

export function rarityWeights(tier = 0, luck = 0) {
  const k = 1 + tier * 0.55 + luck;
  return RARITIES.map((r, i) => ({ id: r.id, weight: r.weight * Math.pow(k, i) * (i >= 5 && tier < 2 ? 0.2 : 1) }));
}

export function rollRarity(rng, tier = 0, luck = 0, min = null) {
  let pool = rarityWeights(tier, luck);
  if (min) pool = pool.filter((r) => rarityRank(r.id) >= rarityRank(min));
  return rng.weighted(pool).id;
}

export function rollBase(rng, { tier = 0, favour = [], favourSets = [], slots = null } = {}) {
  const maxPartTier = Math.min(4, tier + 2);
  const slotPick = rng.weighted(Object.entries(SLOT_WEIGHTS).filter(([s]) => !slots || slots.includes(s)).map(([slot, weight]) => ({ slot, weight })));
  const cands = ALL_BASES.filter((b) => b.slot === slotPick.slot && (b.tier || 1) <= maxPartTier);
  return rng.weighted(cands.map((b) => ({ b, weight: (favour.includes(b.id) ? 4 : 1) * (b.tier >= 3 ? 0.6 : 1) }))).b;
}

// Generate one loot item for a profile from a source description.
// source: { label, tier, level, favour: [baseIds], favourSets: [setIds], minRarity, slots }
export function rollLoot(profile, source) {
  const counter = profile.seeds.counter = (profile.seeds.counter || 0) + 1;
  const seed = mixSeeds(profile.seeds.loot, counter, source.label || 'loot');
  const rng = new Rng(seed);
  const base = source.base ? ALL_BASES.find((b) => b.id === source.base) : rollBase(rng, source);
  const rarity = source.rarity || rollRarity(rng, source.tier ?? 0, source.luck ?? 0, source.minRarity);
  const level = Math.max(1, Math.round((source.level ?? profile.player.level) + rng.int(-2, 2)));
  let set;
  if (source.favourSets?.length && rng.chance(0.5)) set = rng.pick(source.favourSets);
  const item = createItem({ base: base.id, rarity, level, seed: rng.nextU32(), set, source: source.label || 'loot' });
  item.gen = { source: source.label, tier: source.tier ?? 0, counter };
  return item;
}

export function addItem(profile, item) {
  profile.inventory[item.uid] = item;
  const first = !profile.discovery.parts[item.base];
  profile.discovery.parts[item.base] = true;
  if (item.set) profile.discovery.sets[item.set] = true;
  for (const t of [...item.traits, ...(item.special ? [item.special] : [])]) profile.discovery.traits[t.id] = true;
  return first;
}
