// Fixed-timestep spinning-top simulation.
//
// One game tick = TICK seconds, split into SUBSTEPS physics substeps. Each
// substep: apply body forces -> generate contacts -> sequential-impulse solve
// (top/top, wall, tip, body scrape passes) -> integrate positions and the
// analytic torque-free rotation -> positional correction. Energy changes of
// every pass are recorded in a per-top ledger so they can be inspected in the
// debug overlay and verified by tests.

import { Vec3, clamp, smoothstep, UP } from '../core/math.js';
import { GRAVITY } from './topBody.js';
import { sampleProfile } from './profile.js';
import { applyMagnets, struckRestitution, mechanismsPostTick } from './mechanisms.js';

export const TICK = 1 / 120;
export const DEFAULT_SUBSTEPS = 16;

export const LEDGER_KEYS = [
  'tipFriction', 'floor', 'scrape', 'collision', 'wall', 'drag', 'control', 'ability',
  'mechanism', 'damping', 'clamp', 'numerical',
];

const MAX_LIN_SPEED = 9; // m/s, safety clamp (tunnelling guard)
const MAX_SPIN = 1600; // rad/s safety clamp
const SLOP = 0.00015; // m allowed penetration

// Calibration coefficients of the contact and steering model, in one place so
// they are documented and balance experiments (tools/balance-tune.js) can vary
// them. Gameplay code must not change them at runtime.
export const PHYSICS = {
  restThreshold: 0.08, // m/s approach speed needed for restitution
  steerBase: 0.28, // fraction of weight available as steering force
  steerIdleCost: 0.03, // m/s equivalent drain while steering
  steerEff: 0.62, // conversion efficiency spin -> linear work
  nutationDamping: 2, // 1/s intrinsic material damping
  // Velocity-weakening friction for ring/wall contacts: polymer and metal
  // contacts lose friction at high sliding speed (flash heating), so
  // mu_eff = mu / (1 + v_slip / vWeaken).
  vWeaken: 5.0,
  // Blade faces are not rigid wedges: they flex and slide along the opposing
  // ring, so only part of the face geometry turns the contact normal.
  // (0.4 -> 0.6 in the Phase 5 balance pass: hits mattered too little, so
  // avoiding contact won ~75% of AI matches.)
  faceCoupling: 0.6,
  // Lock stress: hits below burstMinStress of the lock threshold leave no
  // mark; above it the lock slips burstRate notches per unit of excess stress.
  burstMinStress: 0.45,
  burstRate: 0.75,
};

// ---------------------------------------------------------------- contacts

class Contact {
  constructor() {
    this.point = new Vec3(); this.n = new Vec3(); this.t1 = new Vec3(); this.t2 = new Vec3();
    this.rA = new Vec3(); this.rB = new Vec3();
    this.reset();
  }
  reset() {
    this.type = ''; this.A = null; this.B = null; this.depth = 0;
    this.mu = 0; this.e = 0; this.torsion = 0;
    this.kN = 0; this.kT1 = 0; this.kT2 = 0; this.kTw = 0;
    this.lN = 0; this.lT1 = 0; this.lT2 = 0; this.lTw = 0;
    this.targetVn = 0; this.vn0 = 0; this.wN = 0; this.wF = 0;
    this.layerA = null; this.layerB = null; this.faceA = 0; this.faceB = 0;
    this.pairKey = null;
    return this;
  }
}

const _t = new Vec3(), _t2 = new Vec3(), _t3 = new Vec3(), _t4 = new Vec3();
const _va = new Vec3(), _vb = new Vec3(), _vb2 = new Vec3();
const _n = new Vec3(), _c = new Vec3(), _d = new Vec3(), _u = new Vec3(), _e = new Vec3();
const _prof = { radius: 0, face: 0 };
const _prof2 = { radius: 0, face: 0 };

function kAlong(body, r, dir) {
  if (!body) return 0;
  _t.crossVectors(r, dir);
  body.invInertiaMul(_t, _t2);
  _t3.crossVectors(_t2, r);
  return body.invMass + dir.dot(_t3);
}

function relVel(c, out) {
  if (c.B) c.B.pointVelocity(c.rB, out); else out.set(0, 0, 0);
  if (c.A) { c.A.pointVelocity(c.rA, _vb); out.sub(_vb); }
  return out;
}

function applyPair(c, J) {
  if (c.B) c.B.applyImpulse(J, c.rB);
  if (c.A) { _t4.copy(J).scale(-1); c.A.applyImpulse(_t4, c.rA); }
}

function tangentBasis(n, t1, t2) {
  if (Math.abs(n.y) < 0.9) t1.crossVectors(n, UP).normalize();
  else t1.set(1, 0, 0).addScaled(n, -n.x).normalize();
  t2.crossVectors(n, t1).normalize();
}

let _dt = 1 / 1920;
function prepare(c) {
  if (c.A) c.rA.subVectors(c.point, c.A.p);
  if (c.B) c.rB.subVectors(c.point, c.B.p);
  tangentBasis(c.n, c.t1, c.t2);
  c.kN = 1 / Math.max(1e-9, kAlong(c.A, c.rA, c.n) + kAlong(c.B, c.rB, c.n));
  c.kT1 = 1 / Math.max(1e-9, kAlong(c.A, c.rA, c.t1) + kAlong(c.B, c.rB, c.t1));
  c.kT2 = 1 / Math.max(1e-9, kAlong(c.A, c.rA, c.t2) + kAlong(c.B, c.rB, c.t2));
  if (c.torsion > 0) {
    let k = 0;
    if (c.A) k += c.n.dot(c.A.invInertiaMul(c.n, _t));
    if (c.B) k += c.n.dot(c.B.invInertiaMul(c.n, _t));
    c.kTw = 1 / Math.max(1e-12, k);
  }
  relVel(c, _va);
  c.vn0 = _va.dot(c.n);
  if (c.type === 'top' || c.type === 'wall') {
    const vt = Math.sqrt(Math.max(0, _va.lengthSq() - c.vn0 * c.vn0));
    c.slip = vt;
    c.mu /= 1 + vt / PHYSICS.vWeaken;
  }
  if (c.depth < 0) {
    // speculative: separated by a small gap; only constrain if the gap closes this substep
    const gapClose = c.depth / _dt; // negative
    c.targetVn = c.vn0 < gapClose ? (c.vn0 < -PHYSICS.restThreshold ? -c.e * c.vn0 : 0) : gapClose;
  } else {
    c.targetVn = c.vn0 < -PHYSICS.restThreshold ? -c.e * c.vn0 : 0;
  }
  c.lN = c.lT1 = c.lT2 = c.lTw = 0;
  c.wN = c.wF = 0;
}

const _J = new Vec3();
// Sequential-impulse step for one contact. Tracks the exact work done by the
// normal (wN) and frictional (wF) impulses: dE = J . (v_before + v_after) / 2.
function solveOne(c) {
  // normal
  relVel(c, _va);
  const vn = _va.dot(c.n);
  let dl = (c.targetVn - vn) * c.kN;
  const nl = Math.max(0, c.lN + dl);
  dl = nl - c.lN;
  c.lN = nl;
  if (dl !== 0) {
    _J.copy(c.n).scale(dl); applyPair(c, _J);
    c.wN += dl * (vn + 0.5 * dl / c.kN);
  }
  // friction (Coulomb cone)
  if (c.mu > 0 && c.lN > 0) {
    relVel(c, _va);
    const vt1 = _va.dot(c.t1), vt2 = _va.dot(c.t2);
    let l1 = c.lT1 - vt1 * c.kT1;
    let l2 = c.lT2 - vt2 * c.kT2;
    const max = c.mu * c.lN;
    const mag = Math.sqrt(l1 * l1 + l2 * l2);
    if (mag > max) { const s = max / mag; l1 *= s; l2 *= s; }
    const d1 = l1 - c.lT1, d2 = l2 - c.lT2;
    c.lT1 = l1; c.lT2 = l2;
    if (d1 !== 0 || d2 !== 0) {
      _J.copy(c.t1).scale(d1).addScaled(c.t2, d2);
      applyPair(c, _J);
      relVel(c, _vb2);
      c.wF += 0.5 * (d1 * (vt1 + _vb2.dot(c.t1)) + d2 * (vt2 + _vb2.dot(c.t2)));
    }
  }
  // torsional (spin) friction about the normal
  if (c.torsion > 0 && c.lN > 0) {
    let wrel = 0;
    if (c.B) wrel += c.B.w.dot(c.n);
    if (c.A) wrel -= c.A.w.dot(c.n);
    const max = c.torsion * c.lN;
    let lt = clamp(c.lTw - wrel * c.kTw, -max, max);
    const d = lt - c.lTw;
    c.lTw = lt;
    if (d !== 0) {
      if (c.B) { _J.copy(c.n).scale(d); c.B.applyAngularImpulse(_J); }
      if (c.A) { _J.copy(c.n).scale(-d); c.A.applyAngularImpulse(_J); }
      c.wF += d * (wrel + 0.5 * d / c.kTw);
    }
  }
}

// ---------------------------------------------------------------- simulation

export class Simulation {
  constructor({ arena, tops, substeps = DEFAULT_SUBSTEPS }) {
    this.arena = arena;
    this.tops = tops;
    this.substeps = substeps;
    this.dt = TICK / substeps;
    this.time = 0;
    this.tickCount = 0;
    this.events = [];
    this.pool = [];
    this.contacts = [];
    this.pairState = new Map(); // pairKey -> {contactTicks}
    this.pairAgg = new Map();
    this.wallAgg = new Map();
    this.debug = { contacts: [], enabled: false };
    this.instabilityRecoveries = 0;
    for (const t of tops) this.initLedger(t);
  }

  initLedger(t) {
    t.ledger = {};
    for (const k of LEDGER_KEYS) t.ledger[k] = 0;
    t.telemetry = {
      maxImpulseReceived: 0, maxImpulseDealt: 0, impulseDealt: 0, impulseReceived: 0,
      wallHits: 0, distance: 0, airTime: 0, contacts: 0, maxSpeed: 0,
    };
    t._safe = null;
  }

  activeTops() { return this.tops.filter((t) => t.active); }

  _contact() {
    const c = this.pool.pop() || new Contact();
    return c.reset();
  }

  _release() {
    for (const c of this.contacts) this.pool.push(c);
    this.contacts.length = 0;
  }

  // Advance one fixed tick.
  tick() {
    this.events.length = 0;
    this.pairAgg.clear();
    this.wallAgg.clear();
    for (const t of this.tops) {
      t.prevP.copy(t.p);
      t.prevQ.copy(t.q);
      t._tickSupport = 0;
      t._tickTip = false;
      t._tickScrape = false;
      t._safe = t.snapshot();
    }
    if (this.debug.enabled) this.debug.contacts.length = 0;
    for (let s = 0; s < this.substeps; s++) this.substep(this.dt, s === this.substeps - 1);
    this.time += TICK;
    this.tickCount++;
    this.postTick();
    return this.events;
  }

  substep(dt, last) {
    const arena = this.arena;
    const tops = this.tops;
    const E0 = [];
    for (let i = 0; i < tops.length; i++) {
      const t = tops[i];
      if (!t.active) { E0.push(0); continue; }
      E0.push(t.totalEnergy());
      this.applyBodyForces(t, dt);
    }
    applyMagnets(tops, dt);

    // --- top vs top
    this._release();
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        if (tops[i].active && tops[j].active) this.genTopTop(tops[i], tops[j]);
      }
    }
    if (this.contacts.length) this.solvePass('collision', 6, dt);

    // --- walls
    this._release();
    for (const t of tops) if (t.active) { this.genWall(t); this.genLip(t); }
    if (this.contacts.length) this.solvePass('wall', 4, dt);

    // --- tip
    this._release();
    for (const t of tops) if (t.active) this.genTip(t, dt);
    if (this.contacts.length) this.solvePass('tipFriction', 4, dt);

    // --- body scrape (tilted rim touching floor)
    this._release();
    for (const t of tops) if (t.active) this.genScrape(t);
    if (this.contacts.length) this.solvePass('scrape', 3, dt);
    this._release();

    // --- integrate
    for (let i = 0; i < tops.length; i++) {
      const t = tops[i];
      if (!t.active) {
        if (t.state === 'out' || t.state === 'burst') this.integrateFree(t, dt);
        continue;
      }
      const Ed0 = t.totalEnergy();
      this.applyDamping(t, dt);
      const dDamp = t.totalEnergy() - Ed0;
      t.ledger.damping += dDamp;
      t._subLedger.damping += dDamp;
      this.clampState(t);
      const dPE = t.mass * GRAVITY * t.v.y * dt;
      t.ledger.floor += dPE; t._subLedger.floor += dPE;
      t.p.addScaled(t.v, dt);
      t.telemetry.distance += Math.hypot(t.v.x, t.v.z) * dt;
      t.integrateOrientation(dt);
      this.correctTip(t);
      // energy residual -> numerical drift
      let attributed = 0;
      for (const k of LEDGER_KEYS) if (k !== 'numerical') attributed += t._subLedger?.[k] || 0;
      const resid = t.totalEnergy() - E0[i] - attributed;
      t.ledger.numerical += resid;
      if (t._subLedger) for (const k in t._subLedger) t._subLedger[k] = 0;
    }
  }

  applyBodyForces(t, dt) {
    const m = t.mass;
    if (!t._subLedger) { t._subLedger = {}; for (const k of LEDGER_KEYS) t._subLedger[k] = 0; }
    const led = t._subLedger;
    // gravity (+ ability lift which is an explicit external force). The kinetic
    // energy gained here and the potential change during integration are
    // booked to 'floor' together with the support impulses, so a resting top
    // nets to zero and only real landing losses remain.
    const vy0 = t.v.y;
    t.v.y -= GRAVITY * dt;
    const gk = 0.5 * m * (t.v.y * t.v.y - vy0 * vy0);
    led.floor += gk; t.ledger.floor += gk;
    if (t.mods.liftForce > 0) {
      const dv = GRAVITY * t.mods.liftForce * dt;
      const dE = m * (t.v.y * dv + 0.5 * dv * dv);
      t.v.y += dv;
      led.ability += dE; t.ledger.ability += dE;
    }
    // steering: limited force while the tip is on the floor, paid for with spin energy
    const st = t.control.steer;
    const sMag = Math.hypot(st.x, st.z);
    if (sMag > 0.02 && t.contactTip) {
      const Fmax = PHYSICS.steerBase * m * GRAVITY * t.mods.steerForce;
      const fx = st.x * Fmax, fz = st.z * Fmax;
      const before = 0.5 * m * (t.v.x * t.v.x + t.v.z * t.v.z);
      t.v.x += (fx / m) * dt;
      t.v.z += (fz / m) * dt;
      const after = 0.5 * m * (t.v.x * t.v.x + t.v.z * t.v.z);
      const work = after - before;
      const eff = PHYSICS.steerEff * t.mods.steerEfficiency;
      const cost = (Math.max(0, work) + Fmax * sMag * PHYSICS.steerIdleCost * dt) / Math.max(0.1, eff);
      const drained = t.drainSpinEnergy(cost);
      led.control += work - drained; t.ledger.control += work - drained;
    }
    // ability-driven external force (explicit energy source)
    if (t.extForce && t.extForce.lengthSq() > 0) {
      const before = t.linearEnergy();
      t.v.addScaled(t.extForce, dt / m);
      const work = t.linearEnergy() - before;
      let spent = 0;
      if (t.extForceSource === 'spin') spent = t.drainSpinEnergy(Math.max(0, work) / 0.6);
      led.ability += work - spent; t.ledger.ability += work - spent;
    }
    // aerodynamic drag: spin (quadratic) and linear
    const s = t.spinRate;
    const k = (t.spec.aero || 0) * t.mods.aeroDrag;
    if (k > 0 && s !== 0) {
      const before = t.rotationalEnergy();
      const dL = Math.min(Math.abs(s) * t.I3 * 0.5, k * s * s * dt);
      t.L.addScaled(t.a, -Math.sign(s) * dL);
      t.updateOmegaOnly();
      const d = t.rotationalEnergy() - before;
      led.drag += d; t.ledger.drag += d;
    }
    const sp = t.v.length();
    if (sp > 0) {
      const before = 0.5 * m * sp * sp;
      const f = Math.min(0.5, (t.spec.linDrag ?? 6e-4) * sp * dt / m);
      t.v.scale(1 - f);
      const d = t.linearEnergy() - before;
      led.drag += d; t.ledger.drag += d;
    }
  }

  // Damps nutation toward steady precession (physical damping in the body).
  applyDamping(t, dt) {
    const k = PHYSICS.nutationDamping + t.mods.nutationDamping;
    if (k <= 0) return;
    const s = t.spinRate;
    if (Math.abs(s) < 1) return;
    const a = t.a;
    const La = t.L.dot(a);
    // transverse L
    _t.copy(t.L).addScaled(a, -La);
    // steady (slow) precession about the floor normal: Omega = m g h / (I3 s)
    const h = -t.spec.tip.endZ;
    const omegaP = (t.mass * GRAVITY * h) / (t.I3 * s);
    const nrm = t.lastTipNormal;
    _t2.copy(nrm).addScaled(a, -nrm.dot(a)).scale(t.I1 * omegaP);
    const f = 1 - Math.exp(-k * dt);
    _t.sub(_t2).scale(-f);
    t.L.add(_t);
    t.updateOmegaOnly();
  }

  // Safety limits (tunnelling and blow-up guards). Energy they remove is
  // booked to 'clamp' so it never hides inside the numerical residual.
  clampState(t) {
    const sp = t.v.length();
    const s = t.spinRate;
    if (sp > MAX_LIN_SPEED || Math.abs(s) > MAX_SPIN) {
      const before = t.totalEnergy();
      if (sp > MAX_LIN_SPEED) t.v.scale(MAX_LIN_SPEED / sp);
      if (Math.abs(s) > MAX_SPIN) {
        t.L.addScaled(t.a, (Math.sign(s) * MAX_SPIN - s) * t.I3);
        t.updateOmegaOnly();
      }
      const d = t.totalEnergy() - before;
      t.ledger.clamp += d; t._subLedger.clamp += d;
    }
    if (sp > t.telemetry.maxSpeed) t.telemetry.maxSpeed = sp;
  }

  integrateFree(t, dt) {
    t.v.y -= GRAVITY * dt;
    t.p.addScaled(t.v, dt);
    t.integrateOrientation(dt);
  }

  solvePass(category, iterations, dt) {
    const tops = this.tops;
    const E = tops.map((t) => (t.active ? t.totalEnergy() : 0));
    _dt = dt;
    for (const c of this.contacts) prepare(c);
    for (let it = 0; it < iterations; it++) for (const c of this.contacts) solveOne(c);
    // positional correction (no velocity change)
    for (const c of this.contacts) {
      if (c.depth > SLOP && c.type !== 'tip') {
        const corr = (c.depth - SLOP) * 0.6;
        const wa = c.A ? c.A.invMass : 0, wb = c.B ? c.B.invMass : 0;
        const ws = wa + wb;
        if (ws > 0) {
          if (c.A) c.A.p.addScaled(c.n, (-corr * wa) / ws);
          if (c.B) c.B.p.addScaled(c.n, (corr * wb) / ws);
        }
      }
    }
    if (category === 'collision') {
      // energy snapshot per pair for the debug telemetry (before first / after last substep of the tick)
      for (const c of this.contacts) {
        if (c.type !== 'top') continue;
        const ia = tops.indexOf(c.A), ib = tops.indexOf(c.B);
        const snap = this._eSnap || (this._eSnap = new Map());
        let s = snap.get(c.pairKey);
        if (!s || s.tick !== this.tickCount) { s = { tick: this.tickCount, before: [E[ia], E[ib]] }; snap.set(c.pairKey, s); }
        s.after = [c.A.totalEnergy(), c.B.totalEnergy()];
      }
    }
    if (category === 'tipFriction') {
      // static floor: split the exact work into support (normal) and friction
      for (const c of this.contacts) {
        const t = c.B;
        t.ledger.floor += c.wN; t._subLedger.floor += c.wN;
        t.ledger.tipFriction += c.wF; t._subLedger.tipFriction += c.wF;
      }
    } else {
      for (let i = 0; i < tops.length; i++) {
        const t = tops[i];
        if (!t.active) continue;
        const d = t.totalEnergy() - E[i];
        t.ledger[category] += d;
        t._subLedger[category] += d;
      }
    }
    this.aggregate(category);
    if (this.debug.enabled) {
      for (const c of this.contacts) {
        this.debug.contacts.push({ type: c.type, p: c.point.toArray(), n: c.n.toArray(), l: c.lN });
      }
    }
  }

  aggregate(category) {
    for (const c of this.contacts) {
      if (c.lN <= 0 && c.type !== 'tip') continue;
      if (c.type === 'top') {
        let agg = this.pairAgg.get(c.pairKey);
        if (!agg) {
          agg = {
            A: c.A, B: c.B, impulse: 0, J: new Vec3(), approach: 0, point: new Vec3(), normal: new Vec3(),
            layerA: c.layerA, layerB: c.layerB, faceA: 0, faceB: 0, counterA: 0, counterB: 0, liftA: 0, liftB: 0,
            maxLayerImpulse: 0, slip: 0,
          };
          this.pairAgg.set(c.pairKey, agg);
        }
        const Jn = c.lN;
        _J.copy(c.n).scale(c.lN).addScaled(c.t1, c.lT1).addScaled(c.t2, c.lT2);
        agg.J.add(_J);
        agg.impulse += Math.hypot(c.lN, c.lT1, c.lT2);
        if (Jn > agg.maxLayerImpulse) {
          agg.maxLayerImpulse = Jn; agg.layerA = c.layerA; agg.layerB = c.layerB;
          agg.point.copy(c.point); agg.normal.copy(c.n);
        }
        agg.approach = Math.max(agg.approach, -c.vn0);
        agg.faceA = Math.max(agg.faceA, c.faceA);
        agg.faceB = Math.max(agg.faceB, c.faceB);
        // counter-rotational angular impulse (burst stress) on each top
        // B receives +J at rB; A receives -J at rA
        _t.crossVectors(c.rB, _J);
        const dLB = _t.dot(c.B.a) * c.B.spinDir;
        if (dLB < 0) agg.counterB += -dLB;
        _t.crossVectors(c.rA, _J).scale(-1);
        const dLA = _t.dot(c.A.a) * c.A.spinDir;
        if (dLA < 0) agg.counterA += -dLA;
        // lift: upward impulse along each top's axis
        const upB = _J.dot(c.B.a), upA = -_J.dot(c.A.a);
        if (upB > 0) agg.liftB += upB;
        if (upA > 0) agg.liftA += upA;
      } else if (c.type === 'wall') {
        const key = c.B.id;
        let agg = this.wallAgg.get(key);
        if (!agg) {
          agg = { top: c.B, impulse: 0, approach: 0, point: new Vec3(), normal: new Vec3(), layer: c.layerB };
          this.wallAgg.set(key, agg);
        }
        agg.impulse += Math.hypot(c.lN, c.lT1, c.lT2);
        agg.approach = Math.max(agg.approach, -c.vn0);
        agg.point.copy(c.point); agg.normal.copy(c.n);
      } else if (c.type === 'tip') {
        c.B._tickSupport += c.lN;
        if (c.lN > 0) c.B._tickTip = true;
      } else if (c.type === 'scrape') {
        if (c.lN > 0) c.B._tickScrape = true;
      }
    }
  }

  // ------------------------------------------------------------ generators

  genTip(t, dt) {
    const tip = t.tip; // per-top: clutches and shifts change it mid-battle
    const arena = this.arena;
    // rounded-disc tip: centre C on the axis, flat radius rf, edge radius rho
    t.axisPoint(tip.endZ + tip.ballRadius, _c);
    // local floor normal under the tip
    arena.height(_c.x, _c.z, _n);
    // direction into the surface
    _d.copy(_n).scale(-1);
    const a = t.a;
    _u.copy(_d).addScaled(a, -_d.dot(a));
    const s = _u.length();
    let b = 0;
    if (s > 1e-9) {
      _u.scale(1 / s);
      b = smoothstep(0, Math.sin(tip.compliance), s);
    } else _u.set(0, 0, 0);
    const rf = tip.flatRadius * (t.wearFlat ?? 1);
    _e.copy(_c).addScaled(_u, rf * b).addScaled(_d, tip.ballRadius);
    const floorY = arena.height(_e.x, _e.z, _n);
    const depth = (floorY - _e.y) * _n.y;
    t.lastTipPoint.copy(_e);
    if (depth < -0.0003) { t.contactTip = false; return; }
    t.contactTip = true;
    t.lastTipNormal.copy(_n);
    const c = this._contact();
    c.type = 'tip'; c.A = null; c.B = t;
    c.point.copy(_e); c.n.copy(_n); c.depth = depth;
    const surfMu = arena.frictionAt(_e.x, _e.z);
    c.mu = tip.mu * surfMu * t.mods.tipFriction;
    c.e = arena.floorRestitution * (tip.restitution ?? 1);
    const reff = (2 / 3) * rf * (1 - b) + tip.patchRadius;
    c.torsion = tip.mu * surfMu * reff * t.mods.tipSpinDrag * arena.spinDragMul;
    this.contacts.push(c);
  }

  // Positional projection of the tip onto the floor after integration.
  correctTip(t) {
    if (!t.contactTip) return;
    const tip = t.tip;
    t.axisPoint(tip.endZ + tip.ballRadius, _c);
    this.arena.height(_c.x, _c.z, _n);
    _d.copy(_n).scale(-1);
    _u.copy(_d).addScaled(t.a, -_d.dot(t.a));
    const s = _u.length();
    let b = 0;
    if (s > 1e-9) { _u.scale(1 / s); b = smoothstep(0, Math.sin(tip.compliance), s); } else _u.set(0, 0, 0);
    _e.copy(_c).addScaled(_u, tip.flatRadius * (t.wearFlat ?? 1) * b).addScaled(_d, tip.ballRadius);
    const floorY = this.arena.height(_e.x, _e.z, _n);
    const depth = (floorY - _e.y) * _n.y;
    if (depth > SLOP * 0.5) t.p.addScaled(_n, depth - SLOP * 0.5);
  }

  genScrape(t) {
    const tiltS = Math.sqrt(t.a.x * t.a.x + t.a.z * t.a.z); // sin(tilt) from vertical
    if (tiltS < 0.15) return; // rims are far above the floor when nearly upright
    const arena = this.arena;
    _u.set(0, -1, 0).addScaled(t.a, t.a.y); // -up minus its axial part
    const ul = _u.length();
    if (ul < 1e-6) return;
    _u.scale(1 / ul);
    let best = null;
    for (const h of t.spec.hull) {
      t.axisPoint(h.z, _c);
      _e.copy(_c).addScaled(_u, h.radius);
      const fy = arena.height(_e.x, _e.z, _n);
      const depth = (fy - _e.y) * _n.y;
      if (depth > -0.0002 && (!best || depth > best.depth)) {
        best = { depth, p: _e.clone(), n: _n.clone(), mu: h.friction ?? 0.5 };
      }
    }
    if (!best) return;
    const c = this._contact();
    c.type = 'scrape'; c.A = null; c.B = t;
    c.point.copy(best.p); c.n.copy(best.n); c.depth = best.depth;
    c.mu = best.mu * arena.frictionAt(best.p.x, best.p.z);
    c.e = 0.15;
    this.contacts.push(c);
    t.scraping = true;
  }

  genWall(t) {
    const arena = this.arena;
    const R = arena.radius;
    const rr = Math.hypot(t.p.x, t.p.z);
    if (rr + t.spec.radius < R - 0.002) return;
    for (const L of t.spec.layers) {
      t.axisPoint(L.z, _c);
      const cr = Math.hypot(_c.x, _c.z);
      if (cr < 1e-6) continue;
      // outward radial direction projected into the ring plane
      _d.set(_c.x / cr, 0, _c.z / cr);
      _u.copy(_d).addScaled(t.a, -_d.dot(t.a));
      const ul = _u.length();
      if (ul < 1e-6) continue;
      _u.scale(1 / ul);
      const psi = t.bodyAzimuth(_u);
      sampleProfile(L, psi, t.spinDir, _prof);
      _e.copy(_c).addScaled(_u, _prof.radius);
      const er = Math.hypot(_e.x, _e.z);
      if (er <= R) continue;
      const ang = Math.atan2(_e.z, _e.x);
      const top = arena.wallTopAt(ang); // exits only have a low lip
      if (_e.y - L.thickness * 0.5 > top) continue; // passing over the rim
      const c = this._contact();
      c.type = 'wall'; c.A = null; c.B = t; c.layerB = L;
      c.point.copy(_e); c.depth = er - R;
      // The wall is smooth, so the contact normal is the wall normal (with a
      // slight inward/downward lean at the rim). Blade corners catching the
      // wall raise the effective tangential friction instead.
      const lean = arena.wallLean;
      c.n.set(-_e.x / er, -lean, -_e.z / er).normalize();
      const catchMul = L.attack ? 1 + 0.8 * _prof.face : 1;
      c.mu = arena.wallFriction * L.friction * t.mods.wallFriction * catchMul * (1 - (L.freeSpin || 0));
      c.e = clamp(arena.wallRestitution * L.restitution * t.mods.wallRestitution, 0, 0.9);
      this.contacts.push(c);
    }
  }

  // Rim and exit lips: the tip body (lowest part of the stack) is stopped by
  // the wall or by the low lip across an exit unless it has been lifted over
  // it. Ring layers are handled by genWall; on low-walled stadiums the rings
  // pass above the rim, so without this the lower body would slide through.
  genLip(t) {
    const arena = this.arena;
    const tip = t.spec.tip;
    t.axisPoint(tip.endZ + 0.003, _c);
    const cr = Math.hypot(_c.x, _c.z);
    const reach = cr + 0.006;
    if (reach <= arena.radius || cr < 1e-6) return;
    const ang = Math.atan2(_c.z, _c.x);
    const o = arena.openingAt(ang);
    if (o && o.lipHeight <= 0) return;
    const bottom = _c.y - 0.003;
    const rimTop = arena.wallTopAt(ang);
    if (bottom > rimTop) return;
    const c = this._contact();
    c.type = 'wall'; c.A = null; c.B = t; c.layerB = { part: 'tip' };
    c.point.set((_c.x / cr) * arena.radius, _c.y, (_c.z / cr) * arena.radius);
    c.depth = reach - arena.radius;
    // A step lower than the body radius acts as a ramp: the normal from the
    // step edge to the rounded body points up and inward, so a top crossing
    // fast enough (1/2 v^2 > g h) rides over it; a full wall pushes straight back.
    const rb = 0.006;
    const hStep = rimTop - bottom;
    const sinT = hStep >= rb ? -0.05 : clamp((rb - hStep) / rb, 0, 0.9);
    const cosT = Math.sqrt(1 - sinT * sinT);
    c.n.set((-_c.x / cr) * cosT, sinT, (-_c.z / cr) * cosT);
    c.mu = 0.2; c.e = 0.3;
    this.contacts.push(c);
  }

  genTopTop(A, B) {
    const dx = B.p.x - A.p.x, dz = B.p.z - A.p.z;
    const dh = Math.hypot(dx, dz);
    if (dh > A.spec.radius + B.spec.radius + 0.004) return;
    if (Math.abs(B.p.y - A.p.y) > (A.spec.height + B.spec.height)) return;
    const pairKey = A.id + '|' + B.id;
    const nhx = dh > 1e-9 ? dx / dh : 1, nhz = dh > 1e-9 ? dz / dh : 0;
    let best = null, bestDepth = -1;
    for (const la of A.spec.layers) {
      A.axisPoint(la.z, _c);
      const cAx = _c.x, cAy = _c.y, cAz = _c.z;
      // in-plane direction from A toward B
      _u.set(nhx, 0, nhz).addScaled(A.a, -(nhx * A.a.x + nhz * A.a.z));
      _u.normalize();
      const psiA = A.bodyAzimuth(_u);
      sampleProfile(la, psiA, A.spinDir, _prof);
      const eAx = cAx + _u.x * _prof.radius, eAy = cAy + _u.y * _prof.radius, eAz = cAz + _u.z * _prof.radius;
      const uAx = _u.x, uAy = _u.y, uAz = _u.z;
      for (const lb of B.spec.layers) {
        B.axisPoint(lb.z, _e);
        _d.set(-nhx, 0, -nhz).addScaled(B.a, -(-nhx * B.a.x + -nhz * B.a.z));
        _d.normalize();
        const psiB = B.bodyAzimuth(_d);
        sampleProfile(lb, psiB, B.spinDir, _prof2);
        const eBx = _e.x + _d.x * _prof2.radius, eBy = _e.y + _d.y * _prof2.radius, eBz = _e.z + _d.z * _prof2.radius;
        // vertical band overlap at the edges
        const dy = eBy - eAy;
        const halfSum = (la.thickness + lb.thickness) * 0.5;
        if (Math.abs(dy) > halfSum) continue;
        // horizontal penetration along the centre line
        const depth = (eAx - eBx) * nhx + (eAz - eBz) * nhz;
        if (depth <= -0.0002) continue;
        if (depth > bestDepth) {
          bestDepth = depth;
          best = {
            la, lb, depth, dy, halfSum,
            px: (eAx + eBx) * 0.5, py: (eAy + eBy) * 0.5, pz: (eAz + eBz) * 0.5,
            uA: [uAx, uAy, uAz], uB: [_d.x, _d.y, _d.z],
            faceA: _prof.face, faceB: _prof2.face,
          };
        }
      }
    }
    if (!best) return;
    const { la, lb } = best;
    const c = this._contact();
    c.type = 'top'; c.A = A; c.B = B; c.layerA = la; c.layerB = lb; c.pairKey = pairKey;
    c.point.set(best.px, best.py, best.pz);
    c.depth = Math.max(0, best.depth);
    // normal: horizontal centre line, tilted by ring slopes and edge offset,
    // and turned by engaged blade faces in the direction of surface motion
    const slopeTerm = Math.tan(la.slope || 0) - Math.tan(lb.slope || 0) + clamp(best.dy / (best.halfSum * 2), -0.45, 0.45) * 0.6;
    c.n.set(nhx, slopeTerm, nhz);
    const faceA = (la.faceAngle + (la.attack ? A.mods.faceAngle : 0)) * best.faceA;
    const faceB = (lb.faceAngle + (lb.attack ? B.mods.faceAngle : 0)) * best.faceB;
    _t.set(best.uA[0], best.uA[1], best.uA[2]);
    _t2.crossVectors(A.a, _t).scale(A.spinDir); // A surface motion
    c.n.addScaled(_t2, PHYSICS.faceCoupling * Math.tan(clamp(faceA, 0, 0.45)));
    _t.set(best.uB[0], best.uB[1], best.uB[2]);
    _t3.crossVectors(B.a, _t).scale(B.spinDir); // B surface motion
    c.n.addScaled(_t3, -PHYSICS.faceCoupling * Math.tan(clamp(faceB, 0, 0.45)));
    c.n.normalize();
    c.faceA = best.faceA * (la.faceAngle || 0);
    c.faceB = best.faceB * (lb.faceAngle || 0);
    // material response
    const closingA = A.v.dot(c.n) > -B.v.dot(c.n);
    let e = Math.sqrt(la.restitution * lb.restitution);
    e *= Math.sqrt(A.mods.restitution * B.mods.restitution);
    // the top being hit (slower closer) gets its counter/absorb modifier
    e *= closingA ? B.mods.restitutionWhenHit : A.mods.restitutionWhenHit;
    // a spring tip under the top being hit soaks up part of the blow
    e *= struckRestitution(closingA ? B : A);
    // blade strikes deform the striking edge: less elastic than rim-on-rim contact
    e *= 1 - 0.45 * Math.max(best.faceA, best.faceB);
    c.e = clamp(e, 0.05, 0.92);
    let fr = Math.sqrt(la.friction * lb.friction) * Math.sqrt(A.mods.contactFriction * B.mods.contactFriction);
    // minor (slow, grinding) contacts: grindLoss channel scales their friction
    const closing = -((B.v.x - A.v.x) * nhx + (B.v.z - A.v.z) * nhz);
    if (closing < 0.35) fr *= Math.sqrt(A.mods.grindLoss * B.mods.grindLoss);
    c.mu = fr * (1 - Math.max(la.freeSpin || 0, lb.freeSpin || 0));
    this.contacts.push(c);
  }

  // ------------------------------------------------------------ post tick

  postTick() {
    const arena = this.arena;
    // pair (top/top) events
    for (const [key, agg] of this.pairAgg) {
      const prev = this.pairState.get(key);
      const isNew = !prev || prev.lastTick < this.tickCount - 1;
      this.pairState.set(key, { lastTick: this.tickCount });
      const ev = {
        type: isNew ? 'impact' : 'grind', A: agg.A, B: agg.B, impulse: agg.impulse, approach: agg.approach,
        point: agg.point.toArray(), normal: agg.normal.toArray(), layerA: agg.layerA, layerB: agg.layerB,
        faceA: agg.faceA, faceB: agg.faceB, counterA: agg.counterA, counterB: agg.counterB,
        liftA: agg.liftA, liftB: agg.liftB, time: this.time,
        energy: this._eSnap?.get(key) ? { before: this._eSnap.get(key).before, after: this._eSnap.get(key).after } : null,
      };
      this.events.push(ev);
      for (const t of [agg.A, agg.B]) {
        if (isNew) t.telemetry.contacts++;
        if (agg.impulse > t.telemetry.maxImpulseReceived) t.telemetry.maxImpulseReceived = agg.impulse;
        t.telemetry.impulseReceived += agg.impulse;
      }
      this.applyBurstStress(agg.B, agg.counterB, agg.liftB, agg.A, agg.layerA);
      this.applyBurstStress(agg.A, agg.counterA, agg.liftA, agg.B, agg.layerB);
    }
    for (const [, agg] of this.wallAgg) {
      const t = agg.top;
      const prev = t._lastWallTick ?? -10;
      const isNew = prev < this.tickCount - 1;
      t._lastWallTick = this.tickCount;
      if (isNew) t.telemetry.wallHits++;
      this.events.push({
        type: isNew ? 'wall' : 'wallGrind', top: t, impulse: agg.impulse, approach: agg.approach,
        point: agg.point.toArray(), normal: agg.normal.toArray(), layer: agg.layer, time: this.time,
      });
    }
    // moving parts (springs, clutches, tip shifts)
    if (this.tops.some((t) => t.mech)) this.events.push(...mechanismsPostTick(this, [...this.pairAgg.values()], TICK));
    // per-top state
    for (const t of this.tops) {
      if (!t.isFiniteState()) {
        // numerical recovery: restore last good tick, kill velocity spikes
        if (t._safe) { t.restore(t._safe); t.v.scale(0.5); }
        this.instabilityRecoveries++;
        this.events.push({ type: 'recovered', top: t, time: this.time });
      }
      if (!t.active) continue;
      t.contactTip = t._tickTip || t.contactTip;
      if (!t._tickTip) { t.airTime += TICK; t.telemetry.airTime += TICK; } else t.airTime = 0;
      t.scraping = t._tickScrape;
      t.scrapeTime = t.scraping ? t.scrapeTime + TICK : Math.max(0, t.scrapeTime - TICK * 2);
      t.lastSupportN = t._tickSupport / TICK;
      // lock recovery of partial stress (full notches are permanent)
      const rec = (t.spec.burst.recovery || 0) * TICK;
      if (rec > 0) t.burstNotches = Math.max(Math.floor(t.burstNotches), t.burstNotches - rec);
      this.checkFinish(t);
    }
  }

  applyBurstStress(target, counter, lift, attacker, attackerLayer) {
    if (!target.active) return;
    const burst = target.spec.burst;
    const catchF = (attackerLayer?.catch ?? 0.5) * attacker.mods.burstStressDealt;
    const R = attackerLayer?.radius ?? 0.02;
    const Q = (counter * catchF + lift * R * 0.35) * (attacker.nextHitStressMul || 1);
    const T = burst.threshold * target.mods.burstThreshold * (target.lockCondition ?? 1);
    const stress = Q / Math.max(1e-9, T);
    if (stress > PHYSICS.burstMinStress) {
      const before = Math.floor(target.burstNotches);
      target.burstNotches += (stress - PHYSICS.burstMinStress) * PHYSICS.burstRate;
      const after = Math.floor(target.burstNotches);
      if (after > before) {
        this.events.push({ type: 'lockClick', top: target, notches: target.burstNotches, max: burst.notches, count: after - before, time: this.time });
      }
    }
    target.lastStress = stress;
  }

  checkFinish(t) {
    const arena = this.arena;
    const r = Math.hypot(t.p.x, t.p.z);
    const ang = Math.atan2(t.p.z, t.p.x);
    const opening = arena.openingAt(ang);
    // ring out: centre past the wall line through an exit, outside the wall, or dropped below the floor
    if ((opening && r > arena.radius + t.spec.radius * 0.15) || r > arena.radius + t.spec.radius * 0.9 ||
        t.p.y < arena.edgeHeight - 0.08) {
      this.finish(t, 'out');
      return;
    }
    if (t.burstNotches >= t.spec.burst.notches) {
      this.finish(t, 'burst');
      return;
    }
    const spin = t.spinAbs;
    if (spin < 6) { this.finish(t, 'stopped'); return; }
    if (t.tilt > 1.05 && t.scrapeTime > 0.35) { this.finish(t, 'toppled'); return; }
    if (t.tilt > 1.35) { this.finish(t, 'toppled'); }
  }

  // ------------------------------------------------------------ ability helpers
  // All three book their energy changes to the 'ability' ledger.

  // Instantaneous velocity change along dir, paid for with spin energy.
  applyDash(t, dir, speed, efficiency = 0.6) {
    if (!t.active) return 0;
    const before = t.linearEnergy();
    t.v.addScaled(dir, speed);
    const work = t.linearEnergy() - before;
    const drained = t.drainSpinEnergy(Math.max(0.01, work) / Math.max(0.1, efficiency));
    t.ledger.ability += work - drained;
    this.events.push({ type: 'dash', top: t, speed, time: this.time });
    return drained;
  }

  // Radial impulse from source onto target if in range; energy injected from the spirit meter.
  applyShockwave(source, target, impulse, range) {
    if (!target.active) return 0;
    const dx = target.p.x - source.p.x, dz = target.p.z - source.p.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 1e-5) return 0;
    const J = impulse * Math.sqrt(1 - d / range);
    const before = target.totalEnergy();
    _J.set((dx / d) * J, J * 0.08, (dz / d) * J);
    target.v.addScaled(_J, target.invMass);
    target.ledger.ability += target.totalEnergy() - before;
    this.events.push({ type: 'shockwaveHit', source, top: target, impulse: J, time: this.time });
    return J;
  }

  // Add spin energy (J) from the spirit meter.
  restoreSpin(t, energy) {
    if (!t.active) return 0;
    const e = t.addSpinEnergy(energy);
    t.ledger.ability += e;
    return e;
  }

  finish(t, how) {
    if (!t.active) return;
    t.state = how;
    t.active = false;
    if (how === 'out') {
      // keep flying outward for the presentation
    } else if (how === 'burst') {
      // pieces fly apart in the renderer; body continues ballistically
      t.v.y += 0.8;
    } else {
      t.v.scale(0.2);
    }
    this.events.push({ type: 'finish', top: t, how, time: this.time });
  }
}
