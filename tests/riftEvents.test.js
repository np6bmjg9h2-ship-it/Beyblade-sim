// Rift event pack: Gambling Spinner, The Echo, Cracked Mirror, Quiet Library,
// Abandoned Arena. Every choice lists its gain and cost, outcomes come from
// the run's seeded rng (same seed + same choices = same result), and the
// lasting flags (run.flags) reach the next boss / elite battle and are spent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../src/systems/profile.js';
import { startRun, riftState, pickReward } from '../src/systems/rift.js';
import { EVENT_INDEX } from '../src/data/rift.js';
import { CHARM_INDEX } from '../src/data/riftCharms.js';
import { eventAction, eventOptions } from '../src/systems/riftNodes.js';
import { flagSources, flagAffixes, consumeFlags, flagNotes, ECHO_GIFTS } from '../src/systems/riftFlags.js';
import { riftParticipant, nodeOpponent } from '../src/systems/riftBattle.js';

const PACK = ['gambler', 'echo', 'mirror', 'library', 'arena'];

function freshRun(seed = 1234) {
  const p = newProfile(77);
  const run = startRun(p, { loadoutIndex: 0, depth: 0, seed });
  run.hearts = 3; run.shards = 300;
  run.charms = [{ id: 'kindling', enhanced: false }, { id: 'lockwax', enhanced: false }, { id: 'glassfang', enhanced: false }];
  return { p, run };
}
const evNode = (event, id = 'ev') => ({ id, type: 'event', event, act: 0, floor: 0, seed: 99 });
// Play one choice on a fresh copy of a seed; returns the run after it.
function play(seed, event, action, arg = null) {
  const { p, run } = freshRun(seed);
  const node = evNode(event);
  eventOptions(p, run, node);
  const r = eventAction(p, run, node, action, arg);
  return { p, run, node, r };
}
// acquiredAt is a wall-clock stamp on generated parts, not an outcome.
const snap = ({ run, r }) => JSON.stringify({ r, charms: run.charms, shards: run.shards, hearts: run.hearts, flags: run.flags, pending: run.pending }, (k, v) => (k === 'acquiredAt' ? undefined : v));

test('the five new events exist with real choices that each show a gain and a cost', () => {
  for (const id of PACK) {
    assert.ok(EVENT_INDEX[id], id);
    const { p, run } = freshRun();
    const opts = eventOptions(p, run, evNode(id));
    assert.ok(opts.length >= 2, `${id} offers at least two choices`);
    for (const o of opts) { assert.ok(o.label && o.gain && o.cost, `${id}:${o.action} names gain and cost`); assert.equal(o.disabled, ''); }
  }
});

test('same seed and same choice give the same outcome, for every event choice', () => {
  const cases = [['gambler', 'wager', 0], ['gambler', 'stake'], ['echo', 'gift', null], ['mirror', 'reflect', 0], ['mirror', 'smash', 2], ['library', 'study'], ['library', 'pay'], ['arena', 'fight'], ['arena', 'scavenge']];
  for (const [ev, action, arg0] of cases) {
    for (const seed of [1, 2, 3]) {
      const arg = ev === 'echo' ? eventOptions(freshRun(seed).p, freshRun(seed).run, evNode('echo'))[0].arg : arg0 ?? null;
      const a = play(seed, ev, action, arg), b = play(seed, ev, action, arg);
      assert.ok(a.r.ok, `${ev}:${action} ok (${a.r.reason || ''})`);
      assert.equal(snap(a), snap(b), `${ev}:${action} seed ${seed}`);
      assert.ok(a.node.done, 'one choice per visit');
      assert.equal(eventAction(a.p, a.run, a.node, action, arg).ok, false);
    }
  }
});

test('coin flips are seeded 50/50 and depend on the seed', () => {
  let wins = 0;
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) { const w = play(seed, 'gambler', 'stake').r.win; wins += w ? 1 : 0; seen.add(w); }
  assert.equal(seen.size, 2);
  assert.ok(wins > 70 && wins < 130, `about half win (${wins}/200)`);
  let fights = 0;
  for (let seed = 1; seed <= 200; seed++) fights += play(seed, 'arena', 'fight').r.win ? 1 : 0;
  assert.ok(fights > 95 && fights < 145, `about 60% win the arena (${fights}/200)`);
});

test('Gambling Spinner: a won wager swaps the charm for a better rarity; a lost one takes it', () => {
  let won = 0, lost = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { run, r } = play(seed, 'gambler', 'wager', 0);
    assert.ok(!run.charms.some((h) => h.id === 'kindling'));
    if (r.win) { won++; assert.equal(CHARM_INDEX[r.charm.id].rarity, 'rare'); assert.equal(run.charms.length, 3); } else { lost++; assert.equal(run.charms.length, 2); }
  }
  assert.ok(won && lost);
  const { p, run } = freshRun();
  assert.ok(!eventOptions(p, run, evNode('gambler')).some((o) => o.action === 'wager' && o.arg === 2), 'curses cannot be wagered');
  const s = play(5, 'gambler', 'stake');
  assert.equal(s.run.shards, 300 - 40 + (s.r.win ? 100 : 0));
});

test('The Echo costs a heart now and lends its gift to the next boss fight only', () => {
  const { p, run } = freshRun(7);
  const node = evNode('echo');
  const opts = eventOptions(p, run, node);
  assert.equal(opts.length, EVENT_INDEX.echo.offers);
  assert.equal(new Set(opts.map((o) => o.arg)).size, opts.length);
  assert.ok(eventAction(p, run, node, 'gift', opts[0].arg).ok);
  assert.equal(run.hearts, 2);
  assert.equal(run.flags.echo, opts[0].arg);
  assert.match(flagNotes(run)[0], /next boss/);
  const boss = run.map[0].boss, battle = run.map[0].floors[0].find((n) => n.type === 'battle');
  run.current = battle.id;
  assert.ok(!riftParticipant(p, run).modSources.some((m) => m.id.startsWith('flag:echo')), 'not in ordinary battles');
  run.current = boss.id;
  const src = riftParticipant(p, run).modSources.find((m) => m.id.startsWith('flag:echo'));
  assert.ok(src);
  assert.deepEqual(src.deltas, ECHO_GIFTS[opts[0].arg].mods);
  consumeFlags(run, battle);
  assert.equal(run.flags.echo, opts[0].arg, 'an ordinary battle keeps it');
  assert.deepEqual(consumeFlags(run, boss), [ECHO_GIFTS[opts[0].arg].name]);
  assert.equal(flagSources(run, boss, 'player').mods.length, 0);
  // at one heart the price is refused (it would end the run)
  const low = freshRun(7); low.run.hearts = 1;
  const n2 = evNode('echo');
  assert.ok(eventOptions(low.p, low.run, n2).every((o) => o.disabled));
  assert.equal(eventAction(low.p, low.run, n2, 'gift', n2.echoes[0]).ok, false);
  assert.equal(low.run.hearts, 1);
});

test('Cracked Mirror: a reflected charm counts twice and brings a curse; smashing breaks a curse for a heart', () => {
  const { run, r } = play(3, 'mirror', 'reflect', 1);
  assert.equal(run.charms.filter((h) => h.id === 'lockwax').length, 2);
  assert.equal(CHARM_INDEX[r.charm.id].rarity, 'cursed');
  assert.equal(run.charms.length, 5);
  const s = play(3, 'mirror', 'smash', 2);
  assert.ok(!s.run.charms.some((h) => h.id === 'glassfang'));
  assert.equal(s.run.hearts, 2);
  const { p, run: r2 } = freshRun();
  const opts = eventOptions(p, r2, evNode('mirror'));
  assert.ok(!opts.some((o) => o.action === 'reflect' && o.arg === 2), 'curses cannot be reflected');
  assert.ok(!opts.some((o) => o.action === 'smash' && o.arg !== 2));
});

test('Quiet Library: study gives a boon pick and marks the next elite; paying skips the mark', () => {
  const { p, run } = play(4, 'library', 'study');
  assert.equal(run.pending.at(-1).kind, 'boon');
  assert.equal(run.flags.nextEliteAffix, 1);
  const id = run.pending.at(-1).options[0].id;
  run.pending = run.pending.slice(-1);
  assert.ok(pickReward(p, run, 0).ok);
  assert.equal(run.boons[id], 1);
  const elite = { id: 'a0f1n0', type: 'elite', act: 0, floor: 1, seed: 4242, archetype: 'striker', affixes: ['spiked'] };
  const extra = flagAffixes(run, elite);
  assert.equal(extra.length, 1);
  assert.notEqual(extra[0], 'spiked');
  assert.deepEqual(flagAffixes(run, elite), extra, 'same node, same extra trait (scout sheet = battle)');
  const opp = nodeOpponent(p, run, elite);
  assert.equal(opp.affixNames.length, 2);
  assert.ok(opp.modSources.some((m) => m.id === 'affix:flag:' + extra[0]) || opp.rift?.status);
  assert.equal(flagAffixes(run, { ...elite, type: 'battle' }).length, 0, 'only elites');
  consumeFlags(run, elite);
  assert.equal(nodeOpponent(p, run, elite).affixNames.length, 1);
  const paid = play(4, 'library', 'pay');
  assert.equal(paid.run.shards, 300 - 60);
  assert.equal(paid.run.flags.nextEliteAffix, undefined);
});

test('Abandoned Arena: a win queues a part choice, a loss costs a heart, scavenging pays shards', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { run, r } = play(seed, 'arena', 'fight');
    if (r.win) { assert.equal(run.pending.at(-1).kind, 'part'); assert.equal(run.hearts, 3); } else { assert.equal(run.hearts, 2); assert.ok(!run.pending.some((s) => s.title.startsWith('Abandoned'))); }
  }
  const s = play(1, 'arena', 'scavenge');
  assert.equal(s.run.shards, 300 + EVENT_INDEX.arena.scavenge);
});

test('old saves without run.flags still build battles and spend nothing', () => {
  const { p, run } = freshRun();
  delete run.flags;
  const boss = run.map[0].boss;
  run.current = boss.id;
  assert.ok(riftParticipant(p, run));
  assert.ok(nodeOpponent(p, run, boss));
  assert.deepEqual(consumeFlags(run, boss), []);
  assert.deepEqual(flagNotes(run), []);
  assert.equal(riftState(p).active.flags, undefined);
});

test('leaving a pack event closes it without cost', () => {
  const { p, run } = freshRun();
  const node = evNode('arena');
  assert.ok(eventAction(p, run, node, 'leave').ok);
  assert.ok(node.done);
  assert.equal(run.hearts, 3);
  assert.equal(run.shards, 300);
});
