// Shop: prices, guarantees, pools, odds, crates, daily deals, determinism.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { OFFERS, OFFER_INDEX } from '../src/data/store.js';
import { PART_INDEX } from '../src/data/parts.js';
import { LAUNCHER_INDEX } from '../src/data/launchers.js';
import { rarityRank } from '../src/data/rarity.js';
import { offerOdds, buyOffer, dailyDeals, buyDeal, storeState, dealsUnseen, markDealsSeen } from '../src/systems/store.js';

const rich = (seed = 5, cr = 100000) => { const p = newProfile(seed); p.currency.credits = cr; return p; };
const baseOf = (it) => PART_INDEX[it.base] || LAUNCHER_INDEX[it.base];

test('every offer prints odds that add up and respect its guarantee', () => {
  for (const o of OFFERS) {
    const odds = offerOdds(o);
    if (o.kind === 'crate') { assert.equal(odds, null); continue; }
    const sum = odds.item.reduce((s, r) => s + r.p, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${o.id} odds sum ${sum}`);
    if (o.minRarity) assert.ok(odds.item.every((r) => rarityRank(r.id) >= rarityRank(o.minRarity)));
    if (o.guarantee) {
      assert.ok(Math.abs(odds.guaranteed.reduce((s, r) => s + r.p, 0) - 1) < 1e-9);
      assert.ok(odds.guaranteed.every((r) => rarityRank(r.id) >= rarityRank(o.guarantee.minRarity)), `${o.id} guarantee`);
    }
  }
  // dearer packs have better odds
  const epicPlus = (id) => offerOdds(OFFER_INDEX[id]).item.filter((r) => rarityRank(r.id) >= 3).reduce((s, r) => s + r.p, 0);
  assert.ok(epicPlus('pack_starter') < epicPlus('pack_street') && epicPlus('pack_street') < epicPlus('pack_pro') && epicPlus('pack_pro') < epicPlus('pack_champion'));
});

test('buying a pack costs CR, adds its items and keeps the guarantee', () => {
  for (const id of ['pack_starter', 'pack_street', 'pack_pro', 'pack_champion']) {
    const o = OFFER_INDEX[id];
    for (let i = 0; i < 6; i++) {
      const p = rich(100 + i);
      const cr0 = p.currency.credits, inv0 = Object.keys(p.inventory).length;
      const r = buyOffer(p, id);
      assert.ok(r.ok);
      assert.equal(p.currency.credits, cr0 - o.price);
      assert.equal(r.items.length, o.count);
      assert.equal(Object.keys(p.inventory).length, inv0 + o.count);
      if (o.guarantee) assert.ok(r.items.some((it) => rarityRank(it.rarity) >= rarityRank(o.guarantee.minRarity)), `${id} guarantee held`);
      for (let k = 1; k < r.items.length; k++) assert.ok(rarityRank(r.items[k].rarity) >= rarityRank(r.items[k - 1].rarity), 'revealed rarest last');
    }
  }
  const poor = rich(1, 100);
  const r = buyOffer(poor, 'pack_street');
  assert.equal(r.ok, false);
  assert.equal(poor.currency.credits, 100, 'nothing taken when you cannot pay');
});

test('themed offers stay in their pools; crates give materials; capsules respect their minimum', () => {
  const p = rich(7);
  for (let i = 0; i < 5; i++) {
    for (const it of buyOffer(p, 'pack_classic').items) assert.equal(baseOf(it).series, 'classic');
    for (const it of buyOffer(p, 'pack_launch').items) assert.ok(['launcher', 'cable'].includes(it.slot));
    const b = buyOffer(p, 'bundle_attack');
    assert.deepEqual(b.items.map((x) => x.slot).sort(), ['disc', 'ring', 'tip']);
    assert.ok(rarityRank(b.items.find((x) => x.slot === 'ring').rarity) >= rarityRank('rare'), 'bundle ring is Rare or better');
    assert.ok(OFFER_INDEX.bundle_attack.items.find((x) => x.slot === 'tip').pool.includes(b.items.find((x) => x.slot === 'tip').base));
    for (const it of buyOffer(p, 'cap_gold').items) assert.ok(rarityRank(it.rarity) >= rarityRank('epic'));
  }
  const scrap0 = p.materials.scrap || 0;
  const c = buyOffer(p, 'crate_materials');
  assert.ok(c.ok && c.items.length === 0);
  assert.equal(p.materials.scrap, scrap0 + 20);
});

test('purchases are deterministic per profile', () => {
  const run = () => { const p = rich(42); return ['pack_street', 'cap_mystery', 'bundle_defense'].flatMap((id) => buyOffer(p, id).items.map((it) => `${it.base}:${it.rarity}:${it.traits.map((t) => t.id).join('+')}`)); };
  assert.deepEqual(run(), run());
});

test('daily deals: three exact Rare+ parts a day, bought once, what you see is what you get', () => {
  const p = rich(9);
  const day = '2026-10-11';
  const a = dailyDeals(p, day), b = dailyDeals(p, day);
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((d) => d.item.uid), b.map((d) => d.item.uid), 'same day, same deals');
  assert.notDeepEqual(dailyDeals(p, '2026-10-12').map((d) => d.item.uid), a.map((d) => d.item.uid), 'new deals tomorrow');
  assert.ok(a.every((d) => rarityRank(d.item.rarity) >= rarityRank('rare') && d.price < d.full));
  const cr0 = p.currency.credits;
  const r = buyDeal(p, 1, day);
  assert.ok(r.ok);
  assert.equal(p.currency.credits, cr0 - a[1].price);
  const got = p.inventory[r.items[0].uid];
  assert.equal(got.base, a[1].item.base);
  assert.equal(got.rarity, a[1].item.rarity);
  assert.deepEqual(got.traits, a[1].item.traits);
  assert.equal(buyDeal(p, 1, day).ok, false, 'once a day');
  assert.ok(dailyDeals(p, day)[1].bought);
  assert.equal(dailyDeals(p, '2026-10-12')[1].bought, false);
  assert.ok(dealsUnseen(p, day));
  markDealsSeen(p, day);
  assert.equal(dealsUnseen(p, day), false);
});

test('old saves get the shop defaults', () => {
  const p = newProfile(3);
  delete p.store;
  normalizeProfile(p);
  assert.equal(storeState(p).purchases, 0);
  assert.deepEqual(p.store.daily.bought, []);
});
