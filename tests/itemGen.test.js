// Item generation v2 and validation: reproducible from seed and version,
// bounded power budgets, exclusions, curses, names and visual variants, bad
// luck protection, and every item source produces items that validate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateItem, regenerate, BUDGET, GEN_VERSION } from '../src/systems/itemGen.js';
import { validateItem } from '../src/systems/itemValidate.js';
import { TRAIT_INDEX } from '../src/data/traits.js';
import { RARITY_INDEX } from '../src/data/rarity.js';
import { PARTS } from '../src/data/parts.js';
import { LAUNCHERS, CABLES } from '../src/data/launchers.js';
import { newProfile } from '../src/systems/profile.js';
import { rollLoot, addItem, PITY } from '../src/systems/loot.js';
import { buyOffer, dailyStore, buyDailyStore } from '../src/systems/store.js';
import { OFFERS } from '../src/data/store.js';
import { startRun } from '../src/systems/rift.js';
import { rollRunPart, applyForge } from '../src/systems/riftLoot.js';
import { rivalItems, signatureBuild } from '../src/systems/rivals.js';
import { CHARACTERS } from '../src/data/characters.js';
import * as WS from '../src/systems/workshop.js';
import { Rng } from '../src/core/rng.js';

const BASES = [...PARTS, ...LAUNCHERS, ...CABLES];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const strip = (it) => { const c = structuredClone(it); delete c.uid; delete c.history.acquiredAt; return c; };

test('same seed and version, same item; regenerate() rebuilds it', () => {
  for (let i = 0; i < 60; i++) {
    const o = { base: BASES[i % BASES.length], rarity: RARITIES[i % 6], level: 1 + i, seed: (i * 2654435761) >>> 0, source: 'test', tier: 2 };
    const a = generateItem(o), b = generateItem(o);
    assert.deepEqual(strip(a), strip(b));
    assert.equal(a.gen.v, GEN_VERSION);
    assert.deepEqual(strip(regenerate(a)), strip(a));
  }
});

test('budgets, counts, exclusions, curses, names and variants hold across 6000 items', () => {
  let cursed = 0;
  for (let i = 0; i < 6000; i++) {
    const rarity = RARITIES[i % 6];
    const it = generateItem({ base: BASES[(i * 7) % BASES.length], rarity, level: 10, seed: (i * 40503 + 17) >>> 0, source: 'test' });
    const all = [...it.traits, ...(it.special ? [it.special] : [])];
    const cost = all.reduce((s, t) => s + TRAIT_INDEX[t.id].cost, 0);
    const curses = it.traits.filter((t) => TRAIT_INDEX[t.id].curse).length;
    assert.ok(curses <= 1 && !!it.cursed === (curses === 1));
    cursed += curses;
    assert.ok(cost <= BUDGET[rarity] + (curses ? 1 : 0), `${rarity} cost ${cost}`);
    const R = RARITY_INDEX[rarity];
    assert.ok(it.traits.length - curses <= R.traits[1] + curses, `${rarity}: ${it.traits.length} traits`);
    const groups = all.map((t) => TRAIT_INDEX[t.id].group).filter(Boolean);
    assert.equal(new Set(groups).size, groups.length, 'exclusive groups');
    assert.equal(new Set(all.map((t) => t.id)).size, all.length, 'no duplicates');
    for (const t of it.traits) assert.ok(t.mag >= R.mag[0] - 1e-9 && t.mag <= R.mag[1] + 1e-9);
    assert.ok(validateItem(it).ok);
    if (it.title) assert.ok(!/undefined|null/.test(it.title) && it.title.includes(BASES[(i * 7) % BASES.length].name), it.title);
    assert.match(it.visual.color, /^#[0-9a-f]{6}$/);
    assert.ok(['matte', 'satin', 'gloss', 'metallic', 'pearl', 'prism'].includes(it.visual.finish));
    if (rarity === 'common' || rarity === 'uncommon') assert.ok(!it.cursed, 'no curses below rare');
  }
  assert.ok(cursed > 50 && cursed < 600, `curses are uncommon (${cursed})`);
});

test('bad-luck protection guarantees Epic and Legendary drops', () => {
  const p = newProfile(9);
  let sinceEpic = 0, maxGap = 0, sinceLeg = 0, maxLeg = 0;
  for (let i = 0; i < 400; i++) {
    const it = rollLoot(p, { label: 'pity test', tier: 0 });
    const epic = RARITY_INDEX[it.rarity].rank >= RARITY_INDEX.epic.rank;
    const leg = RARITY_INDEX[it.rarity].rank >= RARITY_INDEX.legendary.rank;
    sinceEpic = epic ? 0 : sinceEpic + 1; maxGap = Math.max(maxGap, sinceEpic);
    sinceLeg = leg ? 0 : sinceLeg + 1; maxLeg = Math.max(maxLeg, sinceLeg);
  }
  assert.ok(maxGap < PITY.epic, `longest run without Epic+: ${maxGap}`);
  assert.ok(maxLeg < PITY.legendary, `longest run without Legendary+: ${maxLeg}`);
  // fixed-rarity drops don't touch the counters
  const before = { ...p.seeds.pity };
  rollLoot(p, { label: 'fixed', rarity: 'common', base: 'ring_galefang' });
  assert.deepEqual(p.seeds.pity, before);
});

test('every item source produces items that validate', () => {
  const p = newProfile(21);
  p.currency.credits = 1e7;
  Object.assign(p.materials, { scrap: 9999, polymer: 9999, alloy: 9999, coreShard: 9999, spiritDust: 9999, relicFragment: 9999 });
  const check = (it, where) => { const v = validateItem(it); assert.ok(v.ok, `${where} ${it.base}: ${v.errors.join('; ')}`); };
  for (const it of Object.values(p.inventory)) check(it, 'starter');
  for (let i = 0; i < 200; i++) check(rollLoot(p, { label: 'drop', tier: i % 5 }), 'loot');
  for (const o of OFFERS) { const r = buyOffer(p, o.id); for (const it of r.items || []) check(it, 'store ' + o.id); }
  for (const [i] of dailyStore(p, '2026-10-12').entries()) { const r = buyDailyStore(p, i, '2026-10-12'); if (r.item) check(r.item, 'daily store'); }
  const run = startRun(p, { loadoutIndex: 0, depth: 0, seed: 99 });
  const rng = new Rng(5);
  for (let i = 0; i < 80; i++) {
    const it = rollRunPart(p, run, rng);
    if (!it) continue;
    check(it, 'rift');
    if (it.traits.length) applyForge(run, 'reroll', it, { traitIndex: 0 });
    applyForge(run, 'engrave', it);
    check(it, 'rift forged');
  }
  for (const ch of CHARACTERS.slice(0, 6)) for (const tier of [1, 3, 5]) {
    const b = signatureBuild(ch, tier);
    if (!b) continue;
    const r = rivalItems(ch.id, b, tier);
    for (const it of [...Object.values(r.parts), r.launcher, r.cable].filter(Boolean)) check(it, 'rival ' + ch.id);
  }
  const bp = WS.craftBlueprint(p, 'ring_cyclonesaw');
  if (bp.item) check(bp.item, 'blueprint');
  const fg = WS.forge(p, 'tip', rollLoot);
  if (fg.item) check(fg.item, 'forge');
  // adding refuses invalid items
  const bad = rollLoot(p, { label: 'x' });
  bad.traits.push({ id: 'nope', mag: 1 });
  assert.throws(() => addItem(p, bad), /invalid item/);
});
