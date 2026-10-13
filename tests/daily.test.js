// The Daily Seed: the same challenge for everyone on a day, scoring, picks,
// streaks and rewards, and replay codes that re-simulate a run exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { emptyControls } from '../src/game/ai.js';
import { Rng } from '../src/core/rng.js';
import { newProfile } from '../src/systems/profile.js';
import { validateItem } from '../src/systems/itemValidate.js';
import { validateBuild } from '../src/systems/assembly.js';
import {
  dayKey, shiftDay, dailyChallenge, dailyBuild, dailySession, battleScore, startDaily, recordDailyBattle, pickDue, pickOffer,
  finishDaily, dailyState, verifyRun, beginDailyBattle, forfeitDailyBattle, settleDaily, DAILY, SCORE,
} from '../src/systems/daily.js';
import { encodeRun, decodeRun } from '../src/systems/dailyCode.js';

const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'uid' || k === 'acquiredAt' ? undefined : v)));

// One battle of the run with scripted "human" inputs, recorded.
function play(session, seed) {
  const b = new Battle({ arenaId: session.arenaId, format: session.format, seed: session.seed, participants: session.participants, rules: session.rules, roundTime: session.roundTime, record: true });
  b.headless = true;
  const rng = new Rng(seed);
  const ctl = emptyControls();
  let guard = 0;
  while (b.phase !== 'matchOver' && guard++ < 100000) {
    if (b.phase === 'setup') { b.setAim(0, { x: -0.06 + rng.next() * 0.02, z: rng.next() * 0.02, lean: rng.next() * 0.2, dir: 0.1 }); b.confirmSetup(0); }
    if (b.phase === 'countdown') { const L = b.fighters[0].launch; b.chargeInput(0, !L.released, 1); if (!L.released && L.meter.charge >= 0.9) b.release(0); }
    const t = b.battleTime;
    ctl.steer.set(Math.cos(t * 1.7 + seed) * 0.8, 0, Math.sin(t * 1.3) * 0.8);
    ctl.dash = Math.floor(t * 2) % 7 === 3;
    ctl.brace = Math.floor(t) % 5 === 2;
    b.update(1 / 60, [ctl]);
    if (b.phase === 'roundOver') b.nextRound();
  }
  return b;
}

// A whole run on a save: picks go to offer (stage % 3).
function playRun(profile, key, seed = 1) {
  const run = startDaily(profile, key);
  const ch = dailyChallenge(key);
  while (!run.done) {
    if (pickDue(run)) { assert.ok(pickOffer(profile, (run.stage + seed) % 3).ok || pickOffer(profile, -1).ok); continue; }
    const b = play(dailySession(ch, run, run.stage, { name: 'Tester' }), seed * 31 + run.stage);
    recordDailyBattle(profile, b.result, b.replayData());
  }
  return { run, ch };
}

test('the challenge is the same all day, changes daily, and is always buildable', () => {
  const key = '2026-10-12';
  assert.deepEqual(strip(dailyChallenge(key)), strip(dailyChallenge(key)));
  assert.notDeepEqual(strip(dailyChallenge(key).start), strip(dailyChallenge(shiftDay(key, 1)).start));
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.match(dayKey(new Date(Date.UTC(2026, 9, 12, 23, 59))), /^2026-10-12$/);
  for (let d = 0; d < 30; d++) {
    const ch = dailyChallenge(shiftDay(key, d));
    assert.ok(validateBuild(ch.start.build, { spin: ch.start.spin }).ok, ch.key);
    for (const it of [...Object.values(ch.start.build), ch.start.launcher, ch.start.cable, ...ch.offers.flat()]) assert.ok(validateItem(it).ok, `${ch.key} ${it.base}`);
    assert.equal(ch.opponents.length, DAILY.battles);
    assert.equal(ch.opponents[DAILY.battles - 1].kind, 'rival');
    assert.equal(ch.offers.length, DAILY.offerRarity.length);
    // nearly every combination of picks stays legal (only mass can rule one out)
    let legal = 0, all = 0;
    for (let n = 0; n < 4 ** 4; n++) {
      const picks = [0, 1, 2, 3].map((i) => (Math.floor(n / 4 ** i) % 4) - 1);
      all++;
      if (validateBuild(dailyBuild(ch, picks), { spin: ch.start.spin }).ok) legal++;
    }
    assert.ok(legal / all > 0.8, `${ch.key}: ${legal}/${all} pick combinations legal`);
  }
});

test('scoring rewards wins, finishes, speed and a perfect launch', () => {
  const win = (how, time) => ({ winner: 0, rounds: [{ winner: 0, how, time }] });
  assert.equal(battleScore({ winner: 1, rounds: [{ winner: 1, how: 'out', time: 5 }] }, 1), 0);
  assert.equal(battleScore(win('out', 10), 1), SCORE.win + SCORE.finish.out + SCORE.fast);
  assert.equal(battleScore(win('spin', 50), 1.2), Math.round(SCORE.win * 1.2 + SCORE.finish.spin));
  assert.equal(battleScore(win('burst', 30), 1, 1), Math.round(SCORE.win + SCORE.finish.burst + SCORE.fast / 2 + SCORE.perfectLaunch));
});

test('a run records its battles and picks, pays once a day and keeps the streak', () => {
  const p = newProfile(3);
  const key = '2026-10-12';
  const { run } = playRun(p, key, 1);
  assert.ok(run.done && run.results.length >= 1 && run.results.length <= DAILY.battles);
  // a pick between battles: after each of the first four, unless the run had ended
  assert.equal(run.picks.length, Math.min(run.stage - 1, DAILY.offerRarity.length));
  const cr = p.currency.credits;
  const r1 = finishDaily(p);
  assert.ok(r1.reward && p.currency.credits === cr + r1.reward.credits);
  assert.equal(r1.streak, 1);
  assert.equal(dailyState(p, key).best.score, r1.score);
  // a second run the same day: no second reward, best kept
  playRun(p, key, 2);
  const r2 = finishDaily(p);
  assert.equal(r2.reward, null);
  assert.equal(dailyState(p, key).best.score, Math.max(r1.score, r2.score));
  // next day continues the streak; a missed day resets it
  playRun(p, shiftDay(key, 1), 3);
  assert.equal(finishDaily(p).streak, 2);
  assert.equal(dailyState(p, shiftDay(key, 2)).streak, 2, 'still alive the day after');
  assert.equal(dailyState(p, shiftDay(key, 3)).streak, 0, 'broken after a missed day');
  playRun(p, shiftDay(key, 3), 4);
  assert.equal(finishDaily(p).streak, 1);
  assert.equal(p.daily.bestStreak, 2);
});

test('a replay code re-simulates the run to the same score, and a forged one is caught', async () => {
  const p = newProfile(4);
  const key = '2026-10-14';
  const { run } = playRun(p, key, 5);
  const score = finishDaily(p).score;
  const code = await encodeRun({ key, name: 'Tester', score, picks: run.picks, battles: run.battles });
  assert.match(code, /^CS1z\.[A-Za-z0-9_-]+$/);
  const data = await decodeRun(code);
  assert.deepEqual(data.picks, run.picks);
  const v = await verifyRun(data);
  assert.ok(v.ok && v.matches && v.complete, JSON.stringify(v));
  assert.equal(v.score, score);
  // a claimed score that the inputs don't produce
  const forged = await verifyRun({ ...data, score: score + 500 });
  assert.equal(forged.matches, false);
  // inputs from another day
  const wrongDay = await verifyRun({ ...data, key: shiftDay(key, 1) });
  assert.equal(wrongDay.ok, false);
  await assert.rejects(() => decodeRun('hello'));
});

test('verification ignores recorded rules and AI data, and rejects illegal picks and old recordings', async () => {
  const p = newProfile(6);
  const key = '2026-10-15';
  const { run } = playRun(p, key, 7);
  const score = finishDaily(p).score;
  const data = await decodeRun(await encodeRun({ key, name: 'T', score, picks: run.picks, battles: run.battles }));
  // tampering with rules, round time or AI entries changes nothing
  const tampered = structuredClone(data);
  for (const b of tampered.battles) {
    if (!b || b.forfeit) continue;
    b.rules = { abilities: false }; b.roundTime = 5;
    for (const r of Object.values(b.rec.releases)) r[1] = { charge: 1, ct: 0, inStep: false };
    b.rec.spawns = { 1: { 1: 99999 } };
  }
  const v = await verifyRun(tampered);
  assert.ok(v.ok && v.score === score, JSON.stringify({ v: v.score, score }));
  // an out-of-range pick
  if (data.battles.length > 1) {
    const bad = structuredClone(data); bad.picks[0] = 7;
    assert.equal((await verifyRun(bad)).ok, false);
  }
  // a v1 recording is refused
  const old = structuredClone(data); old.battles[0].rec.v = 1;
  assert.equal((await verifyRun(old)).ok, false);
});

test('quitting or leaving a Daily battle counts as a loss, never a retry', async () => {
  const p = newProfile(8);
  const key = '2026-10-16';
  const run = startDaily(p, key);
  beginDailyBattle(p);
  const r = forfeitDailyBattle(p);
  assert.ok(r && r.lost);
  assert.equal(run.hearts, DAILY.hearts - 1);
  assert.equal(run.stage, 1);
  assert.equal(forfeitDailyBattle(p), null, 'nothing to forfeit without a battle in progress');
  // a battle left in progress (game closed) is settled as a loss
  if (pickDue(run)) pickOffer(p, -1);
  beginDailyBattle(p);
  assert.ok(settleDaily(p));
  assert.equal(run.hearts, DAILY.hearts - 2);
  assert.equal(settleDaily(p), null);
  // a forfeit survives the code round trip and verifies as a loss
  if (pickDue(run)) pickOffer(p, -1);
  beginDailyBattle(p); forfeitDailyBattle(p);
  assert.ok(run.done);
  const fin = finishDaily(p);
  const best = p.daily.best[key].run;
  const data = await decodeRun(await encodeRun({ key, name: 'T', score: fin.score, picks: best.picks, battles: best.battles }));
  const v = await verifyRun(data);
  assert.ok(v.ok && v.matches && v.complete && v.battles.every((b) => b.forfeit), JSON.stringify(v));
});

function forfeitRun(p) {
  while (p.daily.active && !p.daily.active.done) {
    if (pickDue(p.daily.active)) pickOffer(p, -1);
    beginDailyBattle(p); forfeitDailyBattle(p);
  }
}

test('a run that crosses UTC midnight is finished and scored on its own day', () => {
  const p = newProfile(10);
  const key = '2026-10-17';
  startDaily(p, key);
  const st = dailyState(p, shiftDay(key, 1));
  assert.ok(st.run && st.run.key === key, 'the run is still there the next day');
  forfeitRun(p);
  const fin = finishDaily(p);
  assert.ok(fin && p.daily.best[key] && !p.daily.best[shiftDay(key, 1)]);
  assert.equal(p.daily.lastDay, key);
  // finishing an older day later never rewinds the streak day or pays again
  p.daily.lastDay = shiftDay(key, 2);
  startDaily(p, key);
  forfeitRun(p);
  assert.equal(finishDaily(p).reward, null);
  assert.equal(p.daily.lastDay, shiftDay(key, 2));
});

test('the simulation never reads Math.random or the clock (replays stay exact)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dirs = ['src/physics', 'src/game', 'src/core'];
  // allowed: a battle with no seed picks one (it is then recorded), and the
  // background match runner budgets real time per frame (not outcomes)
  const allowed = [/this\.seed = opts\.seed \?\? \(\(Math\.random\(\)/, /performance\.now\(\)( - t0)?/];
  const bad = [];
  for (const dir of dirs) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      readFileSync(`${dir}/${f}`, 'utf8').split('\n').forEach((line, i) => {
        if (!/Math\.random|Date\.now|performance\.now/.test(line)) return;
        if (f === 'matchSim.js' && allowed[1].test(line)) return;
        if (f === 'battle.js' && allowed[0].test(line)) return;
        bad.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(bad, []);
});

test('the code reader rejects cut, corrupted and oversized codes without crashing', async () => {
  const p = newProfile(12);
  const key = '2026-10-18';
  const { run } = playRun(p, key, 9);
  const score = finishDaily(p).score;
  const code = await encodeRun({ key, name: 'T', score, picks: run.picks, battles: run.battles });
  await assert.rejects(() => decodeRun(code.slice(0, Math.floor(code.length / 2))));
  const flipped = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
  try {
    const d = await decodeRun(flipped);
    const v = await verifyRun(d);
    assert.ok(!v.ok || !v.matches || v.score === score);
  } catch { /* rejected: fine */ }
  await assert.rejects(() => decodeRun('CS1z.' + 'A'.repeat(300000)), /too long/);
});

test('the first finished run of a day is kept apart from the best', () => {
  const p = newProfile(14);
  const key = '2026-10-19';
  playRun(p, key, 11);
  const a = finishDaily(p);
  assert.ok(a.firstRun);
  playRun(p, key, 12);
  const b = finishDaily(p);
  assert.ok(!b.firstRun);
  assert.equal(dailyState(p, key).first.score, a.score);
  assert.equal(dailyState(p, key).best.score, Math.max(a.score, b.score));
});
