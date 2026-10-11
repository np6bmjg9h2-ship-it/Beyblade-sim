// Rift Run loot: run-only parts and charms, spoils offers, the trader's
// stock, forge jobs, shrine bargains and events. Every roll comes from an Rng
// seeded by the run seed, the node and a per-run counter, so a run is
// reproducible from its seed and reloading never rerolls an offer.

import { Rng, mixSeeds } from '../core/rng.js';
import { PARTS, SLOTS } from '../data/parts.js';
import { RARITY_INDEX, rarityRank } from '../data/rarity.js';
import { CHARMS, CHARM_INDEX, CHARM_RARITIES, canEnhance } from '../data/riftCharms.js';
import { BOONS } from '../data/riftBoons.js';
import { RIFT_ACTS, STATUS_IDS, depthRules, PART_PRICE, CHARM_PRICE, HEART_PRICE, RESTOCK_PRICE, FORGE_PRICE, FORGE_MAX_LEVEL, SHARD_REWARD } from '../data/rift.js';
import { createItem, eligibleTraits } from './items.js';
import { rollRarity } from './loot.js';
import { validateBuild } from './assembly.js';
import { runEffects } from './riftBattle.js';
import { resolveLaunchGear } from '../game/launch.js';

const PART_SLOT_WEIGHTS = { ring: 28, tip: 22, disc: 18, lock: 12, core: 10, aux: 10 };

export function runRng(run, ...label) {
  run.counter = (run.counter || 0) + 1;
  return new Rng(mixSeeds(run.seed, run.counter, ...label));
}

const talents = (profile) => profile?.rift?.talents || {};

// ---------------------------------------------------------------- parts

// Would this base fit the current build if swapped in?
export function fitsBuild(profile, run, base) {
  const build = { ...run.equipped, [base.slot]: base };
  const gear = resolveLaunchGear(profile.inventory[run.launcher], profile.inventory[run.cable]);
  return validateBuild(build, { spin: run.spin, launcher: { spinMech: gear.spinMech } }).ok;
}

export function rollRunPart(profile, run, rng, { minRarity = null, rarityBoost = 0, slot = null } = {}) {
  const act = RIFT_ACTS[Math.min(run.act, RIFT_ACTS.length - 1)];
  const D = depthRules(run.depth);
  const slots = Object.entries(PART_SLOT_WEIGHTS).filter(([s]) => !slot || s === slot);
  for (let tries = 0; tries < 8; tries++) {
    const s = rng.weighted(slots.map(([id, weight]) => ({ id, weight }))).id;
    const cur = run.equipped[s];
    const cands = PARTS.filter((p) => p.slot === s && (p.tier || 1) <= act.tier + 1 && (s !== 'ring' || p.spin === 'dual' || p.spin === run.spin) && fitsBuild(profile, run, p));
    if (!cands.length) continue;
    const base = rng.weighted(cands.map((b) => ({ b, weight: cur && cur.base === b.id ? 0.4 : 1 }))).b;
    const rarity = rollRarity(rng, run.act + rarityBoost, D.luck + 0.4 * (talents(profile).treasure || 0), minRarity);
    const item = createItem({ base: base.id, rarity, level: 5 + 10 * run.act, seed: rng.nextU32(), source: 'Rift Run' });
    item.uid = `rift_${(run.seed >>> 0).toString(36)}_${run.counter}_${rng.int(0, 1e6).toString(36)}`;
    item.origin = 'found';
    item.forge = 0;
    item.element = s === 'ring' && rng.chance(0.3 + 0.08 * run.act) ? rng.pick(STATUS_IDS) : null;
    return item;
  }
  return null;
}

// ---------------------------------------------------------------- charms

export function rollCharm(run, rng, { rarities = null, cursedMul = 1, exclude = [] } = {}) {
  const held = new Set([...run.charms.map((h) => h.id), ...exclude]);
  const pool = CHARMS.filter((c) => !held.has(c.id) && (!rarities || rarities.includes(c.rarity)));
  if (!pool.length) return null;
  const weights = pool.map((c) => ({ c, weight: CHARM_RARITIES[c.rarity].weight * (c.rarity === 'cursed' ? cursedMul : 1) / pool.filter((x) => x.rarity === c.rarity).length }));
  return { id: rng.weighted(weights).c.id, enhanced: false };
}

export function rollCharms(run, rng, n, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = rollCharm(run, rng, { ...opts, exclude: [...(opts.exclude || []), ...out.map((x) => x.id)] });
    if (c) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- boons

export function rollBoons(profile, run, rng) {
  const n = Math.max(1, 3 + (talents(profile).ascendant || 0) + depthRules(run.depth).boonChoices);
  const beastState = run.beast ? { id: run.beast.id, awakened: !!profile.beasts[run.beast.id]?.awakened } : null;
  const pool = BOONS.filter((b) => (run.boons[b.id] || 0) < b.max && (!b.available || b.available(beastState)));
  return rng.shuffle(pool.slice()).slice(0, n).map((b) => ({ type: 'boon', id: b.id }));
}

// ---------------------------------------------------------------- spoils

export function spoilsCount(profile, run) {
  return 3 + (talents(profile).keen || 0) + (runEffects(profile, run).econ.spoils || 0);
}

// Pick-one rewards after an ordinary battle: parts, a charm, shards.
export function rollSpoils(profile, run, node) {
  const rng = runRng(run, 'spoils', node.id);
  const n = spoilsCount(profile, run);
  const D = depthRules(run.depth);
  const out = [];
  const charmSlots = n >= 4 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    if (i < charmSlots) {
      const c = rollCharm(run, rng, { rarities: ['common', 'rare', 'cursed'], cursedMul: D.cursedMul, exclude: out.filter((o) => o.charm).map((o) => o.charm.id) });
      if (c) { out.push({ type: 'charm', charm: c }); continue; }
    }
    const item = rollRunPart(profile, run, rng, { rarityBoost: node.type === 'battle' ? 0 : 1 });
    if (item) out.push({ type: 'part', item });
    else out.push({ type: 'shards', amount: 40 + 10 * run.act });
  }
  return rng.shuffle(out);
}

export function rollPartChoice(profile, run, node, n = 3, opts = {}) {
  const rng = runRng(run, 'parts', node.id);
  const out = [];
  for (let i = 0; i < n; i++) {
    const item = rollRunPart(profile, run, rng, opts);
    if (item) out.push({ type: 'part', item });
  }
  return out;
}

// ---------------------------------------------------------------- prices

export function traderMul(profile, run) {
  const fx = runEffects(profile, run);
  return Math.max(0.4, depthRules(run.depth).priceMul * (1 + 0.15 * run.act) * (1 - 0.1 * (talents(profile).haggle || 0) + (fx.econ.trader || 0)));
}
export function forgeMul(profile, run) {
  return Math.max(0.3, depthRules(run.depth).priceMul * (1 - 0.15 * (talents(profile).smith || 0)));
}

export function priceOf(profile, run, offer) {
  const m = traderMul(profile, run);
  if (offer.type === 'part') return Math.round(PART_PRICE[offer.item.rarity] * m);
  if (offer.type === 'charm') return Math.round(CHARM_PRICE[CHARM_INDEX[offer.charm.id].rarity] * m);
  if (offer.type === 'heart') return Math.round(HEART_PRICE * m);
  return 0;
}

// ---------------------------------------------------------------- trader

export function rollTraderStock(profile, run, node) {
  const rng = runRng(run, 'trader', node.id, node.restocks || 0);
  const stock = [];
  for (let i = 0; i < 2; i++) { const item = rollRunPart(profile, run, rng, { rarityBoost: 1 }); if (item) stock.push({ type: 'part', item }); }
  for (const c of rollCharms(run, rng, 2, { rarities: ['common', 'rare', 'cursed'], cursedMul: depthRules(run.depth).cursedMul })) stock.push({ type: 'charm', charm: c });
  stock.push({ type: 'heart' });
  for (const o of stock) o.price = priceOf(profile, run, o);
  return stock;
}

export const restockPrice = (profile, run, node) => Math.round(RESTOCK_PRICE * (1 + (node.restocks || 0)) * traderMul(profile, run));

// ---------------------------------------------------------------- forge

export function forgePrice(profile, run, job, item = null) {
  const base = job === 'upgrade' ? FORGE_PRICE.upgrade(item?.forge || 0) : FORGE_PRICE[job];
  return Math.round(base * forgeMul(profile, run));
}

export function traitCap(item) { return Math.min(4, (RARITY_INDEX[item.rarity]?.traits[1] ?? 1) + 1); }

export function forgeCheck(run, job, item, extra = {}) {
  if (job === 'enhance') {
    const h = run.charms[extra.charmIndex];
    if (!h) return 'Choose a charm.';
    if (!canEnhance(CHARM_INDEX[h.id])) return 'Only common and rare charms can be enhanced.';
    if (h.enhanced) return 'Already enhanced.';
    return null;
  }
  if (!item) return 'Choose a part.';
  if (job === 'upgrade' && (item.forge || 0) >= FORGE_MAX_LEVEL) return `Already at +${FORGE_MAX_LEVEL}.`;
  if (job === 'reroll' && !(item.traits || []).length) return 'This part has no traits to reroll.';
  if (job === 'engrave' && (item.traits || []).length >= traitCap(item)) return 'No room for another trait.';
  if (job === 'engrave' && !eligibleTraits(item.slot, item.rarity).some((t) => !item.traits.some((x) => x.id === t.id))) return 'No trait left to engrave.';
  if (job === 'infuse' && item.slot !== 'ring') return 'Only attack rings take an element.';
  if (job === 'infuse' && !STATUS_IDS.includes(extra.element)) return 'Choose an element.';
  return null;
}

// Apply a forge job (cost already checked and paid by the caller).
export function applyForge(run, job, item, extra = {}) {
  const rng = runRng(run, 'forge', job);
  if (job === 'upgrade') item.forge = (item.forge || 0) + 1;
  else if (job === 'reroll') {
    const i = extra.traitIndex ?? 0;
    const R = RARITY_INDEX[item.rarity];
    const pool = eligibleTraits(item.slot, item.rarity).filter((d) => !item.traits.some((x, k) => k !== i && x.id === d.id) && d.id !== item.traits[i]?.id);
    if (pool.length) item.traits[i] = { id: rng.pick(pool).id, mag: +rng.range(R.mag[0], R.mag[1]).toFixed(3) };
  } else if (job === 'engrave') {
    const R = RARITY_INDEX[item.rarity];
    const pool = eligibleTraits(item.slot, item.rarity).filter((d) => !item.traits.some((x) => x.id === d.id));
    if (pool.length) item.traits.push({ id: rng.pick(pool).id, mag: +rng.range(R.mag[0], R.mag[1]).toFixed(3) });
  } else if (job === 'infuse') item.element = extra.element;
  else if (job === 'enhance') run.charms[extra.charmIndex].enhanced = true;
}

// ---------------------------------------------------------------- shrine

export function rollShrine(profile, run, node) {
  const rng = runRng(run, 'shrine', node.id);
  const offers = [];
  if (run.hearts >= 2) offers.push({ id: 'blood', name: 'Blood Pact', desc: 'Lose a heart. Choose one of two legendary charms.' });
  offers.push({ id: 'tithe', name: 'Tithe', desc: 'Pay 100 shards for a random rare charm.', cost: 100 });
  if (run.charms.some((h) => ['common', 'rare'].includes(CHARM_INDEX[h.id]?.rarity))) offers.push({ id: 'transmute', name: 'Transmute', desc: 'Give up your oldest common or rare charm for a random charm one rarity higher.' });
  offers.push({ id: 'curse', name: 'Accept a Curse', desc: 'Take a random cursed charm and 120 shards.' });
  return rng.shuffle(offers).slice(0, 3);
}

// ---------------------------------------------------------------- events

// Wheel outcome for a 30-shard spin.
export function spinWheel(run) {
  const rng = runRng(run, 'wheel');
  const r = rng.next();
  if (r < 0.5) return { kind: 'shards', amount: 80 };
  if (r < 0.85) return { kind: 'charm', charm: rollCharm(run, rng, { rarities: ['common', 'rare'] }) };
  return { kind: 'curse', charm: rollCharm(run, rng, { rarities: ['cursed'] }) };
}

// Curiosity box: one to three charms, each with a small chance of a curse.
export function openCuriosity(run) {
  const rng = runRng(run, 'curiosity');
  const n = rng.int(1, 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = rollCharm(run, rng, { rarities: rng.chance(0.1) ? ['cursed'] : ['common', 'rare', 'legendary'], exclude: out.map((x) => x.id) });
    if (c) out.push(c);
  }
  return out;
}

export const skipShards = (run) => SHARD_REWARD.skip + 4 * run.act;

export { rarityRank, SLOTS };
