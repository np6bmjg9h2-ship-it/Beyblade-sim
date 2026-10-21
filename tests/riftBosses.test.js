// Rift bosses (rift-m6-spec.md section 4, tests 16-17): a kit boss in every act, a
// weakness text generated from its numbers, exactly one weakness source on
// the boss, a plan that ignores the player's habits, the condition wiring
// and Mirelle's spin kit (same-spin weakness, two-way launcher, spin read).

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../src/systems/profile.js';
import { RIFT_ACTS } from '../src/data/rift.js';
import { ARENA_INDEX } from '../src/data/arenas.js';
import { BOSS_KITS, bossKit, weaknessText, nodeArena } from '../src/data/riftBosses.js';
import { startRun, generateAct } from '../src/systems/rift.js';
import { nodeOpponent, riftParticipant, runGear } from '../src/systems/riftBattle.js';
import { traderStock, buy } from '../src/systems/riftNodes.js';
import { resolveLaunchGear } from '../src/game/launch.js';
import { rivalPlan } from '../src/systems/rivals.js';
import { ModifierStack } from '../src/systems/modifiers.js';
import { CHANNEL_LIMITS } from '../src/data/channels.js';
import { CHARACTER_INDEX } from '../src/data/characters.js';

function freshRun(seed = 1234) {
  const p = newProfile(77);
  const run = startRun(p, { loadoutIndex: 0, depth: 0, seed });
  return { p, run };
}

test('every Rift boss pool holds a kit boss, and every kit is a real character', () => {
  RIFT_ACTS.forEach((A, a) => assert.ok(A.bosses.some((id) => bossKit(id)), `act ${a + 1}`));
  for (const kit of Object.values(BOSS_KITS)) {
    assert.ok(CHARACTER_INDEX[kit.id]);
    assert.ok(RIFT_ACTS[kit.act].bosses.includes(kit.id), `${kit.id} is in its home act`);
  }
});

test('a weakness is one source on known channels, and its text carries every number', () => {
  for (const kit of Object.values(BOSS_KITS)) {
    const w = kit.weakness;
    assert.ok(w.id && w.name && w.cond?.type);
    const text = weaknessText(kit);
    for (const [ch, v] of w.deltas) {
      assert.ok(CHANNEL_LIMITS[ch], ch);
      assert.ok(text.includes(`${Math.round(Math.abs(v) * 100)}%`), `${kit.id}: ${text}`);
    }
    if (w.cond.type === 'spinBelow') assert.ok(text.includes(`${Math.round(w.cond.value * 100)}%`), text);
  }
  assert.equal(weaknessText(null), '');
});

test('nodeOpponent adds one weakness source to a kit boss and none elsewhere', () => {
  for (const seed of [77, 78, 79, 80]) {
  const { p, run } = freshRun(seed);
  for (let a = 0; a < RIFT_ACTS.length; a++) {
    const A = generateAct(run, a);
    const opp = nodeOpponent(p, run, A.boss);
    const ws = opp.modSources.filter((s) => s.id.startsWith('weakness:'));
    const kit = bossKit(A.boss.rival);
    assert.equal(ws.length, kit ? 1 : 0);
    if (kit) assert.equal(ws[0].origin, 'weakness');
    assert.equal(opp.weakness || null, kit?.weakness.id || null);
    for (const n of A.floors.flat().filter((x) => x.arena)) {
      assert.ok(!nodeOpponent(p, run, n).modSources.some((s) => s.id.startsWith('weakness:')));
    }
  }
  }
});

test('a Rift boss plays its signature build whatever your habits', () => {
  let adapted = 0;
  for (const style of ['attack', 'defense', 'stamina', 'burst']) {
    for (const seed of [1, 2, 3, 4]) {
      const { p, run } = freshRun(seed);
      const base = Object.fromEntries(Object.keys(p.habits.style).map((k) => [k, k === style ? 1 : 0]));
      p.habits = { ...p.habits, matches: 20, style: base, recentStyles: [style, style] };
      for (let a = 0; a < RIFT_ACTS.length; a++) {
        const boss = generateAct(run, a).boss;
        p.rivals = { [boss.rival]: { met: true, seen: true } };
        const tier = RIFT_ACTS[a].tier;
        const neutral = rivalPlan({ habits: null, rivals: {} }, boss.rival, tier, { seed: boss.seed });
        assert.equal(nodeOpponent(p, run, boss).plan.buildId, neutral.build.id);
        if (rivalPlan(p, boss.rival, tier, { seed: boss.seed }).build.id !== neutral.build.id) adapted++;
      }
    }
  }
  assert.ok(adapted > 0, 'the habits above make an ordinary rival adapt (the test bites)');
});

const CTX = { spinFrac: 0.9, rFrac: 0.5, oppRFrac: 0.5, speed: 0.3, surfaceTag: 'standard', sinceCollision: 99, time: 10, approaching: false };
function active(kit, ctx) {
  const m = new ModifierStack();
  m.add({ id: 'weakness:' + kit.weakness.id, name: kit.weakness.name, origin: 'weakness', cond: kit.weakness.cond, deltas: kit.weakness.deltas });
  m.evaluate({ ...CTX, ...ctx });
  return m.active.has('weakness:' + kit.weakness.id);
}

test('weakness conditions open exactly when the spec says', () => {
  const K = BOSS_KITS;
  assert.ok(active(K.sora, { sinceCollision: 0.5 }));
  assert.ok(!active(K.sora, { sinceCollision: 1.2 }));
  assert.ok(active(K.daichi, { time: 41 }));
  assert.ok(!active(K.daichi, { time: 39 }));
  assert.ok(active(K.mirelle, { sameSpin: true, oppositeSpin: false }));
  assert.ok(!active(K.mirelle, { sameSpin: false, oppositeSpin: true }));
  assert.ok(active(K.nyx, { spinFrac: 0.39 }));
  assert.ok(!active(K.nyx, { spinFrac: 0.41 }));
});

test('bosses keep the drawn arena; Mirelle brings a two-way launcher and reads spin', () => {
  for (const arena of RIFT_ACTS[2].arenas) assert.equal(nodeArena({ type: 'boss', rival: 'mirelle', arena }), arena);
  assert.equal(nodeArena({ type: 'battle', arena: 'magma' }), 'magma');
  assert.equal(nodeArena({ type: 'boss', rival: 'juno', arena: 'standard' }), 'standard', 'an old save with a kit-less boss');
  const { p, run } = freshRun();
  const opp = nodeOpponent(p, run, { id: 'b', type: 'boss', rival: 'mirelle', act: 2, arena: 'crystal', seed: 5, affixes: [] });
  assert.equal(opp.launcher.spinMech, 'dual');
  assert.equal(opp.spin, 'L');
  assert.ok(opp.spinRead > 0);
  const sora = nodeOpponent(p, run, { id: 'b', type: 'boss', rival: 'sora', act: 0, arena: 'standard', seed: 5, affixes: [] });
  assert.ok(!sora.spinRead);
});


test('traders in a spin-reading boss act offer a two-way launcher for the run', () => {
  const { p, run } = freshRun();
  const gear = () => resolveLaunchGear(runGear(p, run).launcher, runGear(p, run).cable);
  assert.notEqual(gear().spinMech, 'dual', 'the starter launcher turns one way');
  const offers = (act) => { run.act = act; return traderStock(p, run, { id: 't' + act, type: 'trader' }); };
  assert.ok(!offers(0).some((o) => o.type === 'launcher'), 'act 1 has no spin reader');
  const stock = offers(1);
  const i = stock.findIndex((o) => o.type === 'launcher');
  assert.ok(i >= 0 && stock[i].price > 0);
  run.shards = 999;
  assert.ok(buy(p, run, { id: 't1', type: 'trader', stock }, i).ok);
  assert.equal(gear().spinMech, 'dual');
  const me = riftParticipant(p, run);
  assert.equal(resolveLaunchGear(me.launcher, me.cable).spinMech, 'dual');
  assert.ok(!traderStock(p, run, { id: 't9', type: 'trader' }).some((o) => o.type === 'launcher'), 'not offered once carried');
});
