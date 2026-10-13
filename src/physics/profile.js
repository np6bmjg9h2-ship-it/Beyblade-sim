// Radial contact profile of a contact layer (attack ring, disc rim, skirt).
// Shared by the physics (collision reach and blade-face normal) and the
// renderer (the ring mesh is extruded from exactly this profile), so what you
// see is what collides.
//
// Azimuth convention: psi = atan2(-z, x) in the body frame, so a positive spin
// (counter-clockwise seen from above) increases psi. "Right spin" in game
// terms is clockwise seen from above, i.e. spin sign -1.

import { TAU, smoothstep } from '../core/math.js';
import * as dm from '../core/dmath.js';

// Returns { radius, face } where face in [0,1] is how much of the blade face
// angle is engaged at this azimuth for the given spin direction.
export function sampleProfile(layer, psi, spinSign, out = { radius: 0, face: 0 }) {
  const N = layer.blades | 0;
  if (N <= 0 || layer.radius <= layer.baseRadius) {
    out.radius = layer.radius;
    out.face = layer.blades < 0 ? 0 : 0;
    return out;
  }
  let ph = (psi / TAU) * N;
  ph -= Math.floor(ph);
  const hand = layer.hand || 0;
  const w = layer.bladeWidth ?? 0.55; // blade fraction of each period
  let lam = hand >= 0 ? ph : 1 - ph;
  let bump, face;
  if (hand === 0) {
    // symmetric blade centred in [0, w]; faces at both ends
    const rise = smoothstep(0, 0.12, lam) * (1 - smoothstep(w - 0.12, w, lam));
    bump = rise;
    face = (smoothstep(0, 0.06, lam) * (1 - smoothstep(0.08, 0.16, lam)) +
            smoothstep(w - 0.16, w - 0.08, lam) * (1 - smoothstep(w - 0.06, w, lam))) * 0.8;
  } else {
    // sawtooth: gentle ramp from lam=0 up to the leading face at lam=w
    bump = smoothstep(0, w * 0.7, lam) * (1 - smoothstep(w - 0.035, w, lam));
    const matched = hand * spinSign > 0;
    if (matched) face = smoothstep(w - 0.22, w - 0.08, lam) * (1 - smoothstep(w - 0.03, w + 0.01, lam));
    else face = 0.25 * (1 - smoothstep(0.0, w * 0.5, lam)) * smoothstep(0, 0.05, lam);
  }
  out.radius = layer.baseRadius + (layer.radius - layer.baseRadius) * bump;
  out.face = face;
  return out;
}

// Discretised outline used by the renderer.
export function profileOutline(layer, segments = 256, spinSign = 1) {
  const pts = [];
  const tmp = { radius: 0, face: 0 };
  for (let i = 0; i < segments; i++) {
    const psi = (i / segments) * TAU;
    sampleProfile(layer, psi, spinSign, tmp);
    pts.push([dm.cos(psi) * tmp.radius, -dm.sin(psi) * tmp.radius]);
  }
  return pts;
}
