// Swap comparison: measured rows, verdicts, traits and sets gained or lost,
// launch gear, legality.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../src/systems/profile.js';
import { createItem } from '../src/systems/items.js';
import { compareSwap, verdictLine } from '../src/systems/compare.js';

const add = (p, opts) => { const it = createItem({ seed: 77, level: 1, ...opts }); p.inventory[it.uid] = it; return it; };
const row = (rows, key) => rows.find((r) => r.key === key);

test('the equipped item compares as equipped', () => {
  const p = newProfile(3);
  const L = p.loadouts[0];
  const cmp = compareSwap(p, L, 'ring', p.inventory[L.parts.ring]);
  assert.equal(cmp.same, true);
  assert.equal(verdictLine(cmp), 'Equipped');
  assert.ok(cmp.top.every((r) => r.tone === 'same'));
});

test('a heavy rim disc reads as more inertia, more stamina and defence, less mobility', () => {
  const p = newProfile(3);
  const L = p.loadouts[0]; // Ten Disc
  const heavy = add(p, { base: 'disc_heavyring', rarity: 'common', noTraits: true, set: null, special: null });
  const cmp = compareSwap(p, L, 'disc', heavy);
  const I = row(cmp.top, 'I3gcm2');
  assert.ok(I.b > I.a && I.tone === 'good', 'inertia up and judged good');
  assert.equal(row(cmp.top, 'massG').tone, 'mixed', 'mass is a trade-off');
  assert.ok(cmp.verdict.better.includes('Stamina') && cmp.verdict.better.includes('Defense'));
  assert.ok(cmp.verdict.worse.includes('Mobility'));
  // part rows come from the resolved part, top rows from the assembled top
  assert.ok(row(cmp.part, 'mass').b > row(cmp.part, 'mass').a);
  assert.ok(cmp.valid.ok);
  // every changed row carries a formatted delta with a sign
  for (const r of [...cmp.top, ...cmp.part]) if (r.tone !== 'same') assert.match(r.delta, /^[+−]/);
});

test('traits and set bonuses gained and lost are listed', () => {
  const p = newProfile(3);
  const L = p.loadouts[0];
  // two Tempest pieces already equipped through the launcher and the cable
  for (const k of ['launcher', 'cable']) p.inventory[L[k]].set = 'tempest';
  const ring = add(p, { base: 'ring_galefang', rarity: 'rare', traits: [{ id: 'honedEdge', mag: 0.8 }], set: 'tempest', special: null });
  const cmp = compareSwap(p, L, 'ring', ring);
  assert.deepEqual(cmp.traits.gained.map((t) => t.id), ['honedEdge']);
  assert.ok(cmp.traits.gained[0].desc.length > 0);
  assert.ok(cmp.sets.gained.some((s) => s.set === 'tempest' && s.tier === 3), 'third Tempest piece adds the 3-piece bonus');
  // the reverse swap loses them
  const L2 = { ...L, parts: { ...L.parts, ring: ring.uid } };
  const back = compareSwap(p, L2, 'ring', p.inventory[L.parts.ring]);
  assert.deepEqual(back.traits.lost.map((t) => t.id), ['honedEdge']);
  assert.ok(back.sets.lost.some((s) => s.set === 'tempest' && s.tier === 3));
});

test('launch gear compares launch energy and launch spin; a wrong-spin launcher is flagged', () => {
  const p = newProfile(3);
  const L = p.loadouts[0];
  const torque = add(p, { base: 'launcher_torque', rarity: 'common', noTraits: true, set: null, special: null });
  const cmp = compareSwap(p, L, 'launcher', torque);
  const E = row(cmp.gear, 'energyMax');
  assert.ok(E.b > E.a && E.tone === 'good');
  assert.ok(row(cmp.gear, 'launchRpm').b > row(cmp.gear, 'launchRpm').a);
  assert.ok(cmp.verdict.better.includes('Launch power') && cmp.verdict.worse.includes('Launch control'), 'big spring: more power, harder to time');
  assert.equal(cmp.top.length, 0, 'gear does not change the top');
  const lefty = add(p, { base: 'launcher_lefthand', rarity: 'common', noTraits: true, set: null, special: null });
  const bad = compareSwap(p, L, 'launcher', lefty);
  assert.equal(bad.valid.ok, false);
  assert.match(bad.valid.errors.join(' '), /left spin/);
});

test('an incompatible part is flagged, and a part swap shows launch spin without judging it', () => {
  const p = newProfile(3);
  const L = p.loadouts[0];
  const wideBall = add(p, { base: 'tip_wideball', rarity: 'common', noTraits: true, set: null, special: null });
  const cmp = compareSwap(p, L, 'tip', wideBall);
  assert.equal(cmp.valid.ok, false, 'wide-socket tip on a standard lock');
  const rpm = row(cmp.gear, 'launchRpm');
  assert.ok(rpm && rpm.roles === null);
});
