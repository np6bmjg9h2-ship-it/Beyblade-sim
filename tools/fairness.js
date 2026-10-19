// Fairness gates: how much the player's input, the gear and the seed decide a
// battle, measured with real headless battles spread over worker threads.
//
//   1 no-input bots    a human slot that never steers, dashes or braces, on
//                      the same build as the AI (mirror). Realistic physics
//                      (user decision 2026-10-19): on equal parts a patient
//                      top that launches well is near the best play, as in
//                      real tops where nobody steers, so easy AIs may lose to
//                      it. Gated on the average-launch bot only: it must win
//                      < 70% against Elite (1.15) and < 50% against Legend
//                      (1.3); everything else is reported. Only play decides
//                      a mirror, since
//                      across builds the part matchup decides most battles
//                      (an attack top with no input still beats a stamina AI,
//                      as real tops do). Two baselines, same seeds and builds:
//                        1a "perfect launch": releases at PERFECT_CENTER (0.92)
//                           every time (3.00 J on the starter launcher; more than
//                           a human gets)
//                        1b "average launch": releases at a typical human Good
//                           grade: charge 0.86 +- 0.03 (seeded per round, clamped
//                           0.75-0.97), about 2.5 J. Perfect window on the starter
//                           launcher is 0.886-0.954, Good is 0.75-0.886.
//                      --only 1 runs both, 1a or 1b runs one. --only 1m adds a
//                      report-only run of the perfect bot across all 25 build
//                      pairs (not gated): how much the matchup decides.
//   2 gear curve       the same AI with better gear (items rolled by the loot
//                      pipeline) against a base loadout must win 50-85%
//   3 difficulty steps the AI at each difficulty step against a fixed reference
//                      (the same AI at 1.0, same build) must move the win rate
//                      >= 10 points
//   4 luck (--luck)    how often the result flips when only the seed changes
//
// Usage: node tools/fairness.js [--n 200] [--check] [--json] [--luck]
//          [--only 1,1a,1b,1m,2,3,4] [--arena standard] [--steps 0.6,0.85,1,1.15,1.3]
//          [--gear-tier epic] [--threads N]
// Every outcome-deciding random draw comes from core/rng.js (battle seeds are
// mixSeeds of fixed labels); results are identical from run to run.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Battle } from '../src/game/battle.js';
import { mixSeeds, Rng } from '../src/core/rng.js';
import { PART_INDEX } from '../src/data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX, TECHNIQUE_INDEX } from '../src/data/launchers.js';
import { DIFFICULTIES } from '../src/data/opponents.js';
import { createItem } from '../src/systems/items.js';
import { generateItem } from '../src/systems/itemGen.js';
import { buildParticipant } from '../src/systems/loadout.js';
import { PERFECT_CENTER } from '../src/game/launch.js';
import { REFERENCE_BUILDS } from './balance.js';

const BUILDS = Object.keys(REFERENCE_BUILDS);
const ALL_TECH = Object.keys(TECHNIQUE_INDEX);
const SLOTS = ['ring', 'core', 'disc', 'lock', 'tip'];
const AVG_CENTER = 0.86; // average human: a Good release just under the perfect window
const AVG_SD = 0.03;
const COUNTDOWN = 3.0; // battle.js: IGNITE; a release before COUNTDOWN - 0.15 is a false start

// ------------------------------------------------------------ one battle (worker side)

// side: { build, human?, difficulty?, gear?: rarity }. Gear is rolled from the
// loot pipeline (curses allowed) at the given level; no gear = the plain
// catalogue parts of a starter kit.
function makeParticipant(side, seed, id) {
  const ref = REFERENCE_BUILDS[side.build];
  const inventory = {};
  const add = (base) => {
    const uid = `fx_${id}_${base.id}`;
    const it = side.gear
      ? generateItem({ base, rarity: side.gear, level: side.level ?? 20, seed: mixSeeds(seed, id, base.id), source: 'fairness', uid })
      : createItem({ base: base.id, rarity: 'common', level: 1, seed: 1, perfect: true, noTraits: true, set: null, special: null, uid });
    inventory[uid] = it;
    return uid;
  };
  const parts = Object.fromEntries(SLOTS.map((s) => [s, add(PART_INDEX[ref.parts[s]])]));
  const L = { id: 'fx', name: side.build, parts, launcher: add(LAUNCHER_INDEX.launcher_spark), cable: add(CABLE_INDEX.cable_standard), beast: null, spin: 'R', technique: 'normal' };
  const profile = { inventory, player: { name: side.build, color: '#ffffff', skills: {}, level: 1 }, beasts: {}, discovery: { synergies: {} }, techniques: ALL_TECH };
  const p = buildParticipant(profile, L, { human: !!side.human, id });
  p.ai = ref.ai;
  p.difficulty = side.difficulty ?? 1;
  return p;
}

// The no-input player: holds the charge so it peaks at IGNITE, releases at the
// perfect centre, and does nothing else (controls stay empty).
// kind 'perfect' releases at PERFECT_CENTER; 'avg' at AVG_CENTER scattered per
// seed and round (Rng over mixSeeds, so identical on every run).
function releaseTarget(kind, seed, b, f) {
  if (kind !== 'avg') return PERFECT_CENTER;
  const rng = new Rng(mixSeeds('fairness', 'avgrelease', seed, b.round ?? 0, f.index));
  return Math.min(0.97, Math.max(0.75, AVG_CENTER + rng.gauss(0, AVG_SD)));
}
function driveBot(b, f, kind, seed) {
  if (b.phase !== 'countdown' || f.launch.released) { b.chargeInput(f.index, false); return; }
  const target = releaseTarget(kind, seed, b, f);
  const startAt = Math.max(0, COUNTDOWN - target / f.gear.chargeRate);
  b.chargeInput(f.index, b.phaseT >= startAt);
  if (f.launch.meter.charge >= target) b.release(f.index);
}

function runSpec(spec) {
  const sides = spec.swap ? [spec.b, spec.a] : [spec.a, spec.b];
  const participants = sides.map((s, i) => makeParticipant(s, spec.seed, i === 0 ? 'p0' : 'p1'));
  const b = new Battle({ arenaId: spec.arena, format: 'bo3', seed: spec.seed, participants, headless: true });
  const bots = b.fighters.filter((f) => f.human);
  for (let guard = 0; b.phase !== 'matchOver' && guard < 1200 * 60; guard++) {
    b.update(1 / 60, []);
    if (b.phase === 'setup') for (const f of bots) b.confirmSetup(f.index);
    for (const f of bots) driveBot(b, f, spec.bot, spec.seed);
  }
  if (b.phase !== 'matchOver') b.finishMatch();
  const r = b.result;
  const sideOf = (idx) => (idx == null ? null : (idx === 0) === !spec.swap ? 'a' : 'b');
  return {
    key: spec.key, winner: sideOf(r.winner),
    rounds: r.rounds.map((x) => ({ w: sideOf(x.winner), how: x.how, t: x.time })),
  };
}

if (!isMainThread) {
  for (const spec of workerData.specs) parentPort.postMessage({ spec: spec.key, res: runSpec(spec) });
  process.exit(0);
}

// ------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; };
const N = Math.max(2, parseInt(opt('--n', '200'), 10));
const ARENA = opt('--arena', 'standard');
const STEPS = opt('--steps', DIFFICULTIES.map((d) => d.value).join(',')).split(',').map(Number);
const GEAR_TIER = opt('--gear-tier', 'epic');
const LADDER = ['rare', 'epic', 'legendary', 'mythic'];
const LUCK = flag('--luck');
const ONLY = opt('--only', null)?.split(',').map((s) => s.trim()) ?? (LUCK ? ['1', '2', '3', '4'] : ['1', '2', '3']);
const JSON_OUT = flag('--json');
const CHECK = flag('--check');
const THREADS = Math.max(1, parseInt(opt('--threads', String(os.cpus().length)), 10));

// ------------------------------------------------------------ spec generation

// All ordered build pairs (i, j): 25 matchups, cycled so every one gets used
// and the sides alternate (the pair count is odd).
const PAIRS = BUILDS.flatMap((x) => BUILDS.map((y) => [x, y]));
const specs = [];
const add = (key, k, a, b, tag, bot) => specs.push({ key, tag, bot, arena: ARENA, a, b, swap: k % 2 === 1, seed: mixSeeds('fairness', tag, k) });

const RUN_PERFECT = ONLY.includes('1') || ONLY.includes('1a');
const RUN_AVG = ONLY.includes('1') || ONLY.includes('1b');
const RUN_MATCHUPS = ONLY.includes('1m');
for (const [on, kind, prefix, mirror] of [[RUN_PERFECT, 'perfect', 'bot', true], [RUN_AVG, 'avg', 'avgbot', true], [RUN_MATCHUPS, 'perfect', 'mbot', false]]) {
  if (!on) continue;
  for (const d of STEPS) for (let k = 0; k < N; k++) {
    const [x, y] = mirror ? [BUILDS[k % BUILDS.length], BUILDS[k % BUILDS.length]] : PAIRS[k % PAIRS.length];
    // same tag and seeds for both bots: only the release point differs
    add(`${prefix}:${d}:${k}`, k, { build: x, human: true }, { build: y, difficulty: d }, mirror ? `mirror${d}` : `bot${d}`, kind);
  }
}
if (ONLY.includes('2')) {
  const tiers = LADDER.includes(GEAR_TIER) ? LADDER : [...LADDER, GEAR_TIER];
  for (const t of tiers) for (let k = 0; k < N; k++) {
    const [x, y] = PAIRS[k % PAIRS.length];
    add(`gear:${t}:${k}`, k, { build: x, gear: t }, { build: y }, `gear${t}`);
  }
}
if (ONLY.includes('3')) {
  for (const d of STEPS) for (let k = 0; k < N; k++) {
    const x = BUILDS[k % BUILDS.length];
    add(`diff:${d}:${k}`, k, { build: x, difficulty: d }, { build: x, difficulty: 1 }, `mdiff${d}`);
  }
}
const LUCK_PAIRS = BUILDS.flatMap((x, i) => BUILDS.slice(i).map((y) => [x, y])); // 15 unordered, incl. mirrors
const LUCK_SEEDS = Math.max(8, 2 * Math.round(N / 10)); // even, so seeds pair up
if (ONLY.includes('4')) {
  for (const mode of ['ai', 'bot']) LUCK_PAIRS.forEach(([x, y], pi) => {
    for (let k = 0; k < LUCK_SEEDS; k++) {
      const human = mode === 'bot';
      specs.push({ key: `luck:${mode}:${pi}:${k}`, tag: `luck${mode}${pi}`, arena: ARENA, swap: false, seed: mixSeeds('fairness', 'luck', pi, k), a: { build: x, human }, b: { build: y, human } });
    }
  });
}

// ------------------------------------------------------------ run

const W = Math.max(1, Math.min(THREADS, specs.length));
const buckets = Array.from({ length: W }, () => []);
specs.forEach((s, i) => buckets[i % W].push(s));
const t0 = Date.now();
const done = new Map();
await Promise.all(buckets.map((bk) => new Promise((resolve, reject) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { specs: bk } });
  w.on('message', (m) => { done.set(m.spec, m.res); if (!JSON_OUT && process.stderr.isTTY) process.stderr.write(`\r${done.size}/${specs.length} battles`); });
  w.on('error', reject);
  w.on('exit', resolve);
})));
if (!JSON_OUT && process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(30) + '\r');
const secs = (Date.now() - t0) / 1000;

// ------------------------------------------------------------ statistics

const rate = (rs, side = 'a') => {
  const n = rs.length;
  const w = rs.reduce((s, r) => s + (r.winner === side ? 1 : r.winner == null ? 0.5 : 0), 0);
  const p = n ? w / n : 0;
  // Wilson 95% interval
  const z = 1.96, den = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, n, lo: n ? (c - m) / den : 0, hi: n ? (c + m) / den : 0 };
};
const pick = (prefix) => [...done.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const ci = (r) => `${pct(r.p)} [${pct(r.lo)}-${pct(r.hi)}]`;

const out = { n: N, arena: ARENA, seconds: +secs.toFixed(1), checks: {}, gates: [] };
const gate = (check, name, value, ok, band) => out.gates.push({ check, name, value: +value.toFixed(3), band, pass: ok });

// average-launch bot targets per difficulty (see the header); others report
const BOT_LIMIT = { 1.15: 0.7, 1.3: 0.5 };
const botRows = (prefix, label, gated = true) => STEPS.map((d) => {
  const rs = pick(`${prefix}:${d}:`);
  const a = rs.flatMap((r) => r.rounds);
  const roundRate = a.length ? a.filter((r) => r.w === 'a').length / a.length : 0;
  const wonBy = {};
  for (const r of a) if (r.w === 'a') wonBy[r.how] = (wonBy[r.how] || 0) + 1;
  const r = rate(rs);
  if (gated && BOT_LIMIT[d] != null) gate(1, `${label} bot wins at difficulty ${d}`, r.p, r.p < BOT_LIMIT[d], `< ${Math.round(100 * BOT_LIMIT[d])}%`);
  return { difficulty: d, match: r, roundWinRate: roundRate, botRoundWinsBy: wonBy };
});
if (RUN_PERFECT) out.checks.noInputBot = botRows('bot', 'perfect-launch', false);
if (RUN_AVG) out.checks.noInputBotAverage = botRows('avgbot', 'average-launch');
if (RUN_MATCHUPS) out.checks.noInputBotMatchups = botRows('mbot', 'cross-build', false);
if (ONLY.includes('2')) {
  const tiers = LADDER.includes(GEAR_TIER) ? LADDER : [...LADDER, GEAR_TIER];
  const rows = tiers.map((t) => {
    const r = rate(pick(`gear:${t}:`));
    const gated = t === GEAR_TIER;
    if (gated) gate(2, `${t} gear vs base loadout`, r.p, r.p >= 0.5 && r.p <= 0.85, '50-85%');
    return { tier: t, gated, match: r };
  });
  out.checks.gearCurve = rows;
}
if (ONLY.includes('3')) {
  const rows = STEPS.map((d) => ({ difficulty: d, match: rate(pick(`diff:${d}:`)) }));
  for (let i = 1; i < rows.length; i++) {
    const delta = rows[i].match.p - rows[i - 1].match.p;
    rows[i].delta = delta;
    // the step must RAISE the win rate: a harder AI should win more against the reference
    gate(3, `step ${rows[i - 1].difficulty} -> ${rows[i].difficulty}`, delta, delta >= 0.1, '>= +10 points');
  }
  out.checks.difficultySteps = rows;
}
if (ONLY.includes('4')) {
  // Seed-noise: probability that two different seeds give different outcomes
  // = 1 - sum(p_k^2) over the outcome shares (unbiased with m/(m-1)); also the
  // directly observed rate over seed pairs (2j, 2j+1).
  const flipOf = (labels) => {
    const m = labels.length, cnt = {};
    for (const l of labels) cnt[l] = (cnt[l] || 0) + 1;
    const g = 1 - Object.values(cnt).reduce((s, c) => s + (c / m) ** 2, 0);
    return m > 1 ? (g * m) / (m - 1) : 0;
  };
  const modes = {};
  for (const mode of ['ai', 'bot']) {
    const rows = LUCK_PAIRS.map(([x, y], pi) => {
      const rs = Array.from({ length: LUCK_SEEDS }, (_, k) => done.get(`luck:${mode}:${pi}:${k}`));
      const match = rs.map((r) => r.winner);
      const rounds = rs.flatMap((r) => r.rounds.map((x2) => x2.w));
      let pairs = 0, flips = 0;
      for (let k = 0; k + 1 < match.length; k += 2) { pairs++; if (match[k] !== match[k + 1]) flips++; }
      return { a: x, b: y, aWins: rate(rs).p, matchFlip: flipOf(match), roundFlip: flipOf(rounds), pairedFlip: pairs ? flips / pairs : 0 };
    });
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    modes[mode] = { rows, mean: { matchFlip: avg('matchFlip'), roundFlip: avg('roundFlip'), pairedFlip: avg('pairedFlip') } };
  }
  out.checks.luck = { seedsPerMatchup: LUCK_SEEDS, ...modes };
}

// ------------------------------------------------------------ output

if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`Fairness gates: ${N} battles per check (bo3), arena ${ARENA}, ${specs.length} battles in ${secs.toFixed(0)} s on ${W} threads\n`);
  const c = out.checks;
  const botLines = (title, rows) => {
    console.log(title);
    for (const r of rows) console.log(`   difficulty ${String(r.difficulty).padEnd(5)} bot wins ${ci(r.match).padEnd(16)} rounds ${pct(r.roundWinRate).padEnd(4)} bot round wins by ${JSON.stringify(r.botRoundWinsBy)}`);
  };
  if (c.noInputBot) botLines('1a. Report only: no-input bot, perfect launch (charge 0.92 every round), vs AI on the same build, win rate per difficulty', c.noInputBot);
  if (c.noInputBotAverage) botLines(`1b. No-input bot, average launch (charge ${AVG_CENTER} +- ${AVG_SD}, a Good grade), vs AI on the same build, win rate per difficulty`, c.noInputBotAverage);
  if (c.noInputBotMatchups) botLines('1m. Report only: perfect-launch bot vs AI across all 25 build pairs (the matchup decides most of these)', c.noInputBotMatchups);
  if (c.gearCurve) {
    console.log('\n2. Gear curve: AI with rolled gear (level 20) vs the same AI on base parts');
    for (const r of c.gearCurve) console.log(`   ${r.tier.padEnd(10)} wins ${ci(r.match).padEnd(16)}${r.gated ? '  <- gated' : ''}`);
  }
  if (c.difficultySteps) {
    console.log('\n3. Difficulty steps: AI at each step vs the same AI at 1.0');
    for (const r of c.difficultySteps) console.log(`   difficulty ${String(r.difficulty).padEnd(5)} wins ${ci(r.match).padEnd(16)}${r.delta != null ? `  step ${r.delta >= 0 ? '+' : ''}${(100 * r.delta).toFixed(0)} pts` : ''}`);
  }
  if (c.luck) {
    console.log(`\n4. Luck: result flips when only the seed changes (${c.luck.seedsPerMatchup} seeds per matchup, 15 matchups, sides fixed)`);
    for (const mode of ['ai', 'bot']) {
      const m = c.luck[mode].mean;
      console.log(`   ${mode === 'ai' ? 'AI vs AI (AI choices also vary with seed)' : 'bot vs bot (inputs fixed, only launch scatter varies)'}`);
      console.log(`     match flip ${pct(m.matchFlip)}   round flip ${pct(m.roundFlip)}   paired-seed match flip ${pct(m.pairedFlip)}   (plan band 10-35%)`);
    }
    console.log('   per matchup (AI mode): ' + c.luck.ai.rows.map((r) => `${r.a}/${r.b} ${pct(r.matchFlip)}`).join(', '));
  }
  console.log('\nGates');
  for (const g of out.gates) console.log(`   ${g.pass ? 'PASS' : 'FAIL'}  [${g.check}] ${g.name}: ${g.check === 3 ? `${g.value >= 0 ? '+' : ''}${(100 * g.value).toFixed(0)} pts` : pct(g.value)} (need ${g.band})`);
}
if (CHECK && out.gates.some((g) => !g.pass)) process.exitCode = 1;
