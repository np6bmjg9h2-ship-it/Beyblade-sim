// Attack ring models. Each ring is its own designed toy part, assembled from
// separate pieces the way a real moulded ring is:
//   frame : dark moulded base that carries the physics contact profile
//   shell : painted upper body. One canvas "decal sheet", mapped top-down,
//           colours it and every raised feature merged into it (panel lines,
//           printed graphics, two-tone features) in a single draw.
//   metal : strike plates on the leading faces, screws, rivets, studs
//   extra : optional trim / clear / glow pieces per design
// Every outer surface is swept along the physics profile (physics/profile.js),
// so the silhouette is exactly what collides; slope shows as an inward taper.

import * as THREE from 'three';
import { MM, TAU, partGroup, toonMaterial, inked, tone, inkFor, segs, canvasTexture, makeCanvas } from './common.js';
import { mix } from '../toon.js';
import { sampleProfile } from '../../physics/profile.js';
import { CLASSIC_RINGS, buildClassicRing } from './ringClassic.js';

const UV_R = 28; // mm: the decal sheet spans [-UV_R, UV_R] top-down
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mod = (a) => ((a % TAU) + TAU) % TAU;
const wrapPi = (a) => mod(a + Math.PI) - Math.PI;
const linspace = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// ------------------------------------------------------------------ geometry

// Triangle soup in millimetres. finish() turns it into a BufferGeometry in
// metres with planar top-down UVs, an optional warp and crease-angle normals.
class Soup {
  constructor() { this.p = []; }
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-8) return; // degenerate (pointed ends)
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  // triangle oriented to face along h
  triH(a, b, c, h) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * h[0] + (uz * vx - ux * vz) * h[1] + (ux * vy - uy * vx) * h[2];
    if (d < 0) this.tri(a, c, b); else this.tri(a, b, c);
  }
  // copy another soup through a placement (rotate about Y, then translate)
  place(src, x, y, z, rotY = 0) {
    const c = Math.cos(rotY), s = Math.sin(rotY), p = src.p;
    for (let i = 0; i < p.length; i += 3) this.p.push(x + p[i] * c + p[i + 2] * s, y + p[i + 1], z - p[i] * s + p[i + 2] * c);
  }
  get empty() { return this.p.length === 0; }
}

// Normals averaged over coincident vertices whose faces are within `angle`
// of each other: hard edges at chamfers and caps, smooth along curved walls.
function creaseNormals(p, angle) {
  const nV = p.length / 3, nF = nV / 3, cosA = Math.cos(angle);
  const fa = new Float32Array(nF * 3), fu = new Float32Array(nF * 3);
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fa[f * 3] = nx; fa[f * 3 + 1] = ny; fa[f * 3 + 2] = nz;
    fu[f * 3] = nx / l; fu[f * 3 + 1] = ny / l; fu[f * 3 + 2] = nz / l;
  }
  const map = new Map(), keys = new Array(nV);
  for (let v = 0; v < nV; v++) {
    const k = `${Math.round(p[v * 3] * 2000)},${Math.round(p[v * 3 + 1] * 2000)},${Math.round(p[v * 3 + 2] * 2000)}`;
    keys[v] = k;
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push((v / 3) | 0);
  }
  const out = new Float32Array(nV * 3);
  for (let v = 0; v < nV; v++) {
    const f = (v / 3) | 0;
    let sx = 0, sy = 0, sz = 0;
    for (const g of map.get(keys[v])) {
      if (fu[f * 3] * fu[g * 3] + fu[f * 3 + 1] * fu[g * 3 + 1] + fu[f * 3 + 2] * fu[g * 3 + 2] < cosA) continue;
      sx += fa[g * 3]; sy += fa[g * 3 + 1]; sz += fa[g * 3 + 2];
    }
    const l = Math.hypot(sx, sy, sz);
    if (l > 0) { out[v * 3] = sx / l; out[v * 3 + 1] = sy / l; out[v * 3 + 2] = sz / l; }
    else { out[v * 3] = fu[f * 3]; out[v * 3 + 1] = fu[f * 3 + 1]; out[v * 3 + 2] = fu[f * 3 + 2]; }
  }
  return out;
}

function finish(soup, warp, crease = 0.6) {
  const p = new Float32Array(soup.p), n = p.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = 0.5 + p[i * 3] / (2 * UV_R); uv[i * 2 + 1] = 0.5 - p[i * 3 + 2] / (2 * UV_R); }
  if (warp) for (let i = 0; i < n; i++) warp(p, i * 3);
  const nor = creaseNormals(p, crease);
  for (let i = 0; i < p.length; i++) p[i] *= MM;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

// Sweep a cross-section around the spin axis. sect(psi) returns a CCW polygon
// [[r, y], ...] in mm (r outward, y up) with a fixed point count. psis must
// ascend; closed = a full turn (no end caps); open = the section is a
// polyline (its closing edge would be a face hidden inside another piece).
function sweep(soup, sect, psis, closed = false, open = false) {
  const S = psis.length, rings = [], secs = [];
  for (const psi of psis) {
    const s = sect(psi), c = Math.cos(psi), sn = Math.sin(psi);
    secs.push(s);
    rings.push(s.map(([r, y]) => [c * r, y, -sn * r]));
  }
  const P = rings[0].length;
  for (let i = 0; i < (closed ? S : S - 1); i++) {
    const A = rings[i], B = rings[(i + 1) % S];
    for (let j = 0; j < (open ? P - 1 : P); j++) {
      const j2 = (j + 1) % P;
      soup.tri(A[j], B[j2], A[j2]);
      soup.tri(A[j], B[j], B[j2]);
    }
  }
  if (!closed) {
    endCap(soup, secs[0], rings[0], psis[0], -1);
    endCap(soup, secs[S - 1], rings[S - 1], psis[S - 1], 1);
  }
}

function endCap(soup, sec, ring, psi, sgn) {
  const idx = [];
  const far = (i, j) => Math.abs(sec[i][0] - sec[j][0]) + Math.abs(sec[i][1] - sec[j][1]) > 1e-5;
  for (let i = 0; i < sec.length; i++) if (!idx.length || far(i, idx[idx.length - 1])) idx.push(i);
  while (idx.length > 2 && !far(idx[0], idx[idx.length - 1])) idx.pop();
  if (idx.length < 3) return;
  const tris = THREE.ShapeUtils.triangulateShape(idx.map((i) => new THREE.Vector2(sec[i][0], sec[i][1])), []);
  const h = [-Math.sin(psi) * sgn, 0, -Math.cos(psi) * sgn];
  for (const [a, b, c] of tris) soup.triH(ring[idx[a]], ring[idx[b]], ring[idx[c]], h);
}

// Small turned detail (stud, rivet, screw boss) from an [r, y] profile,
// placed on the ring at (r, psi), base at y.
function turned(soup, prof, seg, r, psi, y) {
  const s = new Soup();
  sweep(s, () => prof, linspace(0, TAU, seg).slice(0, seg), true);
  soup.place(s, Math.cos(psi) * r, y, -Math.sin(psi) * r);
}
const studProf = (rad, h, c = Math.min(rad * 0.35, h * 0.5)) => [[0, 0], [rad, 0], [rad, h - c], [rad - c, h], [0, h]];
const domeProf = (rad, h) => [[0, 0], [rad, 0], [rad, h * 0.25], [rad * 0.8, h * 0.75], [rad * 0.4, h], [0, h]];

// Slotted screw head: two half discs with a gap (the dark recess painted
// under it shows through as the slot).
function screw(soup, r, psi, y, rad, h, seg, slotRot = 0.6) {
  const s = new Soup(), prof = studProf(rad, h, Math.min(0.22, rad * 0.3));
  const half = new Soup();
  sweep(half, () => prof, linspace(0, Math.PI, seg >> 1), false);
  const gap = Math.max(0.1, rad * 0.16);
  s.place(half, 0, 0, -gap);
  s.place(half, 0, 0, gap, Math.PI);
  soup.place(s, Math.cos(psi) * r, y, -Math.sin(psi) * r, slotRot + psi);
}

// --------------------------------------------------------------- the ring

// Profile chain up an outer wall from yLo to yHi at outline O, stepping in to
// the plate pocket K over the plate's height band [p0, p1]. Fixed point count.
function chain(O, K, yLo, yHi, p0, p1) {
  if (p1 <= yLo || p0 >= yHi) return [[O, yHi]];
  const a = Math.max(p0, yLo), b = Math.min(p1, yHi), out = [];
  if (a > yLo) out.push([O, a], [K, a]); else out.push([K, yLo]);
  if (b < yHi) out.push([K, b], [O, b], [O, yHi]); else out.push([K, yHi]);
  return out;
}

function fallbackLayer(part) {
  return { radius: part.rOut * MM, baseRadius: (part.blades > 0 ? part.rBase : part.rOut) * MM, blades: part.blades || 0, bladeWidth: part.bladeWidth ?? 0.55, hand: part.spin === 'R' ? -1 : part.spin === 'L' ? 1 : 0, slope: ((part.slope || 0) * Math.PI) / 180, thickness: part.thickness * MM };
}

const srgb = (hex) => new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
const rgbDist = (a, b) => { const x = srgb(a), y = srgb(b); return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b); };

// Perceptual (sRGB) HSL helpers for paint colours.
function hsl(hex) { const o = { h: 0, s: 0, l: 0 }; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o; }
function fromHsl(h, s, l) { return '#' + new THREE.Color().setHSL(h, clamp(s, 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace).getHexString(); }
// A paint of `hex` with its lightness capped at maxL (and saturation nudged up
// by ds for coloured paints): faces that look straight at the lights wash out
// towards white, so they are painted a little darker and richer.
// Pale and grey paints (low chroma) keep most of their lightness: a white
// ring should stay white, not turn into a saturated pastel.
function paint(hex, maxL = 0.5, ds = 0.06) {
  const { h, s, l } = hsl(hex);
  const c = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const k = clamp((Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) * 1.6, 0, 1);
  return fromHsl(h, s < 0.1 ? s : s + ds * k, lerp(l, Math.min(l, maxL), k));
}
const shade = (hex, dl, ds = 0) => { const { h, s, l } = hsl(hex); return fromHsl(h, s + ds, l + dl); };

// Everything a design needs: profile functions, blades/faces, plates and the
// sampled outline, colours, soups per material and the decal painters.
function makeEnv(part, ctx, design, res = 1) {
  const q = ctx.quality || 'high';
  const L = ctx.layer || fallbackLayer(part);
  const T = part.thickness;
  const coreR = ctx.parts?.core?.radius ?? 0;
  const hole = Math.max(part.rIn, coreR + 0.35);
  const tmp = { radius: 0, face: 0 };
  const Rp = (psi) => { sampleProfile(L, psi, 1, tmp); return tmp.radius / MM; };
  const Rmax = L.radius / MM, Rb = L.baseRadius / MM;
  const N = Rmax > Rb + 1e-6 ? L.blades | 0 : 0;
  const w = L.bladeWidth ?? 0.55, hand = N ? L.hand || 0 : 0, P = TAU / Math.max(1, N);
  const E = { part, ctx, q, low: q === 'low', T, hole, Rcol: hole + 2.6, Rp, Rmax, Rb, N, w, hand, P, slope: L.slope || 0 };
  E.mv = part.spin === 'R' ? -1 : part.spin === 'L' ? 1 : 0; // travel direction in psi
  E.yS = T * 0.56;

  // blades and their steep faces (dir = from the face into the blade)
  E.blades = []; E.faces = [];
  for (let k = 0; k < N; k++) {
    const a = hand < 0 ? (k + 1 - w) * P : k * P, b = a + w * P;
    const bl = { k, a, b, c: (a + b) / 2, faces: [] };
    if (hand < 0) bl.faces.push({ bot: a, dir: 1, k });
    else if (hand > 0) bl.faces.push({ bot: b, dir: -1, k });
    else bl.faces.push({ bot: a, dir: 1, k }, { bot: b, dir: -1, k });
    bl.lead = hand ? bl.faces[0] : null;
    E.blades.push(bl); E.faces.push(...bl.faces);
  }
  // centres of the gaps between blades (or evenly spaced when bladeless)
  E.gaps = N ? E.blades.map((bl) => bl.b + ((1 - w) * P) / 2) : [0, 1, 2].map((i) => (i * TAU) / 3 + Math.PI / 6);

  // strike plates: 'face' wedges at the steep faces, 'cap' over each blade,
  // 'band' all round, 'none'
  const pc = { mode: N ? 'face' : 'band', len: 5.5, dFace: 1.5, dBack: 0.8, lip: 0.3, shift: 0.9, d: 1.1, ...(design.plate || {}) };
  if (!N && pc.mode !== 'none') pc.mode = 'band';
  E.plateCfg = pc;
  E.yP0 = (pc.y0 ?? 0.2) * T; // plate height band (fractions of T)
  E.yP1 = pc.y1 != null ? pc.y1 * T : T + 0.35;
  const sh = pc.mode === 'face' ? pc.shift / Rmax : 0;
  E.shiftPsi = sh;
  // frame outline: blades shortened under the face plates only, so the metal
  // face stands proud; everywhere else the frame is the profile itself
  const inSpan = (psi, a, b) => { let d = mod(psi - a); if (d > TAU - 1e-7) d = 0; return d <= b - a + 1e-9; };
  E.Rf = sh ? (psi) => {
    let r = Rp(psi);
    for (const pl of E.plates) if (pl.face && inSpan(psi, pl.a, pl.b)) r = Math.min(r, Rp(psi - pl.face.dir * sh));
    return r;
  } : Rp;
  E.plates = [];
  if (pc.mode === 'face') {
    const lipP = pc.lip / Rmax, lenP = pc.len / Rmax;
    for (const f of E.faces) {
      const a = f.dir > 0 ? f.bot - lipP : f.bot - lenP, b = f.dir > 0 ? f.bot + lenP : f.bot + lipP;
      E.plates.push({ a, b, face: f, inner: (psi) => E.Rf(psi) - lerp(pc.dFace, pc.dBack, clamp((wrapPi(psi - f.bot) * f.dir) / lenP, 0, 1)) });
    }
  } else if (pc.mode === 'cap') {
    const lipP = pc.lip / Rmax;
    // frac < 1: a shorter cap centred on the blade
    const fr = pc.frac ?? 1;
    for (const bl of E.blades) {
      const h = ((bl.b - bl.a) * fr) / 2 + lipP;
      E.plates.push({ a: bl.c - h, b: bl.c + h, blade: bl, inner: (psi) => Rp(psi) - pc.d });
    }
  } else if (pc.mode === 'band') {
    E.plates.push({ a: 0, b: TAU, full: true, inner: (psi) => Rp(psi) - pc.d });
  }
  E.pocket = (psi) => {
    for (const pl of E.plates) if (pl.full || inSpan(psi, pl.a, pl.b)) return pl.inner(psi);
    return null;
  };
  E.shellInset = design.shellInset ?? 0.55;
  E.Os = (psi) => E.Rf(psi) - E.shellInset;
  E.Ks = (psi) => { const k = E.pocket(psi); return k == null ? E.Os(psi) : Math.min(E.Os(psi), k); };

  // outline samples: uniform + plate breakpoints + refinement on steep faces
  const n0 = Math.round(segs(q, 100, 76, 48) * res), eps = 2e-4;
  let ps = linspace(0, TAU, n0).slice(0, n0);
  for (const pl of E.plates) if (!pl.full) ps.push(mod(pl.a - eps), mod(pl.a), mod(pl.b), mod(pl.b + eps));
  // the profile's own breakpoints (ramp foot, crest start/end, face foot,
  // see physics/profile.js), so coarse outlines still reach every blade tip
  const keyLam = hand ? [0, 0.7 * w, w - 0.035, w] : [0, 0.12, w - 0.12, w];
  for (let k = 0; k < N; k++) for (const lam of keyLam) ps.push(mod((hand < 0 ? k + 1 - lam : k + lam) * P));
  ps = [...new Set(ps.map((x) => Math.round(mod(x) * 1e7) / 1e7))].sort((x, y) => x - y);
  const step = (E.low ? 0.9 : 0.45) / res, maxSub = E.low ? 3 : Math.max(2, Math.round(6 * res));
  const out = [];
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i], b = i + 1 < ps.length ? ps[i + 1] : ps[0] + TAU;
    out.push(a);
    const dr = Math.max(Math.abs(Rp(b) - Rp(a)), Math.abs(E.Rf(b) - E.Rf(a)));
    const m = Math.min(maxSub, Math.ceil(dr / step));
    for (let j = 1; j < m; j++) out.push(a + ((b - a) * j) / m);
  }
  E.psis = out;
  E.psisIn = (a, b) => [a, ...out.flatMap((x) => [x, x + TAU, x - TAU]).filter((x) => x > a + 1e-6 && x < b - 1e-6).sort((x, y) => x - y), b];

  // slope: radial taper of the outer faces pivoting at mid-height, inward only
  const tk = Math.tan(Math.abs(E.slope)) * (design.taperGain ?? 1);
  E.taperIn = (y) => (E.slope > 0 ? Math.max(0, y - T / 2) : E.slope < 0 ? Math.max(0, T / 2 - y) : 0) * tk;
  E.warp = tk > 0 ? (p, i) => {
    const x = p[i], y = p[i + 1], z = p[i + 2], r = Math.hypot(x, z);
    if (r < 1e-6) return;
    const d = E.taperIn(y) * smooth(hole + 3, hole + 6, r);
    p[i] = (x * (r - d)) / r; p[i + 2] = (z * (r - d)) / r;
  } : null;
  // The warp is linear in y on each side of mid-height, so outer walls need
  // a vertex AT mid-height: the rake then folds there as a crisp edge and the
  // wall still reaches the profile where the physics strikes. Inserted on
  // every outer segment crossing T/2 (same indices at every psi, so section
  // point counts stay fixed).
  E.pivot = (sec) => {
    if (!(tk > 0)) return sec;
    const out = [], ym = T / 2;
    for (let i = 0; i < sec.length; i++) {
      const A = sec[i], B = sec[(i + 1) % sec.length];
      out.push(A);
      if ((A[1] - ym) * (B[1] - ym) < 0 && Math.min(A[0], B[0]) > hole + 3) {
        const t = (ym - A[1]) / (B[1] - A[1]);
        out.push([lerp(A[0], B[0], t), ym]);
      }
    }
    return out;
  };
  // walls fold hard at the rake pivot instead of smoothing into a bulge
  E.crease = tk > 0 ? 0.3 : 0.6;

  // colours
  const main = ctx.accent || part.color || '#4fc3ff';
  const own = part.color && rgbDist(part.color, main) > 0.3 ? part.color : null;
  const C = { main, own };
  C.fill = paint(main, design.fillL ?? 0.5); // top faces catch key + spot + sky: paint richer
  C.deep = shade(C.fill, -0.2, 0.04);
  C.wall = shade(C.fill, -0.09);
  C.light = mix(main, '#ffffff', 0.55);
  C.line = inkFor(main, 0.7);
  C.frame = design.frame ? design.frame(main, C) : mix(paint(main, 0.3), '#14121f', 0.55);
  C.sec = own || (design.sec ? design.sec(main, C) : '#eef3ff');
  C.metal = design.metal ? design.metal(main, C) : mix('#5c6779', main, 0.08);
  C.acc = design.acc ? design.acc(main, C) : '#ffe14d';
  C.clear = design.clear ? design.clear(main, C) : mix(main, '#ffffff', 0.35);
  C.glow = design.glow ? design.glow(main, C) : C.acc;
  C.rarity = ctx.rarity?.rank >= 1 ? ctx.rarity.color : null;
  E.C = C;

  E.soups = { shell: new Soup(), metal: new Soup(), trim: new Soup(), clear: new Soup(), glow: new Soup() };
  E.paints = [];
  return E;
}

// The three structural pieces every ring has: frame, shell and plates.
function buildBody(E) {
  const { T, hole, Rcol, yS, yP0, yP1 } = E;
  const cb = 0.6, ct = 0.7, pcB = 0.35, pcT = 0.5;
  // outer frame follows the profile; the round collar around the hole is a
  // coarser lathe in the same mesh. Faces hidden inside the stack (frame
  // inner wall against the collar, shell underside on the frame) are left
  // out: open sections.
  sweep(E.frame = new Soup(), (psi) => {
    const O = E.Rf(psi), K = E.pocket(psi) ?? O;
    return E.pivot([[Rcol, 0], [O - cb, 0], [O, cb], ...chain(O, K, cb, yS, yP0, yP1), [Rcol, yS]]);
  }, E.psis, true, true);
  // collar with key slots for the core's tabs (3, or 4 for a quad core): the
  // hole only ever grows, so the core always fits
  const nc = segs(E.q, 72, 56, 40), nk = E.ctx.parts?.core?.arch === 'quad' ? 4 : 3;
  const kw = 1.7 / hole, keyed = (psi) => Math.abs(wrapPi(psi * nk) / nk) < kw;
  let cps = linspace(0, TAU, nc).slice(0, nc);
  for (let i = 0; i < nk; i++) for (const d of [-kw, kw]) { const c = (i * TAU) / nk + d; cps.push(mod(c - 1e-4), mod(c + 1e-4)); }
  cps = [...new Set(cps.map((x) => Math.round(mod(x) * 1e7) / 1e7))].sort((x, y) => x - y);
  sweep(E.frame, (psi) => {
    const h = hole + (keyed(psi) ? 0.9 : 0);
    return [[h, 0], [Rcol, 0], [Rcol, T - 0.35], [h + 0.45, T - 0.35], [h, T - 0.8]];
  }, cps, true);
  sweep(E.soups.shell, (psi) => {
    const O = E.Os(psi), K = Math.min(O, E.pocket(psi) ?? Infinity);
    const ch = chain(O, K, yS, T, yP0, yP1);
    const [X] = ch.pop();
    // the extra top ring keeps cap triangles short, so the ink hull of the
    // tiny strips at plate steps cannot flip into long dark lines
    return [[O, yS], ...ch, [X, T - ct], [X - ct, T], [X - ct - 0.9, T], [Rcol, T], [Rcol, T - 0.6]];
  }, E.psis, true, true);
  const plateSect = (psi) => {
    const o = E.Rp(psi), k = E.pocket(psi), room = Math.max(0, o - k);
    const cB = Math.min(pcB, room * 0.4), cT = Math.min(pcT, room * 0.5);
    return E.pivot([[k, yP0], [o - cB, yP0], [o, yP0 + cB], [o, yP1 - cT], [o - cT, yP1], [k, yP1]]);
  };
  for (const pl of E.plates) {
    if (pl.full) sweep(E.soups.metal, plateSect, E.psis, true);
    else sweep(E.soups.metal, plateSect, E.psisIn(pl.a, pl.b), false);
  }
}

// Raised feature on the shell top over psi in [a, b]: footprint
// r in [fIn(u), fOut(u)] (u = 0..1 along the feature, see opt.uOf), top at
// fTop(u). kind 'flat' = chamfered slab, 'ridge' = two facets meeting at a
// ridge line (peak = its position across the width). Clamped inside the shell
// outline, so the envelope always holds. Returns the footprint for painting.
function feature(E, soup, a, b, fIn, fOut, fTop, opt = {}) {
  const { kind = 'flat', peak = 0.5, chamfer = 0.4, shoulder = 0.3, margin = 1.0, y0 = E.T - 0.03 } = opt;
  const uOf = opt.uOf || ((psi) => (psi - a) / (b - a));
  const ro = (psi) => { const u = uOf(psi); return Math.min(fOut(u, psi), E.Ks(psi) - margin); };
  const ri = (psi) => { const u = uOf(psi); return Math.min(Math.max(fIn(u, psi), E.Rcol + 1.0), ro(psi)); };
  const n = opt.n ?? Math.max(6, Math.round(((b - a) * 180) / Math.PI / (E.low ? 9 : 3.5)));
  sweep(soup, (psi) => {
    const i = ri(psi), o = ro(psi), yt = fTop(uOf(psi), psi), wd = o - i;
    if (kind === 'ridge') {
      const ys = y0 + (yt - y0) * shoulder * Math.min(1, wd / 1.2);
      return [[i, y0], [o, y0], [o, ys], [lerp(i, o, peak), yt], [i, ys]];
    }
    if (kind === 'gem') { // brilliant-cut section: girdle, two bevel tiers, table
      const ys = y0 + (yt - y0) * shoulder, y1 = ys + (yt - ys) * 0.62;
      return [[i, y0], [o, y0], [o, ys], [o - wd * 0.16, y1], [lerp(i, o, 0.6), yt], [lerp(i, o, 0.4), yt], [i + wd * 0.16, y1], [i, ys]];
    }
    if (kind === 'table') { // cut-gem section: girdle, bevels, flat table
      const ys = y0 + (yt - y0) * shoulder;
      return [[i, y0], [o, y0], [o, ys], [lerp(i, o, 0.74), yt], [lerp(i, o, 0.3), yt], [i, ys]];
    }
    const c = Math.min(chamfer, wd * 0.45, (yt - y0) * 0.6);
    return [[i, y0], [o, y0], [o, yt - c], [o - c, yt], [i + c, yt], [i, yt - c]];
  }, linspace(a, b, n), false);
  return { a, b, ri, ro };
}

// Full-turn annulus on the top (walls, clear overlays) between radii, mm.
function annulusTop(E, soup, ri, ro, y0, y1, c = 0.3, n = segs(E.q, 96, 64, 40)) {
  sweep(soup, () => [[ri, y0], [ro, y0], [ro, y1 - c], [ro - c, y1], [ri + c, y1], [ri, y1 - c]], linspace(0, TAU, n).slice(0, n), true);
}

// Loft through stations of equal-length 3D point rings; faces oriented away
// from each station's centre (sections must be convex), ends capped.
function loft(soup, st) {
  const S = st.length, P = st[0].length;
  const cen = st.map((ring) => [0, 1, 2].map((k) => ring.reduce((s, p) => s + p[k], 0) / P));
  for (let i = 0; i < S - 1; i++) {
    const A = st[i], B = st[i + 1], m = [0, 1, 2].map((k) => (cen[i][k] + cen[i + 1][k]) / 2);
    for (let j = 0; j < P; j++) {
      const j2 = (j + 1) % P;
      const h = [0, 1, 2].map((k) => (A[j][k] + A[j2][k] + B[j][k] + B[j2][k]) / 4 - m[k]);
      soup.triH(A[j], A[j2], B[j2], h);
      soup.triH(A[j], B[j2], B[j], h);
    }
  }
  for (const [i, o] of [[0, 1], [S - 1, S - 2]]) {
    const h = [0, 1, 2].map((k) => cen[i][k] - cen[o][k]);
    for (let j = 1; j < P - 1; j++) soup.triH(st[i][0], st[i][j], st[i][j + 1], h);
  }
}

// Spike on the top (lances, flares, claws, teeth): its centre line runs
// from r0 to r1 along psiC(t), half-width hw(t) mm measured across the path,
// ridge top yTop(t), t = 0..1. Shortened until it sits inside the shell
// outline. Returns its footprint polygon [[r, psi], ...].
function spike(E, soup, r0, r1, psiC, hw, yTop, opt = {}) {
  const { n = E.low ? 5 : 12, margin = 1.0, y0 = E.T - 0.03, shoulder = 0.3 } = opt;
  const polar = (x, z) => [Math.hypot(x, z), Math.atan2(-z, x)];
  const stations = (tip) => {
    const c = [];
    for (let i = 0; i <= n; i++) { const t = i / n, r = lerp(r0, tip, t), p = psiC(t); c.push([r * Math.cos(p), -r * Math.sin(p), t]); }
    return c.map((q, i) => {
      const A = c[Math.max(0, i - 1)], B = c[Math.min(n, i + 1)];
      const tx = B[0] - A[0], tz = B[1] - A[1], l = Math.hypot(tx, tz) || 1;
      return { x: q[0], z: q[1], t: q[2], nx: -tz / l, nz: tx / l, w: Math.max(hw(q[2]), 0.001) };
    });
  };
  const inside = (x, z) => { const [r, p] = polar(x, z); return r <= E.Ks(p) - margin; };
  let tip = r1, S;
  for (let guard = 0; guard < 80; guard++) {
    S = stations(tip);
    if (S.every((q) => inside(q.x, q.z) && inside(q.x + q.nx * q.w, q.z + q.nz * q.w) && inside(q.x - q.nx * q.w, q.z - q.nz * q.w))) break;
    tip += r1 > r0 ? -0.25 : 0.25;
  }
  const st = [], left = [], right = [];
  for (const q of S) {
    const yt = yTop(q.t), ys = y0 + (yt - y0) * shoulder;
    st.push([[-q.w, y0], [q.w, y0], [q.w, ys], [0, yt], [-q.w, ys]].map(([o, y]) => [q.x + q.nx * o, y, q.z + q.nz * o]));
    left.push(polar(q.x + q.nx * q.w, q.z + q.nz * q.w));
    right.push(polar(q.x - q.nx * q.w, q.z - q.nz * q.w));
  }
  loft(soup, st);
  return [...left, ...right.reverse()];
}

// ------------------------------------------------------------ decal sheet

const canvasCache = new Map();
function decalCanvas(key, size, draw) {
  if (canvasCache.has(key)) return canvasCache.get(key);
  const cv = makeCanvas(size, (g, s) => draw(g, painter(g, s)));
  canvasCache.set(key, cv);
  if (canvasCache.size > 32) canvasCache.delete(canvasCache.keys().next().value);
  return cv;
}

// Polar drawing helpers in ring millimetres / profile angles.
function painter(g, s) {
  const k = s / (2 * UV_R), c = s / 2;
  const val = (f, psi) => (typeof f === 'function' ? f(psi) : f);
  const H = {
    g, s, k,
    px: (mm) => mm * k,
    xy: (r, psi) => [c + r * k * Math.cos(psi), c - r * k * Math.sin(psi)],
    to(r, psi, move) { const [x, y] = H.xy(r, psi); if (move) g.moveTo(x, y); else g.lineTo(x, y); },
    along(rf, a, b, move) {
      const n = Math.max(6, Math.ceil(Math.abs(b - a) * 60));
      for (let i = 0; i <= n; i++) { const psi = a + ((b - a) * i) / n; H.to(val(rf, psi), psi, move && i === 0); }
    },
    // closed annular sector between two radius functions
    band(rin, rout, a, b) { g.beginPath(); H.along(rout, a, b, true); H.along(rin, b, a, false); g.closePath(); },
    poly(pts) { g.beginPath(); pts.forEach(([r, psi], i) => H.to(r, psi, i === 0)); g.closePath(); },
    fill(col) { g.fillStyle = col; g.fill(); },
    stroke(col, wMm) { g.strokeStyle = col; g.lineWidth = wMm * k; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); },
    ring(r, wMm, col) { g.beginPath(); g.arc(c, c, r * k, 0, TAU); H.stroke(col, wMm); },
    disc(r, psi, rad, col) { const [x, y] = H.xy(r, psi); g.beginPath(); g.arc(x, y, rad * k, 0, TAU); H.fill(col); },
    // footprint of a feature, grown by `grow` mm
    foot(fp, col, grow = 0) {
      const da = grow / 20;
      H.band((psi) => fp.ri(clamp(psi, fp.a, fp.b)) - grow, (psi) => fp.ro(clamp(psi, fp.a, fp.b)) + grow, fp.a - da, fp.b + da);
      H.fill(col);
    },
    // chevron arrow at (r, psi) pointing along +psi * dir
    chevron(r, psi, size, dir, col, wMm = 0.5) {
      const d = (size / r) * dir;
      g.beginPath(); H.to(r + size * 0.55, psi - d * 0.5, true); H.to(r, psi + d * 0.5); H.to(r - size * 0.55, psi - d * 0.5);
      H.stroke(col, wMm);
    },
  };
  return H;
}


// ------------------------------------------------------------------ build

const SHEET = { high: 1024, medium: 512, low: 256 };
const TRI_BUDGET = { high: 8800, medium: 6500, low: 4800 };

export function buildRing(part, ctx) {
  if (CLASSIC_RINGS[part.id]) return buildClassicRing(part, ctx);
  const design = DESIGNS[part.id] || parametric(part);
  // many-bladed rings (unknown ids, traits) can run over the triangle
  // budget: rebuild the swept outline coarser until they fit
  let E;
  for (const res of [1, 0.8, 0.62, 0.48]) {
    E = makeEnv(part, ctx, design, res);
    buildBody(E);
    design.build?.(E);
    const tris = [E.frame, ...Object.values(E.soups)].reduce((n, sp) => n + sp.p.length / 9, 0);
    if (tris <= TRI_BUDGET[E.q]) break;
  }
  const { C } = E;
  const size = SHEET[E.q] || 512;
  // everything the print depends on (core size moves the hub, item numbers
  // move the blades)
  const key = [part.id, E.Rmax, E.Rb, E.N, E.w, E.hand, E.T, E.hole, E.low, C.main, C.sec, C.rarity, size].join('|');
  const sheet = decalCanvas(key, size, (g, H) => paintSheet(E, design, H));
  // epic and above: the rarity trim lines glow (emissive map), the rest of
  // the print keeps its colours
  const glowTrim = ctx.rarity?.rank >= 3 ? {
    emissive: C.rarity,
    emissiveIntensity: 0.9 + 0.2 * (ctx.rarity.rank - 3),
    emissiveMap: canvasTexture(decalCanvas(key + '|glow', size >> 1, (g, H) => { g.fillStyle = '#000000'; g.fillRect(0, 0, H.s, H.s); rarityLines(E, H, '#ffffff'); })),
  } : {};

  const group = partGroup('ring');
  const glows = [];
  const add = (soup, mat, inkOpts, name) => {
    if (!soup || soup.empty) return null;
    const m = inked(finish(soup, E.warp, inkOpts.crease ?? E.crease), mat, inkOpts);
    m.name = name;
    group.add(m);
    return m;
  };
  // flat tops: a near-mirror spec edge, so a whole flat face only flashes at
  // a true reflection angle instead of whitening the print in overhead views
  add(E.frame, toonMaterial(C.frame, { finish: 'plastic', specEdge: 0.985, rimColor: tone(C.frame, 0.25) }), { px: 2, maxMm: 0.7 }, 'frame');
  const shellMat = toonMaterial('#ffffff', { finish: design.finish || 'gloss', spec: 0.5, specEdge: 0.985, map: canvasTexture(sheet), ink: C.line, rimColor: C.light, ...glowTrim });
  if (glowTrim.emissive) glows.push(shellMat);
  add(E.soups.shell, shellMat, { px: 2, maxMm: 0.7 }, 'shell');
  add(E.soups.metal, toonMaterial(C.metal, { finish: design.metalFinish || 'metal', ink: inkFor(C.metal, 0.8) }), { px: 1.5, maxMm: 0.45 }, 'metal');
  add(E.soups.trim, toonMaterial(C.sec, { finish: design.trimFinish || 'gloss', specEdge: design.trimSpecEdge ?? (design.trimFlat ? undefined : 0.975), flatShading: !!design.trimFlat, ink: inkFor(C.sec, 0.8) }), { px: 1.5, maxMm: 0.5, crease: design.trimFlat ? 0.01 : undefined }, 'trim');
  add(E.soups.clear, toonMaterial(C.clear, { finish: design.clearFinish || 'clear', opacity: design.clearOpacity ?? 0.42, flatShading: !!design.clearFlat, ink: inkFor(C.clear, 0.6) }), { px: 1, maxMm: 0.35 }, 'clear');
  if (!E.soups.glow.empty) {
    const gm = toonMaterial(C.glow, { finish: 'gloss', emissive: C.glow, emissiveIntensity: 0.85, ink: inkFor(C.glow, 0.85) });
    glows.push(gm);
    add(E.soups.glow, gm, { px: 1, maxMm: 0.35 }, 'glow');
  }
  return { group, height: E.T * MM, glows };
}

// ------------------------------------------------------------ sheet + parts

// The printed decal sheet: base paint, design graphics, the darker outer
// wall band, the hole rim, then every feature footprint / screw recess the
// build registered, then the design's top-layer print and rarity trim.
function paintSheet(E, design, H) {
  const { C } = E;
  H.g.fillStyle = C.fill;
  H.g.fillRect(0, 0, H.s, H.s);
  design.paintBase?.(E, H);
  H.band((p) => E.Ks(p) - 0.75, (p) => E.Ks(p) + 4, 0, TAU);
  H.fill(C.wall);
  H.band(E.Rcol - 2, E.Rcol + 0.85, 0, TAU);
  H.fill(C.deep);
  H.ring(E.Rcol + 1.05, 0.22, C.line);
  for (const fn of E.paints) fn(H);
  design.paint?.(E, H);
  if (C.rarity) rarityLines(E, H, C.rarity);
}

// Rarity trim: a line tracing the outline just inside the rim (what the
// battle camera sees) and a thin ring round the hub.
function rarityLines(E, H, col) {
  H.band((p) => E.Ks(p) - 1.35, (p) => E.Ks(p) - 0.85, 0, TAU);
  H.fill(col);
  H.ring(E.Rcol + 1.55, 0.45, col);
}

// Leading face, tail and the psi direction face -> tail of a blade
// (symmetric blades: face at the low end).
function span(E, bl) {
  const f = E.hand > 0 ? bl.b : bl.a, t = E.hand > 0 ? bl.a : bl.b;
  return { f, t, s: t > f ? 1 : -1 };
}

// Swept fang hugging the outer edge from a blade's leading face back past its
// tail into the gap; widest and tallest at the face. Returns the footprint
// plus its edge functions (for matching print).
function fang(E, soup, bl, o = {}) {
  const { start = 0.2, ext = 0.35, w0 = 5, w1 = 0.4, pw = 0.8, h0 = 1.2, h1 = 0.25, margin = 0.9, peak = 0.75, kind = 'ridge', inset = 0 } = o;
  const { f, t, s } = span(E, bl);
  // begins just behind the strike plate (start mm past it), so the metal
  // face and the fang read as one blade
  const plateLen = E.plateCfg.mode === 'face' ? E.plateCfg.len : 0;
  const p0 = f + (s * (plateLen + start)) / E.Rmax, p1 = t + s * ext * E.P * (1 - E.w);
  const a = Math.min(p0, p1), b = Math.max(p0, p1), L = b - a;
  const v = (psi) => clamp((s > 0 ? psi - a : b - psi) / L, 0, 1);
  const out = (psi) => E.Ks(psi) - margin - inset;
  // smooth inner curve between the two ends (the outer edge hugs the blade)
  const rIn0 = out(s > 0 ? a : b) - w0, rIn1 = out(s > 0 ? b : a) - w1;
  const inn = (psi) => Math.min(out(psi) - w1, lerp(rIn0, rIn1, Math.pow(v(psi), pw)));
  const fp = feature(E, soup, a, b, (u, psi) => inn(psi), (u, psi) => out(psi), (u, psi) => E.T + lerp(h0, h1, v(psi)), { kind, peak, margin });
  return Object.assign(fp, { v, out, inn, s, f, t });
}

// Slotted screw on the top with its dark recess printed under it.
function topScrew(E, r, psi, rad = 0.85) {
  if (E.low) return E.paints.push((H) => H.disc(r, psi, rad, E.C.line));
  screw(E.soups.metal, r, psi, E.T - 0.05, rad, 0.5, 12, 0.5);
  E.paints.push((H) => H.disc(r, psi, rad + 0.28, E.C.line));
}
// Domed rivet / stud (metal by default).
function rivet(E, r, psi, rad = 0.6, h = 0.45, soup = E.soups.metal, y = E.T - 0.05) {
  if (E.low && rad < 1) return;
  const prof = [[0, 0], [rad, 0], [rad, h * 0.3], [rad * 0.62, h * 0.86], [0, h]];
  turned(soup, prof, E.low ? 6 : rad < 0.8 ? 8 : 12, r, psi, y);
}

// Speed streak printed alongside an edge function: a band offset `off` mm
// inside edge(psi), `w` mm wide at v = 0 thinning to nothing at v = 1.
function streak(H, a, b, edge, v, off, w, col) {
  H.band((p) => edge(p) - off - w * (1 - v(p)), (p) => edge(p) - off, a, b);
  H.fill(col);
}

// Raised strip along a polyline [[r, psi], ...] (cracks, inlays): w mm wide
// at the base, h mm above the top.
function strip(E, soup, pts, w, h, y0 = E.T - 0.03) {
  const xz = pts.map(([r, p]) => [r * Math.cos(p), -r * Math.sin(p)]);
  const st = xz.map((c, i) => {
    const A = xz[Math.max(0, i - 1)], B = xz[Math.min(xz.length - 1, i + 1)];
    const tx = B[0] - A[0], tz = B[1] - A[1], l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    return [[-w / 2, y0], [w / 2, y0], [w * 0.28, y0 + h], [-w * 0.28, y0 + h]].map(([o, y]) => [c[0] + nx * o, y, c[1] + nz * o]);
  });
  loft(soup, st);
}

// Contrasting colour: `pref` unless it is too close to the main paint.
const pick = (main, pref, alt) => (rgbDist(main, pref) > 0.38 ? pref : alt);

// Painted outline under a raised footprint polygon [[r, psi], ...].
const outlinePoly = (H, pts, col, w = 0.55) => { H.poly(pts); H.fill(col); H.stroke(col, w); };

// Closed wavy line around the axis.
function wavyRing(H, r0, amp, k, phase, w, col) {
  H.g.beginPath();
  for (let i = 0; i <= 360; i++) { const p = (i / 360) * TAU; H.to(r0 + amp * Math.sin(k * p + phase), p, i === 0); }
  H.stroke(col, w);
}

// Spiral arm band from r0 to r1, sweeping `turn` radians, width w0 -> w1 mm.
function spiralArm(H, r0, r1, p0, turn, w0, w1, col) {
  const n = 40, A = [], B = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = lerp(r0, r1, t), p = p0 + turn * t, hw = lerp(w0, w1, t) / 2 / r;
    A.push([r, p - hw]); B.push([r, p + hw]);
  }
  H.poly([...A, ...B.reverse()]); H.fill(col);
}

// n-point star polygon centred on the axis.
function starPts(n, rIn, rOut, phase) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) pts.push([i % 2 ? rIn : rOut, phase + (i / (n * 2)) * TAU]);
  return pts;
}

// Small 4-point sparkle at (r, psi).
function sparkle(H, r, psi, size, col) {
  const d = size / r, e = (size * 0.28) / r;
  H.poly([[r + size, psi], [r + size * 0.28, psi + e], [r, psi + d], [r - size * 0.28, psi + e], [r - size, psi], [r - size * 0.28, psi - e], [r, psi - d], [r + size * 0.28, psi - e]]);
  H.fill(col);
}

const DESIGNS = {
  // Three swept wind fangs riding the blade edges, a navy gale swoosh and
  // speed streaks printed behind them, silver plates on the leading faces.
  ring_galefang: {
    sec: (m) => pick(m, '#f2f7ff', '#1d2a4a'),
    acc: () => '#ffe14d',
    build(E) {
      const mid = (E.Rcol + E.Rb) / 2 - 0.4;
      for (const bl of E.blades) {
        const fp = fang(E, E.soups.trim, bl, { w0: 5.4, w1: 0.5, h0: 1.45, h1: 0.3, ext: 0.55, peak: 0.7 });
        E.paints.push((H) => {
          streak(H, fp.a, fp.b, fp.inn, fp.v, -0.3, 3.4, E.C.deep);
          H.foot(fp, E.C.line, 0.3);
          streak(H, fp.a, fp.b, fp.inn, fp.v, 1.0, 0.8, E.C.light);
          streak(H, fp.a, fp.b, fp.inn, fp.v, 2.4, 0.45, E.C.acc);
        });
        const { t, s } = span(E, bl);
        topScrew(E, mid, t + s * 0.62 * E.P * (1 - E.w));
      }
    },
    paint(E, H) { H.ring(E.Rcol + 3.0, 0.2, E.C.line); },
  },

  // Smooth heavy crown: a polished chrome rim band, twelve battlement merlons
  // with studs, a raised crown ring round the hub and heraldic quarters.
  ring_bastion: {
    plate: { mode: 'band', d: 1.3, y0: 0.12, y1: 0.84 },
    metalFinish: 'chrome',
    metal: () => '#76839a',
    sec: (m) => pick(m, '#2c3446', '#e9eef7'),
    acc: () => '#ffcf4a',
    build(E) {
      const n = 12, half = (TAU / n) * 0.26;
      for (let i = 0; i < n; i++) {
        const c = ((i + 0.5) * TAU) / n;
        const fp = feature(E, E.soups.trim, c - half, c + half, (u, p) => E.Os(p) - 0.9 - 2.6, () => 99, () => E.T + 1.1, { kind: 'flat', chamfer: 0.35, margin: 0.9 });
        E.paints.push((H) => H.foot(fp, E.C.line, 0.3));
        rivet(E, E.Os(c) - 0.9 - 1.3, c, 0.55, 0.32, E.soups.metal, E.T + 1.05);
      }
      annulusTop(E, E.soups.trim, E.Rcol + 0.45, E.Rcol + 1.9, E.T - 0.03, E.T + 0.85, 0.3);
      for (let i = 0; i < 4; i++) topScrew(E, E.Rcol + 4.3, ((i + 0.25) * TAU) / 4, 0.8);
    },
    paint(E, H) {
      for (let i = 0; i < 4; i++) { H.band(E.Rcol + 2.3, E.Rb - 4.3, (i * TAU) / 4 + 0.05, (i * TAU) / 4 + TAU / 8 - 0.05); H.fill(E.C.deep); }
      H.ring(E.Rcol + 2.25, 0.2, E.C.line);
      H.ring(E.Rb - 4.2, 0.25, E.C.line);
      H.ring(E.Rb - 3.75, 0.35, E.C.acc);
    },
  },

  // Six soft wave crests in foam white, chrome crest caps, a clear halo over
  // the printed swell round the hub.
  ring_tidalhalo: {
    plate: { mode: 'cap', d: 0.7, lip: 0, frac: 0.34, y0: 0.42 },
    metalFinish: 'chrome',
    metal: () => '#6f8193',
    sec: (m) => pick(m, '#effffb', '#0f4f6b'),
    clear: (m) => mix(m, '#e8fffb', 0.45),
    acc: () => '#ffffff',
    build(E) {
      for (const bl of E.blades) {
        const L = bl.b - bl.a, a = bl.a - 0.1 * L, b = bl.b + 0.1 * L;
        const fp = feature(E, E.soups.trim, a, b, (u, p) => E.Ks(p) - 0.8 - (0.5 + 2.7 * Math.sin(Math.PI * u) ** 2), () => 99, (u) => E.T + 0.25 + 0.95 * Math.sin(Math.PI * u), { kind: 'ridge', peak: 0.62, margin: 0.8 });
        E.paints.push((H) => H.foot(fp, E.C.line, 0.28));
      }
      annulusTop(E, E.soups.clear, E.Rcol + 0.4, E.Rb - 4.4, E.T - 0.03, E.T + 0.7, 0.35);
    },
    paint(E, H) {
      const r = (E.Rcol + E.Rb - 4) / 2;
      H.band(E.Rcol + 0.4, E.Rb - 4.4, 0, TAU); H.fill(E.C.deep);
      wavyRing(H, r - 0.6, 0.7, 6, 0, 0.9, E.C.light);
      wavyRing(H, r + 0.9, 0.6, 6, Math.PI, 0.45, E.C.acc);
      H.ring(E.Rb - 4.4, 0.25, E.C.line);
    },
  },

  // Two hooked talons with deep catches, chrome faces, a glowing rift crack
  // splitting each wide gap.
  ring_rifttalon: {
    plate: { len: 6.5, dFace: 1.8 },
    metalFinish: 'chrome',
    sec: (m) => pick(m, '#f4ecff', '#2a1a40'),
    glow: () => '#6ff7ff',
    acc: () => '#6ff7ff',
    build(E) {
      for (const bl of E.blades) {
        const { f, s } = span(E, bl);
        // crescent claw: rooted near the hub mid-blade, hooking out to the
        // tip behind the strike plate
        const pf = f + (s * (E.plateCfg.len + 0.7)) / E.Rmax, K = (bl.b - bl.a) * 0.75;
        const pts = spike(E, E.soups.trim, E.Rcol + 1.3, E.Rmax, (t) => pf + s * K * (1 - t) ** 1.8, (t) => 0.35 + 3.0 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (1 - 0.55 * t), (t) => E.T + lerp(0.5, 1.45, t), { margin: 0.9, n: E.low ? 6 : 14 });
        E.paints.push((H) => outlinePoly(H, pts, E.C.line, 0.6));
      }
      for (const g of E.gaps) {
        const pts = [], n = E.low ? 4 : 6;
        for (let i = 0; i <= n; i++) pts.push([lerp(E.Rcol + 1.4, E.Rb - 1.5, i / n), g + (i % 2 ? 0.1 : -0.08) * (1 - 0.35 * (i / n))]);
        strip(E, E.soups.glow, pts, 1.1, 0.35);
        E.paints.push((H) => {
          // dark rift shard round the crack
          const sh = pts.map(([r, p], i) => [r, p + 0.22 * (1 - i / n) + 0.05]);
          const sl = pts.map(([r, p], i) => [r, p - 0.22 * (1 - i / n) - 0.05]);
          H.poly([...sh, ...sl.reverse()]); H.fill(E.C.line);
          for (const d of [-1, 1]) { H.g.beginPath(); H.to(E.Rcol + 3, g + d * 0.12, true); H.to(E.Rb - 3.5, g + d * 0.38); H.stroke(E.C.deep, 0.35); }
        });
        topScrew(E, E.Rcol + 3.2, g + 0.55);
        topScrew(E, E.Rcol + 3.2, g - 0.55);
      }
    },
    paint(E, H) { H.ring(E.Rcol + 1.5, 0.3, E.C.acc); },
  },

  // Four flares that rise as they reach out, a printed sun burst, and an
  // upward rake shown by the strongly tapered upper body.
  ring_solarflare: {
    taperGain: 2.6,
    sec: (m) => pick(m, '#ff4a1c', '#ffe9b0'),
    acc: () => '#fff2a0',
    build(E) {
      for (const bl of E.blades) {
        const { f, s } = span(E, bl);
        const pf = f + (s * (E.plateCfg.len + 0.8)) / E.Rmax;
        const pts = spike(E, E.soups.trim, E.Rcol + 1.2, E.Rmax, (t) => lerp(bl.c + s * 0.16, pf, t), (t) => lerp(3.6, 0.4, t ** 0.8), (t) => E.T + lerp(0.3, 1.45, t), { margin: 0.9 });
        E.paints.push((H) => outlinePoly(H, pts, E.C.line));
      }
      for (const g of E.gaps) topScrew(E, (E.Rcol + E.Rb) / 2, g);
    },
    paint(E, H) {
      for (let i = 0; i < 16; i++) {
        const c = (i * TAU) / 16 + TAU / 32;
        H.poly([[E.Rcol + 1.1, c - 0.08], [E.Rb - (i % 2 ? 3.2 : 1.6), c], [E.Rcol + 1.1, c + 0.08]]);
        H.fill(i % 2 ? E.C.deep : E.C.acc);
      }
      H.ring(E.Rcol + 1.5, 0.7, E.C.acc);
    },
  },

  // Five slim translucent ghost edges, a clear inner veil and printed
  // left-spin arrows.
  ring_phantomedge: {
    fillL: 0.64, // pale, ghostly paint
    sec: (m) => pick(m, '#f3f0ff', '#2b2350'),
    clear: (m) => mix(m, '#f4f0ff', 0.5),
    clearOpacity: 0.55,
    acc: () => '#bdf6ff',
    build(E) {
      for (const bl of E.blades) {
        const fp = fang(E, E.soups.clear, bl, { w0: 3.4, w1: 0.3, h0: 1.45, h1: 0.35, ext: 0.6, peak: 0.8 });
        E.paints.push((H) => {
          // ghost wisp trailing behind each edge, seen through the clear
          streak(H, fp.a, fp.b, fp.inn, fp.v, -0.5, 4.2, E.C.deep);
          H.foot(fp, E.C.sec, 0.2);
          streak(H, fp.a, fp.b, fp.inn, fp.v, 1.0, 1.0, E.C.sec);
          streak(H, fp.a, fp.b, fp.inn, fp.v, 2.9, 0.5, E.C.acc);
        });
      }
      annulusTop(E, E.soups.clear, E.Rcol + 0.4, E.Rcol + 3.2, E.T - 0.03, E.T + 0.6, 0.3);
      for (const g of E.gaps) topScrew(E, E.Rcol + 4.6, g, 0.75);
    },
    paint(E, H) {
      H.band(E.Rcol + 0.4, E.Rcol + 3.2, 0, TAU); H.fill(E.C.line);
      for (let i = 0; i < 15; i++) H.chevron(E.Rcol + 1.8, (i * TAU) / 15, 0.9, E.mv || 1, E.C.acc, 0.35);
      for (const g of E.gaps) H.chevron(E.Rb - 3.0, g + 0.12 * (E.mv || 1), 1.7, E.mv || 1, E.C.sec, 0.65);
    },
  },

  // Eight riveted gunmetal armour plates in an octagon, chrome caps on the
  // eight low bumps, big studs in the seams and hazard print round the hub.
  ring_ironwall: {
    plate: { mode: 'cap', d: 1.0, lip: 0.3 },
    trimSpecEdge: 0.99,
    sec: (m) => pick(m, '#46505e', '#c9d1dc'),
    acc: () => '#ffc93a',
    build(E) {
      for (const bl of E.blades) {
        const c = bl.c, a = bl.a - 0.02, b = bl.b + 0.02;
        const R0 = E.Ks(c) - 1.0, Ri = E.Rcol + 2.4;
        const fp = feature(E, E.soups.trim, a, b, (u, p) => Ri / Math.cos(p - c), (u, p) => R0 / Math.cos(p - c), () => E.T + 0.7, { kind: 'flat', chamfer: 0.45, margin: 1.0 });
        E.paints.push((H) => H.foot(fp, E.C.line, 0.3));
        for (const d of [-0.11, 0.11]) rivet(E, (Ri + R0) / 2 + 1.5, c + d, 0.45, 0.32, E.soups.metal, E.T + 0.65);
      }
      for (const g of E.gaps) rivet(E, E.Ks(g) - 2.0, g, 1.05, 0.85);
    },
    paint(E, H) {
      const r0 = E.Rcol + 0.9, r1 = E.Rcol + 2.2;
      H.band(r0, r1, 0, TAU); H.fill('#1c1f26');
      for (let i = 0; i < 40; i++) { const a = (i * TAU) / 40; H.poly([[r0, a], [r0, a + 0.07], [r1, a + 0.12], [r1, a + 0.05]]); H.fill(E.C.acc); }
    },
  },

  // A gunmetal circular-saw disc set into the top: a raised steel band with
  // six hooked teeth riding out onto the blades, rivets between them, and a
  // printed cyclone spiral turning with the spin inside it.
  ring_cyclonesaw: {
    sec: (m) => pick(m, '#5b6372', '#e3e8f0'),
    trimFinish: 'metal',
    trimSpecEdge: 0.985,
    acc: () => '#ffb02e',
    build(E) {
      const ro = E.Rb - 1.5, ri = ro - (E.low ? 2.4 : 2.1), yt = E.T + 0.55;
      E.saw = [ri, ro];
      annulusTop(E, E.soups.trim, ri, ro, E.T - 0.03, yt, 0.25, segs(E.q, 64, 48, 32));
      for (const bl of E.blades) {
        const fp = fang(E, E.soups.trim, bl, { w0: 4.6, w1: 0.6, pw: 0.8, h0: 1.45, h1: 0.55, ext: 0.12, peak: 0.5, start: 0.15 });
        E.paints.push((H) => H.foot(fp, E.C.line, 0.3));
        // rivet on the band in each gullet
        const { t, s } = span(E, bl);
        rivet(E, (ri + ro) / 2, t + s * 0.5 * E.P * (1 - E.w), 0.5, 0.35, E.soups.metal, yt - 0.04);
      }
    },
    paint(E, H) {
      const turn = -(E.mv || -1), [ri, ro] = E.saw;
      // gullet shadow under the band and its teeth
      H.band(ri - 0.35, ro + 0.35, 0, TAU); H.fill(E.C.line);
      for (let i = 0; i < 6; i++) spiralArm(H, E.Rcol + 0.9, ri - 0.2, (i * TAU) / 6, turn, 0.5, 2.6, shade(E.C.fill, -0.3, 0.05));
      for (let i = 0; i < 6; i++) spiralArm(H, E.Rcol + 1.5, ri - 0.5, (i * TAU) / 6 + 0.3, turn, 0.2, 0.6, E.C.acc);
      H.ring(E.Rcol + 1.3, 0.5, E.C.acc);
    },
  },

  // Symmetric comet arcs in royal blue between double-sided strike plates,
  // each trailing printed tails both ways; a dark star band round the hub and
  // shooting-star streaks in the gaps.
  ring_cometarc: {
    plate: { len: 4.5 },
    sec: (m) => pick(m, '#2f5bff', '#ffffff'),
    acc: () => '#ffffff',
    build(E) {
      for (const bl of E.blades) {
        const pl = (E.plateCfg.len + 0.4) / E.Rmax, a = bl.a + pl, b = bl.b - pl;
        const fp = feature(E, E.soups.trim, a, b, (u, p) => E.Ks(p) - 0.9 - (0.6 + 3.2 * Math.sin(Math.PI * u)), () => 99, (u) => E.T + 0.3 + 1.1 * Math.sin(Math.PI * u), { kind: 'ridge', peak: 0.72 });
        // tails thin out towards both ends of the arc
        const v = (p) => Math.abs((2 * (p - a)) / (b - a) - 1);
        E.paints.push((H) => {
          streak(H, a, b, fp.ri, v, -0.2, 2.6, E.C.deep);
          H.foot(fp, E.C.line, 0.3);
          streak(H, a, b, fp.ri, v, 1.0, 0.8, E.C.sec);
          streak(H, a, b, fp.ri, v, 2.2, 0.4, E.C.light);
        });
      }
      for (const g of E.gaps) topScrew(E, E.Rcol + 2.0, g, 0.8);
    },
    // star band under the screws (printed before the screw recesses)
    paintBase(E, H) {
      const r0 = E.Rcol + 0.8, r1 = E.Rcol + 3.2;
      H.band(r0, r1, 0, TAU); H.fill(E.C.deep);
      H.ring(r1 + 0.25, 0.3, E.C.sec);
      for (let i = 0; i < 18; i++) {
        const p = (i * TAU) / 18;
        if (E.gaps.some((g) => Math.abs(wrapPi(p - g)) < 0.2)) continue; // screws sit there
        sparkle(H, (r0 + r1) / 2, p, i % 2 ? 0.5 : 0.9, E.C.acc);
      }
    },
    paint(E, H) {
      for (const g of E.gaps) {
        const r = E.Rb - 3.4;
        // shooting star: head at the gap centre, streaks fanning back both ways
        for (const d of [-1, 1]) {
          H.band(r - 0.4, r + 0.4, g + d * 0.09, g + d * 0.55); H.fill(E.C.deep);
          H.band(r - 1.3, r - 0.95, g + d * 0.12, g + d * 0.4); H.fill(E.C.sec);
        }
        sparkle(H, r, g, 2.1, E.C.acc);
        sparkle(H, r - 2.5, g + 0.3, 0.75, E.C.light);
        sparkle(H, r - 2.5, g - 0.3, 0.75, E.C.light);
      }
    },
  },

  // Three broad faceted clear prisms over a printed shield lattice; the
  // downward rake shows as a strong taper under the waist.
  ring_aegisprism: {
    plate: { len: 4 },
    taperGain: 3.6,
    // deep crystal a step round the colour wheel from the body paint
    clear: (m) => { const { h } = hsl(m); return fromHsl(h + 0.07, 0.85, 0.4); },
    clearFlat: true,
    clearFinish: 'gem',
    clearOpacity: 0.78,
    acc: () => '#ffffff',
    build(E) {
      for (const bl of E.blades) {
        const pl = (E.plateCfg.len + 0.6) / E.Rmax, a = bl.a + pl, b = bl.b - pl;
        // facets alternate in height along the prism so each catches the
        // light differently (flat shaded)
        const nf = E.low ? 4 : 8;
        const fp = feature(E, E.soups.clear, a, b, () => E.Rcol + 2.0, () => 99, (u) => E.T + (Math.round(u * nf) % 2 ? 1.0 : 1.45), { kind: 'gem', shoulder: 0.15, n: nf });
        E.paints.push((H) => {
          H.foot(fp, shade(E.C.fill, -0.32, 0.05), 0.25);
          for (let i = 1; i < 6; i++) { const p = lerp(fp.a, fp.b, i / 6); H.g.beginPath(); H.to(fp.ri(p), p, true); H.to(fp.ro(p), p); H.stroke(E.C.light, 0.3); }
        });
      }
      for (const g of E.gaps) topScrew(E, (E.Rcol + E.Rb) / 2, g);
    },
    paint(E, H) { H.ring(E.Rcol + 1.7, 0.25, E.C.line); },
  },

  // Left-spin jaws in black lacquer with chrome fang teeth biting inward and
  // acid-green glowing slits; a dark vortex print.
  ring_voidmaw: {
    plate: { len: 6 },
    metalFinish: 'chrome',
    metal: () => '#8a90a0',
    frame: () => '#120d1a',
    sec: () => '#120d18',
    clear: () => '#f1ead8',
    clearFinish: 'gloss',
    clearOpacity: 1,
    glow: () => '#9dff3a',
    acc: () => '#9dff3a',
    build(E) {
      for (const bl of E.blades) {
        const fp = fang(E, E.soups.trim, bl, { w0: 5.8, w1: 0.8, pw: 0.7, h0: 1.3, h1: 0.4, ext: 0.3, peak: 0.65 });
        // bone fangs biting inward from the jaw's inner edge
        const n = E.low ? 2 : 4;
        for (let i = 0; i < n; i++) {
          const v = 0.08 + (i / n) * 0.6, psi = fp.s > 0 ? fp.a + v * (fp.b - fp.a) : fp.b - v * (fp.b - fp.a), r0 = fp.inn(psi) + 0.8;
          spike(E, E.soups.clear, r0, r0 - 2.6 + i * 0.35, () => psi, (t) => lerp(0.95, 0.05, t), (t) => E.T + lerp(1.2, 0.3, t), { n: 3 });
        }
        E.paints.push((H) => {
          H.foot(fp, E.C.line, 0.3);
          streak(H, fp.a, fp.b, fp.inn, fp.v, -0.25, 0.7, E.C.acc);
        });
        // glowing slit "eyes" in the gap behind each jaw
        const g = bl.c + E.P / 2;
        feature(E, E.soups.glow, g - 0.2, g + 0.2, () => E.Rcol + 1.4, () => E.Rcol + 2.4, (u) => E.T + 0.15 + 0.35 * Math.sin(Math.PI * u), { kind: 'ridge', n: 8, margin: 0 });
      }
    },
    paint(E, H) {
      for (let i = 0; i < 6; i++) spiralArm(H, E.Rcol + 1, E.Rb - 1, (i * TAU) / 6, 1.3 * (E.mv || 1), 0.4, 2.2, E.C.line);
      H.ring(E.Rcol + 3.0, 0.3, E.C.acc);
    },
  },

  // Five long gold lances reaching for the widest radius over a printed
  // navy star.
  ring_starlance: {
    sec: (m) => pick(m, '#ffc83a', '#2a3b8f'),
    acc: (m) => pick(m, '#24306b', '#ffffff'),
    build(E) {
      E.lanceAt = [];
      for (const bl of E.blades) {
        const { f, s } = span(E, bl);
        const pf = f + (s * (E.plateCfg.len + 0.6)) / E.Rmax, p0 = bl.c + s * 0.05;
        E.lanceAt.push(p0);
        const pts = spike(E, E.soups.trim, E.Rcol + 1.0, E.Rmax, (t) => lerp(p0, pf, t ** 1.4), (t) => lerp(2.0, 0.3, t), (t) => E.T + lerp(0.7, 1.4, t), { margin: 0.9, shoulder: 0.4 });
        E.paints.push((H) => outlinePoly(H, pts, E.C.line, 0.7));
      }
    },
    paint(E, H) {
      // navy star whose points run out under the lances, gold keyline
      const st = starPts(5, E.Rcol + 2.2, E.Rb - 0.4, E.lanceAt[0]);
      H.poly(st); H.fill(E.C.sec); H.stroke(E.C.sec, 0.9);
      H.poly(st); H.fill(E.C.acc);
      H.ring(E.Rcol + 1.3, 0.45, E.C.sec);
      for (const g of E.gaps) sparkle(H, E.Rb - 2.6, g, 1.3, E.C.sec);
    },
  },
};

// Fallback for unknown ids, from the part's numbers alone: swept fangs sized
// to the blade depth (short crest caps instead of face plates on shallow
// blades), a merlon crown when bladeless, screws in the gaps, a printed
// hub band and spin arrows.
function parametric(part) {
  const depth = (part.rOut ?? 0) - (part.rBase ?? part.rOut ?? 0);
  return {
    plate: part.blades > 0 && depth < 1.6 ? { mode: 'cap', d: 0.8, lip: 0, frac: 0.45 } : undefined,
    sec: (m) => pick(m, '#f2f5fb', '#1e2433'),
    build(E) {
      if (!E.N) {
        for (let i = 0; i < 8; i++) {
          const c = ((i + 0.5) * TAU) / 8;
          const fp = feature(E, E.soups.trim, c - 0.2, c + 0.2, (u, p) => E.Os(p) - 3.4, () => 99, () => E.T + 0.9, { kind: 'flat' });
          E.paints.push((H) => H.foot(fp, E.C.line, 0.3));
        }
      }
      for (const bl of E.blades) {
        const fp = fang(E, E.soups.trim, bl, { w0: clamp(E.Rmax - E.Rb + 1.5, 2.2, 5), w1: 0.4, h0: 1.2, h1: 0.3, ext: 0.3 });
        E.paints.push((H) => {
          streak(H, fp.a, fp.b, fp.inn, fp.v, -0.3, 2.2, E.C.deep);
          H.foot(fp, E.C.line, 0.3);
          streak(H, fp.a, fp.b, fp.inn, fp.v, 1.0, 0.6, E.C.light);
        });
      }
      for (const g of E.gaps) topScrew(E, (E.Rcol + E.Rb) / 2, g);
    },
    paint(E, H) {
      H.band(E.Rcol + 0.9, E.Rcol + 2.4, 0, TAU); H.fill(E.C.deep);
      H.ring(E.Rcol + 2.6, 0.2, E.C.line);
      // spin arrows either side of each gap screw
      const d = Math.min(0.24, ((1 - E.w) * E.P) / 3.2);
      if (E.mv) for (const g of E.gaps) for (const o of [-d, d]) H.chevron(E.Rb - 3, g + o, 1.3, E.mv, E.C.sec, 0.55);
    },
  };
}
