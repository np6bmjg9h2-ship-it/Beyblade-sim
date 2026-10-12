// Property-based physics checks (fast-check): invariants that must hold for
// any legal top in any stadium with any sensible launch, not only for the
// hand-picked cases in physics.test.js. Builds are real loot: generated
// items (tolerances, physical traits) and procedurally generated prototype
// parts. On failure fast-check prints the shrunk counterexample and its seed.
// FC_RUNS=<n> raises the number of runs for a deep check.

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { Vec3 } from '../src/core/math.js';
import { TopBody } from '../src/physics/topBody.js';
import { Simulation } from '../src/physics/simulation.js';
import { Arena } from '../src/physics/arena.js';
import { ARENAS } from '../src/data/arenas.js';
import { assembleTop } from '../src/systems/assembly.js';
import { buildArb, runs } from './arbitraries.js';

const launchArb = fc.record({
  r: fc.double({ min: 0.02, max: 0.7, noNaN: true }), // fraction of the stadium radius
  angle: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
  spin: fc.double({ min: 280, max: 950, noNaN: true }), // rad/s (about 2,700-9,000 rpm)
  tilt: fc.double({ min: 0, max: 0.3, noNaN: true }),
  speed: fc.double({ min: 0, max: 2.2, noNaN: true }), // m/s toward the other top
  aimOff: fc.double({ min: -0.6, max: 0.6, noNaN: true }), // rad off the line between them
});

function launch(top, arena, l, other, spinDir) {
  const R = arena.radius * l.r;
  const x = Math.cos(l.angle) * R, z = Math.sin(l.angle) * R;
  const dx = other.x - x, dz = other.z - z;
  const a = Math.atan2(dz, dx) + l.aimOff;
  const sign = spinDir === 'L' ? 1 : -1;
  top.launch({
    tipPos: new Vec3(x, arena.heightAtR(Math.hypot(x, z)), z),
    axis: new Vec3(Math.sin(l.tilt) * Math.cos(l.angle), Math.cos(l.tilt), Math.sin(l.tilt) * Math.sin(l.angle)),
    spin: sign * l.spin, velocity: new Vec3(Math.cos(a) * l.speed, 0, Math.sin(a) * l.speed),
  });
  return { x, z };
}

test('any two legal tops: collisions never create energy, energy is accounted for, state stays finite', () => {
  fc.assert(fc.property(buildArb, buildArb, launchArb, launchArb, fc.nat({ max: ARENAS.length - 1 }), (A, B, la, lb, ai) => {
    const arena = new Arena(ARENAS[ai]);
    const ta = new TopBody(assembleTop(A.build, { spin: A.spin }).spec, { id: 'A', side: 0 });
    const tb = new TopBody(assembleTop(B.build, { spin: B.spin }).spec, { id: 'B', side: 1 });
    const sim = new Simulation({ arena, tops: [ta, tb] });
    // B goes on the far side of the stadium from A
    const pa = { x: Math.cos(la.angle) * arena.radius * la.r, z: Math.sin(la.angle) * arena.radius * la.r };
    const lbOpp = { ...lb, angle: la.angle + Math.PI + (lb.angle - Math.PI) * 0.3 };
    const pb = launch(tb, arena, lbOpp, pa, B.spin);
    launch(ta, arena, la, pb, A.spin);
    const E0 = ta.totalEnergy() + tb.totalEnergy();
    let worstGain = -Infinity, contacts = 0;
    for (let i = 0; i < 90 && (ta.active || tb.active); i++) {
      const c0 = ta.ledger.collision + tb.ledger.collision;
      sim.tick();
      worstGain = Math.max(worstGain, ta.ledger.collision + tb.ledger.collision - c0);
      contacts += sim.events.filter((e) => e.type === 'impact' || e.type === 'grind').length;
    }
    assert.ok(ta.isFiniteState() && tb.isFiniteState(), 'state finite');
    assert.equal(sim.instabilityRecoveries, 0, 'no instability recoveries');
    assert.ok(ta.spinAbs < 1600 && tb.spinAbs < 1600, 'spin bounded');
    assert.ok(worstGain <= 1e-9, `a tick's collisions added ${worstGain.toExponential(2)} J (${contacts} contacts)`);
    // Integration (tip projection, centre-of-mass height as tops tilt) books
    // into the numerical residual. Over 3,000 random cases it was 0.005% of the
    // pair's energy at the median, 0.6% at the 99.9th percentile; rare
    // degenerate starts (minimum spin, tops already touching in a bowl) reach
    // about 1%. An accounting bug shows up far above 2%.
    const drift = Math.abs(ta.ledger.numerical) + Math.abs(tb.ledger.numerical);
    assert.ok(drift < 0.02 * E0, `unexplained energy ${drift.toExponential(2)} J of ${E0.toFixed(3)} J`);
  }), { numRuns: runs(300) });
});

test('any legal top: identical inputs give an identical simulation', () => {
  fc.assert(fc.property(buildArb, launchArb, fc.nat({ max: ARENAS.length - 1 }), (A, l, ai) => {
    const once = () => {
      const arena = new Arena(ARENAS[ai]);
      const top = new TopBody(assembleTop(A.build, { spin: A.spin }).spec, { id: 'A' });
      const sim = new Simulation({ arena, tops: [top] });
      launch(top, arena, l, { x: 0, z: 0 }, A.spin);
      for (let i = 0; i < 120 && top.active; i++) sim.tick();
      return [...top.p.toArray(), ...top.L.toArray(), top.spinRate, sim.tickCount, top.state];
    };
    assert.deepEqual(once(), once());
  }), { numRuns: runs(60) });
});
