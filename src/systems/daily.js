// The Daily Seed (data/daily.js): today's challenge built from the date
// alone, so every player gets the same top, opponents, stadium twist and
// part offers; the run in progress; scoring, best scores and streaks; and
// verification of a shared run by re-simulating its recorded battles.
// Nothing here reads the player's own progress (skills, Bit-Beast bonds,
// inventory), so a run replays the same on any save.

import { Rng, mixSeeds } from '../core/rng.js';
import { DAILY, SCORE, TWISTS, TWIST_INDEX } from '../data/daily.js';
import { PARTS } from '../data/parts.js';
import { LAUNCHERS, CABLES } from '../data/launchers.js';
import { ARENAS } from '../data/arenas.js';
import { ARCHETYPES, ARCHETYPE_INDEX } from '../data/opponents.js';
import { CHARACTERS } from '../data/characters.js';
import { BEASTS } from '../data/beasts.js';
import { setSources } from '../data/sets.js';
import { generateItem } from './itemGen.js';
import { validateBuild } from './assembly.js';
import { buildBattleFx } from './synergy.js';
import { rivalItems, rivalParticipant } from './rivals.js';
import { Battle } from '../game/battle.js';

// ------------------------------------------------------------ dates

// The challenge day is the UTC date, so it is the same day everywhere.
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(Date.UTC(y, m - 1, d + days)));
}
// Milliseconds until the next challenge (UTC midnight).
export function untilNextDay(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

// ------------------------------------------------------------ the challenge

const tierOk = (p, max = 2) => (p.tier || 1) <= max;

function item(base, rarity, rng, label) {
  return generateItem({ base, rarity, level: DAILY.level, seed: rng.nextU32(), source: label, noCurse: true });
}

function startingTop(rng) {
  const cores = PARTS.filter((p) => p.slot === 'core' && tierOk(p));
  for (let attempt = 0; attempt < 60; attempt++) {
    const core = rng.pick(cores);
    const ring = rng.pick(PARTS.filter((p) => p.slot === 'ring' && tierOk(p) && p.arch.includes(core.arch)));
    const lock = rng.pick(PARTS.filter((p) => p.slot === 'lock' && tierOk(p) && p.arch.includes(core.arch)));
    const tip = rng.pick(PARTS.filter((p) => p.slot === 'tip' && tierOk(p) && p.socket === lock.tipSocket));
    const disc = rng.pick(PARTS.filter((p) => p.slot === 'disc' && tierOk(p) && (core.arch !== 'apex' || p.thickness <= 3.6)));
    const spin = ring.spin === 'L' ? 'L' : 'R';
    const build = Object.fromEntries(Object.entries({ ring, core, disc, lock, tip }).map(([s, b]) => [s, item(b, 'uncommon', rng, 'Daily Seed')]));
    if (!validateBuild(build, { spin }).ok) continue;
    const launcher = item(rng.pick(LAUNCHERS.filter((l) => tierOk(l) && (l.spinMech === 'dual' || l.spinMech === spin))), 'uncommon', rng, 'Daily Seed');
    const cable = item(rng.pick(CABLES.filter((c) => tierOk(c))), 'uncommon', rng, 'Daily Seed');
    const beast = rng.pick(BEASTS.filter((b) => b.id !== 'vexscor')).id;
    return { build, launcher, cable, spin, beast, arch: core.arch, socket: lock.tipSocket };
  }
  throw new Error('no legal daily top');
}

// Three parts to pick from after a battle; any of them fits the day's frame
// and tip socket, so every combination of picks stays buildable.
function offerSet(rng, rarity, start, stage) {
  const fits = {
    ring: (p) => p.arch.includes(start.arch),
    disc: (p) => start.arch !== 'apex' || p.thickness <= 3.6,
    tip: (p) => p.socket === start.socket,
    lock: (p) => p.arch.includes(start.arch) && p.tipSocket === start.socket,
  };
  const out = [];
  const used = new Set();
  while (out.length < 3) {
    const slot = rng.pick(DAILY.offerSlots);
    const base = rng.pick(PARTS.filter((p) => p.slot === slot && tierOk(p, 3) && fits[slot](p)));
    if (used.has(base.id)) continue;
    used.add(base.id);
    out.push(item(base, rarity, rng, `Daily Seed pick ${stage + 1}`));
  }
  return out;
}

const cache = new Map();
export function dailyChallenge(key = dayKey()) {
  if (cache.has(key)) return cache.get(key);
  const seed = mixSeeds('daily', key);
  // one stream per part of the challenge, so each is evenly spread
  const R = (label) => new Rng(mixSeeds(seed, label));
  const arenaId = R('arena').pick(ARENAS).id;
  const twist = R('twist').pick(TWISTS);
  const start = startingTop(R('top'));
  const rng = R('opponents');
  const pool = rng.shuffle([...ARCHETYPES]);
  const opponents = DAILY.difficulty.map((difficulty, i) => {
    if (i === DAILY.battles - 1) {
      const rival = rng.pick(CHARACTERS.filter((c) => c.builds?.length));
      return { kind: 'rival', id: rival.id, name: rival.name, difficulty, tier: 3 };
    }
    const a = pool[i % pool.length];
    return { kind: 'archetype', id: a.id, name: a.name, difficulty, tier: 1 + Math.floor(i / 2) };
  });
  const offers = DAILY.offerRarity.map((rarity, i) => offerSet(R('offers' + i), rarity, start, i));
  const ch = { key, seed, arenaId, twist, start, opponents, offers };
  cache.set(key, ch);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return ch;
}

export const battleSeed = (ch, i) => mixSeeds(ch.seed, 'battle', i);

// Every Daily battle runs on these rules; verification uses them too and
// never the rules a recording claims.
export const DAILY_RULES = Object.freeze({ loot: false, durability: false });

// ------------------------------------------------------------ participants

function twistSource(ch) {
  return { id: 'daily:' + ch.twist.id, name: ch.twist.name, origin: 'stadium', cond: { type: 'always' }, deltas: ch.twist.deltas };
}

// The day's top with the picks made so far (picks[i]: offer index, or -1).
export function dailyBuild(ch, picks = []) {
  const build = { ...ch.start.build };
  picks.forEach((k, i) => { const it = k >= 0 ? ch.offers[i]?.[k] : null; if (it) build[it.slot] = it; });
  return build;
}

export function dailyParticipant(ch, picks = [], { name = 'You', color = '#4fc3ff' } = {}) {
  const build = dailyBuild(ch, picks);
  const { launcher, cable, spin } = ch.start;
  const sets = setSources([...Object.values(build), launcher, cable]);
  const beast = { id: ch.start.beast, bondLevel: DAILY.beastBond, awakened: false };
  const fx = buildBattleFx({ parts: build, launcher, cable, beast, spin }, {});
  const launchMods = { ...sets.launch };
  for (const [k, v] of Object.entries(fx.launch)) launchMods[k] = (launchMods[k] || 0) + v;
  return {
    id: 'player', name, human: true, build, launcher, cable, beast, spin, technique: 'normal', color,
    modSources: [...sets.sources, ...fx.sources, twistSource(ch)], launchMods, skillMods: { ...fx.skill }, reactive: fx.reactive, synergies: fx.ids,
    ...(fx.rift ? { rift: fx.rift } : {}), knownTechniques: ['normal', 'power', 'controlled', 'bank'],
  };
}

export function dailyOpponent(ch, i) {
  const op = ch.opponents[i];
  let p;
  if (op.kind === 'rival') p = rivalParticipant(null, op.id, op.tier, { difficulty: op.difficulty, seed: mixSeeds(ch.seed, 'rival'), pid: 'daily-' + i });
  else {
    const arch = ARCHETYPE_INDEX[op.id];
    const items = rivalItems(`daily:${ch.key}:${i}`, { id: 'daily', parts: arch.parts, launcher: arch.launcher, cable: arch.cable }, op.tier);
    const sets = setSources([...Object.values(items.parts), items.launcher, items.cable]);
    p = {
      id: 'daily-' + i, name: arch.name, human: false, ai: arch.ai, difficulty: op.difficulty,
      build: items.parts, launcher: items.launcher, cable: items.cable,
      beast: arch.beast && arch.beast !== 'vexscor' ? { id: arch.beast, bondLevel: 2 + op.tier * 2, awakened: false } : null,
      spin: arch.spin || 'R', technique: arch.technique || 'normal', color: arch.color,
      knownTechniques: ['normal', 'power', 'controlled', 'bank', 'spiral', 'phantom', 'lance'], modSources: sets.sources, launchMods: sets.launch,
    };
  }
  p.modSources = [...(p.modSources || []), twistSource(ch)];
  return p;
}

// Everything a BattleScreen needs for battle i of the run.
export function dailySession(ch, run, i, who = {}) {
  return {
    mode: 'daily', title: `Daily Seed · Battle ${i + 1}/${DAILY.battles}`, arenaId: ch.arenaId, format: DAILY.format, roundTime: DAILY.roundTime,
    seed: battleSeed(ch, i), participants: [dailyParticipant(ch, run.picks, who), dailyOpponent(ch, i)], difficulty: ch.opponents[i].difficulty,
    noRewards: true, rules: { ...DAILY_RULES }, allowRematch: false, allowRestart: false, continueLabel: 'Continue',
  };
}

// ------------------------------------------------------------ scoring

// Points for one battle from its result (the player is fighter 0).
export function battleScore(summary, difficulty, perfectLaunches = 0) {
  if (summary.winner !== 0) return 0;
  const last = summary.rounds[summary.rounds.length - 1] || { how: 'decision', time: DAILY.roundTime };
  const fast = SCORE.fast * Math.max(0, Math.min(1, (50 - last.time) / 40));
  return Math.round(SCORE.win * difficulty + (SCORE.finish[last.how] || 0) + fast + (perfectLaunches > 0 ? SCORE.perfectLaunch : 0));
}

// Hearts left only count for a run that was played to its end.
export function runScore(run) {
  return run.results.reduce((s, r) => s + r.score, 0) + (run.done && !run.abandoned ? run.hearts * SCORE.heart : 0);
}

// ------------------------------------------------------------ the run on a save

function D(profile) {
  const d = profile.daily || (profile.daily = {});
  d.best = d.best || {};
  d.first = d.first || {};
  d.history = d.history || [];
  d.streak = d.streak || 0;
  d.bestStreak = d.bestStreak || 0;
  d.attempts = d.attempts || {};
  return d;
}

// The run in progress is returned whatever its day: one started before UTC
// midnight is finished and scored on its own day (run.key).
export function dailyState(profile, key = dayKey()) {
  const d = D(profile);
  const run = d.active || null;
  const live = d.lastDay === key || d.lastDay === shiftDay(key, -1);
  return { run, best: d.best[key] || null, first: d.first[key] || null, streak: live ? d.streak : 0, bestStreak: d.bestStreak, attempts: d.attempts[key] || 0, history: d.history };
}

export function startDaily(profile, key = dayKey()) {
  const d = D(profile);
  d.active = { key, stage: 0, hearts: DAILY.hearts, picks: [], results: [], battles: [], done: false, startedAt: Date.now() };
  d.attempts[key] = (d.attempts[key] || 0) + 1;
  return d.active;
}

// After battle `stage`: score it and keep what verification needs.
export function recordDailyBattle(profile, result, replay) {
  const run = D(profile).active;
  if (!run || run.done) return null;
  run.pending = null;
  const ch = dailyChallenge(run.key);
  const summary = { winner: result.winner, rounds: result.rounds.map((r) => ({ winner: r.winner, how: r.how, time: +r.time.toFixed(3) })) };
  const perfect = result.fighters?.[0]?.stats?.perfectLaunches || 0;
  const score = battleScore(summary, ch.opponents[run.stage].difficulty, perfect);
  const lost = result.winner != null && result.winner !== 0;
  run.results.push({ stage: run.stage, opponent: ch.opponents[run.stage].name, summary, perfect, score, won: result.winner === 0 });
  run.battles.push(replay ? { seed: replay.seed, roundTime: replay.roundTime, rules: replay.rules, rec: replay.rec } : null);
  if (lost) run.hearts--;
  run.stage++;
  if (run.hearts <= 0 || run.stage >= DAILY.battles) run.done = true;
  return { score, lost, done: run.done };
}

// A battle is about to start: until its result is recorded it counts as in
// progress, so leaving it (quit, closing the game) is a loss, not a retry.
export function beginDailyBattle(profile) {
  const run = D(profile).active;
  if (!run || run.done) return null;
  run.pending = run.stage;
  return run;
}

// Quitting a Daily battle loses it: no points, one heart.
export function forfeitDailyBattle(profile) {
  const run = D(profile).active;
  if (!run || run.done || run.pending !== run.stage) return null;
  const ch = dailyChallenge(run.key);
  run.pending = null;
  run.results.push({ stage: run.stage, opponent: ch.opponents[run.stage].name, summary: { winner: 1, rounds: [], forfeit: true }, perfect: 0, score: 0, won: false, forfeit: true });
  run.battles.push({ forfeit: true });
  run.hearts--;
  run.stage++;
  if (run.hearts <= 0 || run.stage >= DAILY.battles) run.done = true;
  return { score: 0, lost: true, done: run.done };
}

// A battle left in progress (the game was closed mid-battle) is forfeited.
export function settleDaily(profile) {
  const run = D(profile).active;
  return run && !run.done && run.pending === run.stage ? forfeitDailyBattle(profile) : null;
}

// A pick is due between battles (after 1-4) until the run is done.
export const pickDue = (run) => !!run && !run.done && run.picks.length < run.stage && run.stage <= DAILY.offerRarity.length;

export function pickOffer(profile, index) {
  const run = D(profile).active;
  if (!pickDue(run)) return { ok: false, reason: 'No pick is due' };
  const ch = dailyChallenge(run.key);
  if (index >= 0) {
    const offer = ch.offers[run.picks.length][index];
    if (!offer) return { ok: false, reason: 'No such part' };
    const v = validateBuild({ ...dailyBuild(ch, run.picks), [offer.slot]: offer }, { spin: ch.start.spin });
    if (!v.ok) return { ok: false, reason: v.errors[0] };
  }
  run.picks.push(index);
  return { ok: true };
}

// The run ended: record the best, the streak and the day's reward (once).
export function finishDaily(profile) {
  const d = D(profile);
  const run = d.active;
  if (!run || !run.done) return null;
  const score = runScore(run);
  const key = run.key;
  const prev = d.best[key];
  const newBest = !prev || score > prev.score;
  if (newBest) d.best[key] = { score, at: Date.now(), wins: run.results.filter((r) => r.won).length, hearts: run.hearts, run: { picks: run.picks, results: run.results, battles: run.battles } };
  // the day's first finished run is kept on its own: practice runs can raise
  // the best, never the first-run score
  const firstRun = !d.first[key];
  if (firstRun) d.first[key] = { score, at: Date.now(), wins: run.results.filter((r) => r.won).length };
  let reward = null;
  // the day counts (streak, reward) once at least one battle was played;
  // never for a day older than the last one counted
  if ((!d.lastDay || key > d.lastDay) && run.results.length) {
    d.streak = d.lastDay === shiftDay(key, -1) ? d.streak + 1 : 1;
    d.lastDay = key;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
    reward = { credits: 200 + Math.round(score / 20), coreShard: score >= 4000 ? 2 : 1 };
    if (d.streak % 7 === 0) reward.relicFragment = 2;
    profile.currency.credits += reward.credits;
    for (const [k, v] of Object.entries(reward)) if (k !== 'credits') profile.materials[k] = (profile.materials[k] || 0) + v;
  }
  d.history.unshift({ key, score, wins: run.results.filter((r) => r.won).length, at: Date.now() });
  d.history.length = Math.min(d.history.length, 30);
  // keep full runs (for sharing) only for the last week
  for (const k of Object.keys(d.best)) if (k < shiftDay(key, -7) && d.best[k].run) delete d.best[k].run;
  for (const k of Object.keys(d.first)) if (k < shiftDay(key, -60)) delete d.first[k];
  d.active = null;
  return { score, newBest, firstRun, best: d.best[key].score, first: d.first[key].score, streak: d.streak, reward, wins: run.results.filter((r) => r.won).length };
}

export function abandonDaily(profile) {
  const d = D(profile);
  const run = d.active;
  if (!run) return null;
  run.done = true;
  run.abandoned = true;
  return finishDaily(profile);
}

// ------------------------------------------------------------ verification

// Re-simulate a run's battles from the day, the picks and the recorded
// inputs; the score is recomputed, never trusted. onProgress(i, n) between
// battles; yields to the browser every few frames when `slice` is set.
// Only the human's inputs come from the code: the day's rules and round
// time, the AI's launches, false starts and spawns are recomputed, recorded
// setups are clamped like live input, and every pick must be a legal one.
export async function verifyRun(data, { onProgress = null, slice = 0 } = {}) {
  if (!data || typeof data.key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.key)) return { ok: false, reason: 'Not a Daily Seed run' };
  const ch = dailyChallenge(data.key);
  const list = Array.isArray(data.battles) ? data.battles.slice(0, DAILY.battles) : [];
  const given = Array.isArray(data.picks) ? data.picks : [];
  if (!list.length) return { ok: false, reason: 'The run has no battles' };
  const picks = [];
  let total = 0, hearts = DAILY.hearts;
  const battles = [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b) return { ok: false, reason: `Battle ${i + 1} has no recording` };
    if (b.forfeit) {
      hearts--;
      battles.push({ opponent: ch.opponents[i].name, summary: { winner: 1, rounds: [], forfeit: true }, score: 0, won: false, forfeit: true });
    } else {
      if (b.seed !== battleSeed(ch, i)) return { ok: false, reason: `Battle ${i + 1} was not played on this day's seed` };
      if (!b.rec || b.rec.v !== 2) return { ok: false, reason: `Battle ${i + 1} was recorded by an older version of the game` };
      const battle = new Battle({ arenaId: ch.arenaId, format: DAILY.format, seed: battleSeed(ch, i), participants: [dailyParticipant(ch, picks, { name: data.name }), dailyOpponent(ch, i)], rules: { ...DAILY_RULES }, roundTime: DAILY.roundTime, replay: b.rec });
      battle.headless = true;
      let guard = 0, n = 0;
      while (battle.phase !== 'matchOver' && guard++ < 400000) {
        battle.update(1 / 60, []);
        if (battle.phase === 'roundOver') battle.nextRound();
        if (slice && ++n % slice === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (!battle.result) battle.finishMatch();
      const res = battle.result;
      const summary = { winner: res.winner, rounds: res.rounds.map((r) => ({ winner: r.winner, how: r.how, time: +r.time.toFixed(3) })) };
      const score = battleScore(summary, ch.opponents[i].difficulty, res.fighters[0].stats.perfectLaunches || 0);
      total += score;
      if (summary.winner != null && summary.winner !== 0) hearts--;
      battles.push({ opponent: ch.opponents[i].name, summary, score, won: summary.winner === 0 });
    }
    onProgress?.(i + 1, list.length);
    if (hearts <= 0) break;
    // the pick made after this battle, needed before the next one
    if (i + 1 < list.length && i < DAILY.offerRarity.length) {
      const k = given[i];
      if (!Number.isInteger(k) || k < -1 || k >= ch.offers[i].length) return { ok: false, reason: `Pick ${i + 1} is not one of the offered parts` };
      if (k >= 0) {
        const offer = ch.offers[i][k];
        if (!validateBuild({ ...dailyBuild(ch, picks), [offer.slot]: offer }, { spin: ch.start.spin }).ok) return { ok: false, reason: `Pick ${i + 1} makes an illegal top` };
      }
      picks.push(k);
    }
  }
  const complete = hearts <= 0 || battles.length >= DAILY.battles;
  if (complete) total += Math.max(0, hearts) * SCORE.heart;
  return { ok: true, score: total, claimed: data.score, matches: data.score == null || data.score === total, complete, battles, key: data.key, name: data.name, version: data.ver || null };
}

export { DAILY, SCORE, TWIST_INDEX };
