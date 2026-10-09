// Arena geometry and surface properties.
//
// An arena is an axisymmetric bowl described by a radial height profile
// y = H(r) (monotone cubic interpolation through data-driven knots), a
// cylindrical outer wall with optional openings (knockout exits), and radial
// friction bands. Everything the physics needs (height, normal, friction,
// wall test) is evaluated analytically, so it's cheap and exact.

import { clamp, wrapAngle, DEG } from '../core/math.js';

function buildMonotoneSpline(knots) {
  // knots: [[x, y], ...] with strictly increasing x
  const n = knots.length;
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  // Fritsch-Carlson monotonicity fix
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return { xs, ys, m };
}

function evalSpline(sp, x, out) {
  const { xs, ys, m } = sp;
  const n = xs.length;
  if (x <= xs[0]) { out.y = ys[0] + m[0] * (x - xs[0]); out.dy = m[0]; return out; }
  if (x >= xs[n - 1]) { out.y = ys[n - 1] + m[n - 1] * (x - xs[n - 1]); out.dy = m[n - 1]; return out; }
  let i = 0;
  // knots are few; linear scan is fine
  while (i < n - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const t = (x - xs[i]) / h;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  out.y = h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  const dh00 = 6 * t2 - 6 * t, dh10 = 3 * t2 - 4 * t + 1, dh01 = -6 * t2 + 6 * t, dh11 = 3 * t2 - 2 * t;
  out.dy = (dh00 * ys[i] + dh10 * h * m[i] + dh01 * ys[i + 1] + dh11 * h * m[i + 1]) / h;
  return out;
}

export class Arena {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.radius = def.radius; // wall radius (m)
    this.spline = buildMonotoneSpline(def.profile);
    this.wallHeight = def.wall.height; // height of wall rim above floor edge
    this.wallRestitution = def.wall.restitution;
    this.wallFriction = def.wall.friction;
    this.wallLean = def.wall.lean ?? 0.12;
    this.openings = (def.wall.openings || []).map((o) => ({
      center: o.angle * DEG,
      half: (o.width * DEG) / 2,
      lipHeight: o.lipHeight ?? 0,
    }));
    this.floorFriction = def.surface.friction; // multiplier on tip friction
    this.floorRestitution = def.surface.restitution ?? 0.2;
    this.surfaceTag = def.surface.tag || 'standard';
    this.bands = def.bands || [];
    this.spinDragMul = def.surface.spinDrag ?? 1;
    this._tmp = { y: 0, dy: 0 };
    this.edgeHeight = this.heightAtR(this.radius);
    this.rimY = this.edgeHeight + this.wallHeight;
    // 0..1: how easily a top leaves this stadium (open exits, low walls, little centring)
    const exitFrac = this.openings.reduce((s, o) => s + (o.lipHeight > 0.004 ? 0.3 : 1) * o.half * 2, 0) / (Math.PI * 2);
    this.danger = Math.min(1, exitFrac * 2.2 + (this.wallHeight < 0.02 ? 0.3 : 0) + (this.edgeHeight < 0.015 ? 0.15 : 0));
  }

  heightAtR(r) { return evalSpline(this.spline, r, this._tmp).y; }
  slopeAtR(r) { return evalSpline(this.spline, r, this._tmp).dy; }

  // Floor height at (x, z). Writes the unit surface normal into nOut if given.
  height(x, z, nOut) {
    const r = Math.sqrt(x * x + z * z);
    if (r > this.radius + 0.0005) {
      // beyond the wall line there is no floor (exits drop into the pit)
      if (nOut) { nOut.x = 0; nOut.y = 1; nOut.z = 0; }
      return this.edgeHeight - 0.5;
    }
    const e = evalSpline(this.spline, r, this._tmp);
    if (nOut) {
      const s = e.dy; // dH/dr
      let gx = 0, gz = 0;
      if (r > 1e-9) { gx = (s * x) / r; gz = (s * z) / r; }
      // normal of y - H(x,z) = 0 is (-Hx, 1, -Hz)
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      nOut.x = -gx * inv; nOut.y = inv; nOut.z = -gz * inv;
    }
    return e.y;
  }

  // Friction multiplier at radius r (bands + base surface).
  frictionAt(x, z) {
    let mu = this.floorFriction;
    if (this.bands.length) {
      const r = Math.sqrt(x * x + z * z);
      for (const b of this.bands) {
        if (r >= b.r0 && r <= b.r1) {
          // soft edges to avoid discontinuous impulses
          const edge = 0.004;
          const w = clamp(Math.min(r - b.r0, b.r1 - r) / edge, 0, 1);
          mu *= 1 + (b.friction - 1) * w;
        }
      }
    }
    return mu;
  }

  bandTagAt(x, z) {
    const r = Math.sqrt(x * x + z * z);
    for (const b of this.bands) if (r >= b.r0 && r <= b.r1) return b.tag || null;
    return null;
  }

  // Returns the opening the angle falls in, or null.
  openingAt(angle) {
    for (const o of this.openings) {
      if (Math.abs(wrapAngle(angle - o.center)) <= o.half) return o;
    }
    return null;
  }

  // Wall rim height at an angle (opening => lip height above floor edge).
  wallTopAt(angle) {
    const o = this.openingAt(angle);
    return this.edgeHeight + (o ? o.lipHeight : this.wallHeight);
  }
}
