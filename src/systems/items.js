// Item instances: every physical component, launcher and cable is a unique
// item generated deterministically from a seed (reproducible for debugging).
// An item carries its base identity, rarity, level, rolled physical
// tolerances, traits, optional special trait, set, durability, XP, mastery,
// tuning, upgrade history and its own battle history.

import { Rng, mixSeeds } from '../core/rng.js';
import { PART_INDEX } from '../data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX } from '../data/launchers.js';
import { TRAITS, TRAIT_INDEX } from '../data/traits.js';
import { RARITIES, RARITY_INDEX, rarityRank } from '../data/rarity.js';
import { SETS } from '../data/sets.js';
import { UPGRADE_INDEX } from '../data/upgrades.js';
import { PAINT_COLOR_INDEX } from '../data/paint.js';

// The colour an item shows in lists: its paint, else its rolled look, else the base's.
export function itemColor(it) {
  return PAINT_COLOR_INDEX[it?.paint?.color]?.hex || it?.visual?.color || (it?.def || PART_INDEX[it?.base] || LAUNCHER_INDEX[it?.base] || CABLE_INDEX[it?.base])?.color || '#888';
}

export const MASTERY = [
  { id: 'unfamiliar', name: 'Unfamiliar', xp: 0 },
  { id: 'acquainted', name: 'Acquainted', xp: 300 },
  { id: 'skilled', name: 'Skilled', xp: 1000 },
  { id: 'expert', name: 'Expert', xp: 2500 },
  { id: 'masterwork', name: 'Masterwork', xp: 5000 },
];
export const MASTERY_CAP = MASTERY[MASTERY.length - 1].xp;

export function masteryOf(xp) {
  let m = 0;
  for (let i = 0; i < MASTERY.length; i++) if (xp >= MASTERY[i].xp) m = i;
  return { index: m, ...MASTERY[m], next: MASTERY[m + 1] || null };
}

// Number of tuning slots unlocked by mastery (Skilled, Expert, Masterwork)
export const tuningSlots = (xp) => Math.max(0, masteryOf(xp).index - 1);

export function baseOf(item) {
  if (!item) return null;
  // generated prototypes carry their own definition
  return item.def || PART_INDEX[item.base] || LAUNCHER_INDEX[item.base] || CABLE_INDEX[item.base] || null;
}

export function slotOf(item) { return baseOf(item)?.slot; }

// Physical tolerance rolls per slot: [key, relative spread or absolute spread]
const TOLERANCES = {
  ring: [['mass', 0.03], ['faceAngle', 0.8, 'abs'], ['restitution', 0.03], ['friction', 0.05]],
  core: [['mass', 0.03], ['ecc', 0.03, 'abs+']],
  disc: [['mass', 0.03], ['massDist', 0.04, 'abs'], ['ecc', 0.03, 'abs+']],
  lock: [['mass', 0.03], ['threshold', 0.04]],
  tip: [['mu', 0.05], ['patchRadius', 0.05], ['mass', 0.03]],
  aux: [['mass', 0.04]],
  launcher: [['drive.force', 0.025], ['trigger.window', 0.05], ['grip.stability', 0.04, 'abs'], ['chargeRate', 0.04]],
  cable: [['efficiency', 0.012, 'abs'], ['directional', 0.04, 'abs'], ['length', 0.015]],
};

function getPath(o, path) { return path.split('.').reduce((x, k) => x?.[k], o); }
function setPath(o, path, v) {
  const ks = path.split('.');
  let x = o;
  for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]] = x[ks[i]] ? { ...x[ks[i]] } : {};
  x[ks[ks.length - 1]] = v;
}

function rollStats(base, level, rng) {
  const stats = {};
  // higher item level = tighter manufacturing tolerances
  const precision = 1 - Math.min(0.6, level / 50);
  for (const [key, spread, mode] of TOLERANCES[base.slot] || []) {
    const v = getPath(base, key);
    if (v == null) continue;
    const r = rng.gauss(0, 0.5) * spread * precision;
    let nv;
    if (mode === 'abs') nv = v + r;
    else if (mode === 'abs+') nv = Math.max(0, v + Math.abs(r) * 0.6);
    else nv = v * (1 + r);
    if (key.includes('.')) {
      const root = key.split('.')[0];
      stats[root] = stats[root] || structuredClone(base[root]);
      setPath(stats, key, nv);
    } else stats[key] = nv;
  }
  return stats;
}

// Traits an item of this slot and rarity can roll. Curses only come through
// opts.curse (a cursed roll); special traits only through opts.special;
// relic signatures never (they belong to their handcrafted relic).
export function eligibleTraits(slot, rarity, opts = {}) {
  const rr = rarityRank(rarity);
  return TRAITS.filter((t) => !t.relic && t.slots.includes(slot) && rarityRank(t.rarityMin) <= rr && !!t.special === !!opts.special && !!t.curse === !!opts.curse);
}

function rollTraits(base, rarity, rng, opts = {}) {
  const R = RARITY_INDEX[rarity];
  const n = opts.traitCount ?? rng.int(R.traits[0], R.traits[1]);
  const pool = eligibleTraits(base.slot, rarity).filter((t) => !(opts.exclude || []).includes(t.id));
  const chosen = [];
  const groups = new Set();
  const roleBias = { attack: ['offense', 'risk'], defense: ['defense'], stamina: ['endurance'], balance: ['mobility', 'technical'], burst: ['offense', 'risk'], upper: ['offense'] };
  const favoured = roleBias[base.role] || [];
  for (let i = 0; i < n && pool.length; i++) {
    const cands = pool.filter((t) => !chosen.some((c) => c.id === t.id) && !(t.group && groups.has(t.group)));
    if (!cands.length) break;
    const t = rng.weighted(cands.map((c) => ({ ...c, weight: favoured.includes(c.family) ? 2 : 1 })));
    const mag = +rng.range(R.mag[0], R.mag[1]).toFixed(3);
    chosen.push({ id: t.id, mag });
    if (t.group) groups.add(t.group);
  }
  return chosen;
}

let uidCounter = 0;
export function makeUid(seed) {
  uidCounter = (uidCounter + 1) % 1e6;
  return 'itm_' + (seed >>> 0).toString(36) + '_' + Date.now().toString(36).slice(-4) + uidCounter.toString(36);
}

// Create an item instance.
// opts: { base, rarity, level, seed, set, traits, special, noTraits, source }
export function createItem(opts) {
  const base = opts.def || PART_INDEX[opts.base] || LAUNCHER_INDEX[opts.base] || CABLE_INDEX[opts.base];
  if (!base) throw new Error('Unknown base ' + opts.base);
  // A seed is required: an unseeded item could never be rebuilt or replayed.
  if (opts.seed == null) throw new Error('createItem needs a seed (' + base.id + ')');
  const seed = opts.seed >>> 0;
  const rng = new Rng(mixSeeds(seed, base.id));
  const rarity = opts.rarity || 'common';
  const level = Math.max(1, Math.min(60, Math.round(opts.level ?? 1)));
  const R = RARITY_INDEX[rarity];
  const stats = opts.perfect ? {} : rollStats(base, level, rng);
  let traits = opts.traits ?? (opts.noTraits ? [] : rollTraits(base, rarity, rng));
  let special = opts.special ?? null;
  if (!special && !opts.noTraits && opts.special !== null && rng.chance(R.special)) {
    const sp = eligibleTraits(base.slot, rarity, { special: true });
    if (sp.length) special = { id: rng.pick(sp).id, mag: 1 };
  }
  let set = opts.set ?? null;
  if (set === null && opts.set !== null && rng.chance(R.setChance)) {
    const eligible = SETS.filter((s) => s.slots.includes(base.slot));
    if (eligible.length) set = rng.pick(eligible).id;
  }
  // max durability: base 100, item traits and level adjust it
  let maxDur = 100 + Math.min(20, level * 0.5);
  for (const t of [...traits, ...(special ? [special] : [])]) {
    const d = TRAIT_INDEX[t.id];
    if (d?.item) maxDur *= 1 + (d.item(t.mag).maxDurability || 0);
  }
  maxDur = Math.round(maxDur);
  const item = {
    uid: opts.uid || makeUid(seed),
    base: base.id,
    slot: base.slot,
    rarity, level, seed,
    stats, traits, special, set,
    durability: opts.durability ?? maxDur,
    maxDurability: maxDur,
    xp: 0,
    tuning: [],
    upgrades: [],
    history: { battles: 0, wins: 0, knockouts: 0, bursts: 0, burstsSurvived: 0, highestImpact: 0, longestSpin: 0, tournamentWins: 0, moments: [], acquired: opts.source || 'unknown', acquiredAt: Date.now() },
    nickname: null, favourite: false, locked: false,
    visual: { color: opts.color || null },
  };
  if (base.slot === 'launcher') item.parts = { drive: 100, trigger: 100, grip: 100 };
  if (opts.def) item.def = structuredClone(opts.def);
  return item;
}

export function itemName(item) {
  const b = baseOf(item);
  if (!b) return 'Unknown';
  const pole = b.magnet ? ` · ${item.pole === 'S' ? 'S' : 'N'}` : ''; // magnet discs show which face is up
  // nickname, else the generated title ("Honed Gale Fang of Fury"), else the part's name
  return (item.nickname ? `“${item.nickname}”` : item.title || b.name) + pole;
}

export function itemWearMultiplier(item) {
  let m = 1;
  for (const t of [...(item.traits || []), ...(item.special ? [item.special] : [])]) {
    const d = TRAIT_INDEX[t.id];
    if (d?.item) m *= 1 + (d.item(t.mag).wear || 0);
  }
  for (const u of item.upgrades || []) m *= 1 + (UPGRADE_INDEX[u]?.wear || 0);
  return Math.max(0.3, m);
}

export { RARITIES };
