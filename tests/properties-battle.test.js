// Property-based battle checks (fast-check): full battles through the real
// loadout path (sets, skills, synergies, elemental statuses, reactive
// traits, Spirit Chips, launch gear) with random loot on both sides.
//   * the same seed and loadouts give the same battle, event for event
//   * every effect that fires belongs to something the top carries
//   * battles always finish with finite state and no instability recovery

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { Battle } from '../src/game/battle.js';
import { newProfile } from '../src/systems/profile.js';
import { buildParticipant } from '../src/systems/loadout.js';
import { BEASTS } from '../src/data/beasts.js';
import { buildArb, gearArb, runs } from './arbitraries.js';

const sideArb = buildArb.chain((b) => fc.record({
  b: fc.constant(b),
  gear: gearArb(b.spin),
  beast: fc.option(fc.record({ i: fc.nat(), bondXp: fc.integer({ min: 0, max: 20000 }), awakened: fc.boolean() }), { nil: null }),
  technique: fc.constantFrom('normal', 'power', 'controlled', 'bank'),
  ai: fc.constantFrom('aggressive', 'defensive', 'endurance', 'balanced', 'risky', 'technical', 'elite'),
}));

// A profile holding exactly this loadout, turned into a battle participant.
function participant(side, id) {
  const p = newProfile(7);
  p.inventory = {};
  const put = (it) => { p.inventory[it.uid] = it; return it.uid; };
  const parts = Object.fromEntries(Object.entries(side.b.build).map(([s, it]) => [s, put(it)]));
  let beast = null;
  if (side.beast) {
    const def = BEASTS[side.beast.i % BEASTS.length];
    p.beasts[def.id] = { id: def.id, bondXp: side.beast.bondXp, awakened: side.beast.awakened, unlockedAt: 0, stats: {} };
    beast = def.id;
  }
  const L = { id: 'L1', name: 'Test', parts, launcher: put(side.gear.launcher), cable: put(side.gear.cable), beast, spin: side.b.spin, technique: side.technique };
  const part = buildParticipant(p, L, { id, human: false });
  part.ai = side.ai;
  return part;
}

function fight(a, b, seed, arenaId) {
  const battle = new Battle({ arenaId, format: 'single', seed, headless: true, participants: [participant(a, 'A'), participant(b, 'B')], rules: { durability: false, slowmo: false }, roundTime: 12 });
  const fired = [];
  battle.on('itemEffect', (e) => fired.push([e.fighter.index, e.id, +battle.battleTime.toFixed(5)]));
  const result = battle.runHeadless(60);
  const tops = battle.fighters.map((f) => f.top);
  return {
    battle, fired,
    trace: {
      fired,
      rounds: result.rounds.map((r) => [r.winner, r.how, +r.time.toFixed(5)]),
      winner: result.winner,
      tops: tops.map((t) => [...t.p.toArray(), ...t.L.toArray(), t.spinRate].map((x) => +x.toPrecision(12))),
      stats: battle.fighters.map((f) => [f.stats.impacts, +f.stats.impulseMax.toPrecision(12)]),
    },
  };
}

const ARENA_IDS = ['standard', 'vortex', 'edgebreaker', 'crystal', 'magma', 'skyfall', 'zero'];

test('any two loot builds: the same seed gives the same battle; fired effects belong to the carriers; state stays finite', () => {
  fc.assert(fc.property(sideArb, sideArb, fc.nat(), fc.constantFrom(...ARENA_IDS), (a, b, seed, arenaId) => {
    const r1 = fight(a, b, seed, arenaId);
    const r2 = fight(a, b, seed, arenaId);
    assert.deepEqual(r1.trace, r2.trace);
    for (const f of r1.battle.fighters) {
      assert.ok(f.top.isFiniteState(), 'finite state');
      const carried = new Set([
        ...[...Object.values(f.p.build), f.p.launcher, f.p.cable].filter(Boolean).flatMap((it) => [...(it.traits || []), ...(it.special ? [it.special] : [])].map((t) => 'trait:' + t.id)),
        ...(f.p.reactive || []).map((r) => r.id),
      ]);
      for (const [who, id] of r1.fired) if (who === f.index) assert.ok(carried.has(id) || id.startsWith('status:'), `fired ${id} without carrying it`);
    }
    assert.equal(r1.battle.sim.instabilityRecoveries, 0, 'no instability recoveries');
  }), { numRuns: runs(12) });
});
