// Part probe: is a part a straight upgrade? Swaps one part into a reference
// build and plays the swapped build against the original (mirror AI, sides
// alternated). A part with its own niche should land near 50% here and earn
// its place in matchups, not beat its own archetype outright.
// Usage: node partprobe.mjs <n> [arena=standard] [partIds=all expansion parts]
//   OPP=attack: both the tried and the base build play the attack reference
//   build instead of each other (for counter parts a mirror can't judge)
//   swap target: build=<ref build> per part, see SWAPS below
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../../', import.meta.url).href;

// part -> reference build it is tried in (and the extra parts it needs to be legal)
const SWAPS = {
  ring_razorcrescent: { build: 'attack' },
  ring_bulwarkdome: { build: 'defense', also: { core: 'core_apex', lock: 'lock_click3', disc: 'disc_compact' }, vs: { core: 'core_apex', lock: 'lock_click3', disc: 'disc_compact', ring: 'ring_tidalhalo' } },
  ring_zephyrsail: { build: 'stamina' },
  ring_hookcrown: { build: 'burst' },
  core_featherlite: { build: 'attack' },
  core_anchor: { build: 'defense' },
  core_keel: { build: 'stamina', also: { disc: 'disc_compact' }, vs: { core: 'core_apex', disc: 'disc_compact' } },
  disc_slimrim: { build: 'stamina' },
  disc_sawrim: { build: 'attack' },
  disc_spoke: { build: 'balance' },
  lock_apexclamp: { build: 'stamina', also: { core: 'core_apex', disc: 'disc_compact' }, vs: { core: 'core_apex', disc: 'disc_compact' } },
  lock_quickset: { build: 'burst' },
  lock_widestab: { build: 'defense', also: { tip: 'tip_wideball' }, vs: { lock: 'lock_widesocket', tip: 'tip_wideball', core: 'core_quad' } },
  tip_widespike: { build: 'stamina', also: { lock: 'lock_widesocket' }, vs: { lock: 'lock_click3' } },
  tip_rubberball: { build: 'defense' },
  tip_stormflat: { build: 'attack' },
  aux_guardskirt: { build: 'defense', also: { disc: 'disc_orbit' }, vs: { disc: 'disc_orbit' } },
  aux_spikeband: { build: 'attack' },
};

if (!isMainThread) {
  const { Battle } = await import(ROOT + 'src/game/battle.js');
  const { REFERENCE_BUILDS } = await import(ROOT + 'tools/balance.js');
  const { PART_INDEX } = await import(ROOT + 'src/data/parts.js');
  const make = (ids) => Object.fromEntries(Object.entries(ids).map(([s, id]) => [s, PART_INDEX[id]]));
  for (const job of workerData.jobs) {
    let wins = 0, games = 0;
    const ref = REFERENCE_BUILDS[job.build];
    const tried = make({ ...ref.parts, ...job.also, [PART_INDEX[job.part].slot]: job.part });
    const base = make({ ...ref.parts, ...job.vs });
    // OPP mode: the side under test (tried or base) plays a reference opponent instead
    const opp = job.opp ? { build: make(REFERENCE_BUILDS[job.opp].parts), ai: REFERENCE_BUILDS[job.opp].ai } : null;
    for (let i = 0; i < job.n; i++) {
      const swap = i % 2 === 1;
      const pt = { name: 'tried', build: job.side === 'base' ? base : tried, ai: ref.ai };
      const pb = opp ? { name: job.opp, build: opp.build, ai: opp.ai } : { name: 'base', build: base, ai: ref.ai };
      const r = new Battle({ arenaId: job.arena, format: 'bo3', seed: job.seed + i * 7919, participants: swap ? [pb, pt] : [pt, pb] }).runHeadless();
      if (r.winner != null) { games++; if (r.winner === (swap ? 1 : 0)) wins++; }
    }
    parentPort.postMessage({ job, wins, games });
  }
  process.exit(0);
}

const n = +(process.argv[2] || 24);
const arena = process.argv[3] || 'standard';
const ids = process.argv[4] ? process.argv[4].split(',') : Object.keys(SWAPS);
const { validateBuild } = await import(ROOT + 'src/systems/assembly.js');
const { REFERENCE_BUILDS } = await import(ROOT + 'tools/balance.js');
const { PART_INDEX } = await import(ROOT + 'src/data/parts.js');
const CH = 8;
const jobs = [];
for (const part of ids) {
  const s = SWAPS[part];
  const ref = REFERENCE_BUILDS[s.build].parts;
  for (const [label, b] of [['tried', { ...ref, ...s.also, [PART_INDEX[part].slot]: part }], ['base', { ...ref, ...s.vs }]]) {
    const v = validateBuild(Object.fromEntries(Object.entries(b).map(([k, id]) => [k, PART_INDEX[id]])));
    if (!v.ok) { console.log(`${part}: ${label} build is illegal: ${v.errors.join(' ')}`); process.exit(1); }
  }
  const OPP = process.env.OPP || null;
  for (const side of OPP ? ['tried', 'base'] : ['tried']) for (let k = 0; k < n; k += CH) jobs.push({ part, side, opp: OPP, build: s.build, also: s.also || {}, vs: s.vs || {}, arena, n: Math.min(CH, n - k), seed: 12000 + k * 131 });
}
const W = Math.min(+(process.env.WORKERS || os.cpus().length), jobs.length);
const buckets = Array.from({ length: W }, () => []);
jobs.forEach((j, k) => buckets[k % W].push(j));
const t0 = Date.now();
const out = [];
await Promise.all(buckets.map((bk) => new Promise((ok, bad) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: bk } }); w.on('message', (m) => out.push(m)); w.on('error', bad); w.on('exit', ok); })));
const agg = {};
for (const { job, wins, games } of out) { const key = job.opp ? `${job.part} ${job.side}` : job.part; const a = (agg[key] = agg[key] || { wins: 0, games: 0, build: job.opp ? `${job.build}>${job.opp}` : job.build }); a.wins += wins; a.games += games; }
console.log(`Part probe: ${n} matches per part, ${arena}${process.env.OPP ? `, both sides vs ${process.env.OPP}` : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
for (const [k, a] of Object.entries(agg)) {
  const p = a.games ? a.wins / a.games : 0.5;
  const se = Math.sqrt(0.25 / Math.max(1, a.games));
  console.log(`${k.padEnd(20)} in ${a.build.padEnd(8)} ${(p * 100).toFixed(0).padStart(3)}%  (${a.wins}/${a.games})${Math.abs(p - 0.5) > 2 * se ? '  *' : ''}`);
}
