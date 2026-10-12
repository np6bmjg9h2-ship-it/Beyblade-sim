// Performance gate (tinybench): times the hot paths the game depends on and,
// with --check, fails when any of them got more than 15% slower than the
// baseline recorded on this machine (tools/perf-baseline.json, keyed by CPU
// model, so another computer only gets a printout).
//   npm run perf              print timings
//   npm run perf -- --save    record the baseline for this machine
//   npm run perf -- --check   compare with the baseline (exit 1 on regression)

import fs from 'node:fs';
import os from 'node:os';
import { Bench } from 'tinybench';
import { Battle } from '../src/game/battle.js';
import { Simulation } from '../src/physics/simulation.js';
import { TopBody } from '../src/physics/topBody.js';
import { Arena } from '../src/physics/arena.js';
import { Vec3 } from '../src/core/math.js';
import { ARENA_INDEX } from '../src/data/arenas.js';
import { PART_INDEX, PARTS } from '../src/data/parts.js';
import { assembleTop } from '../src/systems/assembly.js';
import { generateItem } from '../src/systems/itemGen.js';
import { buildBattleFx } from '../src/systems/synergy.js';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { REFERENCE_BUILDS, buildOf } from './balance.js';

const BASELINE = new URL('./perf-baseline.json', import.meta.url);
const TOLERANCE = 1.15;
const TICKS = 120; // one simulated second per sample

// Two reference tops launched at each other: one second of battle physics.
function newDuel() {
  const arena = new Arena(ARENA_INDEX.standard);
  const a = new TopBody(assembleTop(buildOf('attack'), { spin: 'R' }).spec, { id: 'A', side: 0 });
  const b = new TopBody(assembleTop(buildOf('defense'), { spin: 'R' }).spec, { id: 'B', side: 1 });
  const sim = new Simulation({ arena, tops: [a, b] });
  a.launch({ tipPos: new Vec3(-0.07, arena.heightAtR(0.07), 0), axis: new Vec3(0, 1, 0), spin: -680, velocity: new Vec3(1.1, 0, 0.15) });
  b.launch({ tipPos: new Vec3(0.07, arena.heightAtR(0.07), 0.01), axis: new Vec3(0, 1, 0), spin: -640, velocity: new Vec3(-0.5, 0, 0) });
  return sim;
}

// Loot builds for generation and synergy timing (fixed seeds).
const RARITIES = ['rare', 'epic', 'legendary', 'mythic'];
const lootBuild = (seed) => Object.fromEntries(Object.entries(REFERENCE_BUILDS.balance.parts).map(([s, id], i) =>
  [s, generateItem({ base: PART_INDEX[id], rarity: RARITIES[(seed + i) % 4], level: 20, seed: seed * 31 + i, source: 'perf' })]));
const builds = Array.from({ length: 32 }, (_, i) => lootBuild(i + 1));

const bigSave = newProfile(5);
for (let i = 0; i < 200; i++) {
  const it = generateItem({ base: PARTS[i % PARTS.length], rarity: RARITIES[i % 4], level: 10, seed: 900 + i, source: 'perf' });
  bigSave.inventory[it.uid] = it;
}

let sim = null, n = 0;
const bench = new Bench({ time: 1500, warmupTime: 300 });
bench
  .add('physics: 1 s of a two-top battle (120 ticks)', () => { for (let i = 0; i < TICKS; i++) sim.tick(); }, { beforeEach() { sim = newDuel(); } })
  .add('battle: AI vs AI round (12 s, headless)', () => {
    const b = new Battle({ arenaId: 'standard', format: 'single', seed: 4242, roundTime: 12, rules: { durability: false, slowmo: false },
      participants: [{ name: 'A', build: buildOf('attack'), ai: 'aggressive' }, { name: 'B', build: buildOf('stamina'), ai: 'endurance' }] });
    b.runHeadless(30);
  })
  .add('loot: generate an item', () => { generateItem({ base: PARTS[n % PARTS.length], rarity: RARITIES[n % 4], level: 15, seed: n++, source: 'perf' }); })
  .add('loot: synergies and effects for a build', () => { buildBattleFx({ parts: builds[n++ % builds.length], spin: 'R' }); })
  .add('assembly: assemble a loot top', () => { assembleTop(builds[n++ % builds.length], { spin: 'R' }); })
  .add('save: normalise a 220-item profile', () => { normalizeProfile(structuredClone(bigSave)); });

await bench.run();

const rows = bench.tasks.map((t) => {
  const r = t.result;
  if (r.state !== 'completed') throw new Error(`${t.name}: ${r.state} ${r.error?.message || ''}`);
  return { task: t.name, p50: r.latency.p50, mean: r.latency.mean, samples: r.latency.samples?.length ?? r.latency.sampleCount ?? null };
});
const tick = rows[0].p50 / TICKS;
console.table(rows.map((r) => ({ task: r.task, 'p50 ms': +r.p50.toFixed(4), 'mean ms': +r.mean.toFixed(4) })));
console.log(`physics tick (2 tops, 16 substeps): ${tick.toFixed(4)} ms p50`);

const machine = { cpu: os.cpus()[0]?.model?.trim() || 'unknown', node: process.version };
const args = process.argv.slice(2);
if (args.includes('--save')) {
  fs.writeFileSync(BASELINE, JSON.stringify({ machine, recorded: new Date().toISOString().slice(0, 10), p50: Object.fromEntries(rows.map((r) => [r.task, +r.p50.toFixed(5)])) }, null, 2) + '\n');
  console.log('baseline saved for', machine.cpu);
}
if (args.includes('--check')) {
  if (!fs.existsSync(BASELINE)) { console.log('no baseline yet: run with --save first'); process.exit(0); }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  if (base.machine.cpu !== machine.cpu) { console.log(`baseline was recorded on ${base.machine.cpu}; nothing to compare on ${machine.cpu}`); process.exit(0); }
  const slow = rows.filter((r) => base.p50[r.task] && r.p50 > base.p50[r.task] * TOLERANCE);
  for (const r of rows) if (base.p50[r.task]) console.log(`${r.p50 > base.p50[r.task] * TOLERANCE ? 'SLOWER' : 'ok    '} ${r.task}: ${(100 * (r.p50 / base.p50[r.task] - 1)).toFixed(1)}%`);
  if (slow.length) { console.error(`${slow.length} task(s) more than ${Math.round((TOLERANCE - 1) * 100)}% slower than the baseline`); process.exit(1); }
  console.log('performance within 15% of the baseline');
}
