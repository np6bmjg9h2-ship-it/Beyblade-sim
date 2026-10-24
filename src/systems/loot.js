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
import { generateItem } from './itemGen.js';
import { validateItem } from './itemValidate.js';
import * as dm from '../core/dmath.js';

export const SLOT_WEIGHTS = { ring: 22, tip: 20, disc: 16, lock: 12, core: 12, aux: 6, launcher: 6, cable: 6 };
const ALL_BASES = [...PARTS, ...LAUNCHERS, ...CABLES];

// Relic rarity is reserved for the handcrafted relics (data/relics.js):
// random drops, packs, the Forge and daily deals never roll it.
// Each rarity's weight grows as k^rank, so the slope per tier must stay small:
// 0.55 per tier gave 26% Legendary-or-better at tier 2 and 53% at tier 4
// (tools/loot-sim.js, 2026-10-13). 2026-10-24, rarer by request (about a
// third of the old odds): about 1% at tier 0, 3% at tier 4.
export const RARITY_CURVE = { perTier: 0.08, perLuck: 0.2 };
export function rarityWeights(tier = 0, luck = 0) {
  const k = 1 + tier * RARITY_CURVE.perTier + luck * RARITY_CURVE.perLuck;
  return RARITIES.map((r, i) => ({ id: r.id, weight: r.id === 'relic' ? 0 : r.weight * dm.pow(k, i) * (i >= 5 && tier < 2 ? 0.2 : 1) }));
}

// boost: weight multipliers for Epic-or-better and Legendary-or-better
// (the soft bad-luck ramp).
export function rollRarity(rng, tier = 0, luck = 0, min = null, boost = null) {
  let pool = rarityWeights(tier, luck).filter((r) => r.weight > 0);
  if (boost) pool = pool.map((r) => ({ id: r.id, weight: r.weight * (rarityRank(r.id) >= rarityRank('legendary') ? boost.legendary : rarityRank(r.id) >= rarityRank('epic') ? boost.epic : 1) }));
  if (min) pool = pool.filter((r) => rarityRank(r.id) >= rarityRank(min));
  if (!pool.length) return 'mythic';
  return rng.weighted(pool).id;
}

export function rollBase(rng, { tier = 0, favour = [], favourSets = [], slots = null } = {}) {
  const maxPartTier = Math.min(4, tier + 2);
  const slotPick = rng.weighted(Object.entries(SLOT_WEIGHTS).filter(([s]) => !slots || slots.includes(s)).map(([slot, weight]) => ({ slot, weight })));
  const cands = ALL_BASES.filter((b) => b.slot === slotPick.slot && (b.tier || 1) <= maxPartTier);
  return rng.weighted(cands.map((b) => ({ b, weight: (favour.includes(b.id) ? 4 : 1) * (b.tier >= 3 ? 0.6 : 1) }))).b;
}

// Bad-luck protection: after this many drops without an Epic-or-better
// (Legendary-or-better) item, the next random drop is at least that rarity.
// Before that, a soft ramp raises the odds a little with every dry drop, so
// most droughts end before the hard guarantee.
export const PITY = { epic: 45, legendary: 150 };
export const SOFT_PITY = { epic: { from: 25, step: 0.15 }, legendary: { from: 90, step: 0.05 } };

export function pityBoost(profile) {
  const P = profile.seeds.pity || { epic: 0, legendary: 0 };
  const ramp = (n, s) => 1 + Math.max(0, n - s.from) * s.step;
  const legendary = ramp(P.legendary, SOFT_PITY.legendary);
  return { epic: ramp(P.epic, SOFT_PITY.epic), legendary: Math.max(legendary, ramp(P.epic, SOFT_PITY.epic)) };
}

function pityFloor(profile, rarity) {
  const P = profile.seeds.pity || (profile.seeds.pity = { epic: 0, legendary: 0 });
  if (P.legendary + 1 >= PITY.legendary && rarityRank(rarity) < rarityRank('legendary')) return 'legendary';
  if (P.epic + 1 >= PITY.epic && rarityRank(rarity) < rarityRank('epic')) return 'epic';
  return rarity;
}
function countPity(profile, rarity) {
  const P = profile.seeds.pity;
  P.epic = rarityRank(rarity) >= rarityRank('epic') ? 0 : P.epic + 1;
  P.legendary = rarityRank(rarity) >= rarityRank('legendary') ? 0 : P.legendary + 1;
}

// Generate one loot item for a profile from a source description.
// source: { label, tier, level, favour: [baseIds], favourSets: [setIds], minRarity, slots, base?, rarity? }
// Random rarities count toward bad-luck protection; fixed rarities don't.
export function rollLoot(profile, source) {
  const counter = profile.seeds.counter = (profile.seeds.counter || 0) + 1;
  const seed = mixSeeds(profile.seeds.loot, counter, source.label || 'loot');
  const rng = new Rng(seed);
  const base = source.base ? ALL_BASES.find((b) => b.id === source.base) : rollBase(rng, source);
  let rarity = source.rarity || rollRarity(rng, source.tier ?? 0, source.luck ?? 0, source.minRarity, pityBoost(profile));
  if (!source.rarity) { rarity = pityFloor(profile, rarity); countPity(profile, rarity); }
  const level = Math.max(1, Math.round((source.level ?? profile.player.level) + rng.int(-2, 2)));
  let set;
  if (source.favourSets?.length && rng.chance(0.5)) set = rng.pick(source.favourSets);
  return generateItem({ base, rarity, level, seed: rng.nextU32(), set, source: source.label || 'loot', tier: source.tier ?? 0, counter });
}

export function addItem(profile, item) {
  const v = validateItem(item);
  if (!v.ok) throw new Error(`refusing an invalid item (${item?.base}): ${v.errors.join('; ')}`);
  profile.inventory[item.uid] = item;
  const first = !profile.discovery.parts[item.base];
  profile.discovery.parts[item.base] = true;
  if (item.set) profile.discovery.sets[item.set] = true;
  for (const t of [...item.traits, ...(item.special ? [item.special] : [])]) profile.discovery.traits[t.id] = true;
  return first;
}
