// The Dash is a commitment: a visible 0.15 s windup with the direction
// latched, a real spin cost, a hit while coiling cancels it, and the AI reads
// the windup (counters it or steps aside) instead of rolling dice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { TECHNIQUE_DEFS } from '../src/game/abilities.js';
import { emptyControls } from '../src/game/ai.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { Vec3 } from '../src/core/math.js';

function duel(seed = 7) {
  const a = participantFromDef(ARCHETYPE_INDEX.striker, { id: 'A', ai: 'dummy' });
  const b = participantFromDef(ARCHETYPE_INDEX.wall, { id: 'B', ai: 'dummy' });
  const battle = new Battle({ arenaId: 'standard', format: 'single', seed, participants: [a, b], rules: { slowmo: false } });
  battle.headless = true;
  while (battle.phase !== 'battle') { battle.update(1 / 60, []); if (battle.phase === 'setup') { battle.confirmSetup(0); battle.confirmSetup(1); } }
  const [A, B] = battle.fighters;
  A.top.p.set(-0.08, A.top.p.y, 0); B.top.p.set(0.08, B.top.p.y, 0);
  A.top.v.set(0, 0, 0); B.top.v.set(0, 0, 0);
  return { battle, A, B };
}

test('the dash fires 0.15 s after the press, in the latched direction, at any frame rate', () => {
  const T = TECHNIQUE_DEFS.dash;
  for (const fps of [30, 60, 144]) {
    const { battle, A, B } = duel();
    let pressT = null, goT = null, goDir = null;
    battle.on('technique', (e) => {
      if (e.fighter !== A || e.name !== 'dash') return;
      if (e.phase === 'windup') pressT = battle.battleTime; else { goT = battle.battleTime; goDir = e.dir; }
    });
    assert.ok(A.ability.technique('dash', { opponent: B, steer: new Vec3(0, 0, 1) }));
    assert.ok(A.ability.windup, 'coiling');
    assert.equal(A.ability.technique('dash', { opponent: B, steer: new Vec3(0, 0, 1) }), false, 'no second press while coiling');
    pressT = battle.battleTime;
    const vz0 = A.top.v.z;
    // the stick turning during the windup does not change the dash
    for (let i = 0; i < Math.ceil(0.3 * fps); i++) battle.update(1 / fps, []);
    assert.ok(goT !== null, `dash went at ${fps} fps`);
    assert.ok(Math.abs(goT - pressT - T.windup) < 1 / 120 + 1e-9, `${fps} fps: windup ${goT - pressT}`);
    assert.equal(goDir.z, 1);
    assert.ok(A.top.v.z - vz0 > T.speed * 0.5, 'the step happened along the latched direction');
  }
});

test('a dash costs real spin and the energy ledger still closes', () => {
  const { battle, A, B } = duel();
  const e0 = A.top.spinEnergy(), led0 = A.top.ledger.ability;
  A.ability.technique('dash', { opponent: B, steer: new Vec3(0, 0, 1) });
  const lin0 = A.top.linearEnergy();
  for (let i = 0; i < 18; i++) A.ability.update(1 / 120, { opponent: B, steer: null });
  assert.equal(A.ability.windup, null, 'released after 18 ticks');
  const drained = e0 - A.top.spinEnergy(), work = A.top.linearEnergy() - lin0;
  assert.ok(drained >= 0.012 * e0 - 1e-12, `at least 1.2% of spin energy (${(drained / e0 * 100).toFixed(2)}%)`);
  assert.ok(drained >= work / 0.45 - 1e-9, 'paid at 45% conversion');
  assert.ok(Math.abs((A.top.ledger.ability - led0) - (work - drained)) < 1e-12, 'booked to the ability ledger');
  assert.ok(battle.fighters[0].stats.dashes === 1);
});

test('a solid hit while coiling cancels the dash; a light one does not', () => {
  const T = TECHNIQUE_DEFS.dash;
  const { battle, A, B } = duel();
  let interrupted = 0;
  battle.on('dashInterrupted', () => interrupted++);
  A.ability.technique('dash', { opponent: B, steer: new Vec3(1, 0, 0) });
  A.ability.onImpact({ impulse: T.interruptJ * 0.5 }, B.ability, true);
  assert.ok(A.ability.windup, 'a light hit does not interrupt');
  A.ability.onImpact({ impulse: T.interruptJ }, B.ability, false);
  assert.ok(A.ability.windup, 'its own strike does not interrupt');
  A.ability.onImpact({ impulse: T.interruptJ }, B.ability, true);
  assert.equal(A.ability.windup, null);
  assert.equal(interrupted, 1);
  assert.equal(A.ability.cool.dash, T.interruptCool);
  assert.ok(!A.mods.timed.some((t) => t.id === 'dashWindup'), 'the windup slow is lifted');
});

// A human striker who dashes at the AI whenever it is in range.
function dasher(seed, arch, difficulty) {
  const b = new Battle({ arenaId: 'standard', format: 'single', seed, roundTime: 40, rules: { slowmo: false },
    participants: [{ ...participantFromDef(ARCHETYPE_INDEX.striker, { id: 'p' }), human: true, name: 'P' }, participantFromDef(ARCHETYPE_INDEX[arch], { id: 'ai', difficulty })] });
  b.headless = true;
  let gos = 0, counters = 0;
  b.on('technique', (e) => { if (e.name === 'dash' && e.phase === 'go' && e.fighter.index === 0) gos++; });
  b.on('counter', (e) => { if (e.fighter.index === 1) counters++; });
  const c = emptyControls();
  let guard = 0;
  while (b.phase !== 'matchOver' && guard++ < 30000) {
    if (b.phase === 'setup') b.confirmSetup(0);
    if (b.phase === 'countdown' && !b.fighters[0].launch.released) { b.chargeInput(0, true, 1); if (b.fighters[0].launch.meter.charge >= 0.92) b.release(0); }
    const [P, A] = b.fighters;
    c.dash = false;
    if (b.phase === 'battle' && P.top && A.top) {
      const dx = A.top.p.x - P.top.p.x, dz = A.top.p.z - P.top.p.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) c.steer.set(dx / d, 0, dz / d);
      c.dash = d < 0.12 && P.ability.cool.dash <= 0;
    }
    b.update(1 / 60, [c]);
    if (b.phase === 'roundOver') b.nextRound();
  }
  return { gos, counters };
}

test('the AI reads dash windups: a skilled counter AI stops many, an easier one fewer', () => {
  const total = (arch, d) => [1, 2, 3, 4, 5, 6].map((s) => dasher(s, arch, d)).reduce((a, r) => ({ gos: a.gos + r.gos, counters: a.counters + r.counters }), { gos: 0, counters: 0 });
  const hard = total('counter', 1.3), easy = total('counter', 0.8);
  assert.ok(hard.gos >= 15 && easy.gos >= 15, `enough dashes: ${hard.gos}, ${easy.gos}`);
  const rh = hard.counters / hard.gos, re = easy.counters / easy.gos;
  // (S5: the counter AI now also attacks openings, so it waits to be struck less often)
  assert.ok(rh >= 0.18, `difficulty 1.3 counters ${(rh * 100).toFixed(0)}% of dashes`);
  assert.ok(rh > re, `harder reads better (${(rh * 100).toFixed(0)}% vs ${(re * 100).toFixed(0)}%)`);
  assert.ok(rh <= 0.75, 'a dash is still worth trying');
});
