// Physics validation: conservation laws, gyroscopic dynamics against theory,
// stability threshold, collisions, tunnelling, energy ledger closure,
// determinism and measurable effects of part changes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/core/math.js';
import { TopBody, GRAVITY } from '../src/physics/topBody.js';
import { Simulation, TICK, LEDGER_KEYS } from '../src/physics/simulation.js';
import { Arena } from '../src/physics/arena.js';
import { ARENA_INDEX, ARENAS } from '../src/data/arenas.js';
import { flatArena, simpleSpec, spinUp, runUntil, specFromParts, BUILDS } from './helpers.js';

test('torque-free rotation conserves angular momentum and kinetic energy', () => {
  const top = new TopBody(simpleSpec(), { id: 'free' });
  // tilted spin plus a transverse kick: free nutation
  top.launch({ tipPos: new Vec3(0, 1, 0), axis: new Vec3(0.2, 1, 0), spin: 500, velocity: new Vec3(), precessionKick: new Vec3(0, 0, 2e-4) });
  const L0 = top.L.clone(), E0 = top.rotationalEnergy();
  const a0 = top.a.clone();
  const dt = TICK / 16;
  let maxConeDev = 0;
  const coneAngle = Math.acos(a0.dot(L0) / L0.length());
  for (let i = 0; i < 20000; i++) {
    top.integrateOrientation(dt);
    const ang = Math.acos(Math.min(1, top.a.dot(L0) / L0.length()));
    maxConeDev = Math.max(maxConeDev, Math.abs(ang - coneAngle));
  }
  assert.ok(top.L.clone().sub(L0).length() < 1e-15, 'L unchanged');
  assert.ok(Math.abs(top.rotationalEnergy() - E0) / E0 < 1e-9, 'rotational energy conserved');
  // the symmetry axis cones around L at a constant angle (free nutation)
  assert.ok(maxConeDev < 1e-6, `nutation cone angle drift ${maxConeDev}`);
  assert.notDeepEqual(top.a.toArray().map((x) => x.toFixed(3)), a0.toArray().map((x) => x.toFixed(3)), 'axis actually moved');
});

test('gyroscopic precession rate matches m g h / (I3 w3)', () => {
  // frictionless sharp tip on a flat floor, tilted 10 degrees, high spin
  const spec = simpleSpec({ tip: { endZ: -0.016, ballRadius: 0.0002, flatRadius: 0, mu: 0, patchRadius: 0, compliance: 0.12 }, aero: 0 });
  const { top, sim } = spinUp(spec, { tilt: 10 * Math.PI / 180, spin: 400 });
  // let initial nutation settle, then measure azimuth of the axis
  for (let i = 0; i < 60; i++) sim.tick();
  const az = () => Math.atan2(top.a.z, top.a.x);
  let prev = az(), total = 0;
  const t0 = sim.time;
  for (let i = 0; i < 240; i++) {
    sim.tick();
    let d = az() - prev;
    if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
    total += d; prev = az();
  }
  const measured = Math.abs(total / (sim.time - t0));
  const h = -spec.tip.endZ;
  const w3 = Math.abs(top.spinRate);
  const theory = (spec.mass * GRAVITY * h) / (spec.I3 * w3);
  const rel = Math.abs(measured - theory) / theory;
  assert.ok(rel < 0.12, `precession ${measured.toFixed(3)} rad/s vs theory ${theory.toFixed(3)} (rel err ${rel.toFixed(3)})`);
});

test('stability threshold: above critical spin the top sleeps, below it falls', () => {
  const spec = simpleSpec({ aero: 0, tip: { endZ: -0.016, ballRadius: 0.0003, flatRadius: 0, mu: 0.3, patchRadius: 0, compliance: 0.12 } });
  const h = -spec.tip.endZ;
  const Ip = spec.I1 + spec.mass * h * h;
  const wCrit = Math.sqrt((4 * Ip * spec.mass * GRAVITY * h) / (spec.I3 * spec.I3));
  const above = spinUp(spec, { tilt: 0.08, spin: -wCrit * 2.2 });
  runUntil(above.sim, () => false, 4);
  assert.ok(above.top.active && above.top.tilt < 0.3, `top at 2.2x critical spin stays up (tilt ${above.top.tilt.toFixed(3)})`);
  const below = spinUp(spec, { tilt: 0.08, spin: -wCrit * 0.5 });
  const fell = runUntil(below.sim, () => !below.top.active || below.top.tilt > 0.9, 4);
  assert.ok(Number.isFinite(fell), 'top at 0.5x critical spin topples');
});

test('spin decays from tip friction and air drag; ledger accounts for every joule', () => {
  const spec = specFromParts(BUILDS.balance);
  const { top, sim } = spinUp(spec, { arena: new Arena(ARENA_INDEX.standard), at: [0.05, 0, 0], tilt: 0.05, spin: -650, v: [0, 0, 0.2] });
  const E0 = top.totalEnergy();
  runUntil(sim, () => false, 10);
  const E1 = top.totalEnergy();
  const ledger = LEDGER_KEYS.reduce((s, k) => s + top.ledger[k], 0);
  assert.ok(Math.abs(E1 - E0 - ledger) < 1e-6, `energy change ${(E1 - E0).toFixed(6)} vs ledger ${ledger.toFixed(6)}`);
  assert.ok(Math.abs(top.ledger.numerical) < 0.005 * E0, `numerical drift ${top.ledger.numerical.toExponential(2)} J`);
  assert.ok(top.ledger.tipFriction < 0 && top.ledger.drag < 0, 'friction and drag remove energy');
  assert.ok(top.spinAbs < 650, 'spin decayed');
});

test('top/top collision conserves linear momentum and never creates energy', () => {
  // frictionless tips and no air drag: horizontal momentum can only change through the collision
  const arena = flatArena();
  const tip = { endZ: -0.016, ballRadius: 0.0005, flatRadius: 0, mu: 0, patchRadius: 0, compliance: 0.12, restitution: 1 };
  const A = new TopBody(simpleSpec({ tip, linDrag: 0, aero: 0 }), { id: 'A' });
  const B = new TopBody(simpleSpec({ tip, linDrag: 0, aero: 0, mass: 0.06 }), { id: 'B' });
  const sim = new Simulation({ arena, tops: [A, B] });
  A.launch({ tipPos: new Vec3(-0.04, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(1.2, 0, 0) });
  B.launch({ tipPos: new Vec3(0.04, 0, 0.003), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(-0.6, 0, 0) });
  const px = () => A.v.x * A.mass + B.v.x * B.mass;
  const pz = () => A.v.z * A.mass + B.v.z * B.mass;
  // measure across each tick containing top/top contact (before body scraping can start)
  let impacts = 0, maxErr = 0;
  for (let i = 0; i < 120; i++) {
    const p0 = [px(), pz()];
    sim.tick();
    const contact = sim.events.some((e) => e.type === 'impact' || e.type === 'grind');
    if (contact && !A.scraping && !B.scraping) { maxErr = Math.max(maxErr, Math.abs(px() - p0[0]), Math.abs(pz() - p0[1])); }
    impacts += sim.events.filter((e) => e.type === 'impact').length;
  }
  assert.ok(impacts > 0, 'tops collided');
  assert.ok(maxErr < 1e-6, `horizontal momentum conserved through contact ticks (max error ${maxErr.toExponential(2)})`);
  assert.ok(A.ledger.collision + B.ledger.collision <= 1e-9, 'collisions never add energy to the pair');
  // velocities actually changed direction (they bounced)
  assert.ok(A.v.x < 1.2 && B.v.x > -0.6);
});

test('same-spin contacts repel and drain spin; opposite-spin contacts equalise spin', () => {
  const run = (spinB) => {
    const arena = new Arena(ARENA_INDEX.standard);
    const A = new TopBody(simpleSpec(), { id: 'A' });
    const B = new TopBody(simpleSpec(), { id: 'B' });
    const sim = new Simulation({ arena, tops: [A, B] });
    A.launch({ tipPos: new Vec3(-0.035, arena.heightAtR(0.035), 0), axis: new Vec3(0, 1, 0), spin: -700, velocity: new Vec3(0.5, 0, 0) });
    B.launch({ tipPos: new Vec3(0.035, arena.heightAtR(0.035), 0), axis: new Vec3(0, 1, 0), spin: spinB, velocity: new Vec3(-0.5, 0, 0) });
    const e0 = [A.spinAbs, B.spinAbs];
    runUntil(sim, () => false, 0.4);
    return { dA: e0[0] - A.spinAbs, dB: e0[1] - B.spinAbs, A, B, sim };
  };
  const same = run(-400);
  const opp = run(400);
  // the faster top loses more spin against a same-spin opponent (grinding)
  assert.ok(same.dA > 0 && same.dB > 0, 'both lose spin in same-spin contact');
  // opposite spin: co-moving surfaces, the slower top is dragged up toward the faster
  assert.ok(opp.B.spinAbs > same.B.spinAbs, `opposite-spin slower top keeps more spin (${opp.B.spinAbs.toFixed(0)} vs ${same.B.spinAbs.toFixed(0)})`);
});

test('fast tops never tunnel through the stadium wall', () => {
  const arena = new Arena({ ...ARENA_INDEX.vortex });
  for (const speed of [3, 6, 9]) {
    const { top, sim } = spinUp(simpleSpec(), { arena, at: [0, 0, 0], tilt: 0, spin: -700, v: [speed, 0, 0.2] });
    let maxR = 0, exitY = null;
    for (let i = 0; i < 240; i++) {
      sim.tick();
      // the lowest point of the ring band must be above the rim to be outside the wall line
      const ringLow = top.p.y + top.spec.layers[0].z - top.spec.layers[0].thickness;
      if (top.active && ringLow < arena.rimY) maxR = Math.max(maxR, Math.hypot(top.p.x, top.p.z));
      else if (!top.active && exitY == null) exitY = top.p.y;
    }
    // below the rim the COM never passes the wall line (radius minus the top's reach, plus slop)
    assert.ok(maxR < arena.radius - top.spec.radius + 0.004, `speed ${speed}: max COM radius ${maxR.toFixed(4)}`);
    // a top can only leave this closed bowl by flying over the rim
    if (top.state === 'out') assert.ok(exitY > arena.rimY, `exit height ${exitY.toFixed(3)} above rim ${arena.rimY.toFixed(3)}`);
  }
});

test('low walls and exit lips stop the lower body; fast tops ride over a low lip', () => {
  // flat floor, a low 8 mm wall and one exit with a 2 mm lip at +x
  const def = { id: 'lip', name: 'lip', radius: 0.2, profile: [[0, 0], [0.2, 0]], surface: { friction: 1, tag: 'standard' }, bands: [],
    wall: { height: 0.008, restitution: 0.4, friction: 0.2, openings: [{ angle: 0, width: 40, lipHeight: 0.002 }] } };
  const spec = specFromParts(BUILDS.defense);
  const run = (dirAng, speed) => {
    const arena = new Arena(def);
    const v = [Math.cos(dirAng) * speed, 0, Math.sin(dirAng) * speed];
    const { top, sim } = spinUp(spec, { arena, at: [Math.cos(dirAng) * 0.12, 0, Math.sin(dirAng) * 0.12], spin: -600, v });
    runUntil(sim, () => !top.active, 2);
    return top;
  };
  // the ring passes above an 8 mm wall, but the tip body must not slide through it
  assert.equal(run(Math.PI / 2, 0.6).state, 'spinning', 'low wall holds');
  // the 2 mm exit lip: slow tops are stopped, fast tops hop over (1/2 v^2 > g h)
  assert.equal(run(0, 0.12).state, 'spinning', 'slow top stopped by the lip');
  assert.equal(run(0, 0.9).state, 'out', 'fast top rides over the lip');
});

test('random extreme launches stay numerically stable', () => {
  let recoveries = 0;
  for (let i = 0; i < 25; i++) {
    const arena = new Arena(ARENAS[i % ARENAS.length]);
    const spec = specFromParts(Object.values(BUILDS)[i % 4]);
    const { top, sim } = spinUp(spec, { arena, at: [Math.sin(i) * 0.08, 0, Math.cos(i) * 0.08], tilt: (i % 7) * 0.07, spin: -(300 + i * 40), v: [Math.cos(i * 3) * 2, 0, Math.sin(i * 3) * 2] });
    runUntil(sim, () => !top.active, 20);
    recoveries += sim.instabilityRecoveries;
    assert.ok(top.isFiniteState(), `state finite in run ${i}`);
    assert.ok(top.spinAbs < 1600, 'spin bounded');
  }
  assert.equal(recoveries, 0, 'no instability recoveries were needed');
});

test('simulation is deterministic for identical inputs', () => {
  const runOnce = () => {
    const spec = specFromParts(BUILDS.attack);
    const { top, sim } = spinUp(spec, { arena: new Arena(ARENA_INDEX.standard), at: [0.06, 0, 0.01], tilt: 0.15, spin: -640, v: [-0.4, 0, 0.6] });
    runUntil(sim, () => false, 6);
    return [...top.p.toArray(), ...top.L.toArray(), sim.tickCount];
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('part changes produce measurable, explainable physical differences', () => {
  const base = specFromParts(BUILDS.balance);
  const heavy = specFromParts({ ...BUILDS.balance, disc: 'disc_heavyring' });
  // heavier, rim-weighted disc -> more spin inertia -> less spin from the same launch energy
  assert.ok(heavy.I3 > base.I3 * 1.15, 'heavy ring disc raises I3');
  const E = 2.6;
  assert.ok(Math.sqrt(2 * E / heavy.I3) < Math.sqrt(2 * E / base.I3), 'same energy launches it slower');
  // tip comparison on the standard stadium: sharp tip spins far longer, flat tip travels far more
  const tipRun = (tip) => {
    const spec = specFromParts({ ...BUILDS.balance, tip });
    const { top, sim } = spinUp(spec, { arena: new Arena(ARENA_INDEX.standard), at: [0.06, 0, 0], tilt: 0.08, spin: -Math.sqrt(2 * E / spec.I3), v: [0, 0, 0.3] });
    const t = runUntil(sim, () => !top.active, 300);
    return { t, dist: top.telemetry.distance, perSec: top.telemetry.distance / Math.min(t, 300) };
  };
  const sharp = tipRun('tip_needle');
  const flat = tipRun('tip_flatstrike');
  // (balance pass: the flat tip drains less than it used to, but a needle still lasts far longer)
  assert.ok(sharp.t > flat.t * 1.6, `needle outlasts flat (${sharp.t.toFixed(1)} s vs ${flat.t.toFixed(1)} s)`);
  assert.ok(flat.perSec > sharp.perSec * 3, `flat tip moves more (${flat.perSec.toFixed(2)} vs ${sharp.perSec.toFixed(2)} m/s)`);
  // offset core moves the centre of mass off the axis
  const offset = specFromParts({ ...BUILDS.balance, core: 'core_lunar' });
  assert.ok(Math.abs(offset.eccentricity) > 1e-5 && Math.abs(base.eccentricity) < 1e-6, 'offset core creates eccentricity');
  // apex frame lowers the centre of mass
  const apex = specFromParts({ ring: 'ring_tidalhalo', core: 'core_apex', disc: 'disc_compact', lock: 'lock_click3', tip: 'tip_needle' });
  const helix = specFromParts({ ring: 'ring_tidalhalo', core: 'core_helix', disc: 'disc_compact', lock: 'lock_click3', tip: 'tip_needle' });
  assert.ok(apex.comHeight < helix.comHeight, 'apex frame has a lower COM');
});

test('every arena profile is monotone, finite and has sensible walls', () => {
  for (const def of ARENAS) {
    const a = new Arena(def);
    let prev = -1;
    for (let r = 0; r <= def.radius; r += def.radius / 100) {
      const y = a.heightAtR(r);
      assert.ok(Number.isFinite(y));
      if (def.id !== 'magma') assert.ok(y >= prev - 1e-9, `${def.id} profile monotone at r=${r}`);
      prev = y;
      const n = new Vec3();
      a.height(r, 0, n);
      assert.ok(Math.abs(n.length() - 1) < 1e-9 && n.y > 0.5, 'unit upward normal');
    }
    assert.ok(a.rimY > a.edgeHeight, `${def.id} wall above floor edge`);
  }
});

// Frictionless tips and no drag isolate what the collision itself does.
const FREE_TIP = { endZ: -0.016, ballRadius: 0.0005, flatRadius: 0, mu: 0, patchRadius: 0, compliance: 0.12, restitution: 1 };

// A strikes a resting B; offsetZ moves B off the line of travel.
function strike(offsetZ, speed = 1) {
  const A = new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0 }), { id: 'A' });
  const B = new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0 }), { id: 'B' });
  const sim = new Simulation({ arena: flatArena(), tops: [A, B] });
  A.launch({ tipPos: new Vec3(-0.06, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(speed, 0, 0) });
  B.launch({ tipPos: new Vec3(0, 0, offsetZ), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
  let impulse = 0, maxTiltB = 0;
  for (let i = 0; i < 60; i++) {
    sim.tick();
    for (const e of sim.events) if (e.type === 'impact' || e.type === 'grind') impulse += e.impulse;
    maxTiltB = Math.max(maxTiltB, B.tilt);
  }
  return { A, B, impulse, maxTiltB, deflection: Math.atan2(B.v.z, B.v.x) };
}

test('head-on and glancing collisions produce different outcomes', () => {
  const head = strike(0);
  const left = strike(0.04);
  const right = strike(-0.04);
  // head-on: B is driven straight ahead and takes most of A's momentum
  assert.ok(Math.abs(head.deflection) < 0.1, `head-on deflection ${(head.deflection * 57.3).toFixed(1)}°`);
  assert.ok(head.B.v.x > head.A.v.x, 'struck top leaves faster than the striker');
  // glancing: B is pushed sideways, away from the side it was struck on; A keeps most of its speed
  assert.ok(left.deflection > 0.5 && right.deflection < -0.5, `glancing deflections ${(left.deflection * 57.3).toFixed(0)}° / ${(right.deflection * 57.3).toFixed(0)}°`);
  assert.ok(left.A.v.x > head.A.v.x * 1.5, 'striker keeps more forward speed on a glancing hit');
  assert.ok(left.impulse < head.impulse * 0.8, `glancing impulse ${left.impulse.toFixed(4)} < head-on ${head.impulse.toFixed(4)} N·s`);
  for (const r of [head, left, right]) assert.ok(r.A.ledger.collision + r.B.ledger.collision < 0, 'every collision dissipates energy');
});

test('harder impacts tilt the struck top further (destabilisation scales with the hit)', () => {
  const tilts = [0.5, 1, 2, 3].map((s) => strike(0, s).maxTiltB);
  for (let i = 1; i < tilts.length; i++) assert.ok(tilts[i] > tilts[i - 1], `tilt grows with speed: ${tilts.map((t) => (t * 57.3).toFixed(2)).join(', ')}°`);
  assert.ok(tilts[3] > 3 * tilts[0], 'a 3 m/s hit tilts far more than a 0.5 m/s hit');
});

test('wall rebounds lose energy and follow the wall restitution', () => {
  const rebound = (e) => {
    const arena = flatArena({ radius: 0.2, wall: { height: 0.05, restitution: e, friction: 0.2, openings: [] } });
    const top = new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0 }), { id: 'W' });
    const sim = new Simulation({ arena, tops: [top] });
    top.launch({ tipPos: new Vec3(0.12, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(1, 0, 0) });
    let hits = 0;
    const t = runUntil(sim, () => { hits += sim.events.filter((ev) => ev.type === 'wall').length; return top.v.x < 0 && !sim.events.length; }, 1);
    return { top, hits, t };
  };
  const soft = rebound(0.2), hard = rebound(0.8);
  for (const r of [soft, hard]) {
    assert.ok(Number.isFinite(r.t) && r.hits >= 1, 'top hit the wall and came back');
    assert.ok(-r.top.v.x < 1, 'rebound slower than the approach');
    assert.ok(r.top.ledger.wall < 0, 'wall contact removes energy');
  }
  assert.ok(-hard.top.v.x > 2 * -soft.top.v.x, `bouncier wall rebounds faster (${(-hard.top.v.x).toFixed(3)} vs ${(-soft.top.v.x).toFixed(3)} m/s)`);
});

test('repeated collisions in a stadium never create energy and stay stable', () => {
  // a closed bowl (no exits) keeps a heavy defense and a stamina top meeting again and again
  const arena = new Arena(ARENA_INDEX.vortex);
  const A = new TopBody(specFromParts(BUILDS.defense), { id: 'A' });
  const B = new TopBody(specFromParts(BUILDS.stamina), { id: 'B' });
  const sim = new Simulation({ arena, tops: [A, B] });
  A.launch({ tipPos: new Vec3(-0.06, arena.heightAtR(0.06), 0), axis: new Vec3(0, 1, 0), spin: -700, velocity: new Vec3(1.2, 0, 0.05) });
  B.launch({ tipPos: new Vec3(0.06, arena.heightAtR(0.06), 0.004), axis: new Vec3(0, 1, 0), spin: -650, velocity: new Vec3(-0.8, 0, 0) });
  let impacts = 0, worstGain = -Infinity, k = 0;
  while (sim.time < 10 && A.active && B.active) {
    // every half second, send them at each other again (like two players steering in)
    if (++k % 60 === 0) {
      const dx = B.p.x - A.p.x, dz = B.p.z - A.p.z, d = Math.hypot(dx, dz) || 1;
      if (d > 0.06) { A.v.x += (dx / d) * 0.8; A.v.z += (dz / d) * 0.8; B.v.x -= (dx / d) * 0.6; B.v.z -= (dz / d) * 0.6; }
    }
    const c0 = A.ledger.collision + B.ledger.collision;
    sim.tick();
    worstGain = Math.max(worstGain, A.ledger.collision + B.ledger.collision - c0);
    impacts += sim.events.filter((e) => e.type === 'impact').length;
  }
  assert.ok(impacts >= 8, `tops collided repeatedly (${impacts} impacts)`);
  assert.ok(worstGain <= 1e-9, `no tick's collisions added energy (worst ${worstGain.toExponential(2)} J)`);
  assert.equal(sim.instabilityRecoveries, 0);
  assert.ok(A.isFiniteState() && B.isFiniteState());
});

test('energy removed by the safety limits is booked to the clamp ledger', () => {
  const { top, sim } = spinUp(simpleSpec(), { spin: -2000 }); // above the 1600 rad/s safety limit
  const E0 = top.totalEnergy();
  runUntil(sim, () => false, 0.5);
  const ledger = LEDGER_KEYS.reduce((s, k) => s + top.ledger[k], 0);
  assert.ok(top.spinAbs <= 1600 + 1e-6, 'spin clamped');
  assert.ok(top.ledger.clamp < -1, `clamp removed ${(-top.ledger.clamp).toFixed(2)} J`);
  assert.ok(Math.abs(top.totalEnergy() - E0 - ledger) < 1e-6, 'ledger still closes');
  assert.ok(Math.abs(top.ledger.numerical) < 1e-6, 'nothing hidden in the numerical residual');
});
