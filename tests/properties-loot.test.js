// Property-based loot checks (fast-check): item generation, bad-luck
// protection, trait effects and the synergy engine hold their rules for any
// input the game can produce, not only for the seeds in itemGen.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { generateItem, regenerate, BUDGET } from '../src/systems/itemGen.js';
import { validateItem } from '../src/systems/itemValidate.js';
import { rollLoot, PITY } from '../src/systems/loot.js';
import { TRAITS, TRAIT_INDEX } from '../src/data/traits.js';
import { CHANNEL_LIMITS } from '../src/data/channels.js';
import { RARITY_INDEX, rarityRank } from '../src/data/rarity.js';
import { ModifierStack, evaluateCondition } from '../src/systems/modifiers.js';
import { effMag } from '../src/systems/effectSpec.js';
import { synergyContext, evaluateSynergies, buildBattleFx } from '../src/systems/synergy.js';
import { BEASTS } from '../src/data/beasts.js';
import { CHARMS } from '../src/data/riftCharms.js';
import { BOONS } from '../src/data/riftBoons.js';
import { CONDITIONS } from '../src/data/channels.js';
import { genOptsArb, buildArb, gearArb, runs } from './arbitraries.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const costOf = (t) => TRAIT_INDEX[t.id].cost;

test('generated items are valid, inside their power budget, follow the trait rules and rebuild exactly', () => {
  fc.assert(fc.property(genOptsArb, (o) => {
    const it = generateItem({ ...o, source: 'property test' });
    const v = validateItem(it);
    assert.ok(v.ok, v.errors.join('; '));
    assert.deepEqual(v.warnings, [], 'no off-slot traits or doubled groups');
    const R = RARITY_INDEX[o.rarity];
    const all = [...it.traits, ...(it.special ? [it.special] : [])];
    const spent = all.reduce((s, t) => s + costOf(t), 0);
    assert.ok(spent <= BUDGET[o.rarity] + (it.cursed ? 1 : 0), `cost ${spent} over budget ${BUDGET[o.rarity]}`);
    assert.equal(new Set(it.traits.map((t) => t.id)).size, it.traits.length, 'no duplicate traits');
    for (const t of it.traits) {
      const d = TRAIT_INDEX[t.id];
      assert.ok(d.slots.includes(it.slot), `${t.id} on a ${it.slot}`);
      assert.ok(rarityRank(d.rarityMin) <= rarityRank(o.rarity), `${t.id} below its minimum rarity`);
      assert.ok(t.mag >= R.mag[0] - 1e-9 && t.mag <= R.mag[1] + 1e-9, `${t.id} magnitude ${t.mag} outside ${R.mag}`);
      assert.ok(!d.special, 'special traits only in the special slot');
    }
    assert.equal(it.traits.filter((t) => TRAIT_INDEX[t.id].curse).length, it.cursed ? 1 : 0, 'one curse exactly when cursed');
    if (o.noCurse) assert.ok(!it.cursed);
    assert.match(it.visual.color, /^#[0-9a-f]{6}$/);
    const again = regenerate(it);
    for (const k of ['acquiredAt']) { delete again.history[k]; delete it.history[k]; }
    assert.deepEqual(again, it, 'the recorded seed rebuilds the same item');
  }), { numRuns: runs(1000) });
});

test('bad-luck protection: never more than 19 drops without an Epic or 59 without a Legendary', () => {
  const sourceArb = fc.record({ tier: fc.integer({ min: 0, max: 4 }), label: fc.constantFrom('battle', 'tournament', 'rift', 'rival') });
  fc.assert(fc.property(fc.nat(), fc.array(sourceArb, { minLength: 1, maxLength: 4 }), (lootSeed, sources) => {
    const profile = { seeds: { loot: lootSeed, counter: 0, pity: { epic: 0, legendary: 0 } }, player: { level: 12 } };
    let sinceEpic = 0, sinceLegend = 0;
    for (let i = 0; i < 130; i++) {
      const it = rollLoot(profile, sources[i % sources.length]);
      sinceEpic = rarityRank(it.rarity) >= rarityRank('epic') ? 0 : sinceEpic + 1;
      sinceLegend = rarityRank(it.rarity) >= rarityRank('legendary') ? 0 : sinceLegend + 1;
      assert.ok(sinceEpic < PITY.epic, `${sinceEpic} drops without an Epic`);
      assert.ok(sinceLegend < PITY.legendary, `${sinceLegend} drops without a Legendary`);
    }
  }), { numRuns: runs(60) });
});

test('every trait gives finite effects at any magnitude and mastery', () => {
  fc.assert(fc.property(fc.constantFrom(...TRAITS), fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 0, max: 1e6 }), (d, mag, xp) => {
    const m = effMag(d, { id: d.id, mag }, { xp });
    assert.ok(finite(m) && m >= 0, `effective magnitude ${m}`);
    if (d.fx) for (const [ch, v] of d.fx(m)) { assert.ok(CHANNEL_LIMITS[ch], `unknown channel ${ch}`); assert.ok(finite(v), `${d.id} ${ch} = ${v}`); }
    if (d.launch) for (const [k, v] of Object.entries(d.launch(m))) assert.ok(finite(v), `${d.id} launch ${k}`);
    if (d.item) for (const [k, v] of Object.entries(d.item(m))) assert.ok(finite(v), `${d.id} item ${k}`);
    if (d.status) for (const [k, v] of Object.entries(d.status(m))) assert.ok(finite(v) && v >= 0, `${d.id} status ${k}`);
    if (d.react) {
      const r = d.react(m);
      for (const k of ['min', 'chance', 'cooldown']) assert.ok(finite(r[k]), `${d.id} react ${k}`);
      for (const k of ['duration', 'spirit', 'stress', 'spin']) assert.ok(finite(r.effect[k]), `${d.id} react effect ${k}`);
      for (const [, v] of r.effect.deltas || []) assert.ok(finite(v));
    }
    if (d.cond) assert.ok(CONDITIONS[d.cond.type], `unknown condition ${d.cond.type}`);
    assert.equal(typeof d.desc(mag), 'string');
  }), { numRuns: runs(1000) });
});

test('any mix of effects keeps every modifier channel finite and inside its limits', () => {
  const ctxArb = fc.record({
    spinFrac: fc.double({ min: 0, max: 1.2, noNaN: true }), oppSpinFrac: fc.double({ min: 0, max: 1.2, noNaN: true }),
    speed: fc.double({ min: 0, max: 4, noNaN: true }), rFrac: fc.double({ min: 0, max: 1.2, noNaN: true }), oppRFrac: fc.double({ min: 0, max: 1.2, noNaN: true }),
    approaching: fc.boolean(), time: fc.double({ min: 0, max: 300, noNaN: true }), sinceCollision: fc.double({ min: 0, max: 99, noNaN: true }),
    surfaceTag: fc.constantFrom('standard', 'ice', 'grip', 'magma'), oppositeSpin: fc.boolean(), abilityActive: fc.boolean(),
  });
  const srcArb = fc.record({ d: fc.constantFrom(...TRAITS.filter((t) => t.fx)), mag: fc.double({ min: 0, max: 1.6, noNaN: true }), timed: fc.boolean() });
  fc.assert(fc.property(fc.array(srcArb, { maxLength: 24 }), ctxArb, (srcs, ctx) => {
    const st = new ModifierStack();
    srcs.forEach(({ d, mag, timed }, i) => {
      if (timed) st.addTimed('t' + i, d.name, d.fx(mag), 1);
      else st.add({ id: 'trait:' + d.id + i, name: d.name, origin: 'trait', cond: d.cond || { type: 'always' }, deltas: d.fx(mag) });
    });
    const out = st.evaluate(ctx);
    for (const [ch, lim] of Object.entries(CHANNEL_LIMITS)) {
      assert.ok(finite(out[ch]) && out[ch] >= lim.min - 1e-12 && out[ch] <= lim.max + 1e-12, `${ch} = ${out[ch]}`);
    }
    for (const s of st.sources) assert.equal(typeof evaluateCondition(s.cond, ctx, s), 'boolean');
  }), { numRuns: runs(1000) });
});

test('synergies: any carried build evaluates without errors, consistently, with finite effects', () => {
  const runArb = fc.option(fc.record({
    charms: fc.array(fc.constantFrom(...CHARMS.map((c) => c.id)), { maxLength: 8 }).map((ids) => ids.map((id) => ({ id }))),
    boons: fc.dictionary(fc.constantFrom(...BOONS.map((b) => b.id)), fc.integer({ min: 1, max: 3 })),
  }), { nil: null });
  const caseArb = buildArb.chain((b) => fc.record({
    b: fc.constant(b), gear: gearArb(b.spin), beast: fc.option(fc.constantFrom(...BEASTS.map((x) => x.id)), { nil: null }),
    run: runArb, xp: fc.array(fc.integer({ min: 0, max: 8000 }), { minLength: 5, maxLength: 5 }),
  }));
  fc.assert(fc.property(caseArb, ({ b, gear, beast, run, xp }) => {
    Object.values(b.build).forEach((it, i) => { it.xp = xp[i]; });
    const build = { parts: b.build, launcher: gear.launcher, cable: gear.cable, beast: beast ? { id: beast } : null, spin: b.spin, run };
    const ctx = synergyContext(build);
    const r1 = evaluateSynergies(ctx), r2 = evaluateSynergies(synergyContext(build));
    assert.deepEqual(r1.active.map((a) => a.rule.id), r2.active.map((a) => a.rule.id), 'same build, same synergies');
    for (const a of r1.active) assert.ok(a.checks.every((c) => c.met));
    for (const n of r1.near) assert.equal(n.missing.length, 1);
    const fx = buildBattleFx(build);
    for (const s of fx.sources) for (const [ch, v] of s.deltas) assert.ok(CHANNEL_LIMITS[ch] && finite(v), `${s.id} ${ch}`);
    for (const k of ['launch', 'skill', 'status', 'statusPower', 'statusTime']) for (const v of Object.values(fx[k])) assert.ok(finite(v), `${k} ${v}`);
    if (fx.rift) for (const v of Object.values(fx.rift.status)) assert.ok(finite(v) && v >= 0);
  }), { numRuns: runs(300) });
});
