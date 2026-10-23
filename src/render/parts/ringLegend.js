// The Four Founders' attack rings (data/legends.js), one-to-one on the rings
// of the first plastic-gen tops they are modelled on, in the classic-series
// style (ringClassic.js): moulded body from the physics outline plus the
// parts that make each ring what it is, and a printed sticker sheet. Each
// keeps its own fixed palette: a legend looks the same in every hand.
//
//   leg_ring_azure     Reverse Dragon style: four left-spin attack edges
//   leg_ring_vermilion Double Wing style: two broad smash wings, raked up
//   leg_ring_white     Tiger Defenser style: round guard, small rounded claws
//   leg_ring_black     Cross Spike style: square shell with four heads
//
// Same envelope as the classic rings (every point inside the profile radius
// at its azimuth, y in [0, thickness + 1.5]).

import * as THREE from 'three';
import { MM, TAU } from './common.js';
import { kit, finishKit, solid, shapeOf, outline, keyedHole, gemSpike, bar, decalPlate, sheet, P2, rarityLine, clamp } from './ringClassic.js';

const blades = (K) => {
  const N = K.L.blades | 0, P = TAU / Math.max(1, N), w = K.L.bladeWidth ?? 0.4, hand = K.L.hand || 0;
  // azimuth of a point t along blade k (t: 0 = ramp root .. 1 = leading face)
  const at = (k, t) => (hand < 0 ? (k + 1 - t * w) * P : (k + t * w) * P);
  return { N, P, w, hand, at };
};
const polar = (v) => [Math.hypot(v.x, v.y), Math.atan2(v.y, v.x)];

// Reverse Drake: white body, four swept attack edges in red with black
// teeth, a blue storm-dragon sticker between them.
function azure(part, ctx) {
  const K = kit(part, { ...ctx, accent: '#f2f5fb' }), T = K.T;
  const B = blades(K);
  K.bins.body.push(solid(shapeOf(outline((psi) => K.Rp(psi) - 0.4, K.n), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35));
  const edgeR = (k, t) => K.Rp(B.at(k, t)) - 0.7;
  for (let k = 0; k < B.N; k++) {
    // the attack edge: a raised red fin along the outer half of each blade
    const pts = [];
    for (let i = 0; i <= 18; i++) { const t = 0.25 + 0.72 * (i / 18); pts.push(P2(edgeR(k, t), B.at(k, t))); }
    for (let i = 18; i >= 0; i--) { const t = 0.25 + 0.72 * (i / 18); pts.push(P2(Math.max(K.hole + 6, edgeR(k, t) - 3.4 - 1.6 * t), B.at(k, t))); }
    K.bins.sec.push(solid(shapeOf(pts), T - 0.2, T + 0.9, 0.2));
    // a black tooth at the leading face
    K.bins.dark.push(gemSpike(edgeR(k, 0.92) - 4.2, edgeR(k, 0.95) - 0.2, B.at(k, 0.9), 0.07, T + 0.6, T + 1.45));
  }
  // bit-chip holder: a raised collar round the hub
  K.bins.dark.push(solid(shapeOf(outline(() => K.hole + 2.8, K.nh), [new THREE.Path(outline(() => K.hole + 1.4, K.nh).reverse())]), T - 0.2, T + 0.7, 0.2));
  K.bins.decal.push(decalPlate(shapeOf(outline((psi) => K.Rp(psi) - 1.0, K.n), [new THREE.Path(outline(() => K.hole + 3.0, K.nh).reverse())]), T + 0.02));
  const st = sheet(K.low ? 256 : 512, (H) => {
    // a blue band round the hub: the dragon's coiled body, scales printed on it
    H.band(K.hole + 3.0, K.hole + 7.6, 0, TAU, '#2f8bff');
    H.band(K.hole + 6.8, K.hole + 7.6, 0, TAU, '#1c4fa8');
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; H.poly([[K.hole + 4.2, a - 0.07], [K.hole + 5.6, a], [K.hole + 4.2, a + 0.07], [K.hole + 4.8, a]], '#bfe2ff'); }
    for (let k = 0; k < B.N; k++) {
      // storm swirls sweeping out from the band toward each edge
      for (let j = 0; j < 3; j++) H.band(K.hole + 8.2 + j * 1.5, K.hole + 8.9 + j * 1.5, B.at(k, -0.55 + j * 0.12), B.at(k, -0.1 + j * 0.12), j === 1 ? '#62b6ff' : '#2f8bff');
    }
    // the dragon's head and horns at one point of the band
    H.poly([[K.hole + 3.2, 1.35], [K.hole + 9.2, 1.57], [K.hole + 3.2, 1.79]], '#1c4fa8');
    H.dot(K.hole + 6.6, 1.57, 0.55, '#ffe14d');
    H.text('AZURE TEMPEST', K.hole + 5.2, -Math.PI / 2, 1.5, '#ffffff');
    rarityLine(K, H, K.hole + 3.4);
  });
  return finishKit(K, { sheet: st, sec: '#e0302a', dark: '#14171e' });
}

// Vermilion Wing: red body raked upward, two broad wings with a serrated
// feather trailing edge and a flame sticker, gold crest at the hub.
function vermilion(part, ctx) {
  const K = kit(part, { ...ctx, accent: '#d92a1c' }), T = K.T, L = K.L;
  const B = blades(K);
  const tk = Math.tan(Math.abs(L.slope || 0));
  const body = solid(shapeOf(outline((psi) => K.Rp(psi) - 0.4, K.n), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) / MM, z = p.getZ(i), r = Math.hypot(x, z) / MM;
    if (r < K.hole + 4) continue;
    const d = Math.max(0, y - T / 2) * tk * clamp((r - K.hole - 4) / 3, 0, 1);
    p.setXYZ(i, x * (r - d) / r, p.getY(i), z * (r - d) / r);
  }
  body.computeVertexNormals();
  K.bins.body.push(body);
  const edge = (k, t) => K.Rp(B.at(k, t)) - tk * (T / 2) - 1.0;
  for (let k = 0; k < B.N; k++) {
    // the wing: raised panel whose trailing edge is cut into feathers
    const pts = [];
    for (let i = 0; i <= 24; i++) { const t = 0.08 + 0.88 * (i / 24); pts.push(P2(edge(k, t), B.at(k, t))); }
    for (let i = 24; i >= 0; i--) {
      const t = 0.08 + 0.88 * (i / 24), notch = i % 4 < 2 ? 0 : 1.1;
      pts.push(P2(K.hole + 4.2 + notch + 2.2 * (1 - t), B.at(k, t)));
    }
    K.bins.dark.push(solid(shapeOf(pts), T - 0.2, T + 0.75, 0.2));
    K.bins.decal.push(decalPlate(shapeOf(pts), T + 0.77));
  }
  // gold crest at the hub, three points
  for (let i = 0; i < 3; i++) K.bins.sec.push(gemSpike(K.hole + 1.6, K.hole + 4.4, (i * TAU) / 3 + Math.PI / 2, 0.22, T - 0.2, T + 1.3));
  const st = sheet(K.low ? 256 : 512, (H) => {
    for (let k = 0; k < B.N; k++) {
      const gr = H.grad([[0, '#fff06a'], [0.5, '#ffb21e'], [1, '#ff3a1f']], K.hole + 4, B.at(k, 0.5), edge(k, 0.5), B.at(k, 0.5));
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = 0.12 + 0.82 * (i / 12); pts.push([edge(k, t) - 0.4, B.at(k, t)]); }
      for (let i = 12; i >= 0; i--) { const t = 0.12 + 0.82 * (i / 12); pts.push([K.hole + 5.6 + 2.2 * (1 - t), B.at(k, t)]); }
      H.poly(pts, gr);
      for (let j = 0; j < 4; j++) { const t = 0.2 + j * 0.18; H.poly([[K.hole + 6.2, B.at(k, t)], [edge(k, t + 0.1) - 1.2, B.at(k, t + 0.1)], [K.hole + 6.2, B.at(k, t + 0.06)]], '#fff6c8'); }
    }
    rarityLine(K, H, K.hole + 2.0);
  });
  return finishKit(K, { sheet: st, dark: '#8c1410', sec: '#ffd23f' });
}

// White Fang: a round white guard; each small claw gets a green rounded
// talon, three tiger stripes printed behind it.
function white(part, ctx) {
  const K = kit(part, { ...ctx, accent: '#f4f1e6' }), T = K.T;
  const B = blades(K);
  K.bins.body.push(solid(shapeOf(outline((psi) => K.Rp(psi) - 0.4, K.n), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35));
  const base = K.L.baseRadius / MM;
  for (let k = 0; k < B.N; k++) {
    // talon: a curved green hook riding the claw
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = 0.15 + 0.8 * (i / 14); pts.push(P2(K.Rp(B.at(k, t)) - 0.6, B.at(k, t))); }
    for (let i = 14; i >= 0; i--) { const t = 0.15 + 0.8 * (i / 14); pts.push(P2(base - 2.6 + 1.2 * t, B.at(k, t))); }
    K.bins.sec.push(solid(shapeOf(pts), T - 0.2, T + 0.9, 0.3));
    K.bins.dark.push(gemSpike(base - 2.4, K.Rp(B.at(k, 0.85)) - 0.4, B.at(k, 0.85), 0.06, T + 0.6, T + 1.4));
  }
  // smooth inner collar
  K.bins.dark.push(solid(shapeOf(outline(() => K.hole + 3.0, K.nh), [new THREE.Path(outline(() => K.hole + 1.5, K.nh).reverse())]), T - 0.2, T + 0.6, 0.2));
  K.bins.decal.push(decalPlate(shapeOf(outline(() => base - 2.8, K.n), [new THREE.Path(outline(() => K.hole + 3.2, K.nh).reverse())]), T + 0.02));
  const st = sheet(K.low ? 256 : 512, (H) => {
    H.band(K.hole + 3.2, base - 2.8, 0, TAU, '#e9e4d3');
    for (let k = 0; k < B.N; k++) for (let j = 0; j < 3; j++) {
      const a = B.at(k, -0.3 - j * 0.22);
      H.poly([[K.hole + 4.0, a - 0.05], [base - 3.4, a - 0.12], [base - 3.0, a - 0.02], [K.hole + 4.6, a + 0.06]], '#1a1a22');
    }
    for (let k = 0; k < B.N; k++) H.dot(K.hole + 5.2, B.at(k, 0.5), 0.7, '#3ad86b');
    rarityLine(K, H, K.hole + 3.6);
  });
  return finishKit(K, { sheet: st, sec: '#3ad86b', dark: '#1a1a22' });
}

// Black Bulwark: a square shell. Four turtle heads at the corners, a
// raised hexagon plate between each pair, shell pattern printed on top.
function black(part, ctx) {
  const K = kit(part, { ...ctx, accent: '#1f4f7a' }), T = K.T;
  const B = blades(K);
  K.bins.body.push(solid(shapeOf(outline((psi) => K.Rp(psi) - 0.4, K.n), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.12)); // small bevel: the quad core fills the hole
  const base = K.L.baseRadius / MM;
  const mid = (k) => (k + B.w / 2) * B.P; // corner centre (symmetric lobes)
  for (let k = 0; k < B.N; k++) {
    const c = mid(k), R = K.Rp(c) - 0.6;
    // head: a rounded snout poking out at the corner, two eye studs
    K.bins.sec.push(solid(shapeOf(outline(() => 2.1, 20).map((v) => v.add(P2(R - 2.3, c)))), T - 0.2, T + 1.2, 0.5));
    K.bins.dark.push(solid(shapeOf(outline(() => 0.45, 10).map((v) => v.add(P2(R - 2.6, c + 0.07)))), T + 1.2, T + 1.45, 0.1));
    K.bins.dark.push(solid(shapeOf(outline(() => 0.45, 10).map((v) => v.add(P2(R - 2.6, c - 0.07)))), T + 1.2, T + 1.45, 0.1));
    // a low flat spike either side of the head
    for (const s of [-1, 1]) K.bins.dark.push(gemSpike(R - 5.5, K.Rp(c + s * 0.3) - 0.6, c + s * 0.28, 0.07, T - 0.2, T + 0.5));
    // hex shell plate on the flat side
    const f = c + B.P / 2, rc = (K.hole + base) / 2 + 0.8;
    const hex = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * TAU; return new THREE.Vector2(Math.cos(a) * 3.0, Math.sin(a) * 3.0).add(P2(rc, f)); });
    K.bins.dark.push(solid(shapeOf(hex), T - 0.2, T + 0.55, 0.2));
  }
  K.bins.decal.push(decalPlate(shapeOf(outline((psi) => K.Rp(psi) - 1.0, K.n), [new THREE.Path(outline(() => K.hole + 1.4, K.nh).reverse())]), T + 0.02));
  const st = sheet(K.low ? 256 : 512, (H) => {
    // shell scutes: a ring of lines and spokes in pale blue on the navy shell
    H.band(K.hole + 6.0, K.hole + 6.5, 0, TAU, '#8fe0ff');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      H.poly([[K.hole + 1.6, a - 0.03], [K.hole + 6.0, a - 0.015], [K.hole + 6.0, a + 0.015], [K.hole + 1.6, a + 0.03]], '#8fe0ff');
    }
    rarityLine(K, H, K.hole + 1.2);
  });
  return finishKit(K, { sheet: st, sec: '#2b7a5a', dark: '#0f2236' });
}

export const LEGEND_RINGS = { leg_ring_azure: azure, leg_ring_vermilion: vermilion, leg_ring_white: white, leg_ring_black: black };
