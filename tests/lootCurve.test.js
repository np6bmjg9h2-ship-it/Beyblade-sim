// The rarity curve stays inside its targets (tools/loot-sim.js measures the
// full picture): about 1% Legendary-or-better at tier 0, 2-4% at tier 4
// (a third of the 2026-10-13 odds, by request on 2026-10-24).

import test from 'node:test';
import assert from 'node:assert/strict';
import { rarityWeights, pityBoost, SOFT_PITY, PITY } from '../src/systems/loot.js';
import { rarityRank } from '../src/data/rarity.js';

const share = (tier, luck = 0, from = 'legendary') => {
  const w = rarityWeights(tier, luck);
  const total = w.reduce((a, r) => a + r.weight, 0);
  return w.filter((r) => rarityRank(r.id) >= rarityRank(from)).reduce((a, r) => a + r.weight, 0) / total;
};

test('Legendary-or-better odds: about 1% at tier 0, 2-4% at tier 4, rising with tier', () => {
  assert.ok(share(0) > 0.006 && share(0) < 0.015, `tier 0: ${share(0)}`);
  assert.ok(share(4) > 0.02 && share(4) < 0.04, `tier 4: ${share(4)}`);
  for (let t = 1; t <= 4; t++) assert.ok(share(t) > share(t - 1), `tier ${t} above tier ${t - 1}`);
  // the best store capsule's luck is a nudge, not a jackpot
  assert.ok(share(3, 0.4) < 0.05, `tier 3 + luck 0.4: ${share(3, 0.4)}`);
  // Mythic is the chase: under 0.2% before tier 2, about 1% at tier 4
  assert.ok(share(0, 0, 'mythic') < 0.002, `mythic tier 0: ${share(0, 0, 'mythic')}`);
  assert.ok(share(4, 0, 'mythic') < 0.015, `mythic tier 4: ${share(4, 0, 'mythic')}`);
});

test('the soft bad-luck ramp starts after a dry streak and stays below the hard guarantee', () => {
  const at = (epic, legendary) => pityBoost({ seeds: { pity: { epic, legendary } } });
  assert.deepEqual(at(0, 0), { epic: 1, legendary: 1 });
  assert.equal(at(SOFT_PITY.epic.from, 0).epic, 1);
  assert.ok(at(PITY.epic - 1, 0).epic > 2, 'epic odds clearly raised before the hard guarantee');
  assert.ok(at(0, PITY.legendary - 1).legendary > 2, 'legendary odds clearly raised before the hard guarantee');
  assert.ok(at(15, 15).legendary >= at(15, 15).epic, 'a legendary is never less likely than the epic boost allows');
});
