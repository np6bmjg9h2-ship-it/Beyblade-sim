// Shop: spend credits (CR) on packs, capsules, bundles, crates and daily
// deals. Items come from the loot generator (deterministic per profile, like
// battle drops); odds shown in the shop are computed from the same weights.

import { Rng, mixSeeds } from '../core/rng.js';
import { PARTS } from '../data/parts.js';
import { LAUNCHERS } from '../data/launchers.js';
import { rarityRank } from '../data/rarity.js';
import { OFFER_INDEX, DAILY, DEAL_PRICE, DEAL_SLOT_MUL, DAILY_STORE } from '../data/store.js';
import { generatePart } from './partGen.js';
import { rollLoot, rollBase, rollRarity, rarityWeights, addItem } from './loot.js';
import { createItem } from './items.js';

const fail = (reason) => ({ ok: false, reason });

export function storeState(profile) {
  if (!profile.store) profile.store = { purchases: 0, spent: 0, opened: {}, daily: { day: '', bought: [], seen: '' } };
  return profile.store;
}

// Local calendar day, e.g. '2026-10-11' (deals change at local midnight).
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ------------------------------------------------------------ odds

// Rarity odds (fractions, rarest last) of one roll at a tier/luck, optionally
// with a minimum rarity.
export function rarityOdds(tier = 0, luck = 0, min = null) {
  let pool = rarityWeights(tier, luck);
  if (min) pool = pool.filter((r) => rarityRank(r.id) >= rarityRank(min));
  const total = pool.reduce((s, r) => s + r.weight, 0);
  return pool.map((r) => ({ id: r.id, p: r.weight / total }));
}

// What an offer's odds look like: per-item odds and, if any, the guaranteed
// item's odds.
export function offerOdds(offer) {
  if (offer.kind === 'crate') return null;
  const min = offer.minRarity || null;
  return {
    item: rarityOdds(offer.tier || 0, offer.luck || 0, min),
    guaranteed: offer.guarantee ? rarityOdds(offer.tier || 0, offer.luck || 0, offer.guarantee.minRarity) : null,
  };
}

// ------------------------------------------------------------ buying

export function canBuy(profile, price) {
  return profile.currency.credits >= price ? { ok: true } : fail(`You need ${price - profile.currency.credits} more CR.`);
}

function pay(profile, price) {
  profile.currency.credits -= price;
  const S = storeState(profile);
  S.purchases++;
  S.spent += price;
}

const CLASSIC_POOL = [...PARTS, ...LAUNCHERS].filter((b) => b.series === 'classic').map((b) => b.id);

// Roll the items of an offer (no payment). Bases for pools come from a
// store-specific seed stream; the items themselves from rollLoot.
export function rollOffer(profile, offer) {
  const S = storeState(profile);
  const n = (S.opened[offer.id] || 0) + 1;
  const rng = new Rng(mixSeeds(profile.seeds.loot, 'store', offer.id, n));
  const source = (extra) => ({ label: offer.name, tier: offer.tier || 0, luck: offer.luck || 0, minRarity: offer.minRarity, ...extra });
  const items = [];
  if (offer.kind === 'bundle') {
    offer.items.forEach((b, i) => items.push(rollLoot(profile, source({ base: rng.pick(b.pool), minRarity: i === 0 ? offer.guarantee?.minRarity : undefined }))));
  } else {
    for (let i = 0; i < (offer.count || 1); i++) {
      const extra = {};
      if (offer.pool === 'classic') extra.base = rng.pick(CLASSIC_POOL);
      else if (offer.slots) extra.base = rollBase(rng, { tier: offer.tier || 0, slots: offer.slots }).id;
      if (i === 0 && offer.guarantee) extra.minRarity = offer.guarantee.minRarity;
      items.push(rollLoot(profile, source(extra)));
    }
  }
  S.opened[offer.id] = n;
  return items;
}

export function buyOffer(profile, offerId) {
  const offer = OFFER_INDEX[offerId];
  if (!offer) return fail('Unknown offer.');
  const c = canBuy(profile, offer.price);
  if (!c.ok) return c;
  pay(profile, offer.price);
  if (offer.kind === 'crate') {
    for (const [k, v] of Object.entries(offer.materials)) profile.materials[k] = (profile.materials[k] || 0) + v;
    storeState(profile).opened[offer.id] = (storeState(profile).opened[offer.id] || 0) + 1;
    return { ok: true, offer, items: [], materials: { ...offer.materials } };
  }
  const items = rollOffer(profile, offer);
  for (const it of items) { it.history.acquired = `Shop: ${offer.name}`; addItem(profile, it); }
  // reveal order: rarest last
  items.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
  return { ok: true, offer, items, materials: null };
}

// ------------------------------------------------------------ daily deals

// Today's deals: exact items (same seed on preview and purchase), a price
// each, and whether it has been bought today.
export function dailyDeals(profile, day = dayKey()) {
  const S = storeState(profile);
  const rng = new Rng(mixSeeds(profile.seeds.loot, 'daily', day));
  const level = profile.player.level;
  const deals = [];
  for (let i = 0; i < DAILY.count; i++) {
    const base = rollBase(rng, { tier: DAILY.tier });
    const rarity = rollRarity(rng, DAILY.tier, DAILY.luck, DAILY.minRarity);
    const seed = rng.nextU32();
    const item = createItem({ base: base.id, rarity, level, seed, source: 'Daily Deal', uid: `deal_${day}_${i}_${seed.toString(36)}` });
    const price = Math.round((DEAL_PRICE[rarity] * (DEAL_SLOT_MUL[base.slot] ?? 1) * DAILY.discount) / 10) * 10;
    const full = Math.round((DEAL_PRICE[rarity] * (DEAL_SLOT_MUL[base.slot] ?? 1)) / 10) * 10;
    deals.push({ index: i, item, price, full, bought: S.daily.day === day && S.daily.bought.includes(i) });
  }
  return deals;
}

export function buyDeal(profile, index, day = dayKey()) {
  const S = storeState(profile);
  if (S.daily.day !== day) S.daily = { day, bought: [], protos: [], seen: S.daily.seen };
  const deal = dailyDeals(profile, day)[index];
  if (!deal) return fail('No such deal.');
  if (deal.bought) return fail('Already bought today.');
  const c = canBuy(profile, deal.price);
  if (!c.ok) return c;
  pay(profile, deal.price);
  S.daily.bought.push(index);
  const it = structuredClone(deal.item);
  it.history.acquired = 'Shop: Daily Deal';
  it.history.acquiredAt = Date.now();
  addItem(profile, it);
  return { ok: true, items: [it], materials: null };
}

export function markDealsSeen(profile, day = dayKey()) { storeState(profile).daily.seen = day; }
export function dealsUnseen(profile, day = dayKey()) { return storeState(profile).daily.seen !== day; }


// ------------------------------------------------------------ daily store

// The Daily Store: one-of-a-kind prototype parts and launchers designed each
// day (systems/partGen.js). The lineup, every part's design and every
// item's traits come from the day's seed, so they are fixed for the day.
export function dailyStore(profile, day = dayKey()) {
  const S = storeState(profile);
  const rng = new Rng(mixSeeds(profile.seeds.loot, 'proto', day));
  const level = profile.player.level;
  const lineup = [];
  DAILY_STORE.lineup.forEach((slot, i) => {
    const seed = rng.nextU32();
    const id = `proto_${slot}_${day.replace(/-/g, '')}_${i}_${seed.toString(36)}`;
    const def = generatePart(seed, slot, id);
    const rarity = rollRarity(rng, DAILY_STORE.tier, DAILY_STORE.luck, DAILY_STORE.minRarity);
    const item = createItem({ base: id, def, rarity, level, seed: rng.nextU32(), source: 'Daily Store', uid: `${id}_item` });
    const price = Math.round((DAILY_STORE.price[rarity] * (DEAL_SLOT_MUL[slot] ?? 1)) / 10) * 10;
    lineup.push({ index: i, item, price, bought: S.daily.day === day && (S.daily.protos || []).includes(i) });
  });
  return lineup;
}

export function buyDailyStore(profile, index, day = dayKey()) {
  const S = storeState(profile);
  if (S.daily.day !== day) S.daily = { day, bought: [], protos: [], seen: S.daily.seen };
  S.daily.protos ||= [];
  const entry = dailyStore(profile, day)[index];
  if (!entry) return fail('No such prototype.');
  if (entry.bought) return fail('Already bought: each prototype is one of a kind.');
  const c = canBuy(profile, entry.price);
  if (!c.ok) return c;
  pay(profile, entry.price);
  S.daily.protos.push(index);
  const it = structuredClone(entry.item);
  it.history.acquired = 'Daily Store';
  it.history.acquiredAt = Date.now();
  addItem(profile, it);
  return { ok: true, items: [it], materials: null };
}
