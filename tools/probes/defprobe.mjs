// Defense probe: defense vs each other reference build, finishes split by
// winner, with optional overrides (same format as tools/balance-tune.js).
// Usage: node defprobe.mjs <n> <arenas|all> [overrides.json] [opponents=attack,stamina,balance,burst]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../../', import.meta.url).href;

async function applyOverrides(ov) {
  if (!ov) return;
  const { PART_INDEX } = await import(ROOT + 'src/data/parts.js');
  const { AI_PROFILES } = await import(ROOT + 'src/data/aiProfiles.js');
  const { PHYSICS } = await import(ROOT + 'src/physics/simulation.js');
  Object.assign(PHYSICS, ov.physics || {});
  for (const [id, o] of Object.entries(ov.parts || {})) Object.assign(PART_INDEX[id], o);
  for (const [id, o] of Object.entries(ov.ai || {})) Object.assign(AI_PROFILES[id], o);
  if (ov.ref) {
    const { REFERENCE_BUILDS } = await import(ROOT + 'tools/balance.js');
    for (const [k, v] of Object.entries(ov.ref)) Object.assign(REFERENCE_BUILDS[k].parts, v);
  }
}

if (!isMainThread) {
  await applyOverrides(workerData.ov);
  const { Battle } = await import(ROOT + 'src/game/battle.js');
  const { REFERENCE_BUILDS, buildOf } = await import(ROOT + 'tools/balance.js');
  for (const job of workerData.jobs) {
    const res = { wins: 0, games: 0, rWin: {}, rLose: {}, plans: {} };
    for (let i = 0; i < job.n; i++) {
      const swap = i % 2 === 1;
      const pd = { name: 'defense', build: buildOf('defense'), ai: REFERENCE_BUILDS.defense.ai };
      const po = { name: job.opp, build: buildOf(job.opp), ai: REFERENCE_BUILDS[job.opp].ai };
      const b = new Battle({ arenaId: job.arena, format: 'bo3', seed: job.seed + i * 7919, participants: swap ? [po, pd] : [pd, po] });
      const r = b.runHeadless();
      const di = swap ? 1 : 0;
      res.games++;
      if (r.winner === di) res.wins++;
      for (const rr of r.rounds) {
        const key = rr.how;
        if (rr.winner === di) res.rWin[key] = (res.rWin[key] || 0) + 1;
        else if (rr.winner != null) res.rLose[key] = (res.rLose[key] || 0) + 1;
      }
      const ai = b.fighters?.[di]?.controller;
      if (ai?.planTime) for (const [k, v] of Object.entries(ai.planTime)) res.plans[k] = (res.plans[k] || 0) + v;
    }
    parentPort.postMessage({ job, res });
  }
  process.exit(0);
}

const n = +(process.argv[2] || 12);
const { ARENAS } = await import(ROOT + 'src/data/arenas.js');
const arenas = (process.argv[3] || 'standard') === 'all' ? ARENAS.map((a) => a.id) : process.argv[3].split(',');
const ov = process.argv[4] && process.argv[4] !== '-' ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
const opps = (process.argv[5] || 'attack,stamina,balance,burst').split(',');
const jobs = [];
const CH = Math.max(2, Math.ceil(n / 4) * 2);
for (const arena of arenas) for (const opp of opps) for (let s = 0; s < n; s += CH) jobs.push({ arena, opp, n: Math.min(CH, n - s), seed: 5000 + s * 131 + opps.indexOf(opp) * 17 });
const W = Math.min(+(process.env.WORKERS || os.cpus().length), jobs.length);
const buckets = Array.from({ length: W }, () => []);
jobs.forEach((j, k) => buckets[k % W].push(j));
const out = [];
const t0 = Date.now();
await Promise.all(buckets.map((b) => new Promise((ok, bad) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b, ov } }); w.on('message', (m) => out.push(m)); w.on('error', bad); w.on('exit', ok); })));
const agg = {};
for (const { job, res } of out) {
  const a = (agg[job.opp] = agg[job.opp] || { wins: 0, games: 0, rWin: {}, rLose: {}, plans: {}, arena: {} });
  a.wins += res.wins; a.games += res.games;
  for (const k of ['rWin', 'rLose', 'plans']) for (const [x, v] of Object.entries(res[k])) a[k][x] = (a[k][x] || 0) + v;
  const ar = (a.arena[job.arena] = a.arena[job.arena] || [0, 0]); ar[0] += res.wins; ar[1] += res.games;
}
console.log(`overrides: ${ov ? JSON.stringify(ov) : 'none'} | n=${n} per opp per arena (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
let tw = 0, tg = 0;
for (const [opp, a] of Object.entries(agg)) {
  tw += a.wins; tg += a.games;
  const pt = Object.values(a.plans).reduce((x, y) => x + y, 0) || 1;
  console.log(`def vs ${opp.padEnd(8)} ${Math.round(100 * a.wins / a.games)}%  won rounds ${JSON.stringify(a.rWin)} lost ${JSON.stringify(a.rLose)}`);
  console.log(`   arenas ${Object.entries(a.arena).map(([k, [w, g]]) => `${k} ${Math.round(100 * w / g)}%`).join(' ')}`);
  console.log(`   plans ${Object.entries(a.plans).map(([k, v]) => `${k} ${Math.round(100 * v / pt)}%`).join(' ')}`);
}
console.log(`defense overall ${Math.round(100 * tw / tg)}%`);
