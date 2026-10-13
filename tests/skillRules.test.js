// Openings and skill moments: a wobbling, tilted or airborne top is open, and
// striking it, punishing a whiff or breaking a dash earns spirit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { openness, SKILL_SPIRIT } from '../src/game/skillRules.js';
import { Battle } from '../src/game/battle.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';

const top = (spinAbs, tiltRad, airTime = 0) => ({ active: true, spinAbs, tilt: tiltRad, airTime });

test('openness follows the HUD thresholds', () => {
  assert.equal(openness(top(300, 0.05), 100).open, false, 'margin 3, tilt 3 deg: stable');
  assert.equal(openness(top(240, 0.05), 100).open, true, 'margin 2.4: wobbling');
  assert.equal(openness(top(300, 10 / 57.3), 100).open, true, 'tilt 10 deg');
  assert.equal(openness(top(300, 0.05, 0.1), 100).degree, 1, 'airborne is fully open');
  assert.ok(openness(top(140, 0.05), 100).degree > openness(top(240, 0.05), 100).degree, 'lower margin, more open');
  assert.equal(openness({ active: false }, 100).open, false);
});

test('striking soon after a whiffed counter is a punish and pays spirit', () => {
  const a = participantFromDef(ARCHETYPE_INDEX.striker, { id: 'A', ai: 'dummy' });
  const b = participantFromDef(ARCHETYPE_INDEX.wall, { id: 'B', ai: 'dummy' });
  const battle = new Battle({ arenaId: 'standard', format: 'single', seed: 3, participants: [a, b], rules: { slowmo: false } });
  battle.headless = true;
  while (battle.phase !== 'battle') { battle.update(1 / 60, []); if (battle.phase === 'setup') { battle.confirmSetup(0); battle.confirmSetup(1); } }
  const [A, B] = battle.fighters;
  const moments = [];
  battle.on('skillMoment', (e) => moments.push(e));
  B.ability.exposedAt = battle.battleTime - 0.5; // B whiffed a counter half a second ago
  // A strikes B: A moves into a resting B along the contact normal
  A.preVx = 0.6; A.preVz = 0; B.preVx = 0; B.preVz = 0;
  const s0 = A.ability.spirit;
  battle.onTopContact({ type: 'impact', A: A.top, B: B.top, impulse: 0.03, normal: [1, 0, 0], point: [0, 0, 0], approach: 0.6 });
  const punish = moments.find((m) => m.kind === 'punish');
  assert.ok(punish && punish.fighter === A, 'A punished');
  assert.ok(A.ability.spirit - s0 >= SKILL_SPIRIT.punish, 'paid at least the punish bonus');
  // too late: no punish
  moments.length = 0;
  B.ability.exposedAt = battle.battleTime - 1.5;
  battle.onTopContact({ type: 'impact', A: A.top, B: B.top, impulse: 0.03, normal: [1, 0, 0], point: [0, 0, 0], approach: 0.6 });
  assert.ok(!moments.some((m) => m.kind === 'punish'));
});
