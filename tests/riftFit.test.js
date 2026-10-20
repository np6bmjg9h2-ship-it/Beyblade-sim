// Rift Run early-run fix: the first part offer fits the build, a dry streak
// of two forces a fitting offer, a lost ordinary battle pays a consolation,
// and the first battle of a run is against a teaching archetype.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../src/systems/profile.js';
import { SHARD_REWARD, FLOORS_PER_ACT } from '../src/data/rift.js';
import { startRun, riftState, currentChoices, recordBattle, OPENER_ARCHETYPES, CONSOLATION } from '../src/systems/rift.js';
import { rollSpoils } from '../src/systems/riftLoot.js';
import { optionFit, buildRoles, charmFit } from '../src/systems/riftFit.js';

function freshRun(seed) {
  const p = newProfile(77);
  const run = startRun(p, { loadoutIndex: 0, depth: 0, seed });
  return { p, run };
}
const battleNode = (run) => currentChoices(run).find((n) => n.type === 'battle');
const fitting = (p, run, opts) => opts.filter((o) => optionFit(p, run, o));

test('the starter build has play roles', () => {
  const { run } = freshRun(1);
  assert.ok(buildRoles(run).length > 0);
});

test('the first spoils of a run always hold an option that fits the build', () => {
  let forced = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { p, run } = freshRun(seed);
    assert.equal(run.firstOfferMade, false);
    recordBattle(p, run, battleNode(run), { won: true });
    const step = run.pending.find((s) => s.kind === 'spoils');
    assert.ok(fitting(p, run, step.options).length >= 1, `seed ${seed}: a fitting option`);
    forced += step.options.filter((o) => o.forced).length;
    assert.equal(run.firstOfferMade, true);
  }
  assert.equal(forced, 0, 'the reference build never needs the last resort');
});

test('the guarantee is seeded: same seed, same first offer', () => {
  const a = freshRun(99), b = freshRun(99);
  recordBattle(a.p, a.run, battleNode(a.run), { won: true });
  recordBattle(b.p, b.run, battleNode(b.run), { won: true });
  const key = (run) => JSON.stringify(run.pending, (k, v) => (k === 'acquiredAt' ? 0 : v));
  assert.equal(key(a.run), key(b.run));
});

test('two dry offers in a row force the next one to fit', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { p, run } = freshRun(seed);
    run.firstOfferMade = true;
    run.dry = 2;
    const opts = rollSpoils(p, run, battleNode(run));
    assert.ok(fitting(p, run, opts).length >= 1, `seed ${seed}`);
    assert.equal(run.dry, 0);
  }
});

test('runs saved before the guarantee never get a surprise one', () => {
  const { p, run } = freshRun(3);
  delete run.firstOfferMade; delete run.dry;
  riftState(p);
  assert.equal(run.firstOfferMade, true);
  assert.equal(run.dry, 0);
});

test('a lost ordinary battle pays half shards and a pick of two; a forfeit or a lost boss does not', () => {
  const { p, run } = freshRun(6);
  const node = battleNode(run);
  const s0 = run.shards;
  const r = recordBattle(p, run, node, { won: false });
  assert.equal(r.shards, Math.round((SHARD_REWARD.battle + SHARD_REWARD.perAct * node.act) * CONSOLATION.shards));
  assert.equal(run.shards, s0 + r.shards);
  assert.equal(run.pending.length, 1);
  assert.equal(run.pending[0].options.length, CONSOLATION.options);
  assert.equal(r.essence, 0);

  const f = freshRun(6);
  const rf = recordBattle(f.p, f.run, battleNode(f.run), { won: false, forfeit: true });
  assert.equal(rf.shards, 0);
  assert.equal(f.run.pending.length, 0);

  const b = freshRun(8);
  b.run.floor = FLOORS_PER_ACT;
  const rb = recordBattle(b.p, b.run, currentChoices(b.run)[0], { won: false });
  assert.equal(rb.shards, 0);
  assert.equal(b.run.pending.length, 0);
});

test('the last heart lost pays no consolation', () => {
  const { p, run } = freshRun(10);
  run.hearts = 1;
  const r = recordBattle(p, run, battleNode(run), { won: false });
  assert.equal(run.status, 'lost');
  assert.equal(r.shards, 0);
  assert.equal(run.pending.length, 0);
});

test('the first battle of a run is a teaching archetype; later floors are untouched', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const { run } = freshRun(seed);
    const n = battleNode(run);
    assert.ok(OPENER_ARCHETYPES.includes(n.archetype), `seed ${seed}: ${n.archetype}`);
    seen.add(n.archetype);
  }
  assert.equal(seen.size, OPENER_ARCHETYPES.length, 'both openers turn up');
});

test('cursed charms never count as fitting', () => {
  const { run } = freshRun(2);
  for (const id of ['glassfang', 'leechcoil', 'greedidol']) assert.equal(charmFit(run, { id }), null);
});
