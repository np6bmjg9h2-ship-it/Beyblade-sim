// Item generation v2: a seeded, versioned pipeline. The same seed, inputs
// and GEN_VERSION reproduce the same item (only its uid and timestamp
// differ). Steps:
//   1 base (given or rolled by the drop source)   2 rarity (given)
//   3 traits from the eligible pool, weighted toward the part's role
//   4 exclusions (one trait per group, no duplicates) and the power budget
//   5 special trait and set by rarity chance; a rare+ item may roll cursed:
//     one curse buys one extra trait
//   6 manufacturing tolerances (systems/items.js)   7 validation
//   8 a name from its traits   9 a visual variant (colour and finish only:
//     never a hint of an effect it doesn't have)   10 provenance
// Definitions stay immutable: the item stores ids, magnitudes and seeds.

import { Rng, mixSeeds } from '../core/rng.js';
import { RARITY_INDEX } from '../data/rarity.js';
import { SETS, SET_INDEX } from '../data/sets.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { createItem, eligibleTraits, baseOf } from './items.js';
import { validateItem } from './itemValidate.js';

export const GEN_VERSION = 2;

// Power budget per rarity in trait-cost units (most traits cost 1, special
// traits and Extra Notch 2, curses -1). It matches the old trait counts, so
// v2 items are no stronger on average; it bounds authored expensive traits.
export const BUDGET = { common: 1, uncommon: 1, rare: 2, epic: 4, legendary: 5, mythic: 5, relic: 5 };
export const CURSE_CHANCE = { rare: 0.06, epic: 0.08, legendary: 0.1, mythic: 0.12, relic: 0 };

const ROLE_FAMILIES = {
  attack: ['offense', 'risk'], defense: ['defense'], stamina: ['endurance'], balance: ['mobility', 'technical'],
  burst: ['offense', 'risk', 'elemental'], upper: ['offense'],
};

function pickTraits(base, rarity, rng, { n, budget, exclude = [] }) {
  const R = RARITY_INDEX[rarity];
  const favoured = ROLE_FAMILIES[base.role] || [];
  const chosen = [];
  const groups = new Set();
  let spent = 0;
  for (let i = 0; i < n; i++) {
    const pool = eligibleTraits(base.slot, rarity).filter((t) => !exclude.includes(t.id) && !chosen.some((c) => c.id === t.id)
      && !(t.group && groups.has(t.group)) && spent + t.cost <= budget);
    if (!pool.length) break;
    const t = rng.weighted(pool.map((c) => ({ ...c, weight: (favoured.includes(c.family) ? 2 : 1) * (c.family === 'synergy' ? 0.7 : 1) })));
    chosen.push({ id: t.id, mag: +rng.range(R.mag[0], R.mag[1]).toFixed(3) });
    spent += t.cost;
    if (t.group) groups.add(t.group);
  }
  return { traits: chosen, spent, groups };
}

// ------------------------------------------------------------ names

const FAMILY_NOUN = {
  offense: 'Fury', defense: 'Warding', endurance: 'the Long Spin', mobility: 'the Gale', technical: 'Precision', risk: 'Ruin',
  elemental: 'Embers', mastery: 'Mastery', synergy: 'Harmony',
};
const STATUS_NOUN = { scorch: 'Embers', static: 'Storms', rust: 'Rust' };

export function itemTitle(base, traits, special, cursed) {
  const defs = traits.map((t) => ({ t, d: TRAIT_INDEX[t.id] })).filter((x) => x.d && !x.d.curse);
  if (!defs.length && !special) return null;
  const sorted = defs.slice().sort((a, b) => (b.t.mag * b.d.cost) - (a.t.mag * a.d.cost));
  const adj = sorted[0]?.d.adj;
  const second = sorted[1]?.d;
  let noun = null;
  if (cursed) noun = 'Woe';
  else if (special) noun = TRAIT_INDEX[special.id]?.name ? `the ${TRAIT_INDEX[special.id].name}` : null;
  else if (second) noun = second.family === 'elemental' ? STATUS_NOUN[Object.keys(second.spec.status)[0]] : FAMILY_NOUN[second.family] || null;
  return `${adj ? adj + ' ' : ''}${base.name}${noun ? ' of ' + noun : ''}`;
}

// ------------------------------------------------------------ visual variant

function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const FINISHES = {
  common: ['matte', 'satin'], uncommon: ['satin', 'gloss'], rare: ['gloss', 'satin'], epic: ['gloss', 'metallic'],
  legendary: ['metallic', 'pearl'], mythic: ['pearl', 'prism'], relic: ['prism'],
};
export function visualVariant(base, rarity, rng) {
  const [h, s, l] = hexToHsl(base.color || '#8899aa');
  const hue = (h + rng.range(-16, 16) + 360) % 360;
  return {
    color: hslToHex(hue, Math.min(1, s * rng.range(0.9, 1.1)), Math.max(0.2, Math.min(0.8, l * rng.range(0.92, 1.08)))),
    accent: hslToHex((hue + 180) % 360, Math.min(1, s * 0.8 + 0.1), 0.55),
    finish: rng.pick(FINISHES[rarity] || FINISHES.common),
  };
}

// ------------------------------------------------------------ the pipeline

// opts: { base (definition), rarity, level, seed, source, tier, set?, noCurse?, uid? }
export function generateItem(opts) {
  const base = opts.base;
  const rarity = opts.rarity || 'common';
  const R = RARITY_INDEX[rarity];
  const seed = opts.seed >>> 0;
  const rng = new Rng(mixSeeds(seed, 'gen', GEN_VERSION, base.id));
  let n = rng.int(R.traits[0], R.traits[1]);
  let budget = BUDGET[rarity] ?? 1;
  // cursed roll: one curse buys one extra trait
  let curse = null;
  if (!opts.noCurse && rng.chance(CURSE_CHANCE[rarity] || 0)) {
    const pool = eligibleTraits(base.slot, rarity, { curse: true });
    if (pool.length) { const c = rng.pick(pool); curse = { id: c.id, mag: +rng.range(R.mag[0], R.mag[1]).toFixed(3) }; n += 1; budget += 1 - c.cost; }
  }
  const { traits, spent, groups } = pickTraits(base, rarity, rng, { n, budget, exclude: curse ? [curse.id] : [] });
  // special trait (legendary and up) within what is left of the budget
  let special = null;
  if (rng.chance(R.special) && budget - spent >= 2) {
    const sp = eligibleTraits(base.slot, rarity, { special: true }).filter((t) => !(t.group && groups.has(t.group)));
    if (sp.length) special = { id: rng.pick(sp).id, mag: 1 };
  }
  let set = opts.set ?? null;
  if (!set && rng.chance(R.setChance)) {
    const eligible = SETS.filter((s) => s.slots.includes(base.slot));
    if (eligible.length) set = rng.pick(eligible).id;
  }
  const allTraits = curse ? [...traits, curse] : traits;
  const item = createItem({
    def: base.generated ? base : undefined, base: base.id, rarity, level: opts.level ?? 1, seed, uid: opts.uid,
    traits: allTraits, special, set: set && SET_INDEX[set] ? set : null, source: opts.source || 'loot',
  });
  item.title = itemTitle(base, allTraits, special, !!curse);
  item.visual = visualVariant(base, rarity, rng);
  if (curse) item.cursed = true;
  item.gen = { v: GEN_VERSION, seed, source: opts.source || 'loot', tier: opts.tier ?? 0, counter: opts.counter ?? null, set: opts.set ?? null, noCurse: !!opts.noCurse };
  const v = validateItem(item);
  if (!v.ok) throw new Error(`generated an invalid item (${base.id}, seed ${seed}): ${v.errors.join('; ')}`);
  return item;
}

// Rebuild an item from its recorded inputs (same seed and version, same item).
export function regenerate(item) {
  const g = item.gen;
  if (g?.v !== GEN_VERSION) return null;
  return generateItem({ base: baseOf(item), rarity: item.rarity, level: item.level, seed: g.seed, source: g.source, tier: g.tier, counter: g.counter, set: g.set, noCurse: g.noCurse, uid: item.uid });
}

export { baseOf };
