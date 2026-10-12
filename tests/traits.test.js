// Declarative traits: the compiled specs behave exactly like the original
// hand-written trait functions (frozen in tests/fixtures/traits-v1.js), and
// every description is generated from the effect's own numbers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAITS as OLD, TRAIT_INDEX as OLD_INDEX } from './fixtures/traits-v1.js';
import { TRAITS, TRAIT_INDEX } from '../src/data/traits.js';
import { PARTS } from '../src/data/parts.js';
import { LAUNCHERS, CABLES } from '../src/data/launchers.js';

const MS = [0, 0.13, 0.5, 0.77, 1];
const strip = (o) => { const c = structuredClone(o); delete c._balanceFix; return c; };

test('every original trait still exists with the same identity', () => {
  for (const o of OLD) {
    const n = TRAIT_INDEX[o.id];
    assert.ok(n, `missing ${o.id}`);
    for (const k of ['name', 'family', 'kind', 'rarityMin', 'special', 'group']) assert.deepEqual(n[k], o[k] ?? (k === 'group' ? null : o[k]), `${o.id}.${k}`);
    assert.deepEqual(n.slots, o.slots, `${o.id}.slots`);
    assert.deepEqual(n.cond ?? null, o.cond ?? null, `${o.id}.cond`);
  }
});

test('compiled effects are bit-identical to the originals', () => {
  for (const o of OLD) {
    const n = TRAIT_INDEX[o.id];
    for (const m of MS) {
      if (o.fx) assert.deepEqual(n.fx(m), o.fx(m), `${o.id}.fx(${m})`);
      if (o.launch) assert.deepEqual(n.launch(m), o.launch(m), `${o.id}.launch(${m})`);
      if (o.item) assert.deepEqual(n.item(m), o.item(m), `${o.id}.item(${m})`);
      if (o.physical) {
        const bases = [...PARTS, ...LAUNCHERS, ...CABLES].filter((b) => o.slots.includes(b.slot));
        assert.ok(bases.length, o.id);
        for (const b of bases) {
          const a = structuredClone(b), c = structuredClone(b);
          o.physical(a, m); n.physical(c, m);
          assert.deepEqual(strip(c), strip(a), `${o.id} on ${b.id} at ${m}`);
        }
      }
    }
  }
});

test('descriptions are generated from the numbers and are well formed', () => {
  for (const t of TRAITS) {
    for (const m of [0, 0.5, 1]) {
      const d = t.desc(m);
      assert.ok(d.length > 8 && !/undefined|NaN|null|\[object/.test(d), `${t.id}: ${d}`);
      assert.ok(/\d/.test(d), `${t.id} shows a number: ${d}`);
    }
  }
  // the numbers move with the magnitude
  assert.notEqual(TRAIT_INDEX.honedEdge.desc(0), TRAIT_INDEX.honedEdge.desc(1));
  assert.match(TRAIT_INDEX.honedEdge.desc(1), /Blade face \+4\.0°/);
  assert.match(TRAIT_INDEX.predatorsEdge.desc(0), /While the opponent closes in on you: blade face \+1\.5°/);
  assert.match(TRAIT_INDEX.stableGrip.desc(1), /Launch angle error −32%/);
  void OLD_INDEX;
});
