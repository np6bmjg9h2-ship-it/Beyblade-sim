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

test('a top that finishes before the opponent spawns loses the round at once', () => {
  // seed 1: the two AIs release a few ticks apart, leaving one top alone after IGNITE
  const b = new Battle({ arenaId: 'standard', format: 'single', seed: 1, headless: true, roundTime: 60,
    participants: [participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 1 }), participantFromDef(ARCHETYPE_INDEX.all, { difficulty: 1 })] });
  b.headless = true;
  let early = null;
  for (let g = 0; g < 120 * 120 && b.phase !== 'matchOver'; g++) {
    b.update(1 / 120, []);
    const [A, B] = b.fighters;
    if (!early && b.phase === 'countdown' && A.launch.launched !== B.launch.launched) {
      early = A.launch.launched ? A : B;
      b.sim.finish(early.top, 'out'); // flies out while the opponent is still on the launcher
      b.processEvents(b.sim.events.splice(0));
    }
  }
  assert.ok(early, 'found a moment with only one top in the stadium');
  const r = b.result.rounds[0];
  assert.equal(r.winner, 1 - early.index, 'the other battler wins');
  assert.equal(r.how, 'out');
  assert.ok(r.time < 1, `decided immediately (${r.time.toFixed(2)} s), not at the time limit`);
});

test('a ring-out explanation names where the top left, not where it landed', () => {
  const b = new Battle({ arenaId: 'standard', format: 'single', seed: 3, headless: true,
    participants: [participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 1 }), participantFromDef(ARCHETYPE_INDEX.all, { difficulty: 1 })] });
  b.headless = true;
  while (b.phase !== 'battle') b.update(1 / 120, []);
  // fighter 0 crosses the 210° exit, then flies on sideways until it is far outside that sector
  const top = b.fighters[0].top, a = (210 * Math.PI) / 180;
  top.p.set(Math.cos(a) * 0.22, b.arena.rimY + 0.02, Math.sin(a) * 0.22); // airborne, past the lip
  top.v.set(-Math.sin(a) * 3, 1, Math.cos(a) * 3);
  b.update(1 / 120, []);
  while (b.phase !== 'matchOver') b.update(1 / 120, []);
  const r = b.result.rounds[0];
  assert.equal(r.how, 'out');
  assert.ok(Math.abs(Math.atan2(top.p.z, top.p.x) - a) > 0.5, 'by the end the top is well outside the exit sector');
  assert.match(r.explanation, /through an exit/);
});

test('the default player launch circles the bowl instead of charging the centre', () => {
  for (const spin of ['R', 'L']) {
    const me = { ...participantFromDef(ARCHETYPE_INDEX.striker, { id: 'player' }), human: true, spin, launcher: { base: 'launcher_twin' } };
    const b = new Battle({ arenaId: 'standard', format: 'single', seed: 4, headless: true, participants: [me, participantFromDef(ARCHETYPE_INDEX.all, { difficulty: 1 })] });
    b.update(1 / 120, []);
    const L = b.fighters[0].launch;
    assert.equal(L.spin, spin);
    // the lean points along the bowl (perpendicular to the launcher's radius), not at the centre
    // (the launch spot sits at a seeded angle to the stadium, so test in its frame)
    const r = Math.hypot(L.aim.x, L.aim.z);
    const radial = (Math.cos(L.aim.dir) * L.aim.x + Math.sin(L.aim.dir) * L.aim.z) / r;
    assert.ok(Math.abs(radial) < 1e-9, `lean direction ${(L.aim.dir * 57.3).toFixed(0)}° from (${L.aim.x}, ${L.aim.z})`);
    // and it circles the same way as Spiral Drive for that spin direction
    const turn = (L.aim.x * Math.sin(L.aim.dir) - L.aim.z * Math.cos(L.aim.dir)) / r;
    assert.equal(Math.sign(turn), spin === 'L' ? -1 : 1);
  }
});

test('launch changes during the countdown replay exactly, and AI launches are recomputed', () => {
  for (const seed of [5, 17, 42]) {
    const fr = new Rng(seed);
    const me = { ...participantFromDef(ARCHETYPE_INDEX.all, { id: 'player' }), human: true, name: 'Tester', knownTechniques: ['normal', 'power', 'controlled', 'bank'] };
    const opp = participantFromDef(ARCHETYPE_INDEX.striker, { id: 'cpu', difficulty: 1 });
    opp.technique = 'lance';
    opp.knownTechniques = [...(opp.knownTechniques || []), 'lance'];
    const parts = () => [structuredClone(me), structuredClone(opp)];
    const b = new Battle({ arenaId: 'standard', format: 'bo3', seed, participants: parts(), rules: {}, record: true, roundTime: 30 });
    b.headless = true;
    const techs = ['normal', 'power', 'bank', 'controlled'];
    let guard = 0;
    while (b.phase !== 'matchOver' && guard++ < 200000) {
      if (b.phase === 'setup') b.confirmSetup(0);
      if (b.phase === 'countdown') {
        const L = b.fighters[0].launch;
        if (!L.released) {
          // keep moving the aim and switching technique and spin while charging
          b.setAim(0, { x: -0.08 + fr.next() * 0.05, z: fr.next() * 0.04 - 0.02, lean: fr.next() * 0.15, dir: fr.next() * 6 });
          if (fr.next() < 0.1) b.setTechnique(0, techs[Math.floor(fr.next() * techs.length)]);
          if (fr.next() < 0.05) b.setSpin(0, fr.next() < 0.5 ? 'L' : 'R');
          b.chargeInput(0, true, 1);
          if (L.meter.charge >= 0.8 + fr.next() * 0.15 && fr.next() < 0.3) b.release(0);
        }
      }
      b.update(0.004 + fr.next() * 0.03, [emptyControls()]);
      if (b.phase === 'roundOver') b.nextRound();
    }
    const data = JSON.parse(JSON.stringify(b.replayData()));
    assert.equal(data.rec.v, 2);
    assert.ok(data.rec.launch.length > 3, 'countdown changes were recorded');
    assert.ok(Object.values(data.rec.releases).every((r) => !r[1]), 'AI releases are not recorded');
    const rp = playReplay(data, parts(), (k) => (k % 3 ? 1 / 60 : 1 / 25));
    const got = { winner: rp.result.winner, rounds: rp.result.rounds.map((r) => ({ winner: r.winner, how: r.how, time: +r.time.toFixed(3) })) };
    assert.deepEqual(got, data.summary, `seed ${seed}`);
  }
});
