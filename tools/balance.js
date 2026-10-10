// Balance simulator: round-robin of representative builds (each driven by a
// matching AI personality) across arenas, using the real battle code.
// Usage: node tools/balance.js [matchesPerPair=4] [arena=standard|all] [--json]

import { pathToFileURL } from 'node:url';
import { Battle } from '../src/game/battle.js';
import { PART_INDEX } from '../src/data/parts.js';
import { ARENAS } from '../src/data/arenas.js';

export const REFERENCE_BUILDS = {
  attack: { ai: 'aggressive', parts: { ring: 'ring_galefang', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_flatstrike' } },
  defense: { ai: 'defensive', parts: { ring: 'ring_bastion', core: 'core_quad', disc: 'disc_heavyring', lock: 'lock_ironclasp', tip: 'tip_pivotball' } },
  stamina: { ai: 'endurance', parts: { ring: 'ring_tidalhalo', core: 'core_helix', disc: 'disc_heavyring', lock: 'lock_click3', tip: 'tip_needle' } },
  balance: { ai: 'balanced', parts: { ring: 'ring_cometarc', core: 'core_helix', disc: 'disc_heavyring', lock: 'lock_click3', tip: 'tip_semiflat' } },
  burst: { ai: 'risky', parts: { ring: 'ring_rifttalon', core: 'core_helix', disc: 'disc_feather', lock: 'lock_click3', tip: 'tip_rubberflat' } },
};

export function buildOf(name) {
  return Object.fromEntries(Object.entries(REFERENCE_BUILDS[name].parts).map(([s, id]) => [s, PART_INDEX[id]]));
}

export function runMatchup(a, b, arenaId, n, seedBase = 1000) {
  const out = { wins: [0, 0], draws: 0, finishes: {}, roundTime: 0, rounds: 0, impacts: 0 };
  for (let i = 0; i < n; i++) {
    // alternate sides so launch positions don't bias results
    const swap = i % 2 === 1;
    const pa = { name: a, build: buildOf(a), ai: REFERENCE_BUILDS[a].ai };
    const pb = { name: b, build: buildOf(b), ai: REFERENCE_BUILDS[b].ai };
    const battle = new Battle({ arenaId, format: 'bo3', seed: seedBase + i * 7919, participants: swap ? [pb, pa] : [pa, pb] });
    const r = battle.runHeadless();
    if (r.winner == null) out.draws++;
    else {
      const winnerIsA = swap ? r.winner === 1 : r.winner === 0;
      out.wins[winnerIsA ? 0 : 1]++;
    }
    for (const rr of r.rounds) { out.finishes[rr.how] = (out.finishes[rr.how] || 0) + 1; out.roundTime += rr.time; out.rounds++; }
    out.impacts += r.fighters[0].stats.impacts;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = parseInt(process.argv[2] || '4', 10);
  const arenaArg = process.argv[3] || 'standard';
  const arenas = arenaArg === 'all' ? ARENAS.map((a) => a.id) : [arenaArg];
  const names = Object.keys(REFERENCE_BUILDS);
  for (const arenaId of arenas) {
    const t0 = Date.now();
    const winrate = {};
    const finishes = {};
    let roundTime = 0, rounds = 0;
    for (const x of names) winrate[x] = { w: 0, g: 0 };
    console.log(`\n=== ${arenaId} (${n} matches per pair, best of 3) ===`);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const r = runMatchup(names[i], names[j], arenaId, n);
        winrate[names[i]].w += r.wins[0]; winrate[names[j]].w += r.wins[1];
        winrate[names[i]].g += n; winrate[names[j]].g += n;
        for (const [k, v] of Object.entries(r.finishes)) finishes[k] = (finishes[k] || 0) + v;
        roundTime += r.roundTime; rounds += r.rounds;
        console.log(`${names[i].padEnd(8)} vs ${names[j].padEnd(8)}  ${r.wins[0]}-${r.wins[1]}${r.draws ? ` (${r.draws} draw)` : ''}  avg round ${(r.roundTime / r.rounds).toFixed(1)}s  ${JSON.stringify(r.finishes)}`);
      }
    }
    console.log('win rates: ' + names.map((x) => `${x} ${Math.round((100 * winrate[x].w) / winrate[x].g)}%`).join(', '));
    console.log(`finishes: ${JSON.stringify(finishes)}  avg round ${(roundTime / rounds).toFixed(1)}s  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
