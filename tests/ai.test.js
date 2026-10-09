// AI personalities, fairness and rival adaptation, measured with the real
// battle simulation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { AIController } from '../src/game/ai.js';
import { AI_PROFILES, scaledProfile } from '../src/data/aiProfiles.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { assembleTop } from '../src/systems/assembly.js';
import { newProfile } from '../src/systems/profile.js';
import { measureHabits, updateHabits, rivalPlan, recordRivalResult, COUNTER_ROLES, rivalParticipant, preMatchLine, buildRole } from '../src/systems/rivals.js';
import { CHARACTERS } from '../src/data/characters.js';
import { runMatchJob } from '../src/game/matchJob.js';

// Same build for everyone so only behaviour differs.
const SAME = ARCHETYPE_INDEX.all;

function behaviour(ai, seeds = [11, 12, 13, 14, 15]) {
  const acc = { aggression: 0, dashes: 0, control: 0, edge: 0 };
  for (const seed of seeds) {
    const a = participantFromDef({ ...SAME, beast: null }, { id: 'A', ai, difficulty: 1 });
    const b = participantFromDef({ ...SAME, beast: null }, { id: 'B', ai: 'balanced', difficulty: 1 });
    const battle = new Battle({ arenaId: 'standard', format: 'single', seed, participants: [a, b], roundTime: 40, rules: { slowmo: false, abilities: false } });
    const r = battle.runHeadless(200);
    const m = measureHabits(r, 0, battle.arena.radius);
    const pt = battle.fighters[0].controller.planTime || {};
    const total = Object.values(pt).reduce((x, y) => x + y, 0) || 1;
    acc.offense = (acc.offense || 0) + ((pt.attack || 0) + (pt.koPush || 0)) / total / seeds.length;
    acc.aggression += m.aggression / seeds.length;
    acc.edge += m.edge / seeds.length;
    acc.dashes += r.fighters[0].stats.dashes / seeds.length;
    // steering spend per second of battle (the ledger records energy spent as negative)
    acc.control += -(r.fighters[0].stats.energy.control || 0) / Math.max(1, r.rounds.reduce((x, y) => x + y.time, 0)) / seeds.length;
  }
  return acc;
}

test('AI personalities produce measurably different behaviour with identical equipment', () => {
  const agg = behaviour('aggressive');
  const end = behaviour('endurance');
  const def = behaviour('defensive');
  assert.ok(agg.offense > end.offense + 0.25, `aggressive spends more time attacking (${agg.offense.toFixed(2)} vs ${end.offense.toFixed(2)})`);
  assert.ok(def.offense < agg.offense, 'defensive attacks less than aggressive');
  assert.ok(agg.dashes > end.dashes, `aggressive dashes more (${agg.dashes} vs ${end.dashes})`);
  assert.ok(end.control < agg.control, `endurance spends less spin on steering (${end.control.toFixed(4)} vs ${agg.control.toFixed(4)} J/s)`);

});

test('difficulty scales skill parameters only — never physics', () => {
  const lo = scaledProfile('balanced', 0.6), hi = scaledProfile('balanced', 1.3);
  const changed = Object.keys(lo).filter((k) => lo[k] !== hi[k]).sort();
  assert.deepEqual(changed, ['counterSkill', 'launchSkill', 'reaction', 'steerSkill']);
  const p1 = participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 0.6 });
  const p2 = participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 1.3 });
  const s1 = assembleTop(p1.build, { spin: 'R' }).spec, s2 = assembleTop(p2.build, { spin: 'R' }).spec;
  assert.deepEqual(s1, s2, 'identical physical spec at any difficulty');
  for (const id of Object.keys(AI_PROFILES)) {
    const P = AI_PROFILES[id];
    for (const k of ['aggression', 'edgeCaution', 'risk', 'launchSkill', 'steerSkill', 'counterSkill', 'dashUse', 'steerEconomy']) assert.ok(P[k] >= 0 && P[k] <= 1, `${id}.${k} in [0,1]`);
  }
});

test('adaptive AIs adjust between rounds, within bounds', () => {
  const ai = new AIController({ profile: 'elite', difficulty: 1, seed: 3 });
  const before = { ...ai.profile };
  const note = ai.adaptBetweenRounds({ won: false, how: 'out' });
  assert.ok(note && ai.profile.edgeCaution > before.edgeCaution, 'plays safer after a ring-out loss');
  const plain = new AIController({ profile: 'aggressive', difficulty: 1, seed: 3 });
  assert.equal(plain.adaptBetweenRounds({ won: false, how: 'out' }), null, 'non-adaptive personalities do not');
  const t = new AIController({ profile: 'balanced', difficulty: 1, seed: 3, tweaks: { counterSkill: 5, aggression: -5 } });
  assert.ok(t.profile.counterSkill <= 0.98 && t.profile.aggression >= 0, 'tweaks are clamped');
});

test('rivals adapt to the player\'s habits after meeting them', () => {
  const P = newProfile(5);
  // the player has been attacking a lot
  for (let i = 0; i < 4; i++) updateHabits(P, { aggression: 0.8, edge: 0.1, dashRate: 5, counterRate: 0, abilityRate: 1, leftSpin: 0, perfectRate: 0.5 }, 'attack');
  const first = rivalPlan(P, 'theo', 3, { seed: 1 });
  assert.equal(first.adapted, false, 'no adaptation before the first meeting');
  recordRivalResult(P, 'theo', { won: true, role: 'attack' });
  const plan = rivalPlan(P, 'theo', 3, { seed: 1 });
  assert.ok(COUNTER_ROLES.attack.includes(plan.build.role), `Theo counters an attacker (${plan.build.role})`);
  assert.ok(plan.notes.length > 0 && plan.tweaks.counterSkill > 0, 'adaptation is explained and sharpens counters');
  for (const v of Object.values(plan.tweaks)) assert.ok(Math.abs(v) <= 0.2, 'tweaks bounded');
  // low-adaptability rival keeps their style
  recordRivalResult(P, 'rook', { won: true, role: 'attack' });
  const rook = rivalPlan(P, 'rook', 2, { seed: 1 });
  assert.equal(rook.build.role, 'burst');
  // dialogue reflects history and adaptation
  const line = preMatchLine(P, 'theo', { plan, seed: 2 });
  assert.ok(typeof line === 'string' && line.length > 10 && !line.includes('{'));
});

test('every rival build is legal and every rival can battle at every tier', () => {
  for (const c of CHARACTERS) {
    for (let tier = 1; tier <= 5; tier++) {
      const p = rivalParticipant(null, c.id, tier, { seed: tier });
      const asm = assembleTop(p.build, { spin: p.spin });
      assert.ok(asm.spec.mass > 0.02, `${c.id} t${tier}`);
    }
  }
  // a full rival match runs headless through the tournament job path
  const r = runMatchJob({ arenaId: 'standard', format: 'single', seed: 9, participants: [rivalParticipant(null, 'sora', 1, {}), rivalParticipant(null, 'daichi', 1, {})] });
  assert.ok(r.winnerSide === 0 || r.winnerSide === 1 || r.winnerSide == null);
  assert.equal(r.simulated, true);
  assert.equal(buildRole(rivalParticipant(null, 'juno', 1, {}).build), 'stamina');
});
