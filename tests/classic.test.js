// Classic series: every part assembles, and every moving part does what its
// card says in the real simulation (magnets, springs, clutches, tip shifts,
// rollers), with the energy books still closing. Plus the classic launchers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/core/math.js';
import { TopBody } from '../src/physics/topBody.js';
import { Simulation, LEDGER_KEYS } from '../src/physics/simulation.js';
import { PARTS, PART_INDEX } from '../src/data/parts.js';
import { LAUNCHERS, LAUNCHER_INDEX, CABLE_INDEX } from '../src/data/launchers.js';
import { assembleTop, validateBuild } from '../src/systems/assembly.js';
import { resolveLaunchGear, ChargeMeter, judgeRelease, computeLaunch } from '../src/game/launch.js';
import { Rng } from '../src/core/rng.js';
import { Battle } from '../src/game/battle.js';
import { participantFromDef, ARCHETYPE_INDEX } from '../src/data/opponents.js';
import { newProfile } from '../src/systems/profile.js';
import { createItem, itemName } from '../src/systems/items.js';
import { addItem } from '../src/systems/loot.js';
import { flipMagnet, undo } from '../src/systems/workshop.js';
import { flatArena, simpleSpec, BUILDS } from './helpers.js';

const FREE_TIP = { endZ: -0.016, ballRadius: 0.0005, flatRadius: 0, mu: 0, patchRadius: 0, compliance: 0.12, restitution: 1 };
const ledgerSum = (t) => LEDGER_KEYS.reduce((s, k) => s + t.ledger[k], 0);
const CLASSIC = PARTS.filter((p) => p.series === 'classic');

// a valid build around one part
function buildWith(part) {
  const b = Object.fromEntries(Object.entries(BUILDS.balance).map(([s, id]) => [s, PART_INDEX[id]]));
  b[part.slot] = part;
  if (part.slot === 'core' && part.arch !== 'helix') b.lock = PART_INDEX.lock_click3;
  return b;
}

test('every classic part assembles into a valid top and carries its mechanism', () => {
  assert.ok(CLASSIC.length >= 14, `${CLASSIC.length} classic parts`);
  for (const p of CLASSIC) {
    const v = validateBuild(buildWith(p), { spin: p.spin === 'L' ? 'L' : 'R' });
    assert.ok(v.ok, `${p.name}: ${v.errors.join(' ')}`);
  }
  const spec = (id) => assembleTop(buildWith(PART_INDEX[id]), { spin: 'R' }).spec;
  assert.equal(spec('ring_rollerguard').layers[0].freeSpin, 0.7, 'roller ring contacts are free-spinning');
  assert.equal(spec('lock_roller').hull[1].friction, 0.08, 'roller lock rolls on the floor');
  assert.equal(spec('disc_magna').mech.magnet.pole, 1, 'magnet discs come N face up');
  assert.ok(spec('tip_springjump').mech.spring.absorb > 0);
  assert.equal(spec('tip_clutchhit').mech.clutch.mode, 'hit');
  assert.ok(Math.abs(spec('tip_clutchhit').mech.clutch.tip.flatRadius - 0.0021) < 1e-12, 'clutch tip in metres');
  assert.ok(spec('tip_autoshift').mech.shift.tip.ballRadius > spec('tip_autoshift').tip.ballRadius);
  assert.equal(spec('ring_bastion').mech, null, 'ordinary parts have no mechanism');
});

// Two tops on frictionless tips, apart and at rest: does the gap close or open?
function magnetGap(magA, magB, poleA = 1, poleB = 1) {
  const mk = (mag, pole, id) => new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0, mech: mag ? { magnet: { pole, strength: 1 } } : null }), { id });
  const A = mk(magA, poleA, 'A'), B = mk(magB, poleB, 'B');
  const sim = new Simulation({ arena: flatArena(), tops: [A, B] });
  A.launch({ tipPos: new Vec3(-0.045, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
  B.launch({ tipPos: new Vec3(0.045, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
  const E0 = A.totalEnergy() + B.totalEnergy();
  for (let i = 0; i < 24; i++) sim.tick();
  return { gap: B.p.x - A.p.x, A, B, E0, E1: A.totalEnergy() + B.totalEnergy() };
}

test('magnets: opposite poles attract, matching poles repel, plain metal is pulled', () => {
  const none = magnetGap(false, false), opposite = magnetGap(true, true, 1, -1), same = magnetGap(true, true, 1, 1), iron = magnetGap(true, false);
  assert.ok(Math.abs(none.gap - 0.09) < 1e-6, 'no magnets, no force');
  assert.ok(opposite.gap < none.gap - 0.002, `opposite poles close the gap (${(opposite.gap * 1000).toFixed(1)} mm)`);
  assert.ok(same.gap > none.gap + 0.002, `matching poles push apart (${(same.gap * 1000).toFixed(1)} mm)`);
  assert.ok(iron.gap < none.gap - 0.0005 && iron.gap > opposite.gap, 'a magnet pulls plain metal, more weakly');
  for (const r of [opposite, same, iron]) {
    for (const t of [r.A, r.B]) assert.ok(t.ledger.mechanism !== 0, 'magnet work is booked');
    const led = ledgerSum(r.A) + ledgerSum(r.B);
    assert.ok(Math.abs(r.E1 - r.E0 - led) < 1e-6, 'energy books close');
  }
  // equal and opposite: the pair's momentum is unchanged
  assert.ok(Math.abs(opposite.A.v.x * opposite.A.mass + opposite.B.v.x * opposite.B.mass) < 1e-9);
});

// A strikes B (at rest) head-on; B's tip may carry a mechanism.
function strikeB(mechB, speed = 1.2, ticks = 60) {
  const A = new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0 }), { id: 'A' });
  const B = new TopBody(simpleSpec({ tip: { ...FREE_TIP }, linDrag: 0, aero: 0, mech: mechB }), { id: 'B' });
  const sim = new Simulation({ arena: flatArena(), tops: [A, B] });
  A.launch({ tipPos: new Vec3(-0.06, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(speed, 0, 0) });
  B.launch({ tipPos: new Vec3(0, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
  const E0 = B.totalEnergy() + A.totalEnergy();
  const events = [];
  let maxVy = 0, vxAfter = 0;
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    events.push(...sim.events.filter((e) => e.type === 'mechanism'));
    maxVy = Math.max(maxVy, B.v.y);
    if (sim.events.some((e) => e.type === 'impact')) vxAfter = B.v.x;
  }
  return { A, B, sim, events, maxVy, vxAfter: vxAfter || B.v.x, E0, E1: A.totalEnergy() + B.totalEnergy() };
}

test('spring tips soak up hits (less knockback) and hop', () => {
  const plain = strikeB(null);
  const spring = strikeB({ spring: { absorb: 0.28, hop: 0.55, minImpulse: 0.005 } });
  assert.ok(spring.vxAfter < plain.vxAfter * 0.97, `knockback ${spring.vxAfter.toFixed(3)} vs ${plain.vxAfter.toFixed(3)} m/s`);
  assert.ok(spring.events.some((e) => e.kind === 'springHop'), 'the spring hopped');
  assert.ok(spring.maxVy > plain.maxVy + 0.02, 'the top left the floor');
  const led = ledgerSum(spring.A) + ledgerSum(spring.B);
  assert.ok(Math.abs(spring.E1 - spring.E0 - led) < 1e-6, 'energy books close');
});

test('hit clutch: the gear is wound from the launch and released by the first hard hit', () => {
  const C = { clutch: { mode: 'hit', store: 0.16, dash: 0.9, minImpulse: 0.005, fallback: 8, tip: { mu: 0.42, flatRadius: 0.0026, patchRadius: 0.00095 } } };
  const plain = new TopBody(simpleSpec({ tip: FREE_TIP }), { id: 'p' });
  plain.launch({ tipPos: new Vec3(), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
  const r = strikeB(C);
  assert.ok(Math.abs(r.B.initialSpinEnergy / plain.initialSpinEnergy - 0.84) < 1e-6, '16% of the launch went into the gear');
  const ev = r.events.find((e) => e.kind === 'clutch');
  assert.ok(ev && ev.mode === 'hit', 'the clutch tripped on the hit');
  assert.ok(r.B.spinFraction() > 1.02, `spin came back above the launch level (${r.B.spinFraction().toFixed(3)})`);
  assert.equal(r.B.tip.mu, 0.42, 'dropped onto the rubber flat');
  assert.ok(r.B.ledger.mechanism > 0, 'released energy is booked');
  const led = ledgerSum(r.A) + ledgerSum(r.B);
  assert.ok(Math.abs(r.E1 - r.E0 - led) < 1e-6, 'energy books close');
  assert.equal(r.events.filter((e) => e.kind === 'clutch').length, 1, 'fires once');
});

test('hit clutch falls back to a timed release when nothing hits it', () => {
  const spec = simpleSpec({ tip: FREE_TIP, aero: 0, mech: { clutch: { mode: 'hit', store: 0.16, dash: 0.9, minImpulse: 0.005, fallback: 0.5 } } });
  const t = new TopBody(spec, { id: 'solo' });
  const sim = new Simulation({ arena: flatArena(), tops: [t] });
  t.launch({ tipPos: new Vec3(), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
  let at = null;
  for (let i = 0; i < 120 && at == null; i++) { sim.tick(); if (sim.events.some((e) => e.kind === 'clutch')) at = sim.time; }
  assert.ok(at != null && Math.abs(at - 0.5) < 0.02, `released at ${at}`);
});

test('final clutch fires at low spin and auto shift drops its ball', () => {
  const run = (mech) => {
    const spec = simpleSpec({ aero: 2e-9, mech });
    const t = new TopBody(spec, { id: 'x' });
    const sim = new Simulation({ arena: flatArena(), tops: [t] });
    t.launch({ tipPos: new Vec3(), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
    const E0 = t.totalEnergy();
    let ev = null, fracAt = null, after = null;
    for (let i = 0; i < 120 * 120 && t.active; i++) {
      sim.tick();
      const e = sim.events.find((x) => x.type === 'mechanism');
      if (e && !ev) { ev = e; fracAt = t.spinFraction(); }
      if (ev && after == null) after = t.spinFraction();
    }
    return { t, ev, fracAt, after, E0 };
  };
  const fin = run({ clutch: { mode: 'low', store: 0.2, below: 0.35, dash: 0, tip: { mu: 0.3, flatRadius: 0.0018 } } });
  assert.ok(fin.ev?.kind === 'clutch' && fin.ev.mode === 'low', 'final clutch fired');
  assert.ok(fin.fracAt > 0.5, `spin jumped back up to ${fin.fracAt.toFixed(2)} of launch`);
  assert.equal(fin.t.tip.flatRadius, 0.0018);
  const sh = run({ shift: { below: 0.5, tip: { ballRadius: 0.0022, patchRadius: 0.001 } } });
  assert.ok(sh.ev?.kind === 'shift', 'tip shifted');
  assert.ok(sh.fracAt < 0.5 && sh.fracAt > 0.45, `shifted as spin crossed half (${sh.fracAt.toFixed(3)})`);
  assert.equal(sh.t.tip.ballRadius, 0.0022);
});

test('rollers: a leaning top rolls on them and keeps more spin than one that scrapes', () => {
  const lean = (hullF) => {
    const spec = simpleSpec({ aero: 0, hull: [{ z: -0.012, radius: 0.012, friction: hullF }, { z: 0.001, radius: 0.025, friction: hullF }] });
    const t = new TopBody(spec, { id: 'r' });
    const sim = new Simulation({ arena: flatArena(), tops: [t] });
    t.launch({ tipPos: new Vec3(), axis: new Vec3(Math.sin(0.9), Math.cos(0.9), 0), spin: -260, velocity: new Vec3() });
    for (let i = 0; i < 60; i++) sim.tick();
    return { spin: t.spinAbs, scrape: t.ledger.scrape };
  };
  const scraping = lean(0.5), rolling = lean(0.08);
  assert.ok(scraping.scrape < 0, 'the leaning top scraped');
  assert.ok(rolling.scrape > scraping.scrape * 0.5, `rolling loses far less (${rolling.scrape.toFixed(4)} vs ${scraping.scrape.toFixed(4)} J)`);
  assert.ok(rolling.spin > scraping.spin, 'and keeps more spin');
});

test('free-spinning rollers on a ring stop contacts grinding spin away', () => {
  const grind = (freeSpin) => {
    const layer = (fs) => [{ id: 'ring', z: 0.004, radius: 0.025, baseRadius: 0.025, blades: 0, faceAngle: 0, slope: 0, thickness: 0.006, restitution: 0.5, friction: 0.25, catch: 0.5, freeSpin: fs }];
    const A = new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0 }), { id: 'A' });
    const B = new TopBody(simpleSpec({ tip: FREE_TIP, linDrag: 0, aero: 0, layers: layer(freeSpin) }), { id: 'B' });
    const sim = new Simulation({ arena: flatArena(), tops: [A, B] });
    A.launch({ tipPos: new Vec3(-0.06, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3(1.2, 0, 0.02) });
    B.launch({ tipPos: new Vec3(0, 0, 0), axis: new Vec3(0, 1, 0), spin: -600, velocity: new Vec3() });
    for (let i = 0; i < 60; i++) sim.tick();
    return B.spinAbs;
  };
  assert.ok(grind(0.7) > grind(0) + 1, 'the roller ring keeps more spin through the same contact');
});

test('classic launchers: clip forgives, wind-up never overcharges, catapult throws, digital rewards a perfect release', () => {
  const cable = CABLE_INDEX.cable_standard;
  const gear = (id) => resolveLaunchGear(LAUNCHER_INDEX[id], cable);
  assert.ok(LAUNCHERS.filter((l) => l.series === 'classic').length >= 6);
  assert.ok(gear('launcher_clip').window > gear('launcher_spark').window, 'clip launcher has a wider perfect window');
  const wind = gear('launcher_windup');
  const m = new ChargeMeter(wind, 'normal');
  for (let i = 0; i < 600; i++) m.update(1 / 60, true);
  assert.equal(m.charge, 1, 'charge stops at full tension');
  const j = judgeRelease(wind, 'normal', 1);
  assert.ok(j.label !== 'Misfire' && j.label !== 'Overcharge', `release at full tension is ${j.label}`);
  const spec = assembleTop(Object.fromEntries(Object.entries(BUILDS.attack).map(([s, id]) => [s, PART_INDEX[id]])), { spin: 'R' }).spec;
  const launch = (g, charge = 0.92) => computeLaunch({ gear: g, techId: 'normal', charge, aim: { x: 0.05, z: 0, lean: 0.12, dir: 0 }, spinDir: 'R', topSpec: spec, rng: new Rng(5), arena: flatArena() });
  const speed = (r) => Math.hypot(r.velocity.x, r.velocity.z);
  const base = gear('launcher_spark');
  const cat = { ...base, speedMul: gear('launcher_catapult').speedMul };
  assert.ok(speed(launch(cat)) > speed(launch(base)) * 1.2, 'catapult throws the top out faster');
  const dig = gear('launcher_digital');
  assert.ok(dig.readout && dig.mods.perfectBonus === 0.03, 'digital shooter: readout and +3% on a perfect release');
  assert.ok(judgeRelease(dig, 'normal', 0.92).energyMul > judgeRelease({ ...dig, mods: { ...dig.mods, perfectBonus: 0 } }, 'normal', 0.92).energyMul);
});

test('flipping a magnet disc swaps its pole (and undo flips it back)', () => {
  const P = newProfile(4);
  const it = createItem({ base: 'disc_magna', seed: 9, level: 5 });
  addItem(P, it);
  assert.match(itemName(it), /· N$/);
  assert.equal(flipMagnet(P, it.uid).pole, 'S');
  assert.match(itemName(P.inventory[it.uid]), /· S$/);
  const build = { ...Object.fromEntries(Object.entries(BUILDS.balance).map(([s, id]) => [s, PART_INDEX[id]])), disc: P.inventory[it.uid] };
  assert.equal(assembleTop(build, { spin: 'R' }).spec.mech.magnet.pole, -1, 'S face up');
  assert.ok(undo(P).ok);
  assert.notEqual(P.inventory[it.uid].pole, 'S');
  assert.equal(flipMagnet(P, Object.keys(P.inventory)[0]).ok, false, 'other parts cannot be flipped');
});

test('classic mechanisms in a real battle are deterministic and reported', () => {
  const run = () => {
    const a = participantFromDef(ARCHETYPE_INDEX.striker, { difficulty: 1, id: 'A' });
    const b = participantFromDef(ARCHETYPE_INDEX.wall, { difficulty: 1, id: 'B' });
    a.build.tip = PART_INDEX.tip_clutchhit;
    a.build.disc = PART_INDEX.disc_magna;
    b.build.tip = PART_INDEX.tip_springjump;
    const battle = new Battle({ arenaId: 'vortex', format: 'single', seed: 17, participants: [a, b], rules: { durability: false, slowmo: false }, roundTime: 60 });
    const mech = [];
    battle.on('mechanism', (e) => mech.push(`${e.fighter.index}:${e.kind}`));
    const result = battle.runHeadless();
    return { result, mech };
  };
  const r1 = run(), r2 = run();
  assert.ok(r1.mech.includes('0:clutch'), `clutch reported (${r1.mech.join(', ')})`);
  assert.deepEqual(r2.mech, r1.mech, 'same seed, same mechanism events');
  assert.equal(r2.result.rounds[0].time, r1.result.rounds[0].time);
});
