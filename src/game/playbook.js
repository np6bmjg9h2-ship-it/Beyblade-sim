// Playbook: D-pad patterns. A pattern is a short steering program (Anchor,
// Orbit, Sidestep, Slingshot, Feint, Herd) that runs inside the battle step,
// so it is part of the deterministic simulation: only its trigger is
// recorded, and playback recomputes the steer. Pure functions of the battle
// state and integer ticks; outcome maths uses dm.* only.
//
// Physics stays honest: patterns only steer, and steering is billed in spin
// like any stick input. Orbit uses the bowl's slope for the centripetal force
// and Slingshot buys its dive speed with the climb (design:
// .claude/research/reviews/playbook-design.md, section 6).

import * as dm from '../core/dmath.js';
import { TICK, PHYSICS } from '../physics/simulation.js';
import { GRAVITY } from '../physics/topBody.js';

// dashAim: 'foe' = a dash fired during the pattern goes at the opponent;
// 'path' = along the pattern's own heading (strike from uphill).
export const PATTERNS = {
  anchor: { id: 'anchor', name: 'Anchor', callout: 'Still Heart', dur: 3.0, dashAim: 'foe', desc: 'Settle on the centre (or beside a foe who holds it) and rest the stick. The cheapest pattern.' },
  orbit: { id: 'orbit', name: 'Orbit', callout: 'Moon Circuit', dur: 3.0, dashAim: 'foe', desc: 'Circle at half the stadium radius; the bowl supplies the turn. Double-tap to circle the other way.' },
  sidestep: { id: 'sidestep', name: 'Sidestep', callout: 'Willow Step', dur: 1.6, dashAim: 'foe', desc: 'A short burst off the line of attack, then coast back to the centre.' },
  slingshot: { id: 'slingshot', name: 'Slingshot', callout: 'Falling Star', dur: 3.0, dashAim: 'path', endOnContact: true, desc: 'Climb the slope beside the foe, then dive at it with downhill speed. Double-tap to climb higher.' },
  feint: { id: 'feint', name: 'Feint', callout: 'Mirage Bait', dur: 2.2, dashAim: 'foe', endOnContact: true, desc: 'Rush in to draw a counter, brake short and retreat. A whiffed counter leaves the foe open.' },
  herd: { id: 'herd', name: 'Herd', callout: 'Gate Driver', dur: 3.0, dashAim: 'path', desc: 'Get behind a foe near the rim and drive it toward the nearest exit.' },
};
export const PATTERN_IDS = Object.keys(PATTERNS);
// D-pad slots: up, down, left, right
export const DEFAULT_PLAYBOOK = ['anchor', 'sidestep', 'orbit', 'slingshot'];
export const PLAYBOOK_SLOTS = ['up', 'down', 'left', 'right'];

// Stick handling while a pattern runs: below NUDGE the pattern steers alone,
// up to BREAK the stick adds on top, and a stick held at BREAK or more for
// BREAK_TICKS ends the pattern.
export const NUDGE = 0.2, BREAK = 0.5, BREAK_TICKS = Math.round(0.12 / TICK);
const G = 5; // velocity-control gain (1/s), as a steady human thumb

const unit = (x, z) => { const m = dm.hypot(x, z); return m < 1e-6 ? [0, 0] : [x / m, z / m]; };
const cap1 = (x, z) => { const m = dm.hypot(x, z); return m > 1 ? [x / m, z / m] : [x, z]; };
// steer toward a desired velocity: brake, cancel drift, then head for it
const velTo = (t, vx, vz, g = G) => cap1((vx - t.v.x) * g, (vz - t.v.z) * g);

export function newPattern(id, variant, tick) {
  if (!PATTERNS[id]) return null;
  return { id, variant: variant ? 1 : 0, startTick: tick, s: {}, breakTicks: 0, phase: 'run' };
}

// One pattern tick: returns [sx, sz] and marks st.done when finished.
// ctx: { t, o (opponent top), arena, tick, meR, oppR (body radii), contact }
export function patternSteer(st, ctx) {
  const { t, o, arena } = ctx;
  const R = arena.radius;
  const tau = (ctx.tick - st.startTick) * TICK;
  const def = PATTERNS[st.id];
  if (tau >= def.dur || (def.endOnContact && ctx.contact)) { st.done = true; return [0, 0]; }
  const S = st.s;
  switch (st.id) {
    case 'anchor': {
      let cx = 0, cz = 0;
      const oR = dm.hypot(o.p.x, o.p.z);
      if (oR < 0.06) { const [ux, uz] = oR > 1e-3 ? [o.p.x / oR, o.p.z / oR] : [1, 0]; cx = o.p.x - ux * 0.075; cz = o.p.z - uz * 0.075; }
      const ex = cx - t.p.x, ez = cz - t.p.z, e = dm.hypot(ex, ez);
      st.phase = 'settle';
      if (e < 0.02 && dm.hypot(t.v.x, t.v.z) < 0.05) { st.phase = 'rest'; return [0, 0]; }
      const [ux, uz] = unit(ex, ez), sp = Math.min(0.3, 2.5 * e);
      return velTo(t, ux * sp, uz * sp);
    }
    case 'orbit': {
      const dir = st.variant ? -1 : 1;
      const rt = 0.5 * R;
      const r = Math.max(1e-3, dm.hypot(t.p.x, t.p.z));
      const rx = t.p.x / r, rz = t.p.z / r;
      const tx = -rz * dir, tz = rx * dir;
      const vs = Math.sqrt(Math.max(0, rt * GRAVITY * arena.slopeAtR(rt)));
      return velTo(t, tx * vs + rx * (rt - r) * 2, tz * vs + rz * (rt - r) * 2);
    }
    case 'sidestep': {
      if (tau >= 0.35) { st.phase = 'coast'; return [0, 0]; }
      st.phase = 'step';
      if (S.nx == null) {
        // the side is chosen once, at the start: perpendicular to the foe line, toward the centre
        const [nx, nz] = unit(-(o.p.z - t.p.z), o.p.x - t.p.x);
        const sg = nx * -t.p.x + nz * -t.p.z >= 0 ? 1 : -1;
        S.nx = nx * sg; S.nz = nz * sg;
      }
      return velTo(t, S.nx * 0.45 - t.p.x * 3, S.nz * 0.45 - t.p.z * 3);
    }
    case 'slingshot': {
      const edge = 0.78 - 0.18 * (arena.danger || 0);
      let rL = (Math.min(0.7, edge - 0.08) + (st.variant ? 0.05 : 0)) * R;
      // the stick must beat the slope where it loads
      const aMax = PHYSICS.steerBase * GRAVITY * 0.6;
      while (rL > 0.3 * R && GRAVITY * arena.slopeAtR(rL) > aMax) rL -= 0.005;
      // load until the climb arrives (or 1.5 s), then release
      if (!S.dive && tau < 1.5) {
        st.phase = 'load';
        if (S.ax == null) {
          // load uphill a quarter turn round from the foe, on my side, so the
          // climb never runs through it and the dive comes down across its line
          const oR = dm.hypot(o.p.x, o.p.z);
          let [fx, fz] = oR > 0.05 * R ? unit(o.p.x, o.p.z) : unit(-t.p.x, -t.p.z);
          if (fx === 0 && fz === 0) { fx = 1; fz = 0; }
          const sg = -fz * t.p.x + fx * t.p.z >= 0 ? 1 : -1;
          S.ax = -fz * sg; S.az = fx * sg;
        }
        const ex = S.ax * rL - t.p.x, ez = S.az * rL - t.p.z;
        if (dm.hypot(ex, ez) < 0.015) S.dive = true;
        const [ux, uz] = unit(ex, ez), sp = Math.min(0.5, 3 * dm.hypot(ex, ez));
        const [vx, vz] = velTo(t, ux * sp, uz * sp);
        // hold against the slope (paid steering like any other): without it
        // the climb stalls where the bowl pulls back as hard as the stick
        const r = dm.hypot(t.p.x, t.p.z), hold = r > 1e-3 ? GRAVITY * arena.slopeAtR(r) / (PHYSICS.steerBase * GRAVITY) : 0;
        return r > 1e-3 ? cap1(vx + t.p.x / r * hold, vz + t.p.z / r * hold) : [vx, vz];
      }
      S.dive = true;
      st.phase = 'dive';
      // the slope gives the speed; a light stick bends the fall onto the foe
      // (firmer for the last 15 cm)
      const [ax, az] = unit(o.p.x + o.v.x * 0.12 - t.p.x, o.p.z + o.v.z * 0.12 - t.p.z);
      const k = dm.hypot(o.p.x - t.p.x, o.p.z - t.p.z) > 0.15 ? 0.3 : 0.6;
      return [ax * k, az * k];
    }
    case 'feint': {
      const gapStop = st.variant ? 0.045 : 0.06;
      const gap = dm.hypot(o.p.x - t.p.x, o.p.z - t.p.z) - (ctx.meR + ctx.oppR);
      S.ph = S.ph || 'approach';
      st.phase = S.ph;
      if (S.ph === 'approach') {
        const [ux, uz] = unit(o.p.x + o.v.x * 0.1 - t.p.x, o.p.z + o.v.z * 0.1 - t.p.z);
        if (gap <= gapStop) { S.ph = 'brake'; S.t0 = tau; }
        return velTo(t, ux * 0.55, uz * 0.55);
      }
      if (S.ph === 'brake') {
        if (tau - S.t0 >= 0.25) S.ph = 'retreat';
        return velTo(t, o.v.x, o.v.z, 6);
      }
      const [ux, uz] = unit(t.p.x - o.p.x, t.p.z - o.p.z);
      return velTo(t, ux * 0.45 - t.p.x * 2, uz * 0.45 - t.p.z * 2);
    }
    case 'herd': {
      const oR = dm.hypot(o.p.x, o.p.z);
      if (!S.driving && oR / R < 0.45) { st.done = true; st.noTarget = true; return [0, 0]; }
      // push direction: toward the nearest exit within 1.2 rad, else straight out
      const oa = dm.atan2(o.p.z, o.p.x);
      let best = null, bestD = 1e9;
      for (const g of arena.openings) {
        const dA = Math.abs(((g.center - oa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dA < bestD) { bestD = dA; best = g; }
      }
      const [dx, dz] = best && bestD < 1.2 ? unit(dm.cos(best.center) * R - o.p.x, dm.sin(best.center) * R - o.p.z) : unit(o.p.x, o.p.z);
      const sx = o.p.x - dx * 0.11, sz = o.p.z - dz * 0.11;
      if (!S.driving) {
        st.phase = 'stage';
        if (tau >= 1.2 || dm.hypot(sx - t.p.x, sz - t.p.z) < 0.03) S.driving = true;
        else {
          // bend around the foe instead of running through it
          let wx = sx, wz = sz;
          const lx = sx - t.p.x, lz = sz - t.p.z, L = dm.hypot(lx, lz);
          if (L > 1e-4) {
            const k = ((o.p.x - t.p.x) * lx + (o.p.z - t.p.z) * lz) / (L * L);
            const cx = t.p.x + lx * k, cz = t.p.z + lz * k;
            if (k > 0 && k < 1 && dm.hypot(o.p.x - cx, o.p.z - cz) < 0.07) {
              const sg = (cx - o.p.x) * -dz + (cz - o.p.z) * dx >= 0 ? 1 : -1;
              wx = o.p.x - dz * 0.12 * sg; wz = o.p.z + dx * 0.12 * sg;
            }
          }
          const [ux, uz] = unit(wx - t.p.x, wz - t.p.z);
          return velTo(t, ux * 0.5, uz * 0.5);
        }
      }
      st.phase = 'drive';
      if (ctx.contact && S.hitTick == null) S.hitTick = ctx.tick;
      if ((S.hitTick != null && (ctx.tick - S.hitTick) * TICK > 0.8) || oR / R < 0.35) { st.done = true; return [0, 0]; }
      const lat = dx * (o.p.z - t.p.z) - dz * (o.p.x - t.p.x);
      return cap1(dx * 0.7 - dz * lat * 2 - t.v.x, dz * 0.7 + dx * lat * 2 - t.v.z);
    }
    default: st.done = true; return [0, 0];
  }
}
