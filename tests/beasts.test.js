// Spirit Chips: every ability has a defined, measurable effect in the real
// simulation, and different beasts produce different combat strategies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/game/battle.js';
import { BEASTS, BEAST_INDEX } from '../src/data/beasts.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { Vec3 } from '../src/core/math.js';
import { newProfile } from '../src/systems/profile.js';
import { trialStatus, recruitBeast, awakeningStatus, awakenBeast, trialOpponent } from '../src/systems/beasts.js';

function arena2(beastId, { awakened = true, seed = 7 } = {}) {
  const a = participantFromDef({ ...ARCHETYPE_INDEX.all, beast: beastId }, { id: 'A', bondLevel: 8, awakened, ai: 'dummy' });
  const b = participantFromDef({ ...ARCHETYPE_INDEX.wall, beast: null }, { id: 'B', ai: 'dummy' });
  const battle = new Battle({ arenaId: 'standard', format: 'single', seed, participants: [a, b], rules: { slowmo: false } });
  battle.headless = true;
  while (battle.phase !== 'battle') { battle.update(1 / 60, []); if (battle.phase === 'setup') { battle.confirmSetup(0); battle.confirmSetup(1); } }
  // place them close together, upright, calm
  const [A, B] = battle.fighters;
  A.top.p.set(-0.035, A.top.p.y, 0); B.top.p.set(0.035, B.top.p.y, 0);
  A.top.v.set(0, 0, 0); B.top.v.set(0, 0, 0);
  A.ability.spirit = 100;
  return { battle, A, B };
}

function measure(beastId, slot, ticks = 30) {
  const { battle, A, B } = arena2(beastId);
  const cond = BEAST_INDEX[beastId].abilities[slot]?.condition;
  if (cond?.spinBelow) {
    // Desperation abilities need a low-spin top: bleed spin just under the threshold.
    const target = 0.9 * cond.spinBelow * A.top.maxSpinRate;
    A.top.drainSpinEnergy(A.top.spinEnergy() - 0.5 * A.top.I3 * target * target);
  }
  if (BEAST_INDEX[beastId].abilities[slot]?.ops.some((o) => o.op === 'restore' && o.channel > 0)) {
    // Channels are cancelled by collisions (tested separately): keep the opponent away.
    B.top.p.set(0.2, B.top.p.y, 0);
  }
  const before = { vA: A.top.v.clone(), vB: B.top.v.clone(), eA: A.top.spinEnergy(), mods: { ...A.top.mods } };
  const r = A.ability.activate(slot, { opponent: B, steer: new Vec3(0, 0, 0) });
  assert.ok(r.ok, `${beastId} ${slot} activates: ${r.reason}`);
  const afterNow = { vA: A.top.v.clone(), vB: B.top.v.clone(), stressMul: A.top.nextHitStressMul };
  let maxLift = 0, maxForce = 0, counterArmed = !!A.ability.counter;
  const modsSeen = {};
  for (let i = 0; i < ticks; i++) {
    battle.tick([]);
    maxLift = Math.max(maxLift, A.top.mods.liftForce);
    maxForce = Math.max(maxForce, A.top.extForce?.length() || 0);
    for (const [k, v] of Object.entries(A.top.mods)) if (v !== before.mods[k]) modsSeen[k] = v;
  }
  const restored = A.top.ledger.ability;
  return { before, afterNow, maxLift, maxForce, modsSeen, counterArmed, restored, A, B };
}

test('every Spirit Chip ability produces its defined physical effect', () => {
  for (const b of BEASTS) {
    for (const slot of ['signature', 'secondary', 'ultimate']) {
      const d = b.abilities[slot];
      if (!d) continue;
      const m = measure(b.id, slot, d.ops.some((o) => o.op === 'restore' && o.channel > 0) ? 160 : 40);
      for (const op of d.ops) {
        switch (op.op) {
          case 'dash': {
            const dv = m.afterNow.vA.clone().sub(m.before.vA).length();
            assert.ok(dv > 0.3, `${b.id}.${slot} dash changes velocity (${dv.toFixed(2)})`);
            break;
          }
          case 'shockwave': {
            const dv = m.afterNow.vB.clone().sub(m.before.vB).length();
            assert.ok(dv > 0.2, `${b.id}.${slot} shockwave pushes the opponent (${dv.toFixed(2)})`);
            break;
          }
          case 'mods':
            for (const [ch] of op.deltas) assert.ok(ch in m.modsSeen, `${b.id}.${slot} changes ${ch}`);
            break;
          case 'lift': assert.ok(m.maxLift > 0.1, `${b.id}.${slot} lift`); break;
          case 'force': assert.ok(m.maxForce > 0, `${b.id}.${slot} sustained force`); break;
          case 'restore': assert.ok(m.restored > 0.05, `${b.id}.${slot} restores spin energy (${m.restored.toFixed(3)} J)`); break;
          case 'counter': assert.ok(m.counterArmed && m.afterNow.stressMul > 1, `${b.id}.${slot} arms a counter`); break;
          case 'nextHit': assert.ok(m.afterNow.stressMul > 1, `${b.id}.${slot} arms the next hit`); break;
          default: assert.fail('unknown op ' + op.op);
        }
      }
    }
  }
});

test('abilities obey cost, cooldown, bond and awakening gates', () => {
  const { A, B } = arena2('magmarion', { awakened: false });
  A.ability.spirit = 10;
  assert.equal(A.ability.activate('signature', { opponent: B }).ok, false, 'needs spirit');
  A.ability.spirit = 100;
  assert.equal(A.ability.activate('signature', { opponent: B }).ok, true);
  A.ability.spirit = 100;
  assert.equal(A.ability.activate('signature', { opponent: B }).ok, false, 'cooldown');
  assert.equal(A.ability.activate('ultimate', { opponent: B }).ok, false, 'ultimate needs awakening');
  const restore = arena2('orrery');
  restore.A.ability.spirit = 100;
  assert.equal(restore.A.ability.activate('ultimate', { opponent: restore.B }).ok, false, 'Last Spin only below 25% spin');
});

test('channelled abilities are interrupted by collisions (counterplay)', () => {
  const { battle, A, B } = arena2('pyrrhex');
  A.ability.activate('signature', { opponent: B });
  assert.ok(A.ability.channel, 'channelling');
  // drive B into A
  B.top.v.set(-1.2, 0, 0);
  for (let i = 0; i < 30 && A.ability.channel; i++) battle.tick([]);
  assert.equal(A.ability.channel, null, 'channel cancelled by the hit');
  assert.ok(A.top.ledger.ability < 0.05, 'no spin restored after interruption');
});

test('different beasts give measurably different passives and resonance', () => {
  const evalMods = (id) => { const { A } = arena2(id); A.mods.evaluate({ spinFrac: 0.6, oppSpinFrac: 0.5, speed: 0.2, rFrac: 0.3, oppRFrac: 0.3, approaching: false, time: 5, sinceCollision: 9, surfaceTag: 'standard', oppositeSpin: false }, A.top.mods); return JSON.stringify(A.top.mods); };
  const seen = new Set(BEASTS.map((b) => evalMods(b.id)));
  assert.ok(seen.size >= 8, `distinct modifier profiles: ${seen.size}`);
});

test('Spirit Trials gate recruitment; awakening requires bond and an achievement', () => {
  const p = newProfile(5);
  assert.equal(trialStatus(p, 'zephyrax').available, false);
  p.player.level = 3;
  assert.equal(trialStatus(p, 'zephyrax').available, true);
  assert.ok(trialOpponent('zephyrax').beast.id === 'zephyrax');
  recruitBeast(p, 'zephyrax');
  assert.ok(p.beasts.zephyrax && trialStatus(p, 'zephyrax').owned);
  let aw = awakeningStatus(p, 'zephyrax');
  assert.equal(aw.eligible, false);
  p.beasts.zephyrax.bondXp = 99999;
  p.beasts.zephyrax.stats.ringOutsWith = 5;
  aw = awakeningStatus(p, 'zephyrax');
  assert.equal(aw.eligible, true);
  awakenBeast(p, 'zephyrax');
  assert.ok(p.beasts.zephyrax.awakened);
});

test('catch-up bonding: recruits start at bond 3 and earn double bond XP until they reach your best chip', async () => {
  const { bondLevel, bondCatchUp, RECRUIT_BOND_LEVEL } = await import('../src/data/beasts.js');
  const { normalizeProfile } = await import('../src/systems/profile.js');
  const p = newProfile(4);
  assert.equal(bondLevel(p.beasts.orrery.bondXp), 1, 'the starter chip still grows from bond 1');
  recruitBeast(p, 'ferrowulf');
  assert.equal(bondLevel(p.beasts.ferrowulf.bondXp), RECRUIT_BOND_LEVEL);
  p.beasts.orrery.bondXp = 2600; // bond 8
  assert.equal(bondCatchUp(p.beasts, 'ferrowulf'), 2);
  assert.equal(bondCatchUp(p.beasts, 'orrery'), 1);
  p.beasts.ferrowulf.bondXp = 2600;
  assert.equal(bondCatchUp(p.beasts, 'ferrowulf'), 1, 'no boost once level with the best chip');
  // older saves: a chip recruited at bond 1 is lifted to the recruit bond on load
  p.beasts.kerauno = { id: 'kerauno', bondXp: 0, awakened: false, stats: {} };
  normalizeProfile(p);
  assert.equal(bondLevel(p.beasts.kerauno.bondXp), RECRUIT_BOND_LEVEL);
});
