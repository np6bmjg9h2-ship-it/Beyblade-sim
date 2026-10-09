// Tournament engine: bracket generation, progression, standings, placements,
// rewards and career records for every format.

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOURNAMENTS, TOURNAMENT_INDEX } from '../src/data/tournaments.js';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { Rng } from '../src/core/rng.js';
import {
  createTournament, applyResult, readyMatches, playerMatch, aiMatches, playerEliminated, playerPlace, finalPlacements,
  standings, seedPositions, canEnter, finishTournament, checkLoadoutRules, activeLocks, entrantParticipant, aiMatchJob, ensurePlan, PLAYER,
} from '../src/systems/tournament.js';

function profileAt(level = 30) {
  const p = newProfile(42);
  p.player.level = level;
  p.player.name = 'Tester';
  return p;
}

// Play a tournament to the end with random winners. Returns stats.
function playOut(t, rng, { playerWins = null } = {}) {
  let n = 0;
  const playerPlaceWhenOut = [];
  for (let guard = 0; guard < 500; guard++) {
    const ready = readyMatches(t);
    if (!ready.length) break;
    for (const m of ready) {
      const isP = m.a === PLAYER || m.b === PLAYER;
      let side;
      if (isP && playerWins != null) side = (m.a === PLAYER) === playerWins ? 0 : 1;
      else side = rng.chance(0.5) ? 0 : 1;
      const draw = !isP && rng.chance(0.05);
      applyResult(t, m.id, { winnerSide: draw ? null : side, score: draw ? [1, 1] : side === 0 ? [2, 1] : [1, 2], points: [2, 1] });
      n++;
      if (isP && playerEliminated(t) && t.status === 'active') playerPlaceWhenOut.push(playerPlace(t));
    }
  }
  return { n, playerPlaceWhenOut };
}

test('seed positions put top seeds on opposite sides', () => {
  assert.deepEqual(seedPositions(4), [1, 4, 2, 3]);
  assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const p16 = seedPositions(16);
  assert.equal(p16.indexOf(1) < 8, true);
  assert.equal(p16.indexOf(2) >= 8, true);
});

test('every tournament format completes with valid placements and correct match counts', () => {
  for (const def of TOURNAMENTS) {
    for (let s = 0; s < 6; s++) {
      const P = profileAt();
      const t = createTournament(def, P, { seed: 1000 + s });
      assert.equal(t.entrants.length, def.size, `${def.id} size`);
      assert.equal(new Set(t.entrants.map((e) => e.name)).size, def.size, `${def.id} unique entrant names`);
      const { n, playerPlaceWhenOut } = playOut(t, new Rng(77 + s));
      assert.equal(t.status, 'complete', `${def.id} seed ${s} completes`);
      const N = def.size;
      const expect = {
        single: [N - 1, N - 1],
        double: [2 * N - 2, 2 * N - 1],
        roundrobin: [N * (N - 1) / 2, N * (N - 1) / 2],
        swiss: [def.rounds * Math.floor(N / 2), def.rounds * Math.floor(N / 2)],
        league: [N * (N - 1) / 2 + (def.playoffs - 1), N * (N - 1) / 2 + (def.playoffs - 1)],
      }[def.format];
      assert.ok(n >= expect[0] && n <= expect[1], `${def.id}: ${n} matches, expected ${expect}`);
      const places = finalPlacements(t);
      assert.equal(places.size, N, `${def.id}: everyone placed`);
      const vals = [...places.values()].sort((a, b) => a - b);
      assert.equal(vals[0], 1, `${def.id}: has a winner`);
      assert.equal(vals.filter((v) => v === 1).length, 1, `${def.id}: exactly one winner`);
      for (const v of vals) assert.ok(v >= 1 && v <= N);
      // the place reported at elimination matches the final place
      for (const p of playerPlaceWhenOut) assert.equal(p, places.get(PLAYER), `${def.id}: elimination place stable`);
    }
  }
});

test('single elimination: player who wins every match wins the cup; one loss eliminates', () => {
  const def = TOURNAMENT_INDEX.rookie_cup;
  let t = createTournament(def, profileAt(), { seed: 5 });
  playOut(t, new Rng(1), { playerWins: true });
  assert.equal(finalPlacements(t).get(PLAYER), 1);
  t = createTournament(def, profileAt(), { seed: 5 });
  const m = playerMatch(t);
  applyResult(t, m.id, { winnerSide: m.a === PLAYER ? 1 : 0, score: [0, 1] });
  assert.ok(playerEliminated(t));
  assert.equal(playerPlace(t), 5, 'first-round loss in an 8-player bracket is 5th-8th');
  assert.equal(playerMatch(t), null);
});

test('double elimination: one loss drops to the lower bracket, two eliminate; bracket reset works', () => {
  const def = TOURNAMENT_INDEX.foundry_open;
  const t = createTournament(def, profileAt(), { seed: 9 });
  let m = playerMatch(t);
  applyResult(t, m.id, { winnerSide: m.a === PLAYER ? 1 : 0, score: [0, 2] });
  assert.equal(playerEliminated(t), false, 'still alive after one loss');
  // finish the rest of the upper first round so the lower bracket opens
  for (const x of aiMatches(t)) applyResult(t, x.id, { winnerSide: 0, score: [2, 0] });
  m = playerMatch(t);
  assert.ok(m && m.bracket === 'L', 'next match is in the lower bracket');
  applyResult(t, m.id, { winnerSide: m.a === PLAYER ? 1 : 0, score: [0, 1] });
  assert.ok(playerEliminated(t), 'second loss eliminates');
  assert.equal(playerPlace(t), 7);

  // grand-final reset: lower-bracket champion beats the upper champion once
  const t2 = createTournament(def, profileAt(), { seed: 11 });
  let guard = 0;
  while (t2.status === 'active' && guard++ < 100) {
    for (const x of readyMatches(t2)) {
      if (x.bracket === 'GF' && !x.reset) applyResult(t2, x.id, { winnerSide: 1, score: [1, 2] });
      else applyResult(t2, x.id, { winnerSide: 0, score: [2, 0] });
    }
  }
  const gf = t2.stages[0].matches.filter((x) => x.bracket === 'GF');
  assert.equal(gf[1].skipped, undefined, 'reset match was played');
  assert.equal(gf[1].status, 'done');
  assert.equal(finalPlacements(t2).get(gf[1].winner), 1);
});

test('round robin and league standings: everyone meets once; points and tiebreaks', () => {
  const def = TOURNAMENT_INDEX.long_spin_classic;
  const t = createTournament(def, profileAt(), { seed: 3 });
  playOut(t, new Rng(5));
  const pairs = new Set();
  for (const m of t.stages[0].matches) {
    const k = [m.a, m.b].sort().join('-');
    assert.ok(!pairs.has(k), 'no repeated pairing');
    pairs.add(k);
  }
  assert.equal(pairs.size, 10);
  const table = standings(t, t.stages[0]);
  for (let i = 1; i < table.length; i++) assert.ok(table[i - 1].pts >= table[i].pts, 'sorted by points');
  for (const r of table) assert.equal(r.played, 4);

  const L = TOURNAMENT_INDEX.garage_league;
  const t3 = createTournament(L, profileAt(), { seed: 8 });
  // matchdays are released one at a time
  const firstRound = new Set(readyMatches(t3).map((m) => m.round));
  assert.equal(firstRound.size, 1);
  playOut(t3, new Rng(2));
  assert.equal(t3.stages.length, 2, 'playoffs created');
  assert.equal(t3.stages[1].entrants.length, 4);
  const top4 = standings(t3, t3.stages[0]).slice(0, 4).map((r) => r.idx).sort();
  assert.deepEqual([...t3.stages[1].entrants].sort(), top4, 'playoffs take the top four');
});

test('swiss pairs equal records and avoids rematches', () => {
  const def = TOURNAMENT_INDEX.saltwind_regional;
  const t = createTournament(def, profileAt(), { seed: 21 });
  playOut(t, new Rng(9));
  const st = t.stages[0];
  const seen = new Set();
  let rematches = 0;
  for (const m of st.matches) {
    if (m.b == null) continue;
    const k = [m.a, m.b].sort().join('-');
    if (seen.has(k)) rematches++;
    seen.add(k);
  }
  assert.equal(rematches, 0);
  const table = standings(t, st);
  assert.ok(table[0].w >= 3, 'winner has at least 3 wins of 4');
});

test('entry requirements, fees, rule restrictions and loadout lock', () => {
  const P = profileAt(1);
  assert.equal(canEnter(P, TOURNAMENT_INDEX.rookie_cup).ok, true);
  assert.equal(canEnter(P, TOURNAMENT_INDEX.foundry_open).ok, false);
  assert.ok(canEnter(P, TOURNAMENT_INDEX.zero_championship).reasons.length >= 2);
  // stamina-only rule rejects the starter attack build
  const errs = checkLoadoutRules(P, P.loadouts[0], TOURNAMENT_INDEX.long_spin_classic);
  assert.ok(errs.length === 1 && /allows only/.test(errs[0]), errs.join());
  assert.equal(checkLoadoutRules(P, P.loadouts[1], TOURNAMENT_INDEX.long_spin_classic).length, 0, 'stamina starter allowed');
  // loadout lock + no-repair rule (Crater Cup)
  const P2 = profileAt(20);
  const t = createTournament(TOURNAMENT_INDEX.crater_cup, P2, { seed: 4, loadoutIndex: 0 });
  P2.tournaments.active = t;
  const locks = activeLocks(P2);
  assert.equal(locks.repairs, false);
  assert.ok(locks.registered.has(P2.loadouts[0].parts.ring));
  const L = P2.loadouts[0];
  const old = L.parts.tip;
  L.parts.tip = P2.loadouts[1].parts.tip;
  assert.ok(checkLoadoutRules(P2, L, TOURNAMENT_INDEX.crater_cup, t).some((e) => /lock/i.test(e)));
  L.parts.tip = old;
  assert.equal(checkLoadoutRules(P2, L, TOURNAMENT_INDEX.crater_cup, t).length, 0);
});

test('prizes, first-win unlocks, career records and save round-trip', () => {
  const P = profileAt(5);
  const def = TOURNAMENT_INDEX.rookie_cup;
  const credits0 = P.currency.credits;
  const inv0 = Object.keys(P.inventory).length;
  const t = createTournament(def, P, { seed: 77 });
  P.tournaments.active = t;
  // persistence mid-tournament: JSON round-trip and normalisation keep state
  const m = playerMatch(t);
  applyResult(t, m.id, { winnerSide: m.a === PLAYER ? 0 : 1, score: [1, 0] });
  const reloaded = normalizeProfile(JSON.parse(JSON.stringify(P)));
  const t2 = reloaded.tournaments.active;
  assert.equal(t2.id, t.id);
  assert.equal(readyMatches(t2).length, readyMatches(t).length);
  playOut(t2, new Rng(3), { playerWins: true });
  assert.equal(t2.status, 'complete');
  const sum = finishTournament(reloaded, t2);
  assert.equal(sum.place, 1);
  assert.ok(reloaded.currency.credits > credits0 + 400);
  assert.equal(Object.keys(reloaded.inventory).length, inv0 + 2, 'two prize items');
  assert.ok(reloaded.arenasUnlocked.includes('vortex'), 'first win unlocks Vortex Bowl');
  assert.equal(reloaded.tournaments.records.rookie_cup.wins, 1);
  assert.equal(reloaded.tournaments.history[0].place, 1);
  assert.equal(reloaded.tournaments.active, null);
  assert.ok(reloaded.tournaments.ranking.points >= 60);
  // repeat win pays less
  const t3 = createTournament(def, reloaded, { seed: 78 });
  playOut(t3, new Rng(4), { playerWins: true });
  const sum2 = finishTournament(reloaded, t3);
  assert.ok(sum2.credits < sum.credits, 'repeat wins pay less');
  assert.equal(sum2.unlocks.length, 0);
});

test('entrant participants are valid battle participants; AI jobs are plain data', () => {
  const P = profileAt(30);
  for (const def of TOURNAMENTS) {
    const t = createTournament(def, P, { seed: 2 });
    for (const e of t.entrants) {
      if (e.idx === PLAYER) continue;
      const p = entrantParticipant(t, e.idx, P, null);
      assert.ok(p.build.ring && p.build.tip && p.launcher && p.cable, `${def.id} ${e.name}`);
    }
    const job = aiMatches(t)[0] && aiMatchJob(t, aiMatches(t)[0], P);
    if (job) assert.deepEqual(JSON.parse(JSON.stringify(job)).matchId, job.matchId);
    const pm = playerMatch(t);
    if (pm) ensurePlan(t, pm, P);
  }
});
