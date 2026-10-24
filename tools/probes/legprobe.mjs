// Legend probe: a legend (its kit, its beast at bond 5, defensive/role AI) vs
// a full relic build (+ Orrery bond 5). Equal AI difficulty, sides alternated.
// Usage: node legprobe.mjs <legend=black> <relicBuild=attack|stamina> <n> [arena=standard|all] [overrides.json]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../../', import.meta.url).href;

const RELIC_BUILDS = {
  attack: { ai: 'aggressive', spin: 'R', technique: 'bank', parts: { ring: 'emberCrown', core: 'zeroPointCore', disc: 'bondkeepersSeal', lock: 'nullLattice', tip: 'skywakeSpindle' } },
  stamina: { ai: 'endurance', spin: 'R', technique: 'controlled', parts: { ring: null, core: 'archivistsLens', disc: 'championsOrbit', lock: 'nullLattice', tip: 'masterworkPivot' }, base: { ring: 'ring_tidalhalo' } },
};
const AI_OF = { Attack: 'aggressive', Defense: 'defensive', Stamina: 'endurance', Balance: 'balanced' };

async function applyOverrides(ov) {
  if (!ov) return;
  const { PART_INDEX } = await import(ROOT + 'src/data/parts.js');
  const { AI_PROFILES } = await import(ROOT + 'src/data/aiProfiles.js');
  for (const [id, o] of Object.entries(ov.parts || {})) Object.assign(PART_INDEX[id], o);
  for (const [id, o] of Object.entries(ov.ai || {})) Object.assign(AI_PROFILES[id], o);
  if (ov.legend) {
    const { LEGEND_INDEX } = await import(ROOT + 'src/data/legends.js');
    for (const [lid, slots] of Object.entries(ov.legend)) for (const [s, o] of Object.entries(slots)) Object.assign(LEGEND_INDEX[lid].build[s], o);
  }
}

async function participants(legendId, relicKey) {
  const { newProfile } = await import(ROOT + 'src/systems/profile.js');
  const { createRelicItem } = await import(ROOT + 'src/systems/relics.js');
  const { createItem } = await import(ROOT + 'src/systems/items.js');
  const { buildParticipant } = await import(ROOT + 'src/systems/loadout.js');
  const { BOND_LEVELS } = await import(ROOT + 'src/data/beasts.js');
  const { LEGEND_INDEX } = await import(ROOT + 'src/data/legends.js');
  const prof = newProfile(42);
  prof.relics = prof.relics || { casts: {} };
  prof.relics.casts = prof.relics.casts || {};
  const put = (it) => { prof.inventory[it.uid] = it; return it.uid; };
  const bond5 = BOND_LEVELS[4];
  const L = LEGEND_INDEX[legendId];
  prof.beasts[L.beast] = { id: L.beast, bondXp: bond5, awakened: false };
  prof.beasts.orrery = { id: 'orrery', bondXp: bond5, awakened: false };
  const legL = { id: 'LEG', name: 'Legend', legend: legendId, parts: {}, spin: L.spin, technique: L.technique, beast: L.beast };
  const pl = { ...buildParticipant(prof, legL, { human: false, id: 'legend' }), ai: AI_OF[L.role] || 'balanced', difficulty: 1, name: L.name };
  const R = RELIC_BUILDS[relicKey];
  const parts = {};
  for (const [s, rid] of Object.entries(R.parts)) parts[s] = rid ? put(createRelicItem(prof, rid)) : put(createItem({ base: R.base[s], rarity: 'relic', level: 30, perfect: true, seed: 9, traits: [], special: null, set: null }));
  const relL = { id: 'REL', name: 'Relic', parts, spin: R.spin, technique: R.technique, beast: 'orrery',
    launcher: put(createRelicItem(prof, 'laurelLauncher')), cable: put(createRelicItem(prof, 'rivalbreakerCord')) };
  const pr = { ...buildParticipant(prof, relL, { human: false, id: 'relic' }), ai: R.ai, difficulty: 1, name: 'Relic ' + relicKey };
  return [pl, pr];
}

if (!isMainThread) {
  await applyOverrides(workerData.ov);
  const { Battle } = await import(ROOT + 'src/game/battle.js');
  for (const job of workerData.jobs) {
    const res = { wins: 0, games: 0, rWin: {}, rLose: {} };
    for (let i = 0; i < job.n; i++) {
      const [pl, pr] = await participants(job.legend, job.relic);
      const swap = i % 2 === 1;
      const b = new Battle({ arenaId: job.arena, format: 'bo3', seed: job.seed + i * 7919, participants: swap ? [pr, pl] : [pl, pr] });
      const r = b.runHeadless();
      const li = swap ? 1 : 0;
      res.games++;
      if (r.winner === li) res.wins++;
      for (const rr of r.rounds) {
        if (rr.winner === li) res.rWin[rr.how] = (res.rWin[rr.how] || 0) + 1;
        else if (rr.winner != null) res.rLose[rr.how] = (res.rLose[rr.how] || 0) + 1;
      }
    }
    parentPort.postMessage({ job, res });
  }
  process.exit(0);
}

const [legend = 'black', relic = 'attack'] = process.argv.slice(2, 4);
const n = +(process.argv[4] || 96);
const arenaArg = process.argv[5] || 'standard';
const { ARENAS } = await import(ROOT + 'src/data/arenas.js');
const arenas = arenaArg === 'all' ? ARENAS.map((a) => a.id) : arenaArg.split(',');
const ov = process.argv[6] ? JSON.parse(fs.readFileSync(process.argv[6], 'utf8')) : null;
const jobs = [];
const CH = 8;
for (const arena of arenas) for (let s = 0; s < n; s += CH) jobs.push({ legend, relic, arena, n: Math.min(CH, n - s), seed: 9000 + s * 131 });
const W = Math.min(os.cpus().length, jobs.length);
const buckets = Array.from({ length: W }, () => []);
jobs.forEach((j, k) => buckets[k % W].push(j));
const out = [];
const t0 = Date.now();
await Promise.all(buckets.map((b) => new Promise((ok, bad) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: b, ov } }); w.on('message', (m) => out.push(m)); w.on('error', bad); w.on('exit', ok); })));
const a = { wins: 0, games: 0, rWin: {}, rLose: {}, ar: {} };
for (const { job, res } of out) {
  a.wins += res.wins; a.games += res.games;
  for (const k of ['rWin', 'rLose']) for (const [x, v] of Object.entries(res[k])) a[k][x] = (a[k][x] || 0) + v;
  const r = (a.ar[job.arena] = a.ar[job.arena] || [0, 0]); r[0] += res.wins; r[1] += res.games;
}
console.log(`${legend} vs relic ${relic}: ${Math.round(100 * a.wins / a.games)}% (n=${a.games}, ${((Date.now() - t0) / 1000).toFixed(0)} s) ${ov ? JSON.stringify(ov) : ''}`);
console.log(`  won rounds ${JSON.stringify(a.rWin)} lost ${JSON.stringify(a.rLose)}`);
if (arenas.length > 1) console.log('  ' + Object.entries(a.ar).map(([k, [w, g]]) => `${k} ${Math.round(100 * w / g)}%`).join(' '));
