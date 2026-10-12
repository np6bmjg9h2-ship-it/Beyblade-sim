// Rigid-body state of an assembled spinning top.
//
// Dynamics model (axisymmetric rigid body):
//   state: COM position p, velocity v, orientation q, angular momentum L (world, about COM)
//   inertia: I3 about the symmetry axis, I1 transverse (both about the COM)
//   omega = L / I1 + (1/I3 - 1/I1) (L.a) a        (a = symmetry axis in world)
// Torque-free motion is integrated analytically each substep (rotation about
// L at |L|/I1 plus body spin about a), so gyroscopic stiffness, precession and
// nutation emerge from the equations rather than being animated. All forces
// (gravity reaction at the tip, collisions, friction) enter as impulses on
// v and L.

import { Vec3, Quat, clamp } from '../core/math.js';
import { initMechanisms } from './mechanisms.js';

export const GRAVITY = 9.81;

const BODY_UP = new Vec3(0, 1, 0);
const _v = new Vec3();
const _w = new Vec3();
const _q = new Quat();
const _q2 = new Quat();

// Modifier channels read by the simulation every substep. Traits, sets,
// abilities, skills and Bit-Beast passives write into these (see
// systems/modifiers.js). Multipliers default to 1, additive values to 0.
export function defaultMods() {
  return {
    faceAngle: 0, // additive radians on attack layers' blade face angle
    restitution: 1, // multiplier on contact restitution (top-top)
    restitutionWhenHit: 1, // multiplier when the opponent is the faster closer
    contactFriction: 1, // multiplier on top-top contact friction
    tipFriction: 1, // multiplier on tip lateral friction
    tipSpinDrag: 1, // multiplier on tip torsional (spin) friction
    aeroDrag: 1, // multiplier on air drag torque
    wallFriction: 1,
    wallRestitution: 1,
    burstThreshold: 1, // multiplier on lock notch threshold
    burstStressDealt: 1, // multiplier on burst stress inflicted via ring catch
    nutationDamping: 0, // 1/s damping of transverse angular momentum
    tiltImpulseScale: 1, // multiplier on the torque part of received collision impulses
    steerForce: 1,
    steerEfficiency: 1,
    abilityCharge: 1,
    abilityDuration: 1,
    abilityPower: 1,
    liftForce: 0, // fraction of weight supplied as upward force (abilities)
    massScale: 1, // reserved for abilities that change effective mass (kept 1 for physics consistency)
    grindLoss: 1, // multiplier on friction for minor contacts
  };
}

export class TopBody {
  constructor(spec, opts = {}) {
    this.id = opts.id ?? 'top';
    this.side = opts.side ?? 0;
    this.setSpec(spec);
    this.p = new Vec3();
    this.v = new Vec3();
    this.q = new Quat();
    this.L = new Vec3();
    this.a = new Vec3(0, 1, 0);
    this.w = new Vec3();
    this.prevP = new Vec3();
    this.prevQ = new Quat();
    this.mods = defaultMods();
    this.baseMods = defaultMods();
    this.state = 'idle'; // idle | spinning | toppled | out | burst | stopped
    this.active = false;
    this.spinDir = 1;
    this.burstNotches = 0; // progressed notches (fractional)
    this.contactTip = false;
    this.tipContactTime = 0;
    this.scraping = false;
    this.scrapeTime = 0;
    this.airTime = 0;
    this.lastTipNormal = new Vec3(0, 1, 0);
    this.lastTipPoint = new Vec3();
    this.lastSupportN = 0; // normal impulse per tick at tip (for stats)
    this.control = { steer: new Vec3(), steerActive: false };
    this.forces = []; // transient external forces (abilities)
    this.ledger = null; // set by simulation
    this.initialSpinEnergy = 1;
    this.maxSpinRate = 1;
  }

  setSpec(spec) {
    this.spec = spec;
    this.mass = spec.mass;
    this.invMass = 1 / spec.mass;
    this.I1 = spec.I1;
    this.I3 = spec.I3;
    this.invI1 = 1 / spec.I1;
    this.invI3 = 1 / spec.I3;
    this.axisOffset = new Vec3().fromArray(spec.axisOffset || [0, 0, 0]);
    this.tip = { ...spec.tip }; // live tip: clutches and shifts change it mid-battle
    this.mech = null;
  }

  // Place the top: tip end resting at `tipPos`, axis direction `axis`,
  // signed spin rate (rad/s), initial velocity.
  launch({ tipPos, axis, spin, velocity, precessionKick }) {
    const ax = axis.clone().normalize();
    this.q.setFromUnitVectors(BODY_UP, ax);
    this.a.copy(ax);
    // COM = tipPos - (tip end point relative to COM)
    const endBody = _v.set(this.axisOffset.x, this.spec.tip.endZ, this.axisOffset.z).applyQuat(this.q);
    this.p.copy(tipPos).sub(endBody);
    this.v.copy(velocity || new Vec3());
    this.spinDir = spin >= 0 ? 1 : -1;
    this.L.copy(ax).scale(this.I3 * spin);
    if (precessionKick) this.L.add(precessionKick);
    this.updateDerived();
    this.prevP.copy(this.p);
    this.prevQ.copy(this.q);
    this.state = 'spinning';
    this.active = true;
    this.burstNotches = 0;
    this.tip = { ...this.spec.tip };
    this.mech = initMechanisms(this); // a clutch winds its gear from the launch spin
    this.initialSpinEnergy = Math.max(1e-6, this.spinEnergy());
    this.maxSpinRate = this.mech?.clutchStored ? this.spinAbs : Math.abs(spin);
  }

  updateDerived() {
    this.a.copy(BODY_UP).applyQuat(this.q);
    const La = this.L.dot(this.a);
    // w = L/I1 + (1/I3 - 1/I1)(L.a)a
    this.w.copy(this.L).scale(this.invI1).addScaled(this.a, (this.invI3 - this.invI1) * La);
  }

  // out = I^-1 x (world)
  invInertiaMul(x, out) {
    const xa = x.dot(this.a);
    out.copy(x).scale(this.invI1).addScaled(this.a, (this.invI3 - this.invI1) * xa);
    return out;
  }

  // Signed spin rate about the symmetry axis (rad/s).
  get spinRate() { return this.L.dot(this.a) * this.invI3; }
  get spinAbs() { return Math.abs(this.spinRate); }

  // Tilt of symmetry axis away from world vertical (radians).
  get tilt() { return Math.acos(clamp(this.a.y, -1, 1)); }

  // Velocity of a point at offset r (world) from the COM.
  pointVelocity(r, out) {
    return out.crossVectors(this.w, r).add(this.v);
  }

  applyImpulse(J, r) {
    this.v.addScaled(J, this.invMass);
    _w.crossVectors(r, J);
    this.L.add(_w);
    this.updateOmegaOnly();
  }

  applyAngularImpulse(t) {
    this.L.add(t);
    this.updateOmegaOnly();
  }

  updateOmegaOnly() {
    const La = this.L.dot(this.a);
    this.w.copy(this.L).scale(this.invI1).addScaled(this.a, (this.invI3 - this.invI1) * La);
  }

  // World position of a body-frame point.
  toWorld(bp, out) { return out.copy(bp).applyQuat(this.q).add(this.p); }

  // World position of the point on the geometric axis at axial offset z.
  axisPoint(z, out) {
    out.set(this.axisOffset.x, z, this.axisOffset.z).applyQuat(this.q).add(this.p);
    return out;
  }

  // Body-frame azimuth (radians) of a world direction lying in the ring plane.
  bodyAzimuth(dirWorld) {
    _q.set(-this.q.x, -this.q.y, -this.q.z, this.q.w);
    _v.copy(dirWorld).applyQuat(_q);
    return Math.atan2(-_v.z, _v.x);
  }

  // Analytic torque-free rotation for one substep.
  integrateOrientation(dt) {
    const La = this.L.dot(this.a);
    const spinRel = La * (this.invI3 - this.invI1);
    // body-frame spin about symmetry axis
    _q.setAxisAngle(BODY_UP, spinRel * dt);
    this.q.multiply(_q);
    const Lm = this.L.length();
    if (Lm > 1e-12) {
      _v.copy(this.L).scale(1 / Lm);
      _q2.setAxisAngle(_v, Lm * this.invI1 * dt);
      this.q.premultiply(_q2);
    }
    this.q.normalize();
    this.updateDerived();
  }

  linearEnergy() { return 0.5 * this.mass * this.v.lengthSq(); }
  rotationalEnergy() { return 0.5 * this.L.dot(this.w); }
  spinEnergy() { const s = this.spinRate; return 0.5 * this.I3 * s * s; }
  potentialEnergy() { return this.mass * GRAVITY * this.p.y; }
  totalEnergy() { return this.linearEnergy() + this.rotationalEnergy() + this.potentialEnergy(); }

  // Remove spin energy dE (J) from rotation about the symmetry axis. Returns energy actually removed.
  drainSpinEnergy(dE) {
    if (dE <= 0) return 0;
    const La = this.L.dot(this.a);
    const E = (La * La) / (2 * this.I3);
    const newE = Math.max(0, E - dE);
    const newLa = Math.sign(La) * Math.sqrt(2 * this.I3 * newE);
    this.L.addScaled(this.a, newLa - La);
    this.updateOmegaOnly();
    return E - newE;
  }

  // Add spin energy (used only by abilities whose rules explicitly allow it).
  addSpinEnergy(dE) {
    if (dE <= 0) return 0;
    const La = this.L.dot(this.a);
    const E = (La * La) / (2 * this.I3);
    const sign = La === 0 ? this.spinDir : Math.sign(La);
    const newLa = sign * Math.sqrt(2 * this.I3 * (E + dE));
    this.L.addScaled(this.a, newLa - La);
    this.updateOmegaOnly();
    return dE;
  }

  spinFraction() {
    return this.maxSpinRate > 0 ? clamp(this.spinAbs / this.maxSpinRate, 0, 1.5) : 0;
  }

  // Pass an earlier snapshot to refill it in place (the simulation takes one per top every tick).
  snapshot(out = null) {
    const s = out || { p: [], v: [], q: [], L: [] };
    this.p.toArray(s.p); this.v.toArray(s.v); this.q.toArray(s.q); this.L.toArray(s.L);
    s.state = this.state; s.burstNotches = this.burstNotches; s.active = this.active;
    return s;
  }

  restore(s) {
    this.p.fromArray(s.p); this.v.fromArray(s.v); this.q.fromArray(s.q); this.L.fromArray(s.L);
    this.state = s.state; this.burstNotches = s.burstNotches; this.active = s.active;
    this.updateDerived();
  }

  isFiniteState() {
    return this.p.isFinite() && this.v.isFinite() && this.q.isFinite() && this.L.isFinite();
  }
}
