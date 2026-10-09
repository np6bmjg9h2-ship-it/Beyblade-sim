// Shared helpers for Node tests.
import { Arena } from '../src/physics/arena.js';
import { TopBody } from '../src/physics/topBody.js';
import { Simulation } from '../src/physics/simulation.js';
import { Vec3 } from '../src/core/math.js';
import { assembleTop } from '../src/systems/assembly.js';
import { PART_INDEX } from '../src/data/parts.js';

export const FLAT_ARENA = {
  id: 'flat', name: 'Flat test floor', radius: 2.0, profile: [[0, 0], [2.0, 0]],
  wall: { height: 0.05, restitution: 0.5, friction: 0.2, openings: [] }, surface: { friction: 1, tag: 'standard' }, bands: [],
};

export function flatArena(over = {}) { return new Arena({ ...FLAT_ARENA, ...over }); }

export function specFromParts(ids, opts = {}) {
  const build = Object.fromEntries(Object.entries(ids).map(([s, id]) => [s, typeof id === 'string' ? PART_INDEX[id] : id]));
  return assembleTop(build, { spin: 'R', ...opts }).spec;
}

export const BUILDS = {
  attack: { ring: 'ring_galefang', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_flatstrike' },
  defense: { ring: 'ring_bastion', core: 'core_quad', disc: 'disc_heavyring', lock: 'lock_ironclasp', tip: 'tip_pivotball' },
  stamina: { ring: 'ring_tidalhalo', core: 'core_helix', disc: 'disc_heavyring', lock: 'lock_click3', tip: 'tip_needle' },
  balance: { ring: 'ring_cometarc', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_semiflat' },
};

export function simpleSpec(over = {}) {
  return {
    mass: 0.05, I3: 1.4e-5, I1: 0.8e-5, axisOffset: [0, 0, 0],
    tip: { endZ: -0.016, ballRadius: 0.0005, flatRadius: 0, mu: 0.2, patchRadius: 0.0003, compliance: 0.12, restitution: 1 },
    layers: [{ id: 'ring', z: 0.004, radius: 0.025, baseRadius: 0.025, blades: 0, faceAngle: 0, slope: 0, thickness: 0.006, restitution: 0.5, friction: 0.25, catch: 0.5 }],
    hull: [{ z: -0.006, radius: 0.02 }, { z: 0.001, radius: 0.025 }],
    burst: { notches: 3, threshold: 2e-4, recovery: 0.2 }, aero: 1e-10, radius: 0.025, height: 0.03,
    ...over,
  };
}

export function spinUp(spec, { arena = flatArena(), at = [0, 0, 0], tilt = 0, spin = -600, v = [0, 0, 0], id = 'A' } = {}) {
  const top = new TopBody(spec, { id });
  const sim = new Simulation({ arena, tops: [top] });
  const axis = new Vec3(Math.sin(tilt), Math.cos(tilt), 0);
  top.launch({ tipPos: new Vec3(at[0], arena.heightAtR(Math.hypot(at[0], at[2])), at[2]), axis, spin, velocity: new Vec3(...v) });
  return { top, sim };
}

export function runUntil(sim, pred, maxTime = 300) {
  while (sim.time < maxTime) { sim.tick(); if (pred()) return sim.time; }
  return Infinity;
}
