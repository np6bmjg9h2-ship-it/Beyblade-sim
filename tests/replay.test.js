// Deterministic replays: a recorded match re-simulates to the identical
// outcome even when frame timing differs completely.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { emptyControls } from '../src/game/ai.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { Rng } from '../src/core/rng.js';

function participants() {
  const me = { ...participantFromDef(ARCHETYPE_INDEX.all, { id: 'player' }), human: true, name: 'Tester' };
  const opp = participantFromDef(ARCHETYPE_INDEX.striker, { id: 'cpu', difficulty: 1 });
  return [me, opp];
}

// Drive a battle with scripted "human" inputs and jittery frame times.
function playRecorded(seed, frameRng) {
  const battle = new Battle({ arenaId: 'standard', format: 'bo3', seed, participants: participants(), rules: { slowmo: true }, record: true, roundTime: 40 });
  battle.headless = true;
  const ctl = emptyControls();
  let guard = 0;
  while (battle.phase !== 'matchOver' && guard++ < 200000) {
    const dt = 0.006 + frameRng.next() * 0.03;
    if (battle.phase === 'setup') {
      battle.setAim(0, { x: -0.06 + frameRng.next() * 0.02, z: frameRng.next() * 0.02, lean: frameRng.next() * 0.2, dir: 0.1 });
      battle.setTechnique(0, frameRng.next() < 0.5 ? 'bank' : 'normal');
      battle.confirmSetup(0);
    }
    if (battle.phase === 'countdown') {
      const L = battle.fighters[0].launch;
      battle.chargeInput(0, !L.released, 1);
      if (!L.released && L.meter.charge >= 0.9) battle.release(0);
    }
    // scripted steering: circle, dash and brace on a timetable
    const t = battle.battleTime;
    ctl.steer.set(Math.cos(t * 1.7) * 0.8, 0, Math.sin(t * 1.3) * 0.8);
    ctl.dash = Math.floor(t * 2) % 7 === 3;
    ctl.brace = Math.floor(t) % 5 === 2;
    ctl.counter = Math.floor(t * 3) % 11 === 5;
    ctl.ability1 = Math.floor(t * 2) % 13 === 6;
    battle.update(dt, [ctl]);
    if (battle.phase === 'roundOver') battle.nextRound();
  }
  return battle;
}

function playReplay(data, parts, dtFn) {
  const battle = new Battle({ arenaId: data.arenaId, format: data.format, seed: data.seed, participants: parts, rules: data.rules, roundTime: data.roundTime, replay: data.rec });
  battle.headless = true;
  let guard = 0, k = 0;
  while (battle.phase !== 'matchOver' && guard++ < 200000) {
    battle.update(dtFn(k++), []);
    if (battle.phase === 'roundOver') battle.nextRound();
  }
  return battle;
}

test('a recorded match replays to the identical result with different frame timing', () => {
  for (const seed of [11, 29]) {
    const rec = playRecorded(seed, new Rng(seed * 3));
    const data = JSON.parse(JSON.stringify(rec.replayData()));
    assert.ok(data.rec.controls.length > 20, 'controls were recorded');
    assert.ok(Object.keys(data.rec.setups).length >= 2, 'setups recorded per round');
    const parts = JSON.parse(JSON.stringify(participants()));
    for (const dtFn of [() => 1 / 60, (k) => (k % 3 === 0 ? 0.05 : 0.004)]) {
      const rep = playReplay(data, parts, dtFn);
      assert.equal(rep.result.winner, data.summary.winner, `seed ${seed}: same winner`);
      assert.equal(rep.result.rounds.length, data.summary.rounds.length);
      rep.result.rounds.forEach((r, i) => {
        assert.equal(r.how, data.summary.rounds[i].how, `round ${i + 1} finish`);
        assert.equal(+r.time.toFixed(3), data.summary.rounds[i].time, `round ${i + 1} time`);
      });
      const a = rec.fighters.map((f) => [f.stats.impacts, f.stats.dashes, +f.stats.distance.toFixed(6)]);
      const b = rep.fighters.map((f) => [f.stats.impacts, f.stats.dashes, +f.stats.distance.toFixed(6)]);
      assert.deepEqual(b, a, 'identical per-fighter statistics');
    }
  }
});

test('replay storage keeps the newest twelve plus pinned replays, per save slot', async () => {
  const { SaveManager, REPLAY_KEEP } = await import('../src/systems/save.js');
  const sm = await SaveManager.create({ memory: true });
  const mk = (i) => ({ id: 'r' + i, date: i, title: 'T', mode: 'quick', names: ['A', 'B'], score: '2-1', arenaId: 'standard', summary: { winner: 0 } });
  await sm.saveReplay('slot1', mk(0));
  await sm.pinReplay('slot1', 'r0', true);
  for (let i = 1; i <= 15; i++) await sm.saveReplay('slot1', mk(i));
  const list = await sm.listReplays('slot1');
  assert.equal(list.filter((r) => !r.pinned).length, REPLAY_KEEP);
  assert.ok(list.some((r) => r.id === 'r0'), 'pinned replay kept');
  assert.equal(await sm.getReplay('slot1', 'r1'), null, 'oldest unpinned pruned');
  assert.ok(await sm.getReplay('slot1', 'r15'));
  assert.equal((await sm.listReplays('slot2')).length, 0, 'slots are separate');
  await sm.remove('slot1');
  assert.equal((await sm.listReplays('slot1')).length, 0, 'deleting a slot deletes its replays');
});

test('a live AI match ends identically at 30, 60 and 144 fps', () => {
  const run = (seed, arenaId, fps) => {
    const battle = new Battle({ arenaId, format: 'single', seed, headless: true,
      participants: [participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 1 }), participantFromDef(ARCHETYPE_INDEX.all, { difficulty: 1 })] });
    battle.headless = true;
    const spawns = [];
    battle.on('launch', () => spawns.push(battle.sim.tickCount));
    let guard = 0;
    while (battle.phase !== 'matchOver' && guard++ < 300 * fps) battle.update(1 / fps, []);
    const r = battle.result.rounds[0];
    return { how: r.how, winner: r.winner, time: r.time, spawns };
  };
  for (const [seed, arenaId] of [[1010, 'vortex'], [1011, 'edgebreaker'], [1006, 'standard']]) {
    const ref = run(seed, arenaId, 60);
    for (const fps of [30, 144]) assert.deepEqual(run(seed, arenaId, fps), ref, `seed ${seed} at ${fps} fps`);
  }
});
