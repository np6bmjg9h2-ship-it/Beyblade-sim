// Loot simulation: rolls many drops per source tier through the real loot
// code (rollLoot, with bad-luck protection advancing as in play) and reports
// rarity shares, how often protection forces the result, and the gap
// between Legendary-or-better drops. Seeded and reproducible.
//
//   npm run loot:sim                     20,000 drops per tier
//   node tools/loot-sim.js --n 100000 --seed 7 --json

import { rollLoot, PITY } from '../src/systems/loot.js';
import { newProfile } from '../src/systems/profile.js';
import { RARITIES, rarityRank } from '../src/data/rarity.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 20000));
const SEED = Number(arg('--seed', 1));
const JSON_OUT = process.argv.includes('--json');
const TIERS = [0, 1, 2, 3, 4];
const IDS = RARITIES.map((r) => r.id).filter((id) => id !== 'relic');
const LEG = rarityRank('legendary'), EPIC = rarityRank('epic');

function simulate(tier) {
  const p = newProfile(SEED * 1000 + tier);
  p.player.level = 20;
  const count = Object.fromEntries(IDS.map((id) => [id, 0]));
  let forcedEpic = 0, forcedLeg = 0, sinceLeg = 0;
  const gaps = [];
  const slots = {};
  for (let i = 0; i < N; i++) {
    const P = p.seeds.pity || { epic: 0, legendary: 0 };
    const legDue = P.legendary + 1 >= PITY.legendary, epicDue = P.epic + 1 >= PITY.epic;
    const it = rollLoot(p, { label: `sim${tier}`, tier });
    delete p.inventory[it.uid];
    const r = rarityRank(it.rarity);
    count[it.rarity]++;
    // protection forced it when it was due and the result sits exactly on the floor
    if (legDue && it.rarity === 'legendary') forcedLeg++;
    else if (epicDue && it.rarity === 'epic') forcedEpic++;
    sinceLeg++;
    if (r >= LEG) { gaps.push(sinceLeg); sinceLeg = 0; }
    const slot = it.slot || it.base?.split('_')[0] || '?';
    slots[slot] = (slots[slot] || 0) + 1;
  }
  gaps.sort((a, b) => a - b);
  const pct = (x) => (100 * x) / N;
  return {
    tier,
    rarity: Object.fromEntries(IDS.map((id) => [id, +pct(count[id]).toFixed(2)])),
    epicPlus: +pct(IDS.filter((id) => rarityRank(id) >= EPIC).reduce((a, id) => a + count[id], 0)).toFixed(2),
    legendaryPlus: +pct(count.legendary + count.mythic).toFixed(2),
    forcedPer100: { epic: +pct(forcedEpic).toFixed(2), legendary: +pct(forcedLeg).toFixed(2) },
    // share of 20-drop (60-drop) stretches that ended in a forced drop
    forcedStretchShare: { epic: +((forcedEpic * PITY.epic) / N).toFixed(3), legendary: +((forcedLeg * PITY.legendary) / N).toFixed(3) },
    dropsBetweenLegendary: gaps.length ? { mean: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1), median: gaps[gaps.length >> 1] } : null,
  };
}

const t0 = Date.now();
const results = TIERS.map(simulate);
if (JSON_OUT) {
  console.log(JSON.stringify({ n: N, seed: SEED, pity: PITY, results }, null, 2));
} else {
  console.log(`Loot simulation: ${N.toLocaleString()} drops per tier, seed ${SEED}, protection Epic ${PITY.epic} / Legendary ${PITY.legendary} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  const head = ['tier', ...IDS.map((id) => id.slice(0, 6)), 'epic+', 'leg+', 'forced e/l per 100', 'leg gap mean/med'];
  console.log(head.map((h, i) => (i ? h.padStart(i > IDS.length + 2 ? 20 : 8) : h.padEnd(5))).join(''));
  for (const r of results) {
    const cells = [String(r.tier).padEnd(5), ...IDS.map((id) => `${r.rarity[id].toFixed(1)}%`.padStart(8)),
      `${r.epicPlus.toFixed(1)}%`.padStart(8), `${r.legendaryPlus.toFixed(1)}%`.padStart(8),
      `${r.forcedPer100.epic} / ${r.forcedPer100.legendary}`.padStart(20),
      (r.dropsBetweenLegendary ? `${r.dropsBetweenLegendary.mean} / ${r.dropsBetweenLegendary.median}` : '-').padStart(20)];
    console.log(cells.join(''));
  }
}
