// Moving-part mechanisms of the classic series, run inside the simulation:
//   magnet : a magnet disc pulls on the other top's metal; between two magnet
//            discs opposite poles attract and matching poles repel
//   spring : a coil spring round the tip soaks up part of a hit and kicks the
//            top into a hop
//   clutch : an engine gear wound at launch (that energy is taken out of the
//            launch spin) and released later, on the first hard hit ('hit')
//            or when spin runs low ('low'): spin comes back, the top lunges
//            and the tip changes
//   shift  : the tip changes by itself when spin falls below a fraction
// Specs come from systems/assembly.js (spec.mech, metres). Every energy
// change is booked to the 'mechanism' ledger, so the energy books still close.

export const MAGNET = {
  pair: 0.06, // N between two full-strength magnet discs at the reference distance
  iron: 0.022, // N between a magnet disc and the plain metal of another top
  ref: 0.05, // m: reference centre distance (about two top radii)
  range: 0.14, // m: no force beyond this
};

// Per-top runtime state, made when the top is launched. A clutch winds its
// gear from the launch: `store` of the launch spin energy goes into the gear.
export function initMechanisms(top) {
  const M = top.spec.mech;
  if (!M) return null;
  const st = { age: 0, clutchStored: 0, clutchFired: false, shifted: false, hopCool: 0 };
  if (M.clutch) st.clutchStored = top.drainSpinEnergy(top.spinEnergy() * (M.clutch.store || 0));
  return st;
}

// Inside a substep the change also goes to the substep ledger (it is then
// excluded from the numerical residual); between ticks only the total.
function book(t, dE, inSubstep = false) {
  t.ledger.mechanism += dE;
  if (inSubstep && t._subLedger) t._subLedger.mechanism += dE;
}

// Pairwise magnet forces for one substep (horizontal, equal and opposite).
export function applyMagnets(tops, dt) {
  for (let i = 0; i < tops.length; i++) {
    const A = tops[i];
    if (!A.active) continue;
    for (let j = i + 1; j < tops.length; j++) {
      const B = tops[j];
      if (!B.active) continue;
      const ma = A.spec.mech?.magnet, mb = B.spec.mech?.magnet;
      if (!ma && !mb) continue;
      const dx = B.p.x - A.p.x, dz = B.p.z - A.p.z;
      const d = Math.hypot(dx, dz);
      if (d > MAGNET.range || d < 1e-5) continue;
      // attraction > 0, repulsion < 0
      let k;
      if (ma && mb) k = -ma.pole * mb.pole * MAGNET.pair * ma.strength * mb.strength;
      else k = MAGNET.iron * (ma || mb).strength;
      const fall = Math.pow(MAGNET.ref / Math.max(d, MAGNET.ref * 0.6), 2);
      const fade = Math.min(1, (MAGNET.range - d) / (MAGNET.range * 0.25)); // smooth cut-off
      const F = k * fall * fade;
      const ux = dx / d, uz = dz / d;
      for (const [t, s] of [[A, 1], [B, -1]]) {
        const before = t.linearEnergy();
        const dv = (s * F * dt) / t.mass;
        t.v.x += ux * dv; t.v.z += uz * dv;
        book(t, t.linearEnergy() - before, true);
      }
    }
  }
}

// Restitution multiplier for a top that is being hit (spring tips absorb).
export function struckRestitution(top) {
  const sp = top.spec.mech?.spring;
  return sp ? 1 - sp.absorb : 1;
}

// After each tick (length `tick` s): spring hops, clutch releases, tip
// shifts. `contacts` are this tick's top/top pair aggregates. Returns the
// events to emit.
export function mechanismsPostTick(sim, contacts, tick) {
  const out = [];
  for (const t of sim.tops) {
    const st = t.mech, M = t.spec.mech;
    if (!st || !M || !t.active) continue;
    st.age += tick;
    if (st.hopCool > 0) st.hopCool -= tick;
    // strongest hit on this top this tick, and who delivered it
    let hit = null;
    for (const agg of contacts) {
      if (agg.A !== t && agg.B !== t) continue;
      if (!hit || agg.impulse > hit.impulse) hit = { impulse: agg.impulse, other: agg.A === t ? agg.B : agg.A };
    }
    if (M.spring && hit && hit.impulse >= M.spring.minImpulse && st.hopCool <= 0 && t.contactTip) {
      const before = t.linearEnergy();
      t.v.y += Math.min(0.45, M.spring.hop * hit.impulse * 10);
      book(t, t.linearEnergy() - before);
      st.hopCool = 0.4;
      out.push({ type: 'mechanism', kind: 'springHop', top: t, impulse: hit.impulse, time: sim.time });
    }
    const C = M.clutch;
    if (C && !st.clutchFired) {
      const trip = C.mode === 'hit'
        ? (hit && hit.impulse >= (C.minImpulse || 0.01)) || st.age >= (C.fallback || 8)
        : t.spinFraction() < (C.below || 0.35);
      if (trip) out.push(releaseClutch(sim, t, hit?.other || null));
    }
    if (M.shift && !st.shifted && t.spinFraction() < M.shift.below) {
      st.shifted = true;
      Object.assign(t.tip, M.shift.tip);
      out.push({ type: 'mechanism', kind: 'shift', top: t, time: sim.time });
    }
  }
  return out;
}

// Let the wound gear go: most of the stored energy returns as spin, part of
// it throws the top at its opponent, and the tip changes if the clutch has a
// second tip.
function releaseClutch(sim, t, other) {
  const st = t.mech, C = t.spec.mech.clutch;
  st.clutchFired = true;
  const E = st.clutchStored * 0.92; // gear losses
  st.clutchStored = 0;
  let dashE = 0;
  const target = other?.active ? other : sim.tops.find((o) => o !== t && o.active);
  if (C.dash > 0 && target) {
    const dx = target.p.x - t.p.x, dz = target.p.z - t.p.z, d = Math.hypot(dx, dz);
    if (d > 1e-4) {
      const before = t.linearEnergy();
      const speed = Math.min(C.dash, Math.sqrt((2 * E * 0.35) / t.mass)); // at most 35% of the gear energy
      t.v.x += (dx / d) * speed; t.v.z += (dz / d) * speed;
      dashE = t.linearEnergy() - before;
      book(t, dashE);
    }
  }
  const spinE = t.addSpinEnergy(Math.max(0, E - Math.max(0, dashE)));
  book(t, spinE);
  if (C.tip) Object.assign(t.tip, C.tip);
  return { type: 'mechanism', kind: 'clutch', mode: C.mode, top: t, energy: E, time: sim.time };
}
