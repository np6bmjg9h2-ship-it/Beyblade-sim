// Performance tip models: ten individually designed tips plus a parametric
// fallback for unknown ids. Each tip is assembled from separate moulded
// pieces (exact contact end, collar/cup, housing, seating flange with lock
// tabs, metal hardware, printed decal band and top emblem). Pieces that share
// a material are merged, so a tip costs at most 6 meshes.
//
// Physical contract (part data in mm, see data/parts.js):
//   * lowest point at y = 0. Flat tips: a flat face of flatRadius rounding
//     over with ballRadius. Sharp/ball tips: a sphere cap of ballRadius. That
//     contact portion is generated exactly (contactRuns); everything above it
//     is styling.
//   * y in [0, tipLen]; radius <= bodyRadius (+0.3 mm for the lock tabs).
//   * below the seating flange, geometry stays inside the "tilt cone": the
//     tangent from the contact end to the physics hull rim (bodyRadius at
//     0.85 * tipLen). Outside it a tilted top would sink into the floor.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM, TAU, partGroup, toonMaterial, inked, tone, segs, canvasTexture, rarityGlow, extrudeShape } from './common.js';
import { classicTipLooks } from './tipClassic.js';

const DEG = Math.PI / 180;
const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
// V-groove (panel line) in a vertical profile wall at radius r, height y
const notch = (r, y, d = 0.2, w = 0.13) => [[r, y - w], [r - d, y], [r, y + w]];

// ------------------------------------------------------------ geometry kit

// Revolve a profile around +Y into a non-indexed geometry (position, normal,
// uv). `runs` = [{ pts: [[r, y], ...] mm, smooth?, c?: [r, y] }]. Points of a
// plain run are crisp corners (per-segment normals: machined, hard-edged);
// `smooth` runs average normals; `c` gives exact normals of a sphere/torus
// about that centre. Profiles go bottom-centre -> out -> up -> top-centre for
// outward normals. `facets` > 0 makes flat sides instead of a round body
// (corner radius = r). u runs around (0..1), v along the profile (0..1).
function revolve(runs, n, { facets = 0, phase = 0 } = {}) {
  const N = facets || n, cosF = facets ? Math.cos(Math.PI / facets) : 1;
  const S = [];
  for (const run of runs) {
    const P = run.pts;
    const sn = [];
    for (let k = 0; k < P.length - 1; k++) sn.push(unit(P[k + 1][1] - P[k][1], -(P[k + 1][0] - P[k][0])));
    for (let k = 0; k < P.length - 1; k++) {
      const p0 = P[k], p1 = P[k + 1];
      let a = sn[k], b = sn[k];
      if (run.c) { a = unit(p0[0] - run.c[0], p0[1] - run.c[1]); b = unit(p1[0] - run.c[0], p1[1] - run.c[1]); }
      else if (run.smooth) {
        if (k > 0) a = unit(sn[k - 1][0] + sn[k][0], sn[k - 1][1] + sn[k][1]);
        if (k < P.length - 2) b = unit(sn[k][0] + sn[k + 1][0], sn[k][1] + sn[k + 1][1]);
      }
      // a flat facet's normal leans less outward than the round profile's
      if (facets) { a = unit(a[0], a[1] * cosF); b = unit(b[0], b[1] * cosF); }
      S.push({ p0, p1, a, b, len: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) });
    }
  }
  const total = S.reduce((s, x) => s + x.len, 0) || 1;
  const pos = [], nor = [], uv = [];
  const put = (r, y, ang, nrm, na, u, v) => {
    pos.push(r * MM * Math.sin(ang), y * MM, r * MM * Math.cos(ang));
    nor.push(nrm[0] * Math.sin(na), nrm[1], nrm[0] * Math.cos(na));
    uv.push(u, v);
  };
  let acc = 0;
  for (const s of S) {
    const v0 = acc / total, v1 = (acc + s.len) / total;
    acc += s.len;
    const [r0, y0] = s.p0, [r1, y1] = s.p1;
    for (let i = 0; i < N; i++) {
      const a0 = phase + (TAU * i) / N, a1 = phase + (TAU * (i + 1)) / N, h = (a0 + a1) / 2;
      const u0 = i / N, u1 = (i + 1) / N;
      // quad A(a0,p0) B(a1,p0) C(a1,p1) D(a0,p1); skip triangles collapsed on the axis
      if (r0 > 1e-4) {
        put(r0, y0, a0, s.a, facets ? h : a0, u0, v0);
        put(r0, y0, a1, s.a, facets ? h : a1, u1, v0);
        put(r1, y1, a0, s.b, facets ? h : a0, u0, v1);
      }
      if (r1 > 1e-4) {
        put(r1, y1, a1, s.b, facets ? h : a1, u1, v1);
        put(r1, y1, a0, s.b, facets ? h : a0, u0, v1);
        put(r0, y0, a1, s.a, facets ? h : a1, u1, v0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Exact contact end. Flat face of radius fr at y = 0 rounding over with
// radius b about (fr, b) (fr = 0: a sphere cap of radius b). The arc runs from
// the floor up to where a straight flank towards `to` [r, y] is tangent, or
// up to arc angle `end` (radians from horizontal) when `to` is null.
function contactRuns(fr, b, to, steps, end = 0) {
  const c = [fr, b];
  let tEnd = end;
  if (to) {
    const vx = to[0] - c[0], vy = to[1] - c[1];
    tEnd = Math.atan2(vy, vx) - Math.acos(Math.min(1, b / Math.hypot(vx, vy)));
  }
  const arc = [];
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + ((tEnd + Math.PI / 2) * i) / steps;
    arc.push([Math.max(0, c[0] + b * Math.cos(t)), c[1] + b * Math.sin(t)]);
  }
  const runs = [];
  if (fr > 0.01) runs.push({ pts: [[0, 0], [fr, 0]] });
  runs.push({ pts: arc, c });
  if (to) runs.push({ pts: [arc[arc.length - 1], to] });
  return { runs, top: to || arc[arc.length - 1] };
}

// Lowest allowed y (mm) at radius r below the flange: the tangent from the
// contact end to the physics hull rim (bodyRadius at 0.85 * tipLen).
function tiltCone(part, L) {
  const b = part.ballRadius, fr = part.flatRadius > 0.2 ? part.flatRadius : 0;
  const R = [part.bodyRadius, 0.85 * L], c = [fr, b];
  const vx = R[0] - c[0], vy = R[1] - c[1];
  const t = Math.atan2(vy, vx) - Math.acos(Math.min(1, b / Math.hypot(vx, vy)));
  const T = [c[0] + b * Math.cos(t), c[1] + b * Math.sin(t)];
  const k = (R[1] - T[1]) / (R[0] - T[0]);
  return (r) => (r <= T[0] ? 0 : T[1] + (r - T[0]) * k);
}

// Prism from an (r, y) mm cross-section extruded tangentially by w mm,
// centred on the +Z radial axis (rotateY(angle) to place it). `skew` leans
// the outer end sideways by that many mm (sawtooth teeth).
function prism(shapePts, w, skew = 0) {
  const s = new THREE.Shape(shapePts.map(([r, y]) => new THREE.Vector2(r * MM, y * MM)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w * MM, bevelEnabled: false });
  g.translate(0, 0, (-w * MM) / 2);
  if (skew) {
    const p = g.attributes.position, r0 = Math.min(...shapePts.map((q) => q[0])) * MM, r1 = Math.max(...shapePts.map((q) => q[0])) * MM;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + ((p.getX(i) - r0) / (r1 - r0 || 1)) * skew * MM);
    g.computeVertexNormals();
  }
  g.rotateY(-Math.PI / 2); // shape x (radius) -> +Z
  return g;
}

// Hex bolt / rivet head standing on a surface point (r, y) with outward
// profile normal [nr, ny], radial axis +Z.
function bolt(r, y, nrm, rad, h, sides = 6) {
  const g = new THREE.CylinderGeometry(rad * MM * 0.82, rad * MM, h * MM, sides, 1).toNonIndexed();
  g.translate(0, ((h - 0.12) * MM) / 2, 0);
  g.rotateX(Math.atan2(nrm[0], nrm[1]));
  g.translate(0, y * MM, r * MM);
  return g;
}

// Merge geometries of one material (all non-indexed, position/normal/uv).
function merge(list) {
  const clean = list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    x.clearGroups();
    return x;
  });
  const m = clean.length === 1 ? clean[0] : mergeGeometries(clean, false);
  for (const g of list) g.dispose();
  return m;
}

// ------------------------------------------------------------ decals

// Atlas canvas: a band strip (top 96 rows, repeated `tiles` times around)
// and a round emblem for the flange top. Canvases are cached per look;
// textures are made per build so they dispose with the top.
const DW = 512, DH = 256, STRIP = 96;
const V_STRIP = 1 - STRIP / DH;
const EMB = { x: 176, y: 96, s: 160 };
const canvasCache = new Map();
const INKC = '#150f22';

// look: { motif, tiles, dc (band print colour), code, cap: { badge, fg, ring,
// glyph } }; acc = top accent colour; rare = rarity colour or ''.
function decalCanvas(look, acc, rare) {
  const { motif, tiles, code, cap } = look, sig = look.dc || look.sig;
  const key = [motif, tiles, sig, acc, code, rare, cap.badge, cap.fg, cap.ring, cap.glyph].join('|');
  if (canvasCache.has(key)) return canvasCache.get(key);
  const c = document.createElement('canvas');
  c.width = DW; c.height = DH;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  const W = DW / tiles, H = STRIP;
  const poly = (pts, fill, stroke = INKC, lw = 4) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
    g.fillStyle = fill; g.fill();
  };
  const disc = (x, y, r, fill, stroke = INKC, lw = 4) => { g.beginPath(); g.arc(x, y, r, 0, TAU); if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); } g.fillStyle = fill; g.fill(); };
  const band = (y0, y1, fill) => { g.fillStyle = INKC; g.fillRect(0, y0 - 4, DW, y1 - y0 + 8); g.fillStyle = fill; g.fillRect(0, y0, DW, y1 - y0); };
  if (motif === 'hazard') {
    // full black/yellow hazard band
    g.fillStyle = INKC; g.fillRect(0, 8, DW, H - 16);
    g.save(); g.beginPath(); g.rect(0, 14, DW, H - 28); g.clip();
    for (let x = -H; x < DW + H; x += 44) poly([[x, 14], [x + 22, 14], [x + 22 + (H - 28), H - 14], [x + H - 28, H - 14]], sig, null);
    g.restore();
  }
  if (motif === 'stars') band(22, H - 22, sig);
  if (motif === 'ticks') { band(12, 22, sig); band(H - 22, H - 12, sig); }
  for (let i = 0; i < tiles; i++) {
    g.save(); g.translate(i * W, 0);
    const cx = W / 2;
    if (motif === 'chevron') {
      // downward chevrons pointing at the needle
      poly([[cx - W * 0.4, 8], [cx, 44], [cx + W * 0.4, 8], [cx + W * 0.4, 38], [cx, 76], [cx - W * 0.4, 38]], sig, INKC, 5);
      disc(cx, 86, 7, acc, INKC, 3);
    } else if (motif === 'dots') {
      disc(cx, H / 2, 32, '#ffffff', INKC, 5); disc(cx, H / 2, 21, sig, null); disc(cx, H / 2, 9, acc, INKC, 3);
    } else if (motif === 'slash') {
      poly([[cx - W * 0.42, H - 8], [cx - W * 0.14, 8], [cx + W * 0.06, 8], [cx - W * 0.22, H - 8]], sig, INKC, 5);
      poly([[cx + W * 0.04, H - 8], [cx + W * 0.28, 8], [cx + W * 0.42, 8], [cx + W * 0.18, H - 8]], acc, INKC, 5);
    } else if (motif === 'hazard') {
      disc(cx, H / 2, 12, acc, INKC, 4);
    } else if (motif === 'dash') {
      poly([[cx - W * 0.42, 22], [cx + W * 0.18, 22], [cx + W * 0.3, 48], [cx + W * 0.18, 74], [cx - W * 0.42, 74]], sig, INKC, 5);
      poly([[cx + W * 0.3, 26], [cx + W * 0.44, 26], [cx + W * 0.44, 70], [cx + W * 0.38, 70]], acc, INKC, 4);
    } else if (motif === 'stars') {
      const star = (x, y, R, f) => poly([[x, y - R], [x + R * 0.24, y - R * 0.24], [x + R, y], [x + R * 0.24, y + R * 0.24], [x, y + R], [x - R * 0.24, y + R * 0.24], [x - R, y], [x - R * 0.24, y - R * 0.24]], f, INKC, 4);
      star(cx, H / 2, 40, '#ffffff'); star(cx + W * 0.36, 22, 13, acc);
    } else if (motif === 'ticks') {
      poly([[cx - 6, 18], [cx + 6, 18], [cx + 6, H - 18], [cx - 6, H - 18]], '#ffffff', INKC, 4);
      for (const d of [-0.25, 0.25]) poly([[cx + d * W - 4, 22], [cx + d * W + 4, 22], [cx + d * W + 4, 52], [cx + d * W - 4, 52]], sig, INKC, 3);
      poly([[cx + W * 0.5, 44], [cx + W * 0.5 + 12, 60], [cx + W * 0.5, 76], [cx + W * 0.5 - 12, 60]], acc, INKC, 3);
    } else if (motif === 'claw') {
      // three claw slashes in white over the coloured housing
      for (const d of [-0.26, 0, 0.26]) poly([[cx + d * W - 14, H - 6], [cx + d * W + 16, 6], [cx + d * W + 26, 12], [cx + d * W + 2, H - 4]], '#ffffff', INKC, 5);
    } else if (motif === 'orbit') {
      g.lineWidth = 14; g.strokeStyle = INKC; g.beginPath(); g.ellipse(cx, H / 2, W * 0.42, 26, -0.25, 0, TAU); g.stroke();
      g.lineWidth = 8; g.strokeStyle = sig; g.stroke();
      disc(cx + W * 0.38, H / 2 - 16, 12, acc, INKC, 4); disc(cx, H / 2, 15, '#ffffff', INKC, 4);
    } else if (motif === 'diamond') {
      poly([[cx, 6], [cx + W * 0.4, H / 2], [cx, H - 6], [cx - W * 0.4, H / 2]], sig, INKC, 5);
      poly([[cx, 28], [cx + W * 0.17, H / 2], [cx, H - 28], [cx - W * 0.17, H / 2]], acc, INKC, 4);
    }
    g.restore();
  }
  // emblem: badge in the design's cap colour, ring, glyph naming the contact
  // type, small part code underneath
  const ex = EMB.x + EMB.s / 2, ey = EMB.y + EMB.s / 2, er = EMB.s / 2 - 2;
  disc(ex, ey, er, rare || INKC, null);
  disc(ex, ey, er - (rare ? 8 : 4), cap.badge, null);
  g.lineWidth = 9; g.strokeStyle = cap.ring; g.beginPath(); g.arc(ex, ey, er - 16, 0, TAU); g.stroke();
  drawGlyph(g, cap.glyph, ex, ey - 9, cap.fg, acc, poly, disc);
  g.fillStyle = cap.fg; g.font = 'bold 19px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = INKC; g.strokeText(code, ex, ey + 41); g.fillText(code, ex, ey + 41);
  canvasCache.set(key, c);
  if (canvasCache.size > 40) canvasCache.delete(canvasCache.keys().next().value);
  return c;
}

// Emblem glyph (about 36 px radius around x, y): a pictogram of the tip's
// contact type, in fg with ink outlines and a dot of the top's accent.
function drawGlyph(g, glyph, x, y, fg, acc, poly, disc) {
  const ring = (cx, cy, rx, ry, rot, w) => {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
    g.lineWidth = w + 7; g.strokeStyle = INKC; g.stroke(); g.lineWidth = w; g.strokeStyle = fg; g.stroke();
  };
  switch (glyph) {
    case 'needle': // spike through a collar
      poly([[x - 9, y - 34], [x + 9, y - 34], [x + 5, y + 12], [x, y + 34], [x - 5, y + 12]], fg);
      poly([[x - 21, y - 16], [x + 21, y - 16], [x + 15, y - 5], [x - 15, y - 5]], fg);
      break;
    case 'ball': // ball sitting in a cup
      g.beginPath(); g.arc(x, y + 4, 27, 0.1, Math.PI - 0.1); g.lineWidth = 15; g.strokeStyle = INKC; g.stroke(); g.lineWidth = 8; g.strokeStyle = fg; g.stroke();
      disc(x, y + 2, 18, fg); disc(x - 6, y - 4, 5, '#ffffff', null);
      break;
    case 'bolt': // strike: lightning bolt
      poly([[x + 10, y - 36], [x - 18, y + 4], [x - 2, y + 4], [x - 12, y + 36], [x + 18, y - 6], [x + 2, y - 6]], fg);
      break;
    case 'tread': // tyre tread blocks
      for (const d of [-24, 0, 24]) poly([[x + d - 6, y - 26], [x + d + 9, y - 26], [x + d + 6, y + 26], [x + d - 9, y + 26]], fg);
      poly([[x - 36, y + 30], [x + 36, y + 30], [x + 32, y + 38], [x - 32, y + 38]], acc, INKC, 3);
      break;
    case 'semi': { // half disc on its flat
      g.beginPath(); g.arc(x, y + 14, 28, Math.PI, 0); g.closePath(); g.lineWidth = 4; g.strokeStyle = INKC; g.stroke(); g.fillStyle = fg; g.fill();
      poly([[x - 34, y + 18], [x + 34, y + 18], [x + 30, y + 27], [x - 30, y + 27]], fg);
      break;
    }
    case 'star': {
      const R = 34, k = 0.3;
      poly([[x, y - R], [x + R * k, y - R * k], [x + R, y], [x + R * k, y + R * k], [x, y + R], [x - R * k, y + R * k], [x - R, y], [x - R * k, y - R * k]], fg);
      break;
    }
    case 'bearing': // ring of balls round a hub
      for (let i = 0; i < 8; i++) disc(x + 25 * Math.cos((i * TAU) / 8), y + 25 * Math.sin((i * TAU) / 8), 7, fg, INKC, 3);
      disc(x, y, 10, acc, INKC, 3);
      break;
    case 'claw':
      for (const d of [-17, 0, 17]) poly([[x + d - 10, y + 32], [x + d + 7, y - 34], [x + d + 13, y - 30], [x + d + 1, y + 34]], fg);
      break;
    case 'orbit':
      ring(x, y, 36, 14, -0.4, 6);
      disc(x, y, 12, fg); disc(x + 31, y - 14, 6, acc, INKC, 3);
      break;
    case 'hybrid': // sharp point inside a flat collar bar
      poly([[x - 34, y + 4], [x + 34, y + 4], [x + 30, y + 14], [x - 30, y + 14]], fg);
      poly([[x, y - 36], [x + 13, y - 4], [x, y + 34], [x - 13, y - 4]], acc);
      break;
    default: // chevron pointing at the floor
      poly([[x - 26, y - 24], [x, y], [x + 26, y - 24], [x + 26, y - 6], [x, y + 20], [x - 26, y - 6]], fg);
  }
}

// ------------------------------------------------------------ build kit

const INK = { px: 2, maxMm: 0.45 };

class TipKit {
  constructor(part, ctx, look) {
    const q = ctx.quality || 'high';
    Object.assign(this, { part, ctx, look, q, lo: q === 'low' });
    this.L = ctx.geo.tipLen;
    this.br = part.bodyRadius;
    this.b = part.ballRadius;
    this.fr = part.flatRadius;
    this.n = segs(q, 32, 24, 14);
    this.arcSteps = segs(q, 9, 6, 4);
    this.y1 = this.L - 0.06; // flange top (emblem sits just above it)
    this.minY = tiltCone(part, this.L);
    this.bins = new Map();
    this.spinners = [];
    this.glows = [];
  }
  // material factory per bin key (created on first use)
  material(key) {
    const L = this.look, glow = rarityGlow(this.ctx.rarity);
    switch (key) {
      case 'body': return toonMaterial(L.body, { finish: L.bodyFinish || 'gloss' });
      case 'pale': return toonMaterial(L.pale, { finish: 'plastic' }); // hard plastic contact pieces
      case 'trim': return toonMaterial(L.sig, { finish: 'gloss', ...glow });
      case 'ring': return toonMaterial(L.ringC || L.sig, { finish: 'gloss' });
      case 'dark': return toonMaterial(L.dark || '#272b36', { finish: 'plastic' });
      case 'chrome': return toonMaterial(L.chrome || '#a9b6c8', { finish: 'chrome' });
      case 'gold': return toonMaterial(L.gold || '#f0b43a', { finish: 'metal' });
      case 'rubber': return toonMaterial(L.rubber || '#30333b', { finish: 'rubber' });
      case 'clear': return toonMaterial(L.clear || tone(L.sig, 0.2), { finish: 'clear', opacity: 0.42 });
      case 'decal': {
        const m = toonMaterial('#ffffff', { finish: 'matte', map: canvasTexture(decalCanvas(L, this.ctx.accent, this.ctx.rarity && this.ctx.rarity.rank > 0 ? this.ctx.rarity.color : '')) });
        m.alphaTest = 0.5;
        return m;
      }
    }
    throw new Error('tip: unknown material ' + key);
  }
  add(key, geo) {
    if (!this.bins.has(key)) this.bins.set(key, []);
    this.bins.get(key).push(geo);
    return geo;
  }
  lathe(key, pts, opts = {}) { return this.add(key, revolve([{ pts }], opts.n || this.n, opts)); }

  // Seating flange (std socket): round plate with a panel-line groove, plus
  // `tabs` lock tabs reaching tabR in another material.
  flange({ y0, r, tabs = 3, tabR = this.br + 0.2, tabW = 1.4, bin = this.look.cap.flange, tabBin = this.look.cap.tabs, phase = 0 }) {
    const y1 = this.y1, ym = (y0 + y1) / 2, c = 0.28;
    this.lathe(bin, [[0, y0], [r - c, y0], [r, y0 + c], [r, ym - 0.13], [r - 0.2, ym], [r, ym + 0.13], [r, y1 - 0.22], [r - 0.22, y1], [0, y1]]);
    for (let i = 0; i < tabs; i++) {
      const g = prism([[r - 0.6, y0 + 0.22], [tabR - 0.3, y0 + 0.22], [tabR, y0 + 0.5], [tabR, y1 - 0.4], [tabR - 0.25, y1 - 0.18], [r - 0.6, y1 - 0.18]], tabW);
      g.rotateY(phase + (i * TAU) / tabs);
      this.add(tabBin, g);
    }
    this.emblem(r * 0.78);
  }
  // Wide-socket flange: full bodyRadius plate with square lock notches.
  wideFlange({ y0, notches = 4, depth = 0.9, width = 1.7, bin = this.look.cap.flange, phase = 0 }) {
    const bev = 0.22, r = this.br - bev, ri = r - depth, hw = width / 2 / r;
    const shape = new THREE.Shape();
    const steps = Math.max(4, Math.round(this.n / notches));
    const P = (rad, a) => [rad * MM * Math.cos(a), rad * MM * Math.sin(a)];
    let first = true;
    const to = ([x, y]) => (first ? (shape.moveTo(x, y), (first = false)) : shape.lineTo(x, y));
    for (let i = 0; i < notches; i++) {
      const a0 = phase + (i * TAU) / notches + hw, a1 = phase + ((i + 1) * TAU) / notches - hw;
      for (let s = 0; s <= steps; s++) to(P(r, a0 + ((a1 - a0) * s) / steps));
      to(P(ri, a1)); to(P(ri, a1 + 2 * hw));
    }
    shape.closePath();
    const g = extrudeShape(shape, (this.y1 - y0) * MM, { bevel: bev * MM, curveSegments: 4 });
    g.translate(0, y0 * MM, 0);
    this.add(bin, g);
    this.emblem(r * 0.66);
  }
  // Printed emblem on the flange top (visible when the top is taken apart).
  emblem(R) {
    const y = this.L - 0.005, steps = this.lo ? 16 : 28;
    const g = revolve([{ pts: [[R, y], [0, y]] }], steps);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      uv.setXY(i, (EMB.x + (0.5 + p.getX(i) / (2 * R * MM)) * EMB.s) / DW, 1 - (EMB.y + (0.5 + p.getZ(i) / (2 * R * MM)) * EMB.s) / DH);
    }
    this.add('decal', g);
  }
  // Printed band on housing segment p0->p1 between t0..t1, raised `off` mm.
  band(p0, p1, t0, t1, { facets = 0, phase = 0, off = 0.08, c = null } = {}) {
    let pts;
    if (c) {
      // along an arc about c from p0 to p1 (both on the circle)
      const R = Math.hypot(p0[0] - c[0], p0[1] - c[1]) + off;
      const A0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), A1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
      pts = [];
      for (let i = 0; i <= 6; i++) { const a = A0 + (A1 - A0) * (t0 + ((t1 - t0) * i) / 6); pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
    } else {
      const [nr, ny] = unit(p1[1] - p0[1], -(p1[0] - p0[0]));
      const k = facets ? 1 / Math.cos(Math.PI / facets) : 1;
      pts = [lerp2(p0, p1, t0), lerp2(p0, p1, t1)].map(([r, y]) => [r + nr * off * k, y + ny * off]);
    }
    const g = revolve([{ pts, c: c || undefined }], this.n, { facets, phase });
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, V_STRIP + uv.getY(i) * (1 - V_STRIP));
    this.add('decal', g);
  }
  // `count` bolts on segment p0->p1 at t; on a faceted host they sit on facet
  // centres (every `every`-th facet).
  bolts(bin, count, p0, p1, t, { facets = 0, phase = 0, rad = 0.36, h = 0.34, sides = 6, every = 1, lift = 0 } = {}) {
    if (this.lo) return;
    const cf = facets ? Math.cos(Math.PI / facets) : 1;
    const nrm = unit(p1[1] - p0[1], -(p1[0] - p0[0]) * cf);
    const [r, y] = lerp2(p0, p1, t);
    for (let i = 0; i < count; i++) {
      const a = facets ? phase + ((i * every + 0.5) * TAU) / facets : phase + (i * TAU) / count;
      const g = bolt(r * cf + nrm[0] * lift, y + nrm[1] * lift, nrm, rad, h, sides);
      g.rotateY(a);
      this.add(bin, g);
    }
  }
  // Raised fins along segment p0->p1 (t0..t1), height h, width w.
  ribs(bin, count, p0, p1, { t0 = 0.1, t1 = 0.9, h = 0.6, w = 0.7, sink = 0.35, lead = 0.45, phase = 0, skew = 0 } = {}) {
    const n = unit(p1[1] - p0[1], -(p1[0] - p0[0])), d = unit(p1[0] - p0[0], p1[1] - p0[1]);
    const q0 = lerp2(p0, p1, t0), q1 = lerp2(p0, p1, t1);
    const shp = [
      [q0[0] - n[0] * sink, q0[1] - n[1] * sink],
      [q0[0] + d[0] * lead + n[0] * h, q0[1] + d[1] * lead + n[1] * h],
      [q1[0] - d[0] * 0.15 + n[0] * h, q1[1] - d[1] * 0.15 + n[1] * h],
      [q1[0] - n[0] * sink, q1[1] - n[1] * sink],
    ];
    for (let i = 0; i < count; i++) {
      const g = prism(shp, w, skew);
      g.rotateY(phase + (i * TAU) / count);
      this.add(bin, g);
    }
  }
  // Bolted armour plates lying flat on facets of a faceted housing segment
  // p0->p1 (corner radii), on every `every`-th facet from `start`.
  plates(bin, facets, p0, p1, { t0 = 0.5, t1 = 0.95, every = 2, start = 0, phase = 0, h = 0.22, fill = 0.74 } = {}) {
    const cf = Math.cos(Math.PI / facets);
    const P0 = [p0[0] * cf, p0[1]], P1 = [p1[0] * cf, p1[1]];
    const n = unit(P1[1] - P0[1], -(P1[0] - P0[0])), d = unit(P1[0] - P0[0], P1[1] - P0[1]);
    const q0 = lerp2(P0, P1, t0), q1 = lerp2(P0, P1, t1);
    const w = 2 * Math.min(lerp2(p0, p1, t0)[0], lerp2(p0, p1, t1)[0]) * Math.sin(Math.PI / facets) * fill;
    const c = Math.min(0.15, h * 0.7);
    const shp = [
      [q0[0] - n[0] * 0.1, q0[1] - n[1] * 0.1],
      [q0[0] + n[0] * h + d[0] * c, q0[1] + n[1] * h + d[1] * c],
      [q1[0] + n[0] * h - d[0] * c, q1[1] + n[1] * h - d[1] * c],
      [q1[0] - n[0] * 0.1, q1[1] - n[1] * 0.1],
    ];
    for (let j = start; j < facets; j += every) this.add(bin, prism(shp, w).rotateY(phase + ((j + 0.5) * TAU) / facets));
  }
  // Merge each material bin into one inked mesh.
  finish(spinBins = []) {
    const group = partGroup('tip');
    if (this.bins.size > 6) console.warn(`tip ${this.part.id}: ${this.bins.size} meshes`);
    for (const [key, geos] of this.bins) {
      const geo = merge(geos);
      const mat = this.material(key);
      let mesh;
      if (key === 'decal') { mesh = new THREE.Mesh(geo, mat); mesh.userData.noInk = true; }
      else if (key === 'clear') { mesh = new THREE.Mesh(geo, mat); mesh.userData.noInk = true; mesh.renderOrder = 1; }
      else mesh = inked(geo, mat, INK);
      mesh.name = 'tip-' + key;
      if (key === 'trim' && mat.emissiveIntensity > 0) this.glows.push(mat);
      if (spinBins.includes(key)) this.spinners.push(mesh);
      group.add(mesh);
    }
    return { group, height: this.L * MM, spinners: this.spinners.length ? this.spinners : undefined, glows: this.glows.length ? this.glows : undefined };
  }
}

// ------------------------------------------------------------ designs

// Needle: hardened chrome needle clamped in a crimson hex collar under a
// white octagonal column that flares into a broad shoulder (a nail-head
// spire), red armour plates and a red seating flange.
function needle(k) {
  const tip = contactRuns(0, k.b, [0.85, 3.2], k.arcSteps);
  k.add('chrome', revolve([...tip.runs, { pts: [[0.85, 3.2], [0.85, 3.7], [0, 3.7]] }], k.n));
  k.add('trim', revolve([{ pts: [[0.8, 2.7], [1.5, 2.7], [2.05, 3.15], [2.05, 4.25], [1.8, 4.55], [0.8, 4.55], [0.8, 2.7]] }], 0, { facets: 6, phase: TAU / 12 }));
  const H = [[0, 4.45], [2.55, 4.45], [2.8, 4.7], [3.3, 5.4], [3.3, 6.6], [3.55, 6.85], [4.95, 7.65], ...notch(4.95, 8.05, 0.18, 0.11), [4.95, 8.45], [0, 8.45]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 8 }));
  k.band(H[3], H[4], 0.06, 0.94, { facets: 8 });
  k.plates('trim', 8, H[5], H[6], { t0: 0.12, t1: 0.94, h: 0.24 });
  k.bolts('chrome', 4, H[5], H[6], 0.55, { facets: 8, every: 2, lift: 0.24, rad: 0.3, h: 0.26 });
  k.flange({ y0: 8.45, r: 5.55, tabR: 6.2 });
  return k.finish();
}

// Pivot Ball: polished chrome ball riding in a riveted teal cup, graphite
// ten-sided housing with teal plates, teal seating flange.
function pivotball(k) {
  const R = k.b;
  const ball = contactRuns(0, R, null, k.arcSteps + 4, 22 * DEG);
  k.add('chrome', revolve([...ball.runs, { pts: [ball.top, [0, ball.top[1]]] }], k.n));
  const cup = [[R - 0.15, 3.0], [3.05, 3.0], [3.45, 3.4], [3.45, 4.3], [3.2, 4.55], [2.0, 4.55], [R - 0.15, 3.0]];
  k.lathe('trim', cup);
  k.bolts('chrome', 6, [3.45, 3.4], [3.45, 4.3], 0.55, { rad: 0.26, h: 0.22, sides: 8 });
  const H = [[0, 4.45], [3.3, 4.45], [3.6, 4.75], [5.3, 7.55], [5.75, 7.9], ...notch(5.75, 8.2, 0.18, 0.1), [5.75, 8.5], [0, 8.5]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 10 }));
  k.band(H[2], H[3], 0.08, 0.46, { facets: 10 });
  k.plates('trim', 10, H[2], H[3], { t0: 0.52, t1: 0.97 });
  k.bolts('chrome', 5, H[2], H[3], 0.78, { facets: 10, every: 2, lift: 0.22, rad: 0.3, h: 0.26 });
  k.flange({ y0: 8.5, r: 6.05, tabR: 6.7 });
  return k.finish();
}

// Flat Strike: hard white flat foot under a bright orange cone armed with
// eight white strike ribs, white seating flange.
function flatstrike(k) {
  const foot = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
  const ft = foot.top;
  k.add('pale', revolve([...foot.runs, { pts: [ft, [ft[0], 1.15], [ft[0] - 0.3, 1.45], [0, 1.45]] }], k.n));
  const C0 = [3.0, 1.6], C1 = [5.5, 6.9];
  k.add('body', revolve([{ pts: [[0, 1.3], [2.7, 1.3], C0, C1, [6.25, 7.35], ...notch(6.25, 7.75), [6.25, 8.15], [0, 8.15]] }], k.n));
  k.ribs('trim', 8, C0, C1, { t0: 0.12, t1: 0.92, h: 0.6, w: 0.7 });
  k.band(C0, C1, 0.42, 0.68, { off: 0.07 });
  k.bolts('chrome', 4, C0, C1, 0.86, { phase: TAU / 16 });
  k.flange({ y0: 8.15, r: 6.6, tabR: 7.2 });
  return k.finish();
}

// Rubber Flat: dark rubber puck with a ring of tread lugs, clamped by a
// hazard-yellow collar under a stepped twelve-sided housing (stacked tyres).
function rubberflat(k) {
  const foot = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
  k.add('rubber', revolve([...foot.runs, { pts: [foot.top, [3.42, 0.98], [3.42, 2.25], [3.15, 2.5], [0, 2.5]] }], k.n));
  const lugs = k.lo ? 8 : 12;
  for (let i = 0; i < lugs; i++) k.add('rubber', prism([[3.3, 1.02], [3.66, 1.1], [3.7, 1.95], [3.45, 2.22], [3.3, 2.22]], 0.85).rotateY((i * TAU) / lugs));
  k.lathe('trim', [[3.0, 2.2], [3.95, 2.2], [4.25, 2.5], [4.25, 3.3], [3.95, 3.6], [3.0, 3.6], [3.0, 2.2]]);
  const H = [[0, 3.45], [3.8, 3.45], [4.1, 3.75], [4.85, 4.05], [4.85, 5.35], [5.1, 5.6], [5.85, 6.05], [5.85, 6.8], [6.4, 7.3], ...notch(6.4, 7.72), [6.4, 8.15], [0, 8.15]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 12 }));
  k.band(H[3], H[4], 0.06, 0.94, { facets: 12 });
  k.plates('trim', 12, H[5], H[6], { t0: 0.08, t1: 0.95, every: 3, h: 0.2 });
  k.bolts('chrome', 4, H[6], H[7], 0.5, { facets: 12, every: 3, phase: TAU / 8, rad: 0.3, h: 0.26 });
  k.flange({ y0: 8.15, r: 6.6, tabR: 7.2 });
  return k.finish();
}

// Semi-Flat: small white flat foot on a graphite shaft with ten white ribs,
// chrome washer, green eight-sided crown and flange.
function semiflat(k) {
  const foot = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
  k.add('pale', revolve([...foot.runs, { pts: [foot.top, [foot.top[0], 1.55], [2.1, 1.85], [0, 1.85]] }], k.n));
  k.lathe('dark', [[0, 1.75], [1.45, 1.75], [1.45, 5.75], [0, 5.75]]);
  const ribs = k.lo ? 6 : 10;
  for (let i = 0; i < ribs; i++) k.add('trim', prism([[1.3, 1.95], [1.92, 2.3], [1.95, 5.25], [1.3, 5.6]], 0.5).rotateY((i * TAU) / ribs));
  k.lathe('chrome', [[1.4, 5.35], [2.45, 5.35], [2.7, 5.6], [2.7, 5.8], [2.45, 6.05], [1.4, 6.05], [1.4, 5.35]]);
  const H = [[0, 5.95], [2.65, 5.95], [2.9, 6.2], [4.95, 7.85], [5.4, 8.15], [5.4, 8.6], [0, 8.6]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 8, phase: TAU / 16 }));
  k.band(H[2], H[3], 0.15, 0.85, { facets: 8, phase: TAU / 16 });
  k.flange({ y0: 8.6, r: 5.9, tabR: 6.75 });
  return k.finish();
}

// Wide Ball: broad pearl dome with a printed equator stripe, royal-blue
// twelve-sided skirt with white plates, wide blue notched flange.
function wideball(k) {
  const R = k.b;
  const ball = contactRuns(0, R, null, k.arcSteps + 6, 5 * DEG);
  k.add('pale', revolve([...ball.runs, { pts: [ball.top, [0, ball.top[1]]] }], k.n));
  k.band([0, 0], [R, R], 0.7, 0.93, { c: [0, R], off: 0.06 });
  const S0 = [5.1, 4.5], S1 = [6.9, 6.95];
  k.add('body', revolve([{ pts: [[R - 0.2, 4.15], [4.75, 4.15], S0, S1, [7.35, 7.3], [7.35, 7.75], [3.0, 7.75], [R - 0.2, 4.15]] }], 0, { facets: 12 }));
  k.plates('trim', 12, S0, S1, { t0: 0.12, t1: 0.9, every: 2, h: 0.2 });
  k.bolts('chrome', 6, S0, S1, 0.5, { facets: 12, every: 2, lift: 0.2, rad: 0.32, h: 0.26 });
  k.wideFlange({ y0: 7.7, notches: 4 });
  return k.finish();
}

// Bearing Spike: chrome spike on a visible bearing (clear drum, gold races
// and cage, ring of steel balls) that idles while the body spins; ice-silver
// housing with gold plates, cyan flange.
function bearing(k) {
  const y0 = 4.85, hn = segs(k.q, 22, 18, 12);
  const tip = contactRuns(0, k.b, [0.95, y0 - 0.35], k.arcSteps);
  k.add('chrome', revolve([...tip.runs, { pts: [[0.95, y0 - 0.35], [0.95, y0 + 0.1], [1.25, y0 + 0.3], [1.25, y0 + 2.05], [0, y0 + 2.05]] }], k.n));
  const balls = k.lo ? 6 : 8;
  for (let i = 0; i < balls; i++) {
    const s = new THREE.SphereGeometry(0.62 * MM, k.lo ? 6 : 7, k.lo ? 4 : 5);
    s.translate(0, (y0 + 1.0) * MM, 2.3 * MM);
    k.add('chrome', s.rotateY((i * TAU) / balls));
  }
  // gold races above and below the balls, a cage ring threaded through
  // their equators, all inside a clear drum
  k.lathe('gold', [[1.2, y0 - 0.1], [2.9, y0 - 0.1], [3.15, y0 + 0.15], [3.15, y0 + 0.4], [1.2, y0 + 0.4], [1.2, y0 - 0.1]], { n: hn });
  k.lathe('gold', [[1.2, y0 + 1.6], [3.15, y0 + 1.6], [3.15, y0 + 1.85], [2.9, y0 + 2.1], [1.2, y0 + 2.1], [1.2, y0 + 1.6]], { n: hn });
  if (!k.lo) k.lathe('gold', [[1.7, y0 + 0.86], [2.88, y0 + 0.86], [2.88, y0 + 1.14], [1.7, y0 + 1.14], [1.7, y0 + 0.86]], { n: hn });
  k.lathe('clear', [[3.0, y0 - 0.2], [3.25, y0 - 0.2], [3.55, y0 + 0.1], [3.55, y0 + 1.9], [3.25, y0 + 2.2], [3.0, y0 + 2.2], [3.0, y0 - 0.2]], { n: segs(k.q, 26, 20, 14) });
  const H = [[0, y0 + 2.15], [3.45, y0 + 2.15], [3.75, y0 + 2.45], [5.3, 9.0], [5.75, 9.3], [5.75, 9.6], [0, 9.6]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 10 }));
  k.band(H[2], H[3], 0.06, 0.5, { facets: 10 });
  k.plates('gold', 10, H[2], H[3], { t0: 0.56, t1: 0.97, h: 0.2 });
  k.flange({ y0: 9.6, r: 6.05, tabR: 6.7 });
  return k.finish(['chrome']);
}

// Grip Hold: dark rubber semi-flat ringed by sawtooth grip teeth, under a
// crimson hexagonal housing with amber plates and rivets, dark flange.
function griphold(k) {
  const foot = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
  k.add('rubber', revolve([...foot.runs, { pts: [foot.top, [foot.top[0], 2.05], [2.35, 2.35], [0, 2.35]] }], k.n));
  const teeth = k.lo ? 6 : 8;
  for (let i = 0; i < teeth; i++) k.add('rubber', prism([[2.25, 1.5], [2.85, 1.62], [3.3, 2.55], [3.3, 3.05], [2.45, 3.25]], 0.95, 0.55).rotateY((i * TAU) / teeth));
  const H = [[0, 2.95], [3.05, 2.95], [3.35, 3.25], [5.75, 6.95], [6.25, 7.3], ...notch(6.25, 7.72), [6.25, 8.15], [0, 8.15]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 6 }));
  k.band(H[2], H[3], 0.16, 0.58, { facets: 6 });
  k.plates('trim', 6, H[2], H[3], { t0: 0.64, t1: 0.97, every: 1, fill: 0.6 });
  k.bolts('chrome', 6, H[2], H[3], 0.8, { facets: 6, rad: 0.3, h: 0.24, sides: 8, lift: 0.22 });
  k.flange({ y0: 8.15, r: 6.6, tabR: 7.2, phase: TAU / 12 });
  return k.finish();
}

// Orbit Flat: wide white plastic flat under a violet cone, with a gold orbit
// ring (three comet knobs) idling around its waist, white wide flange.
function orbit(k) {
  const foot = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
  const ft = foot.top;
  k.add('pale', revolve([...foot.runs, { pts: [ft, [ft[0], 1.25], [ft[0] - 0.3, 1.55], [3.25, 1.75], [0, 1.75]] }], k.n));
  const C0 = [3.6, 3.45], C1 = [5.7, 6.75];
  k.add('body', revolve([{ pts: [[0, 1.65], [3.25, 1.65], [3.25, 3.15], C0, C1, [6.3, 7.1], ...notch(6.3, 7.42, 0.18, 0.11), [6.3, 7.75], [0, 7.75]] }], k.n));
  k.lathe('ring', [[3.35, 2.2], [5.0, 2.2], [5.35, 2.55], [5.35, 2.85], [5.05, 3.1], [3.35, 3.1], [3.35, 2.2]]);
  for (let i = 0; i < 3; i++) k.add('ring', prism([[4.0, 2.9], [5.0, 2.9], [4.8, 3.3], [4.0, 3.3]], 1.1).rotateY((i * TAU) / 3));
  k.band(C0, C1, 0.3, 0.7, { off: 0.07 });
  k.bolts('chrome', 6, C0, C1, 0.86, { phase: TAU / 12 });
  k.wideFlange({ y0: 7.7, notches: 3 });
  return k.finish(['ring']);
}

// Hybrid Spike: chrome spike centre inside a narrow graphite flat collar,
// two-stage housing (magenta lower stage, graphite mid ring, white upper
// stage with magenta plates), white flange.
function hybrid(k) {
  const tip = contactRuns(k.fr, k.b, [2.0, 2.9], k.arcSteps);
  k.add('chrome', revolve([...tip.runs, { pts: [[2.0, 2.9], [2.0, 3.6], [0, 3.6]] }], k.n));
  k.lathe('dark', [[1.45, 2.55], [2.6, 2.55], [3.0, 2.95], [3.0, 3.4], [2.7, 3.7], [1.45, 3.7], [1.45, 2.55]]);
  const H1 = [[0, 3.6], [2.6, 3.6], [2.9, 3.9], [3.95, 5.95], [0, 5.95]];
  k.add('trim', revolve([{ pts: H1 }], 0, { facets: 8 }));
  k.band(H1[2], H1[3], 0.12, 0.88, { facets: 8 });
  k.lathe('dark', [[3.5, 5.8], [4.15, 5.8], [4.45, 6.1], [4.45, 6.45], [4.2, 6.7], [3.5, 6.7], [3.5, 5.8]]);
  const H2 = [[0, 6.6], [4.3, 6.6], [4.5, 6.8], [5.15, 7.95], [5.5, 8.2], ...notch(5.5, 8.62), [5.5, 9.05], [0, 9.05]];
  k.add('body', revolve([{ pts: H2 }], 0, { facets: 8, phase: TAU / 16 }));
  k.plates('trim', 8, H2[2], H2[3], { t0: 0.08, t1: 0.92, phase: TAU / 16, start: 1 });
  k.bolts('chrome', 4, H2[2], H2[3], 0.5, { facets: 8, every: 2, phase: TAU / 16 * 3, lift: 0.22, rad: 0.3, h: 0.26 });
  k.flange({ y0: 9.05, r: 5.9, tabR: 6.7 });
  return k.finish();
}

// Parametric fallback for unknown ids, from the part's numbers alone: exact
// contact end (rubber/plastic flat, chrome ball or chrome spike), collar,
// eight-sided housing fitted inside the tilt cone, std or wide flange.
function generic(k) {
  const { L, br, b, part } = k;
  const fr = k.fr > 0.2 ? k.fr : 0;
  const fy0 = L - Math.min(1.4, L * 0.15);
  let top;
  if (fr > 0) {
    const foot = contactRuns(fr, b, null, k.arcSteps, 0);
    top = [foot.top[0], foot.top[1] + 0.5];
    k.add(part.wear === 'rubber' ? 'rubber' : 'body', revolve([...foot.runs, { pts: [foot.top, top, [top[0] - 0.3, top[1] + 0.3], [0, top[1] + 0.3]] }], k.n));
  } else if (b >= 1.6) {
    const ball = contactRuns(0, b, null, k.arcSteps + 4, 15 * DEG);
    k.add('chrome', revolve([...ball.runs, { pts: [ball.top, [0, ball.top[1]]] }], k.n));
    top = [ball.top[0], ball.top[1]];
  } else {
    const yS = Math.min(L * 0.3, 3.5), rS = Math.max(b + 0.3, 0.9);
    const tip = contactRuns(0, b, [rS, yS], k.arcSteps);
    k.add('chrome', revolve([...tip.runs, { pts: [[rS, yS], [rS, yS + 0.5], [0, yS + 0.5]] }], k.n));
    top = [rS, yS];
  }
  // collar ring hugging the contact piece
  const cr0 = Math.max(0.5, top[0] - 0.2), cr1 = top[0] + 0.8;
  const cy0 = Math.max(top[1] - 0.6, k.minY(cr1) + 0.15), cy1 = cy0 + 1.1;
  k.lathe('trim', [[cr0, cy0], [cr1 - 0.3, cy0], [cr1, cy0 + 0.3], [cr1, cy1 - 0.25], [cr1 - 0.25, cy1], [cr0, cy1], [cr0, cy0]]);
  // housing: tapers from the collar to the shoulder, kept inside the cone
  const rs = br * 0.82, ys = Math.max(fy0 - 0.9, k.minY(rs) + 0.2);
  const hb = [cr1 + 0.2, Math.max(cy1 - 0.1, k.minY(cr1 + 0.2) + 0.1)];
  const H = [[0, hb[1]], hb, [hb[0] + 0.25, hb[1] + 0.25], [rs - 0.4, ys], [rs, ys + 0.35], [rs, fy0], [0, fy0]];
  k.add('body', revolve([{ pts: H }], 0, { facets: 8 }));
  k.band(H[2], H[3], 0.3, 0.7, { facets: 8 });
  k.bolts('chrome', 4, H[2], H[3], 0.86, { facets: 8, every: 2 });
  if (part.socket === 'wide') k.wideFlange({ y0: fy0, notches: 4 });
  else k.flange({ y0: fy0, r: br * 0.9, tabR: br + 0.2 });
  return k.finish();
}

// ------------------------------------------------------------ looks

// Colour blocking per design: housing (body), signature trim (sig), contact
// plastic (pale, defaults to the part colour), band print colour (dc), and
// the cap: which bins form the seating flange and its tabs, plus the emblem
// badge / glyph colours. Each tip gets its own main hue and cap scheme so it
// reads apart from the others from the side and from above.
const W = '#f4f5f9', BADGE = '#1b1f2b';
const LOOKS = {
  tip_needle: { fn: needle, body: W, sig: '#ff2a48', motif: 'chevron', tiles: 8,
    cap: { flange: 'trim', tabs: 'body', badge: W, fg: '#ff2a48', ring: INKC, glyph: 'needle' } },
  tip_pivotball: { fn: pivotball, body: '#2e3546', sig: '#12c7b2', motif: 'dots', tiles: 10,
    cap: { flange: 'trim', tabs: 'body', badge: BADGE, fg: '#e9fffb', ring: '#12c7b2', glyph: 'ball' } },
  tip_flatstrike: { fn: flatstrike, body: '#ff7a1a', sig: W, dc: '#ffffff', motif: 'slash', tiles: 8,
    cap: { flange: 'trim', tabs: 'body', badge: '#ff7a1a', fg: '#ffffff', ring: INKC, glyph: 'bolt' } },
  tip_rubberflat: { fn: rubberflat, body: '#3a404c', bodyFinish: 'plastic', sig: '#ffd21f', rubber: '#2a2d35', motif: 'hazard', tiles: 4,
    cap: { flange: 'trim', tabs: 'body', badge: BADGE, fg: '#ffd21f', ring: '#ffd21f', glyph: 'tread' } },
  tip_semiflat: { fn: semiflat, body: '#22c45e', sig: W, dc: '#ffffff', motif: 'dash', tiles: 8,
    cap: { flange: 'body', tabs: 'trim', badge: W, fg: '#17a34d', ring: INKC, glyph: 'semi' } },
  tip_wideball: { fn: wideball, body: '#2b5cff', bodyFinish: 'plastic', sig: W, dc: '#2b5cff', motif: 'stars', tiles: 8,
    cap: { flange: 'body', badge: W, fg: '#2b5cff', ring: INKC, glyph: 'star' } },
  tip_bearing: { fn: bearing, body: '#cfd8e6', sig: '#36d8ff', motif: 'ticks', tiles: 10,
    cap: { flange: 'trim', tabs: 'gold', badge: BADGE, fg: '#36d8ff', ring: '#f0b43a', glyph: 'bearing' } },
  tip_griphold: { fn: griphold, body: '#d42038', sig: '#ffb21e', rubber: '#3a3332', dark: '#2b2523', motif: 'claw', tiles: 6,
    cap: { flange: 'dark', tabs: 'trim', badge: '#ffb21e', fg: '#2b2523', ring: INKC, glyph: 'claw' } },
  tip_orbit: { fn: orbit, body: '#7a4dff', sig: W, ringC: '#ffc23a', dc: '#ffc23a', motif: 'orbit', tiles: 6,
    cap: { flange: 'trim', badge: '#7a4dff', fg: '#ffffff', ring: INKC, glyph: 'orbit' } },
  tip_hybrid: { fn: hybrid, body: W, sig: '#ff2fa3', dc: '#ffffff', motif: 'diamond', tiles: 8,
    cap: { flange: 'body', tabs: 'trim', badge: '#ff2fa3', fg: '#ffffff', ring: INKC, glyph: 'hybrid' } },
};

Object.assign(LOOKS, classicTipLooks({ revolve, contactRuns, prism, notch, DEG, TAU, MM }));

// Two-letter part code printed on the emblem (initials, or the first letters
// of a one-word name).
function codeFor(name = '') {
  const w = name.split(/[\s-]+/).filter(Boolean);
  return (w.length > 1 ? w.map((s) => s[0]).join('') : name.slice(0, 2)).toUpperCase().slice(0, 2) || 'TP';
}

export function buildTip(part, ctx) {
  const known = LOOKS[part.id];
  let look;
  if (known) look = { ...known };
  else {
    // fallback look: signature hue from the id, motif and glyph from the
    // wear type, housing in the part colour
    let h = 0;
    for (const ch of part.id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const c = new THREE.Color().setHSL((h % 360) / 360, 0.85, 0.55);
    const sig = '#' + c.getHexString();
    look = { fn: generic, sig, motif: { rubber: 'hazard', flat: 'slash', ball: 'dots' }[part.wear] || 'chevron', tiles: 8,
      cap: { flange: 'trim', tabs: 'dark', badge: BADGE, fg: '#ffffff', ring: sig, glyph: { rubber: 'tread', flat: 'semi', ball: 'ball', sharp: 'needle' }[part.wear] || 'chevron' } };
  }
  look.body = look.body || part.color || '#eeeeee';
  look.pale = look.pale || part.color || '#f2f2f2';
  look.code = codeFor(part.name);
  return look.fn(new TipKit(part, ctx, look));
}
