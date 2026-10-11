// Parallel balance simulation: every reference build against every other on
// the chosen stadiums, real battles, sides alternated, spread over worker
// threads. Prints win rates with 95% intervals and finish mix.
// Usage: node tools/balance-par.js [matchesPerPair=8] [arena|all] [--json] [--check lo-hi]
// --check fails (exit 1) if any build's win rate over all chosen stadiums
// leaves the lo-hi percent band: a guard against balance regressions.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const { runMatchup } = await import('./balance.js');
  for (const job of workerData.jobs) {
    const r = runMatchup(job.a, job.b, job.arena, job.n, job.seedBase);
    parentPort.postMessage({ job, r });
  }
  process.exit(0);
}

const { REFERENCE_BUILDS } = await import('./balance.js');
const { ARENAS } = await import('../src/data/arenas.js');
const n = parseInt(process.argv[2] || '8', 10);
const arenaArg = process.argv[3] || 'standard';
const json = process.argv.includes('--json');
const arenas = arenaArg === 'all' ? ARENAS.map((a) => a.id) : arenaArg.split(',');
const names = Object.keys(REFERENCE_BUILDS);
const jobs = [];
for (const arena of arenas) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) jobs.push({ a: names[i], b: names[j], arena, n, seedBase: 1000 + i * 37 + j * 101 });
const W = Math.max(1, Math.min(os.cpus().length, jobs.length));
const buckets = Array.from({ length: W }, () => []);
jobs.forEach((jb, k) => buckets[k % W].push(jb));
const t0 = Date.now();
const results = [];
await Promise.all(buckets.map((b) => new Promise((resolve, reject) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b } });
  w.on('message', (m) => results.push(m));
  w.on('error', reject);
  w.on('exit', resolve);
})));

const out = {};
for (const arena of arenas) {
  const wr = Object.fromEntries(names.map((x) => [x, { w: 0, g: 0 }]));
  const fin = {};
  const lines = [];
  for (const { job, r } of results.filter((x) => x.job.arena === arena)) {
    wr[job.a].w += r.wins[0]; wr[job.b].w += r.wins[1];
    wr[job.a].g += job.n; wr[job.b].g += job.n;
    for (const [k, v] of Object.entries(r.finishes)) fin[k] = (fin[k] || 0) + v;
    lines.push(`${job.a.padEnd(8)} vs ${job.b.padEnd(8)} ${String(r.wins[0]).padStart(2)}-${String(r.wins[1]).padEnd(2)} avg round ${(r.roundTime / r.rounds).toFixed(1)}s ${JSON.stringify(r.finishes)}`);
  }
  out[arena] = { winrate: Object.fromEntries(names.map((x) => [x, wr[x].w / wr[x].g])), finishes: fin };
  if (!json) {
    console.log(`\n=== ${arena} (${n} per pair) ===`);
    lines.sort().forEach((l) => console.log(l));
    console.log('win rates: ' + names.map((x) => { const p = wr[x].w / wr[x].g; const ci = 1.96 * Math.sqrt((p * (1 - p)) / wr[x].g); return `${x} ${Math.round(p * 100)}%±${Math.round(ci * 100)}`; }).join(', '));
    console.log('finishes: ' + JSON.stringify(fin));
  }
}
if (json) console.log(JSON.stringify(out));
else console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s on ${W} threads)`);

const ci = process.argv.indexOf('--check');
if (ci > 0) {
  const [lo, hi] = (process.argv[ci + 1] || '25-70').split('-').map(Number);
  const overall = Object.fromEntries(names.map((x) => [x, { w: 0, g: 0 }]));
  for (const { job, r } of results) { overall[job.a].w += r.wins[0]; overall[job.b].w += r.wins[1]; overall[job.a].g += job.n; overall[job.b].g += job.n; }
  let ok = true;
  for (const x of names) {
    const p = Math.round((100 * overall[x].w) / overall[x].g);
    const pass = p >= lo && p <= hi;
    ok = ok && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${x} ${p}% overall (band ${lo}-${hi}%)`);
  }
  if (!ok) process.exitCode = 1;
}
