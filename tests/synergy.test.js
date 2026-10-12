// Synergy engine: valid rules, requirement checks with contributing items,
// near misses (hidden ones stay hidden), battle effects through participants,
// elemental statuses outside the Rift, and no synergies for bare builds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNERGIES } from '../src/data/synergies.js';
import { CHANNEL_LIMITS } from '../src/data/channels.js';
import { TRIGGERS } from '../src/systems/effectSpec.js';
import { synergyContext, evaluateSynergies, ruleIsValid, synergyEffectText, synergyGraph, buildBattleFx } from '../src/systems/synergy.js';
import { ARCHETYPES, ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { createItem } from '../src/systems/items.js';
import { newProfile } from '../src/systems/profile.js';
import { buildParticipant } from '../src/systems/loadout.js';
import { Battle } from '../src/game/battle.js';

const item = (base, traits = [], extra = {}) => createItem({ base, rarity: 'legendary', level: 10, seed: 3, traits: traits.map((id) => ({ id, mag: 1 })), special: null, set: null, perfect: true, ...extra });

test('every rule needs collected loot and uses only known effects', () => {
  for (const r of SYNERGIES) {
    assert.ok(ruleIsValid(r), `${r.id} needs a loot requirement`);
    for (const [ch] of r.effect.deltas || []) assert.ok(CHANNEL_LIMITS[ch], `${r.id}: ${ch}`);
    if (r.effect.react) assert.ok(TRIGGERS[r.effect.react.on], `${r.id}: trigger ${r.effect.react.on}`);
    const t = synergyEffectText(r);
    assert.ok(t.length > 5 && !/undefined|NaN/.test(t), `${r.id}: ${t}`);
    if (r.hidden) assert.ok(r.hint, `${r.id} hidden rules give a hint`);
  }
});

test('bare reference builds never trigger a synergy', () => {
  for (const a of ARCHETYPES) {
    const p = participantFromDef(a);
    const r = evaluateSynergies(synergyContext({ parts: p.build, launcher: p.launcher, cable: p.cable, beast: p.beast, spin: p.spin }));
    assert.equal(r.active.length, 0, a.id);
  }
});

test('requirements name the items behind them; near misses say what is missing', () => {
  const parts = {
    ring: item('ring_tidalhalo', ['streamlined']), core: item('core_helix', ['lateBloom']), disc: item('disc_heavyring', ['rimWeighted']),
    lock: item('lock_click3', ['lockGuard']), tip: item('tip_pivotball', ['stillPoint']),
  };
  const r = evaluateSynergies(synergyContext({ parts, spin: 'R' }));
  const ids = r.active.map((a) => a.rule.id);
  assert.ok(ids.includes('longHorizon'), 'four endurance traits: ' + ids);
  const graph = synergyGraph(r).find((g) => g.id === 'longHorizon');
  assert.ok(graph.edges[0].items.length >= 3);
  // Gyro Lock wants two defence traits under a ball tip: one is missing
  const gyro = r.near.find((n) => n.rule.id === 'gyroLock');
  assert.ok(gyro && gyro.missing.length === 1 && /Defense/.test(gyro.missing[0].text), JSON.stringify(gyro?.missing));
  // hidden rules stay hidden in near misses until discovered
  const stormParts = { ...parts, ring: item('ring_galefang', ['staticCoil']) };
  const near = evaluateSynergies(synergyContext({ parts: stormParts }), {}).near.find((n) => n.rule.id === 'stormfront');
  assert.ok(near?.hidden);
  assert.equal(evaluateSynergies(synergyContext({ parts: stormParts }), { stormfront: true }).near.find((n) => n.rule.id === 'stormfront').hidden, false);
});

test('a loadout carries its synergies and statuses into battle', () => {
  const p = newProfile(4);
  const L = p.loadouts[1]; // Tidal Drift
  const add = (it) => { p.inventory[it.uid] = it; return it.uid; };
  L.parts.ring = add(item('ring_tidalhalo', ['streamlined', 'emberEdge']));
  L.parts.core = add(item('core_helix', ['lateBloom']));
  L.parts.disc = add(item('disc_heavyring', ['rimWeighted']));
  const part = buildParticipant(p, L);
  assert.ok(part.synergies.includes('longHorizon'));
  assert.ok(part.modSources.some((s) => s.id === 'synergy:longHorizon'));
  assert.ok(part.rift?.status?.scorch > 0, 'elemental trait inflicts Scorch outside the Rift');
  // a defender keeps the tops in contact long enough for statuses to land
  const b = new Battle({ arenaId: 'standard', format: 'bo3', seed: 5, headless: true, participants: [{ ...part, human: false, ai: 'balanced' }, participantFromDef(ARCHETYPE_INDEX.wall, { id: 'B' })], rules: { durability: false, slowmo: false }, roundTime: 60 });
  let scorched = 0;
  b.on('riftStatus', (e) => { if (e.status === 'scorch' && e.by.index === 0) scorched++; });
  b.runHeadless();
  assert.ok(b.fighters[0].stats.sources['synergy:longHorizon'].seconds > 0, 'synergy active in the battle breakdown');
  assert.ok(scorched > 0, 'Scorch inflicted');
});

test('Rift charms only count during a run', () => {
  const parts = { ring: item('ring_galefang', ['orbitalFlow']), tip: item('tip_flatstrike', ['nimble']) };
  const run = { charms: [{ id: 'quicklaces' }, { id: 'steadyhand' }], boons: {} };
  assert.ok(buildBattleFx({ parts, run }).ids.includes('galeRider'));
  assert.ok(!buildBattleFx({ parts }).ids.includes('galeRider'));
});
