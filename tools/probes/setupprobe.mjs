// Setup probe: does any setup slider (data/setup.js) win on its own? Each
// reference build plays a mirror match against itself, one side with one
// slider at an extreme, sides alternated. A trade-off should stay near 50%.
// Usage: node setupprobe.mjs <n> [arena=standard] [builds=attack,defense,stamina,balance,burst] [steps=5] [axes=tip.grip,...]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../../', import.meta.url).href;

if (!isMainThread) {
  const { Battle } = await import(ROOT + 'src/game/battle.js');
  const { REFERENCE_BUILDS } = await import(ROOT + 'tools/balance.js');
  const { createItem } = await import(ROOT + 'src/systems/items.js');
  const build = (name, setup) => Object.fromEntries(Object.entries(REFERENCE_BUILDS[name].parts).map(([s, id]) => {
    const it = createItem({ base: id, rarity: 'common', perfect: true, noTraits: true, set: null, special: null, seed: 1 });
    if (setup && s === setup.slot) it.setup = { [setup.axis]: setup.v };
    return [s, it];
  }));
  for (const job of workerData.jobs) {
    let wins = 0, games = 0;
    for (let i = 0; i < job.n; i++) {
      const swap = i % 2 === 1;
      const ai = REFERENCE_BUILDS[job.build].ai;
      const pt = { name: 'tuned', build: build(job.build, job), ai };
      const pp = { name: 'plain', build: build(job.build, null), ai };
      const r = new Battle({ arenaId: job.arena, format: 'bo3', seed: job.seed + i * 7919, participants: swap ? [pp, pt] : [pt, pp] }).runHeadless();
      if (r.winner != null) { games++; if (r.winner === (swap ? 1 : 0)) wins++; }
    }
    parentPort.postMessage({ job, wins, games });
  }
  process.exit(0);
}

const n = +(process.argv[2] || 24);
const arena = process.argv[3] || 'standard';
const builds = (process.argv[4] || 'attack,defense,stamina,balance,burst').split(',');
const steps = +(process.argv[5] || 5);
const { SETUP_AXES } = await import(ROOT + 'src/data/setup.js');
const CH = 8;
const jobs = [];
const only = process.argv[6] ? process.argv[6].split(',') : null; // e.g. tip.grip,tip.height
for (const b of builds) for (const [slot, axes] of Object.entries(SETUP_AXES)) for (const ax of axes) for (const v of [-steps, steps])
  if (!only || only.includes(`${slot}.${ax.id}`))
  for (let s = 0; s < n; s += CH) jobs.push({ build: b, slot, axis: ax.id, v, arena, n: Math.min(CH, n - s), seed: 9000 + s * 131 });
const W = Math.min(+(process.env.WORKERS || os.cpus().length), jobs.length);
const buckets = Array.from({ length: W }, () => []);
jobs.forEach((j, k) => buckets[k % W].push(j));
const t0 = Date.now();
const out = [];
await Promise.all(buckets.map((bk) => new Promise((ok, bad) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: bk } }); w.on('message', (m) => out.push(m)); w.on('error', bad); w.on('exit', ok); })));
const agg = {};
for (const { job, wins, games } of out) {
  const k = `${job.build} ${job.slot}.${job.axis} ${job.v > 0 ? '+' : ''}${job.v}`;
  const a = (agg[k] = agg[k] || { wins: 0, games: 0 });
  a.wins += wins; a.games += games;
}
console.log(`Setup probe: ${n} mirror matches per line, ${arena}, steps ±${steps} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
for (const [k, a] of Object.entries(agg).sort()) {
  const p = a.games ? a.wins / a.games : 0.5;
  const se = Math.sqrt(0.25 / Math.max(1, a.games));
  console.log(`${k.padEnd(34)} ${(p * 100).toFixed(0).padStart(3)}%  (${a.wins}/${a.games})${Math.abs(p - 0.5) > 2 * se ? '  *' : ''}`);
}
