// Balance experiments without editing source: apply part/AI overrides in every
// worker, run the reference round robin, report match win rates per build and
// per stadium plus the matchup matrix.
// Usage: node tools/balance-tune.js <n> <arenas|all> [overrides.json]
// overrides.json: { "parts": { "tip_flatstrike": { "patchRadius": 0.45 } },
//                   "ai": { "balanced": { "aggression": 0.45 } },
//                   "physics": { "faceCoupling": 0.6 } }
// WORKERS=<k> limits worker threads; SEED_OFFSET=<k> plays different matches.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../', import.meta.url).href;
async function applyOverrides(ov) {
  if (!ov) return;
  const { PART_INDEX } = await import(ROOT + 'src/data/parts.js');
  const { AI_PROFILES } = await import(ROOT + 'src/data/aiProfiles.js');
  const { PHYSICS } = await import(ROOT + 'src/physics/simulation.js');
  Object.assign(PHYSICS, ov.physics || {});
  for (const [id, o] of Object.entries(ov.parts || {})) Object.assign(PART_INDEX[id], o);
  for (const [id, o] of Object.entries(ov.ai || {})) Object.assign(AI_PROFILES[id], o);
}
if (!isMainThread) {
  await applyOverrides(workerData.ov);
  const { runMatchup } = await import(ROOT + 'tools/balance.js');
  for (const job of workerData.jobs) parentPort.postMessage({ job, r: runMatchup(job.a, job.b, job.arena, job.n, job.seedBase) });
  process.exit(0);
}
const n = +(process.argv[2] || 6);
const SEED_OFFSET = +(process.env.SEED_OFFSET || 0); // validate on matches the tuning never saw
const { ARENAS } = await import(ROOT + 'src/data/arenas.js');
const arenas = (process.argv[3] || 'standard') === 'all' ? ARENAS.map((a) => a.id) : process.argv[3].split(',');
const ov = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
const { REFERENCE_BUILDS } = await import(ROOT + 'tools/balance.js');
const names = Object.keys(REFERENCE_BUILDS);
const jobs = [];
for (const arena of arenas) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) jobs.push({ a: names[i], b: names[j], arena, n, seedBase: 1000 + i * 37 + j * 101 + SEED_OFFSET });
const W = Math.min(+(process.env.WORKERS || os.cpus().length), jobs.length);
const buckets = Array.from({ length: W }, () => []);
jobs.forEach((jb, k) => buckets[k % W].push(jb));
const res = [];
const t0 = Date.now();
await Promise.all(buckets.map((b) => new Promise((ok, bad) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b, ov } }); w.on('message', (m) => res.push(m)); w.on('error', bad); w.on('exit', ok); })));
const pct = (w, g) => g ? Math.round((100 * w) / g) : 0;
const total = Object.fromEntries(names.map((x) => [x, { w: 0, g: 0 }]));
const perArena = {};
const mat = {};
for (const { job, r } of res) {
  total[job.a].w += r.wins[0]; total[job.b].w += r.wins[1]; total[job.a].g += job.n; total[job.b].g += job.n;
  const pa = (perArena[job.arena] = perArena[job.arena] || Object.fromEntries(names.map((x) => [x, { w: 0, g: 0 }])));
  pa[job.a].w += r.wins[0]; pa[job.b].w += r.wins[1]; pa[job.a].g += job.n; pa[job.b].g += job.n;
  const k = `${job.a}|${job.b}`; mat[k] = mat[k] || [0, 0]; mat[k][0] += r.wins[0]; mat[k][1] += r.wins[1];
}
console.log(`overrides: ${ov ? JSON.stringify(ov) : 'none'} | ${n}/pair/arena on ${arenas.length} arenas (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log('OVERALL  ' + names.map((x) => `${x} ${pct(total[x].w, total[x].g)}%`).join('  '));
for (const a of arenas) console.log(`  ${a.padEnd(12)} ` + names.map((x) => `${x.slice(0, 3)} ${String(pct(perArena[a][x].w, perArena[a][x].g)).padStart(3)}%`).join('  '));
console.log('  matchups: ' + Object.entries(mat).map(([k, [x, y]]) => `${k.replace('|', '-')} ${x}:${y}`).join('  '));
