// Challenges, Survival and League rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { CHALLENGES } from '../src/data/challenges.js';
import { ARENA_INDEX } from '../src/data/arenas.js';
import { assembleTop } from '../src/systems/assembly.js';
import {
  challengeStatus, checkConstraint, evaluateChallenge, grantChallengeReward, opponentFrom,
  startSurvival, survivalStage, survivalWin, survivalRepair, endSurvival, leagueState, startSeason, DIVISIONS,
} from '../src/systems/modes.js';
import { readyMatches, applyResult, finishTournament, PLAYER } from '../src/systems/tournament.js';

const result = (rounds, stats = {}, winner = 0) => ({
  winner, rounds,
  fighters: [{ stats: { perfectLaunches: 0, lockClicksTaken: 0, comebacks: 0, ...stats } }, { stats: {} }],
});

test('challenge goals are judged from the battle result', () => {
  const C = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
  assert.equal(evaluateChallenge(C.over_the_edge, result([{ winner: 0, how: 'out', time: 9 }, { winner: 0, how: 'out', time: 5 }])).ok, true);
  assert.equal(evaluateChallenge(C.over_the_edge, result([{ winner: 0, how: 'out', time: 9 }, { winner: 0, how: 'spin', time: 30 }])).ok, false);
  assert.equal(evaluateChallenge(C.lock_breaker, result([{ winner: 0, how: 'burst', time: 4 }, { winner: 1, how: 'spin', time: 30 }, { winner: 0, how: 'spin', time: 30 }])).ok, true);
  assert.equal(evaluateChallenge(C.blitz, result([{ winner: 0, how: 'out', time: 9 }, { winner: 0, how: 'spin', time: 16 }])).ok, false);
  assert.equal(evaluateChallenge(C.perfect_form, result([{ winner: 0, how: 'spin', time: 20 }], { perfectLaunches: 2 })).ok, true);
  assert.equal(evaluateChallenge(C.iron_lock, result([{ winner: 0, how: 'spin', time: 20 }], { lockClicksTaken: 1 })).ok, false);
  assert.equal(evaluateChallenge(C.last_breath, result([{ winner: 0, how: 'spin', time: 20 }], { comebacks: 1 })).ok, true);
  const lost = evaluateChallenge(C.pure_physics, result([{ winner: 1, how: 'spin', time: 20 }], {}, 1));
  assert.equal(lost.ok, false);
  assert.ok(lost.fails[0].includes('win'));
});

test('challenge constraints, locks, rewards once, and every opponent is battle-ready', () => {
  const P = newProfile(3);
  const C = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
  assert.ok(checkConstraint(P, P.loadouts[0], C.outlast).length === 1, 'attack build rejected for a stamina challenge');
  assert.equal(checkConstraint(P, P.loadouts[1], C.outlast).length, 0);
  assert.ok(checkConstraint(P, P.loadouts[0], C.mirror_spin).length === 1, 'right spin rejected');
  assert.equal(challengeStatus(P, C.beat_the_champion).locked, true);
  const c0 = P.currency.credits, n0 = Object.keys(P.inventory).length;
  const g1 = grantChallengeReward(P, C.lock_breaker);
  assert.ok(g1.first && P.currency.credits === c0 + C.lock_breaker.reward.credits && Object.keys(P.inventory).length === n0 + 1);
  const g2 = grantChallengeReward(P, C.lock_breaker);
  assert.ok(!g2.first && g2.items.length === 0 && g2.credits < g1.credits, 'repeats pay little');
  for (const c of CHALLENGES) {
    assert.ok(ARENA_INDEX[c.arena], c.id);
    const p = opponentFrom(c.opponent, { id: 'x', seedKey: c.id, tier: c.opponent.tier || 2 });
    assert.ok(assembleTop(p.build, { spin: p.spin }).spec.mass > 0.02, c.id);
  }
});

test('survival: escalating stages, rival bosses, milestones, field repairs, cash out and best score', () => {
  const P = newProfile(5);
  P.arenasUnlocked = ['standard', 'vortex'];
  const run = startSurvival(P, P.loadouts[0].id, 42);
  const diffs = [];
  let bosses = 0;
  for (let i = 0; i < 10; i++) {
    const st = survivalStage(P, run);
    diffs.push(st.difficulty);
    if (st.boss) bosses++;
    assert.ok(P.arenasUnlocked.includes(st.arena));
    assert.ok(opponentFrom(st.spec, { id: 's', seedKey: 'k' + i }).build.ring);
    survivalWin(P, run);
  }
  for (let i = 1; i < diffs.length; i++) assert.ok(diffs[i] >= diffs[i - 1], 'difficulty never drops');
  assert.equal(bosses, 2, 'stages 5 and 10 are rival stages');
  assert.equal(run.items.length, 3, 'milestone loot at 3, 6 and 10 wins');
  assert.equal(run.repairs, 3);
  const item = P.inventory[P.loadouts[0].parts.ring];
  item.durability = 10;
  assert.ok(survivalRepair(P, run));
  assert.ok(item.durability > 10 && run.repairs === 2);
  const c0 = P.currency.credits;
  const reloaded = normalizeProfile(JSON.parse(JSON.stringify(P)));
  assert.equal(reloaded.survival.active.wins, 10, 'run survives a save round-trip');
  const r = endSurvival(P, { cashOut: true });
  assert.equal(r.wins, 10);
  assert.equal(P.currency.credits, c0 + r.credits);
  assert.equal(P.survival.best, 10);
  assert.equal(P.stats.survivalBest, 10);
  assert.equal(P.survival.active, null);
});

test('league: season runs on the bracket engine; top two promoted, bottom two relegated', () => {
  const P = newProfile(8);
  const LG = leagueState(P);
  assert.equal(LG.division, 5);
  const play = (playerWins) => {
    const t = startSeason(P, 0, 77 + LG.season);
    assert.equal(P.league.active, t);
    assert.equal(P.tournaments.active, null, 'league does not occupy the tournament slot');
    for (let g = 0; g < 50 && t.status === 'active'; g++) {
      for (const m of readyMatches(t)) {
        const pSide = m.a === PLAYER ? 0 : m.b === PLAYER ? 1 : null;
        const side = pSide == null ? (m.id.length % 2) : playerWins ? pSide : 1 - pSide;
        applyResult(t, m.id, { winnerSide: side, score: side === 0 ? [2, 0] : [0, 2] });
      }
    }
    assert.equal(t.status, 'complete');
    return finishTournament(P, t);
  };
  const s1 = play(true);
  assert.equal(s1.place, 1);
  assert.equal(s1.leagueMove, 'promoted');
  assert.equal(LG.division, 4);
  assert.equal(P.league.active, null);
  const s2 = play(false);
  assert.ok(s2.place >= 7);
  assert.equal(s2.leagueMove, 'relegated');
  assert.equal(LG.division, 5);
  assert.equal(LG.history.length, 2);
  assert.equal(LG.season, 3);
  assert.equal(DIVISIONS.length, 5);
});
