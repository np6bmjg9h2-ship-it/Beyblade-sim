// Arena twists: derived stadiums for Rift nodes. Pure data on the base def,
// seeded on their own stream, closed energy books on every derived floor.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENAS, ARENA_INDEX, resolveArena } from '../src/data/arenas.js';
import { TWISTS, TWIST_INDEX, legalTwists, twistText } from '../src/data/arenaTwists.js';
import { RIFT_ACTS } from '../src/data/rift.js';
import { Arena } from '../src/physics/arena.js';
import { LEDGER_KEYS } from '../src/physics/simulation.js';
import { newProfile } from '../src/systems/profile.js';
import { startRun, generateAct } from '../src/systems/rift.js';
import { spinUp, runUntil, specFromParts, BUILDS } from './helpers.js';

const legalPairs = () => ARENAS.flatMap((a) => legalTwists(a.id, 8).map((t) => [a.id, t.id]));

test('a twisted id resolves to a derived def; the base stadium is untouched', () => {
  const before = JSON.stringify(ARENAS);
  const d = resolveArena('vortex+slickring');
  assert.equal(d.id, 'vortex+slickring');
  assert.equal(d.baseId, 'vortex');
  assert.equal(d.twist, 'slickring');
  assert.equal(d.bands.length, ARENA_INDEX.vortex.bands.length + 1);
  assert.equal(resolveArena('vortex+slickring'), d, 'cached');
  const g = resolveArena('standard+glass');
  assert.equal(g.surface.tag, 'ice');
  assert.ok(g.surface.friction < ARENA_INDEX.standard.surface.friction);
  assert.equal(resolveArena('standard'), ARENA_INDEX.standard);
  assert.equal(resolveArena('standard+nope'), undefined);
  assert.equal(JSON.stringify(ARENAS), before);
});

test('slick ring bands never overlap a stadium band they are allowed on', () => {
  for (const [a, t] of legalPairs()) {
    const bands = resolveArena(`${a}+${t}`).bands;
    for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) {
      assert.ok(bands[i].r1 <= bands[j].r0 || bands[j].r1 <= bands[i].r0, `${a}+${t}: bands overlap`);
    }
  }
});

test('every twist describes itself from its numbers', () => {
  for (const t of TWISTS) assert.match(twistText(t.id), /\d/);
});

test('twists are seeded on their own stream: map types, arenas and archetypes match depth 0', () => {
  const strip = (A) => A.floors.flat().map((n) => [n.type, n.arena, n.archetype, n.affixes?.join() || '']).join('|');
  for (const seed of [1, 2, 3]) {
    const p = newProfile(77);
    p.rift = { depthUnlocked: 8 };
    const r0 = startRun(p, { loadoutIndex: 0, depth: 0, seed });
    const r8 = startRun(p, { loadoutIndex: 0, depth: 8, seed });
    for (let a = 0; a < RIFT_ACTS.length; a++) {
      const A0 = generateAct(r0, a), A8 = generateAct(r8, a);
      assert.ok(!A0.floors.flat().some((n) => n.twist), 'depth 0 has no twists');
      // depth 1+ doubles elite weight, so compare depth 8 against itself regenerated
      assert.equal(strip(A8), strip(generateAct(r8, a)));
      assert.equal(JSON.stringify(A8), JSON.stringify(generateAct(r8, a)));
      assert.ok(A0.floors.length === A8.floors.length);
    }
  }
});

test('at depth 8 twists turn up, are legal, and never on the first battle', () => {
  let n = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const p = newProfile(77);
    p.rift = { depthUnlocked: 8 };
    const run = startRun(p, { loadoutIndex: 0, depth: 8, seed });
    for (let a = 0; a < RIFT_ACTS.length; a++) {
      const A = generateAct(run, a);
      A.floors.forEach((fl, f) => fl.forEach((node) => {
        if (!node.twist) return;
        n++;
        assert.ok(!(a === 0 && f === 0), 'never on act 1 floor 1');
        assert.ok(legalTwists(node.arena, 8).some((t) => t.id === node.twist), `${node.arena}+${node.twist} legal`);
      }));
    }
  }
  assert.ok(n > 20, `twists appear (${n})`);
});

test('energy books close on every twisted stadium', () => {
  const spec = specFromParts(BUILDS.balance);
  for (const [a, t] of legalPairs()) {
    const { top, sim } = spinUp(spec, { arena: new Arena(resolveArena(`${a}+${t}`)), at: [0.09, 0, 0], tilt: 0.05, spin: -650, v: [0, 0, 0.25] });
    const E0 = top.totalEnergy();
    runUntil(sim, () => false, 6);
    const ledger = LEDGER_KEYS.reduce((s, k) => s + top.ledger[k], 0);
    assert.ok(Math.abs(top.totalEnergy() - E0 - ledger) < 1e-6, `${a}+${t}: books close`);
    assert.ok(Math.abs(top.ledger.numerical) < 0.005 * E0, `${a}+${t}: numerical drift ${top.ledger.numerical.toExponential(2)} J`);
  }
});

test('twist ids are unique and their exclusions name real stadiums', () => {
  assert.equal(Object.keys(TWIST_INDEX).length, TWISTS.length);
  for (const t of TWISTS) for (const id of t.not) assert.ok(ARENA_INDEX[id], id);
});

test('steep keeps the slope cap, dome raises the centre, thin rim lowers the wall and widens exits', () => {
  const slopeMax = (def) => { const A = new Arena(def); let m = 0; for (let r = 0; r <= def.radius; r += 0.001) m = Math.max(m, A.slopeAtR(r)); return m; };
  for (const a of ARENAS) {
    if (legalTwists(a.id, 8).some((t) => t.id === 'steep')) {
      const d = resolveArena(`${a.id}+steep`);
      assert.ok(slopeMax(d) <= 0.45 + 0.05, `${a.id}+steep slope ${slopeMax(d).toFixed(3)}`);
      assert.ok(new Arena(d).edgeHeight > new Arena(a).edgeHeight, `${a.id}+steep is steeper`);
    }
    if (legalTwists(a.id, 8).some((t) => t.id === 'dome')) {
      const A = new Arena(resolveArena(`${a.id}+dome`));
      assert.ok(A.heightAtR(0) > A.heightAtR(0.06), `${a.id}+dome sheds from the centre`);
    }
    if (legalTwists(a.id, 8).some((t) => t.id === 'thinrim')) {
      const d = resolveArena(`${a.id}+thinrim`);
      assert.ok(d.wall.height < a.wall.height && d.wall.height >= 0.014);
      d.wall.openings.forEach((o, i) => assert.equal(o.width, a.wall.openings[i].width + 8));
    }
  }
  assert.ok(!legalTwists('vortex', 8).some((t) => t.id === 'steep'));
  assert.ok(!legalTwists('standard', 1).some((t) => t.minDepth > 1));
});
