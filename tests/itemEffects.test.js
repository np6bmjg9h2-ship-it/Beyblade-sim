// Reactive traits in real battles: they fire from battle events, respect
// cooldowns and limits, act through modifiers / spirit / lock stress / spin,
// repeat exactly with the same seed, and leave trait-free battles untouched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { createItem } from '../src/systems/items.js';
import { TRAIT_INDEX } from '../src/data/traits.js';

// An archetype whose parts are item instances carrying the given traits.
function withTraits(defId, traitsBySlot, opts = {}) {
  const p = participantFromDef(ARCHETYPE_INDEX[defId], opts);
  const build = {};
  for (const [slot, base] of Object.entries(p.build)) {
    const traits = (traitsBySlot[slot] || []).filter((id) => !TRAIT_INDEX[id].special).map((id) => ({ id, mag: 1 }));
    const special = (traitsBySlot[slot] || []).find((id) => TRAIT_INDEX[id].special);
    build[slot] = createItem({ base: base.id, rarity: 'legendary', level: 10, seed: 11, traits, special: special ? { id: special, mag: 1 } : null, set: null, perfect: true });
  }
  p.build = build;
  return p;
}

function run(pa, pb, seed = 7, arenaId = 'standard', roundTime = 60) {
  const b = new Battle({ arenaId, format: 'single', seed, headless: true, participants: [pa, pb], rules: { durability: false, slowmo: false }, roundTime });
  const fired = [];
  b.on('itemEffect', (e) => fired.push({ who: e.fighter.index, id: e.id, t: +b.battleTime.toFixed(4), energy: e.energy }));
  const result = b.runHeadless();
  return { b, result, fired };
}

test('reactive traits fire from real events and show in the breakdown', () => {
  const pa = withTraits('striker', { ring: ['momentumEngine', 'adrenalStrike'], core: ['spiritSiphon'], disc: ['reboundCoil'] }, { id: 'A' });
  const pb = participantFromDef(ARCHETYPE_INDEX.wall, { id: 'B' });
  const { b, fired } = run(pa, pb);
  const ids = new Set(fired.filter((x) => x.who === 0).map((x) => x.id));
  assert.ok(ids.has('trait:momentumEngine') && ids.has('trait:spiritSiphon'), 'hit triggers fired: ' + [...ids].join(', '));
  assert.ok(fired.every((x) => x.who === 0), 'the trait-free opponent never triggers anything');
  // cooldowns: Spirit Siphon at most every 0.5 s
  const ts = fired.filter((x) => x.id === 'trait:spiritSiphon' && x.who === 0).map((x) => x.t);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 0.5 - 1e-9 || ts[i] < ts[i - 1], 'cooldown respected');
  // breakdown: trigger counts and seconds active for timed effects
  const src = b.fighters[0].stats.sources;
  assert.ok(src['trait:momentumEngine'].fired > 0 && src['trait:momentumEngine'].seconds > 0);
  assert.ok(src['trait:spiritSiphon'].fired > 0);
});

test('once-per-round low-spin triggers fire once and restore spin through the ledger', () => {
  const pa = withTraits('drifter', { tip: ['secondBreath'], core: ['lastLight'] }, { id: 'A' });
  const pb = participantFromDef(ARCHETYPE_INDEX.drifter, { id: 'B' });
  // which seeds reach a low-spin moment depends on the battle, so try a few:
  // it must fire at least once overall and never more than once per round
  let total = 0, lights = 0;
  for (const seed of [3, 4, 5, 6, 7]) {
    const { b, fired } = run(structuredClone(pa), structuredClone(pb), seed, 'vortex', 400); // long enough for the spin race to run down
    const mine = (id) => fired.filter((x) => x.who === 0 && x.id === id).length;
    const rounds = b.result.rounds.length;
    assert.ok(mine('trait:secondBreath') <= rounds);
    assert.ok(mine('trait:lastLight') <= rounds);
    for (const x of fired.filter((y) => y.who === 0 && y.id === 'trait:lastLight')) assert.ok(x.energy > 0, 'Last Light restored spin through the ledger');
    total += mine('trait:secondBreath');
    lights += mine('trait:lastLight');
    if (total >= 2 && lights >= 1) break;
  }
  assert.ok(total >= 1, 'Second Breath fired');
  assert.ok(lights >= 1, 'Last Light fired');
});

test('same seed, same battle; trait-free battles are untouched', () => {
  const mk = () => [withTraits('striker', { ring: ['momentumEngine'], disc: ['shockBrace'], lock: ['notchGuard'] }, { id: 'A' }), participantFromDef(ARCHETYPE_INDEX.breaker, { id: 'B' })];
  const r1 = run(...mk(), 21), r2 = run(...mk(), 21);
  assert.deepEqual(r1.fired, r2.fired);
  assert.equal(r1.result.winner, r2.result.winner);
  assert.deepEqual(r1.result.rounds.map((r) => [r.how, r.time]), r2.result.rounds.map((r) => [r.how, r.time]));
  const plain = run(participantFromDef(ARCHETYPE_INDEX.striker, { id: 'A' }), participantFromDef(ARCHETYPE_INDEX.wall, { id: 'B' }), 21);
  assert.equal(plain.b.itemFx, null, 'no engine without reactive traits');
  assert.equal(plain.fired.length, 0);
});
