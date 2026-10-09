// Core models: the top centre of every top, built like a real toy core from
// separately moulded pieces stacked on the spin axis:
//   hub      lathed body with crisp chamfers; its cap carries printed panel
//            art (canvas map) and drops into the attack ring's hole
//   tab ring the clamp plate whose tabs reach over the ring (or, when there
//            is no headroom above the ring, short lugs inside the hole)
//   bezel    the frame around the Bit-Beast chip (round, polygonal or star)
//   chip     emblem disc (emissive, pulsed through `glows`)
//   lens     domed clear plastic over the chip with a printed glint
//   hardware merged screws/bolts/weights (one metal mesh)
//   inlays   merged accent plates in the top's colour
//   gems     merged crystals (resonant core only)
// Each part id has its own silhouette, colour blocking and print; unknown
// ids get a parametric design from their architecture and numbers.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM, TAU, partGroup, toonMaterial, inked, tone, inkFor, segs, canvasTexture, rarityGlow, makeCanvas, extrudeShape } from './common.js';
import { mix } from '../toon.js';
import { emblemCanvas } from '../emblems.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------ geometry helpers

// Lathe from [r, y] mm points with hard creases: every profile segment has
// its own normals, so chamfers read as crisp facets instead of the soft
// blend of LatheGeometry. The profile must run counter-clockwise in (r, y)
// (out along the bottom, up the outside, in across the top) for outward
// normals. Non-indexed with planar top-down UVs over radius uvR mm; strips
// for which plain(k) is truthy map to a plain canvas corner: true -> the
// body-colour corner, or an explicit [u, v].
// smooth: normals averaged along the profile (domes). flat: one normal per
// facet around the axis (polygonal bezels, hex heads).
function lathe(pts, n, { smooth = false, flat = false, phi0 = 0, uvR = 10, plain = null } = {}) {
  const pos = [], nor = [], uv = [];
  const segN = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const dr = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1];
    const l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  const ptN = pts.map((_, j) => {
    const a = segN[Math.max(0, j - 1)], b = segN[Math.min(segN.length - 1, j)];
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  });
  const vert = (r, y, phi, nphi, nrm, k) => {
    const c = Math.cos(phi), s = Math.sin(phi);
    pos.push(r * c * MM, y * MM, r * s * MM);
    nor.push(nrm[0] * Math.cos(nphi), nrm[1], nrm[0] * Math.sin(nphi));
    const pk = plain && plain(k);
    if (pk) uv.push(...(Array.isArray(pk) ? pk : [0.995, 0.995]));
    else uv.push(0.5 + (r * c) / (2 * uvR), 0.5 - (r * s) / (2 * uvR));
  };
  for (let k = 0; k < pts.length - 1; k++) {
    const [rA, yA] = pts[k], [rB, yB] = pts[k + 1];
    if (rA < 1e-6 && rB < 1e-6) continue;
    if (Math.abs(rA - rB) < 1e-9 && Math.abs(yA - yB) < 1e-9) continue;
    const nA = smooth ? ptN[k] : segN[k], nB = smooth ? ptN[k + 1] : segN[k];
    for (let i = 0; i < n; i++) {
      const p0 = phi0 + (i / n) * TAU, p1 = phi0 + ((i + 1) / n) * TAU, pm = (p0 + p1) / 2;
      const q0 = flat ? pm : p0, q1 = flat ? pm : p1;
      // (v00, v01, v10) and (v10, v01, v11); v01 = B at p0 etc.
      if (rA > 1e-6) { vert(rA, yA, p0, q0, nA, k); vert(rB, yB, p0, q0, nB, k); vert(rA, yA, p1, q1, nA, k); }
      if (rB > 1e-6) { vert(rA, yA, p1, q1, nA, k); vert(rB, yB, p0, q0, nB, k); vert(rB, yB, p1, q1, nB, k); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Washer/bezel ring with chamfered outer top and inner top edges.
function bezelLathe(ri, ro, y0, y1, n, { c = 0.25, ci = 0.12, flat = false, phi0 = 0 } = {}) {
  return lathe([[ri, y0], [ro, y0], [ro, y1 - c], [ro - c, y1], [ri + ci, y1], [ri, y1 - ci], [ri, y0]], n, { flat, phi0 });
}

// Hex-head screw / bolt standing on y = 0 (mm sizes), with a washer flange.
function hexBolt(r, h, washer = 0) {
  const p = [];
  if (washer) p.push([0, 0], [r * 1.35, 0], [r * 1.35, washer], [r, washer]);
  else p.push([0, 0], [r, 0]);
  const y0 = washer || 0;
  p.push([r, y0 + h * 0.62], [r * 0.72, y0 + h], [r * 0.32, y0 + h], [r * 0.32, y0 + h - 0.06], [0, y0 + h - 0.06]);
  return lathe(p, 6, { flat: true, phi0: 30 * DEG });
}

// Domed rivet.
function rivet(r, h, n = 8) {
  const p = [[0, 0], [r, 0]];
  for (let i = 1; i <= 3; i++) { const a = (i / 3) * (Math.PI / 2); p.push([r * Math.cos(a), h * Math.sin(a)]); }
  return lathe(p, n, { smooth: true });
}

// Closed polygon of [r, angle] (mm, rad) -> THREE.Shape in XZ (shape y = -z).
function polarShape(pts) {
  const s = new THREE.Shape();
  pts.forEach(([r, a], i) => {
    const x = r * Math.cos(a) * MM, y = -r * Math.sin(a) * MM;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  });
  s.closePath();
  return s;
}
// [x, y] mm in a tab's local frame (x radial, y toward the spin direction)
// at angle a -> [r, angle].
const toPolar = (pts, a) => pts.map(([x, y]) => [Math.hypot(x, y), a + Math.atan2(y, x)]);
const xz = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// Extruded slab from a shape, y0..y1 mm, chamfered by bevel mm.
function slab(shape, y0, y1, bevel = 0.12, curveSegments = 6) {
  const g = extrudeShape(shape, (y1 - y0) * MM, { bevel: bevel * MM, curveSegments });
  g.translate(0, y0 * MM, 0);
  return g;
}

// Place a geometry at (r, angle) on the part, rotated to face outward.
function placed(geo, r, a, y = 0) {
  geo.rotateY(-a);
  const [x, z] = xz(r, a);
  geo.translate(x * MM, y * MM, z * MM);
  return geo;
}

// Envelope safety net: extrude bevels push acute tab corners out further than
// the bevel size, so pull any stray vertex back inside the ring hole (below
// the ring top yT) or the clamp radius (above it), and under the height cap.
function clampEnvelope(group, yT, rLow, rHigh, yMax) {
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.isInk || seen.has(o.geometry)) return;
    seen.add(o.geometry);
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = Math.min(Math.max(p.getY(i), 0), yMax * MM);
      const lim = (y < yT * MM ? rLow : rHigh) * MM, r = Math.hypot(x, z);
      const k = r > lim ? lim / r : 1;
      p.setXYZ(i, x * k, y, z * k);
    }
    p.needsUpdate = true;
  });
}

function merged(list) {
  const geos = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  if (!geos.length) return null;
  for (const g of geos) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const m = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return m;
}

// ------------------------------------------------------------ printed canvases

// Canvases are cached per design/colours (textures are made per build).
const canvasCache = new Map();
function cachedCanvas(key, size, draw) {
  if (!canvasCache.has(key)) canvasCache.set(key, makeCanvas(size, draw));
  return canvasCache.get(key);
}

// Bit chip face: dark tinted face, printed rim and ticks, emblem on top.
function chipCanvas(beast, accent) {
  const prim = beast ? beast.colors.primary : accent;
  const sec = beast ? beast.colors.secondary : '#ffffff';
  const em = beast
    ? emblemCanvas(beast.emblem, beast.colors, 256, { background: false })
    : emblemCanvas('blank', { primary: accent, secondary: '#ffffff' }, 256, { background: false });
  return cachedCanvas(`chip|${beast ? beast.id : 'none'}|${prim}|${sec}`, 256, (g, S) => {
    const c = S / 2;
    const grd = g.createRadialGradient(c, c, S * 0.04, c, c, S * 0.5);
    grd.addColorStop(0, mix(prim, '#0c1236', 0.8));
    grd.addColorStop(0.72, mix(prim, '#080b22', 0.9));
    grd.addColorStop(1, '#04050e');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.lineWidth = S * 0.035;
    g.strokeStyle = prim;
    g.beginPath(); g.arc(c, c, S * 0.455, 0, TAU); g.stroke();
    g.strokeStyle = sec;
    g.globalAlpha = 0.75;
    g.lineWidth = S * 0.012;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, r0 = i % 6 ? 0.415 : 0.395;
      g.beginPath(); g.moveTo(c + Math.cos(a) * S * r0, c + Math.sin(a) * S * r0); g.lineTo(c + Math.cos(a) * S * 0.432, c + Math.sin(a) * S * 0.432); g.stroke();
    }
    g.globalAlpha = 1;
    g.drawImage(em, S * 0.07, S * 0.07, S * 0.86, S * 0.86);
  });
}

// Clear lens: faint tint everywhere plus anime glints (alpha carries them).
function lensCanvas(tint, alpha = 0.1) {
  return cachedCanvas(`lens|${tint}|${alpha}`, 128, (g, S) => {
    const c = S / 2;
    g.fillStyle = tint;
    g.globalAlpha = alpha;
    g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.95;
    g.strokeStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineWidth = S * 0.075;
    g.beginPath(); g.arc(c, c, S * 0.33, Math.PI * 1.05, Math.PI * 1.42); g.stroke();
    g.lineWidth = S * 0.04;
    g.beginPath(); g.arc(c, c, S * 0.33, Math.PI * 1.52, Math.PI * 1.6); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(c + S * 0.2, c + S * 0.2, S * 0.035, 0, TAU); g.fill();
  });
}

// Hub cap print, in mm units centred on the axis (x -> +X, y -> +Z).
// Corner patches of the hub canvas: body colour (top right, the default
// fill) and the darker under-moulding (bottom left; v is flipped).
const UV_LOWER = [0.03, 0.03];
function hubCanvas(key, L, body, lower, paint) {
  return cachedCanvas(`hub|${key}`, L.q === 'low' ? 256 : 512, (g, S) => {
    g.fillStyle = body;
    g.fillRect(0, 0, S, S);
    g.save();
    g.translate(S / 2, S / 2);
    g.scale(S / (2 * L.rCap), S / (2 * L.rCap));
    paint(g, L);
    g.restore();
    // plain corners for the unprinted strips (outside the printed cap disc)
    g.fillStyle = body;
    g.fillRect(S * 0.92, 0, S * 0.08, S * 0.08);
    g.fillStyle = lower;
    g.fillRect(0, S * 0.92, S * 0.08, S * 0.08);
  });
}

// Print primitives (mm units).
const P = {
  circle(g, r, w, color, alpha = 1) { g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.globalAlpha = 1; },
  radial(g, a, r0, r1, w, color) { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); },
  band(g, r0, r1, a0, a1, color) { g.fillStyle = color; g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill(); },
  dot(g, r, a, rad, color) { g.fillStyle = color; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, rad, 0, TAU); g.fill(); },
  // tapered swoosh along an arc (r0 -> r1 while sweeping a0 -> a1)
  swoosh(g, r0, r1, a0, a1, w, color) {
    g.fillStyle = color; g.beginPath();
    const N = 16;
    for (let i = 0; i <= N; i++) { const t = i / N, r = r0 + (r1 - r0) * t + w * (1 - t) * 0.5, a = a0 + (a1 - a0) * t; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = N; i >= 0; i--) { const t = i / N, r = r0 + (r1 - r0) * t - w * (1 - t) * 0.5, a = a0 + (a1 - a0) * t; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
  },
  text(g, str, r, a, size, color) {
    g.save(); g.rotate(a); g.translate(r, 0); g.rotate(Math.PI / 2);
    g.fillStyle = color; g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(str, 0, 0); g.restore();
  },
  // countersink under a screw
  sink(g, r, a, rad, color) { P.dot(g, r, a, rad, color); },
};

// ------------------------------------------------------------ tab outlines

// Tab outlines in the tab's local frame: x radial (mm), y toward the spin
// direction (mm), listed from the trailing root to the leading root. Root
// points sit on the collar circle. Authored for right spin; mirrored for L.
const root = (rc, y) => [Math.sqrt(Math.max(0, rc * rc - y * y)), y];

const TABS = {
  // swept hook, tip trailing the spin
  helix: (L) => { const r0 = L.rCol, r1 = L.rTab; return [root(r0, -3.0), [r0 + 1.6, -3.3], [r1 - 0.45, -4.3], [r1, -3.8], [r1, -1.7], [r1 - 1.3, -0.1], [r0 + 1.0, 2.1], root(r0, 2.9)]; },
  // broad reinforced rectangle with chamfered corners
  quad: (L) => { const r0 = L.rCol, r1 = L.rTab; return [root(r0, -3.1), [r1 - 0.7, -3.1], [r1, -2.4], [r1, 2.4], [r1 - 0.7, 3.1], root(r0, 3.1)]; },
  // short low lug inside the ring hole
  apex: (L) => { const r0 = L.rCol, r1 = L.rTab; return [root(r0, -3.2), [r1, -2.2], [r1, 2.2], root(r0, 3.2)]; },
  // crescent horns
  // crescent moon: rounded outer corners, pointed horns, a round bite
  lunar: (L) => {
    const r0 = L.rCol, r1 = L.rTab, p = [root(r0, -3.1)];
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); p.push([r1 - 1.3 + Math.sin(a) * 1.3, -3.1 + (1 - Math.cos(a)) * 1.2]); }
    const cx = r1 + 0.5, rho = Math.hypot(0.5, 1.9), a0 = Math.atan2(-1.9, -0.5);
    for (let i = 1; i < 8; i++) { const a = a0 - (i / 8) * (2 * a0 + 2 * Math.PI); p.push([cx + Math.cos(a) * rho, Math.sin(a) * rho]); }
    for (let i = 0; i <= 4; i++) { const a = (1 - i / 4) * (Math.PI / 2); p.push([r1 - 1.3 + Math.sin(a) * 1.3, 3.1 - (1 - Math.cos(a)) * 1.2]); }
    p.push(root(r0, 3.1));
    return p;
  },
  // crystal shard point
  shard: (L) => { const r0 = L.rCol, r1 = L.rTab; return [root(r0, -2.7), [r0 + 1.3, -2.5], [r1, -0.35], [r1, 0.35], [r0 + 1.3, 2.5], root(r0, 2.7)]; },
  // stubby heavy claw with a notch
  stub: (L) => { const r0 = L.rCol, r1 = L.rTab; return [root(r0, -3.9), [r1 - 0.5, -3.7], [r1, -3.1], [r1, -1.0], [r1 - 0.65, -0.55], [r1 - 0.65, 0.55], [r1, 1.0], [r1, 3.1], [r1 - 0.5, 3.7], root(r0, 3.9)]; },
  // lightning bolt zig-zag
  bolt: (L) => { const r0 = L.rCol, r1 = L.rTab, d = r1 - r0; return [root(r0, -2.8), [r0 + d * 0.45, -1.0], [r0 + d * 0.38, -2.9], [r1, 1.0], [r0 + d * 0.6, -0.1], [r0 + d * 0.68, 1.9], root(r0, 2.6)]; },
  // sun rays: long ray tabs with short rays between (n is doubled)
  ray: (L, i) => {
    const r0 = L.rCol;
    if (i % 2) { const r1 = r0 + Math.min(1.8, (L.rTab - r0) * 0.45); return [root(r0, -1.5), [r1, 0], root(r0, 1.5)]; }
    const r1 = L.rTab; return [root(r0, -2.4), [r1 - 0.45, -0.32], [r1, 0], [r1 - 0.45, 0.32], root(r0, 2.4)];
  },
};

function tabOutline(L, kind, i) {
  let p = TABS[kind](L, i);
  if (L.mirror) p = p.map(([x, y]) => [x, -y]).reverse();
  return p;
}

// Collar disc with n tabs as one outline (polar points, ascending angle).
function tabRingShape(L, kind, n) {
  const tabs = [];
  for (let i = 0; i < n; i++) tabs.push(toPolar(tabOutline(L, kind, i), L.phase + (i / n) * TAU).map(([r, a]) => [Math.min(r, L.rTab), a]));
  const pts = [];
  const step = TAU / L.arcSegs;
  for (let i = 0; i < n; i++) {
    const t = tabs[i], nx = tabs[(i + 1) % n];
    pts.push(...t);
    const a0 = t[t.length - 1][1];
    let a1 = nx[0][1] + (i === n - 1 ? TAU : 0);
    while (a1 <= a0) a1 += TAU;
    const k = Math.max(1, Math.ceil((a1 - a0) / step));
    for (let j = 1; j < k; j++) pts.push([L.rCol, a0 + ((a1 - a0) * j) / k]);
  }
  // centre hole (hidden inside the hub) so the plate never covers the chip
  const s = polarShape(pts);
  const hole = new THREE.Path();
  hole.absarc(0, 0, (L.rCap - 0.35) * MM, 0, TAU, true);
  s.holes.push(hole);
  return s;
}

// Inset copy of a tab outline (accent inlay), scaled about its centroid.
function inlayShape(L, kind, i, a, sx = 0.62, sy = 0.5, dx = 0.25) {
  const p = tabOutline(L, kind, i);
  const cx = p.reduce((s, q) => s + q[0], 0) / p.length + dx, cy = p.reduce((s, q) => s + q[1], 0) / p.length;
  return polarShape(toPolar(p.map(([x, y]) => [cx + (x - cx) * sx, cy + (y - cy) * sy]), a));
}

// ------------------------------------------------------------ designs

// Each design: colours/finishes, tab kind, bezel style, print, extras.
// Colours may be functions of (part, ctx). `extras(k)` adds pieces to
// k.hardware / k.inlays / k.gems (mm helpers available on k).
const DESIGNS = {
  core_helix: {
    tabs: 'helix', n: 3,
    tab: '#33446c', tabFinish: 'gloss',
    bezel: { color: '#dde6f2', finish: 'chrome', sides: 0, w: 1.0 },
    paint(g, L, c) {
      P.circle(g, L.rb + 0.35, 0.07, c.line);
      for (let i = 0; i < 3; i++) {
        const a = L.tabA(i);
        P.swoosh(g, L.rb + 0.6, L.rCap - 0.55, a + 0.35, a + 1.75, 0.9, c.accent);
        P.radial(g, a, L.rb + 0.35, L.rCap, 0.07, c.line);
        P.sink(g, L.screwR, a - 60 * DEG * L.dir, 0.72, c.dark);
      }
      for (let i = 0; i < 36; i++) P.radial(g, (i / 36) * TAU, L.rCap - 0.32, L.rCap - 0.08, 0.05, c.line);
      P.text(g, 'HX-3', L.screwR, L.tabA(0) + 105 * DEG * L.dir, 0.55, c.line);
    },
    extras(k) {
      for (let i = 0; i < 3; i++) k.screw(k.L.screwR, k.L.tabA(i) - 60 * DEG * k.L.dir);
      k.tabInlays(0.6, 0.42, 0.3);
    },
  },
  core_quad: {
    tabs: 'quad', n: 4,
    tab: '#4f5866', tabFinish: 'metal',
    bezel: { color: '#ff8a2a', finish: 'gloss', sides: 8, w: 1.15 },
    paint(g, L, c) {
      P.circle(g, L.rb + 0.3, 0.08, c.line);
      for (let i = 0; i < 4; i++) {
        const a = L.tabA(i);
        P.band(g, L.rb + 0.55, L.rCap - 0.45, a - 0.2, a + 0.2, c.dark);
        P.radial(g, a + Math.PI / 4, L.rb + 0.3, L.rCap, 0.07, c.line);
        P.sink(g, L.screwR + 0.2, a + Math.PI / 4, 0.75, c.dark);
      }
      P.circle(g, L.rCap - 0.3, 0.12, c.accent);
      P.text(g, 'Q4', L.rb + 1.6, L.tabA(0) + 0.42, 0.6, c.line);
    },
    extras(k) {
      const L = k.L;
      for (let i = 0; i < 4; i++) {
        const a = L.tabA(i);
        k.screw(L.screwR + 0.2, a + Math.PI / 4);
        k.inlay(slab(polarShape(toPolar([[L.rCol + 0.3, -1.0], [L.rTab - 1.2, -1.0], [L.rTab - 1.2, 1.0], [L.rCol + 0.3, 1.0]], a)), L.ty1 - 0.05, L.ty1 + 0.14, 0.05, 1));
        k.bolt(L.rTab - 2.2, a, L.ty1 + 0.14, 0.62, 0.38);
      }
    },
  },
  core_apex: {
    tabs: 'apex', n: 3,
    tab: '#14bfa4', tabFinish: 'gloss',
    bezel: { color: '#e4ebf5', finish: 'chrome', sides: 0, w: 1.9, low: true },
    chip: 0.44, capInset: 0.45, lensH: 0.55,
    paint(g, L, c) {
      // racing stripes across the cap
      g.save(); g.beginPath(); g.arc(0, 0, L.rCap, 0, TAU); g.clip();
      g.rotate(L.tabA(0) + Math.PI / 2);
      g.fillStyle = '#1b2236'; g.fillRect(-1.9, -L.rCap, 3.8, 2 * L.rCap);
      g.fillStyle = c.accent; g.fillRect(-1.55, -L.rCap, 0.9, 2 * L.rCap); g.fillRect(0.65, -L.rCap, 0.9, 2 * L.rCap);
      g.fillStyle = '#14bfa4'; g.fillRect(-0.18, -L.rCap, 0.36, 2 * L.rCap);
      g.restore();
      for (let i = 0; i < 48; i++) P.radial(g, (i / 48) * TAU, L.rCap - 0.55, L.rCap - 0.3, 0.07, c.line);
      // speedometer dial band around the bezel
      P.band(g, L.rb, L.rb + 0.85, 0, TAU, '#1b2236');
      for (let i = 0; i < 40; i++) P.radial(g, L.tabA(0) + (i / 40) * TAU, L.rb + 0.45, L.rb + (i % 5 ? 0.7 : 0.8), i % 5 ? 0.06 : 0.12, i < 6 ? '#ff4a5e' : '#e9f2ff');
      P.circle(g, L.rb + 0.85, 0.07, c.line);
      P.circle(g, L.rCap - 0.25, 0.06, c.line);
      for (let i = 0; i < 3; i++) P.radial(g, L.tabA(i), L.rb + 0.85, L.rCap, 0.07, c.line);
      P.text(g, 'APEX', L.rb + 0.95, L.tabA(1) + 0.5, 0.5, c.line);
    },
    extras(k) {
      for (let i = 0; i < 3; i++) k.rivet(k.L.rCap - 0.85, k.L.tabA(i) + Math.PI / 3, 0.38, 0.22);
    },
  },
  core_lunar: {
    tabs: 'lunar', n: 3,
    tab: '#7d8cf0', tabFinish: 'gloss',
    bezel: { color: '#ffd36b', finish: 'metal', sides: 0, w: 0.95 },
    hardwareColor: '#eef2fa', capInset: 0.7,
    paint(g, L, c) {
      // night-sky cap so the silver crescent reads from afar
      P.band(g, L.rb, L.rCap - 0.3, 0, TAU, '#262e6a');
      P.circle(g, L.rCap - 0.3, 0.08, '#c9d2ff');
      P.circle(g, L.rb + 0.3, 0.07, '#5d68b8');
      // star field on the light (-X) side, opposite the weight
      const stars = [[0.55, 2.4], [0.8, 3.0], [0.35, 3.5], [0.7, 3.9], [0.45, 2.8], [0.9, 3.4]];
      for (const [t, a] of stars) P.dot(g, L.rb + 0.5 + t * (L.rCap - L.rb - 1), a, 0.17, '#ffffff');
      for (const [t, a] of stars) P.dot(g, L.rb + 0.5 + t * (L.rCap - L.rb - 1), a + 0.22, 0.08, c.accent);
      P.text(g, 'LUNA', L.rb + 1.0, Math.PI, 0.5, '#c9d2ff');
    },
    extras(k) {
      // crescent weight on +X: outer circle minus an offset circle
      const L = k.L, ro = L.rCap - 0.12, d = 1.5 + 2.2 * (k.part.ecc || 0.28), r2 = L.rb + d + 0.15;
      const xh = (r2 * r2 - ro * ro - d * d) / (2 * d), th = Math.acos(Math.max(-1, Math.min(1, xh / ro)));
      const zh = Math.sqrt(Math.max(0, ro * ro - xh * xh)), ph = Math.atan2(zh, xh + d);
      const pts = [];
      const N = k.q === 'low' ? 10 : 18;
      for (let i = 0; i <= N; i++) pts.push([ro, -th + (2 * th * i) / N]);
      for (let i = 0; i <= N; i++) {
        const p = ph - (2 * ph * i) / N, x = -d + r2 * Math.cos(p), z = r2 * Math.sin(p);
        pts.push([Math.hypot(x, z), Math.atan2(z, x)]);
      }
      k.hardware.push(slab(polarShape(pts), L.capTop - 0.05, Math.min(L.bezelTop + 0.1, L.yMax - 0.15), 0.12, 1));
      for (let i = 0; i < 3; i++) k.rivet((L.rb + 0.15 + ro) / 2, (i - 1) * 0.5, 0.3, 0.18, Math.min(L.bezelTop + 0.1, L.yMax - 0.15) - 0.03);
    },
  },
  core_resonant: {
    tabs: 'shard', n: 3,
    tab: '#b37b1e', tabFinish: 'metal',
    bezel: { color: '#8ff5ff', finish: 'gem', sides: 6, w: 1.1, gem: true },
    crystal: '#8ff5ff',
    paint(g, L, c) {
      P.circle(g, L.rb + 0.3, 0.07, c.line);
      // resonance rings and spokes
      P.circle(g, (L.rb + L.rCap) / 2, 0.1, c.accent, 0.9);
      for (let i = 0; i < 6; i++) P.radial(g, L.tabA(0) + (i / 6) * TAU + Math.PI / 6, L.rb + 0.3, L.rCap - 0.2, 0.06, c.line);
      for (let i = 0; i < 12; i++) P.dot(g, L.rCap - 0.45, (i / 12) * TAU, 0.12, c.dark);
      P.text(g, 'RSN', L.rb + 0.9, L.tabA(1) + Math.PI / 3, 0.5, c.line);
    },
    extras(k) {
      const L = k.L;
      // crystal on every shard tab + six small facets around the bezel
      for (let i = 0; i < 3; i++) k.crystal(L.rCol - 0.6, L.tabA(i), L.ty1 - 0.1, 1.3, (L.rTab - L.rCol) * 0.95, Math.min(0.85, L.yMax - L.ty1 - 0.05));
      if (k.q !== 'low') for (let i = 0; i < 6; i++) k.crystal(L.rb + 0.15, L.tabA(0) + (i / 6) * TAU + Math.PI / 6, L.capTop - 0.1, 0.4, Math.min(1.3, L.rCap - L.rb - 0.6), Math.min(0.45, L.yMax - L.capTop - 0.05));
    },
  },
  core_gravity: {
    tabs: 'stub', n: 4,
    tab: '#2a2e36', tabFinish: 'metal',
    bezel: { color: '#3a404b', finish: 'metal', sides: 12, w: 1.2 },
    collar: 1.3, tabReach: 2.3, capInset: 1.1,
    paint(g, L, c) {
      // hazard stripes on the cap band
      g.save();
      g.beginPath(); g.arc(0, 0, L.rCap - 0.25, 0, TAU); g.arc(0, 0, L.rb + 0.35, TAU, 0, true); g.clip();
      g.fillStyle = '#ffd23a'; g.fillRect(-L.rCap, -L.rCap, 2 * L.rCap, 2 * L.rCap);
      g.fillStyle = '#16181d';
      for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * L.rb, Math.sin(a) * L.rb); g.lineTo(Math.cos(a + 0.12) * L.rb, Math.sin(a + 0.12) * L.rb); g.lineTo(Math.cos(a + 0.24) * L.rCap, Math.sin(a + 0.24) * L.rCap); g.lineTo(Math.cos(a + 0.12) * L.rCap, Math.sin(a + 0.12) * L.rCap); g.closePath(); g.fill(); }
      g.restore();
      P.circle(g, L.rb + 0.35, 0.09, c.line);
      P.circle(g, L.rCap - 0.25, 0.09, c.line);
    },
    extras(k) {
      const L = k.L;
      // heavy bolts on the tungsten ring, or on the cap when the ring is buried in the hole
      const onRing = L.rCol - L.rCap > 1.4;
      const br = onRing ? (L.rCap + L.rCol) / 2 + 0.05 : L.screwR, by = onRing ? L.ty1 - 0.02 : L.capTop - 0.05;
      for (let i = 0; i < 8; i++) k.bolt(br, L.tabA(0) + (i / 8) * TAU + Math.PI / 8, by, onRing ? 0.55 : 0.48, 0.42, 0.1);
      k.tabInlays(0.45, 0.3, 0.05);
    },
  },
  core_storm: {
    tabs: 'bolt', n: 3,
    tab: '#ffe14d', tabFinish: 'gloss',
    bezel: { color: '#f4f9ff', finish: 'gloss', sides: 0, w: 0.95 },
    paint(g, L, c) {
      // swept vent slots with lit lips
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + L.phase;
        P.swoosh(g, L.rb + 0.45, L.rCap - 0.5, a, a - 0.5 * L.dir, 0.55, '#0f2a48');
        P.swoosh(g, L.rb + 0.45 + 0.05, L.rCap - 0.5 + 0.05, a + 0.06 * L.dir, a - 0.44 * L.dir, 0.18, '#d6f2ff');
      }
      P.circle(g, L.rb + 0.3, 0.07, c.line);
      P.circle(g, L.rCap - 0.25, 0.08, c.accent);
    },
    extras(k) { for (let i = 0; i < 3; i++) k.rivet(k.L.rCol + 0.75, k.L.tabA(i) + 0.03 * k.L.dir, 0.34, 0.2, k.L.ty1 - 0.03); },
  },
  core_solar: {
    tabs: 'ray', n: 8, tabCount: 4,
    tab: '#ff4f24', tabFinish: 'gloss',
    bezel: { color: '#ffe27a', finish: 'chrome', star: 12, w: 1.25 },
    lens: '#ffa21a', lensAlpha: 0.38,
    paint(g, L, c) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + L.phase;
        g.fillStyle = i % 2 ? '#ffd27a' : '#ff6a2e';
        g.beginPath(); g.moveTo(Math.cos(a - 0.12) * (L.rb + 0.3), Math.sin(a - 0.12) * (L.rb + 0.3));
        g.lineTo(Math.cos(a) * (L.rCap - (i % 2 ? 0.9 : 0.3)), Math.sin(a) * (L.rCap - (i % 2 ? 0.9 : 0.3)));
        g.lineTo(Math.cos(a + 0.12) * (L.rb + 0.3), Math.sin(a + 0.12) * (L.rb + 0.3)); g.closePath(); g.fill();
      }
      P.circle(g, L.rCap - 0.2, 0.08, c.line);
    },
    extras(k) { for (let i = 0; i < 4; i++) k.rivet(k.L.rCol + 0.55, k.L.tabA(i), 0.36, 0.22, k.L.ty1 - 0.03); },
  },
};

// Parametric design for unknown ids, from architecture and numbers.
function fallbackDesign(part) {
  const arch = part.arch || 'helix';
  const kind = arch === 'quad' ? 'quad' : arch === 'apex' ? 'apex' : 'helix';
  return {
    tabs: kind, n: kind === 'quad' ? 4 : 3,
    tab: tone(part.color || '#c0c8d4', -0.38, 0.1), tabFinish: 'gloss',
    bezel: { color: '#dfe6f0', finish: 'chrome', sides: kind === 'quad' ? 8 : 0, w: 1.0 },
    paint(g, L, c) {
      P.circle(g, L.rb + 0.3, 0.07, c.line);
      for (let i = 0; i < L.n; i++) { P.radial(g, L.tabA(i), L.rb + 0.3, L.rCap, 0.07, c.line); P.band(g, L.rb + 0.6, L.rCap - 0.5, L.tabA(i) + 0.5, L.tabA(i) + 1.1, c.accent); }
      P.circle(g, L.rCap - 0.25, 0.06, c.line);
    },
    extras(k) {
      if (part.ecc) k.hardware.push(slab(polarShape(toPolar([[k.L.rb + 0.5, -1.6], [k.L.rCap - 0.3, -2.2], [k.L.rCap - 0.3, 2.2], [k.L.rb + 0.5, 1.6]], 0)), k.L.capTop - 0.05, k.L.bezelTop, 0.1, 1));
      k.tabInlays(0.55, 0.4, 0.2);
    },
  };
}

// ------------------------------------------------------------ layout

// Vertical/radial layout from the physical envelope (all mm). The core base
// sits at 35% of the ring's height, so the ring top is at yT; below it the
// core must fit the ring hole, above it tabs may reach over the ring.
function layout(part, ctx, d) {
  const ring = ctx.parts?.ring || { rIn: 11, thickness: 6.5 };
  const R = part.radius || 9, H = part.height || 5;
  const yT = 0.65 * ring.thickness;
  const rHole = ring.rIn - 0.35, rOver = ring.rIn + 3.4;
  const lowR = Math.min(R, rHole);
  const yMax = H + 0.77;
  let ty0 = yT + 0.1, ty1 = Math.max(ty0 + 0.45, H - 0.1);
  const over = ty1 <= yMax - 0.45;
  if (!over) { ty1 = Math.min(H - 0.1, yMax - 0.5); ty0 = Math.max(0.5, ty1 - 0.9); }
  const capTop = Math.min(yMax - 0.33, Math.max(ty1 + 0.15, H + 0.12));
  const bezelTop = Math.min(yMax - 0.12, capTop + 0.28);
  const chipY = capTop - 0.22;
  const rCap = lowR - (d.capInset ?? 0.9);
  const rc = Math.min(R * (d.chip ?? 0.5), rCap - (d.bezel.w + 1.2));
  const rb = rc + d.bezel.w;
  const bevel = 0.12;
  const rCol = Math.min(lowR + (d.collar ?? 0.45), over ? rOver - 1.5 : rHole - 1.0);
  const reach = over ? Math.min(rOver - bevel, d.tabReach != null ? ring.rIn + d.tabReach : rOver - bevel) : rHole - bevel - 0.05;
  const dir = ctx.spin === 'L' ? -1 : 1;
  const n = d.tabCount || d.n; // main tabs (solar's outline has 4 extra short rays)
  const phase = 90 * DEG; // first tab toward +Z (front in the default views)
  return {
    R, H, yT, yMax, over, ty0, ty1, capTop, bezelTop, chipY, lensTop: yMax, rHole, rOver, lowR,
    rCap, rc, rb, rCol, rTab: reach, bevel, n, phase, dir, mirror: dir < 0,
    screwR: (rb + rCap) / 2, q: ctx.quality || 'high',
    arcSegs: segs(ctx.quality, 96, 64, 40),
    tabA: (i) => phase + ((i % n) / n) * TAU, // angle of main tab i
  };
}

// ------------------------------------------------------------ builder

export function buildCore(part, ctx) {
  const d = DESIGNS[part.id] || fallbackDesign(part);
  const L = layout(part, ctx, d);
  const mainN = L.n;
  const q = L.q, lowQ = q === 'low';
  const g = partGroup('core');
  const glows = [];
  const accent = ctx.accent || '#4fc3ff';
  const body = part.color || '#d0d8e4';
  const tabCol = typeof d.tab === 'function' ? d.tab(part, ctx) : d.tab;
  const inkW = { px: 2, maxMm: 0.4 };
  const fine = { px: 1, maxMm: 0.2 };
  const n = segs(q, 48, 36, 24);

  // ---- hub: lathed body, printed cap
  const colours = { accent, line: inkFor(body, 0.55), dark: tone(body, -0.42, 0.05) };
  const rar = ctx.rarity;
  // the part below the tab plate is a darker under-moulding (two-tone hub)
  const hsl = new THREE.Color(body).getHSL({});
  const lowerCol = tone(body, -Math.min(0.2, hsl.l * 0.3), 0.04);
  const canvas = hubCanvas(`${part.id}|${body}|${accent}|${rar ? rar.color : ''}|${L.rCap.toFixed(2)}|${L.rb.toFixed(2)}|${L.dir}|${q === 'low'}`, L, body, lowerCol, (g2, LL) => {
    d.paint(g2, LL, colours);
    if (rar && rar.rank >= 2) P.circle(g2, LL.rCap - 0.12, 0.14, rar.color);
  });
  const hubMap = canvasTexture(canvas);
  const hubMat = toonMaterial('#ffffff', { finish: 'gloss', map: hubMap, ink: inkFor(body), rimColor: tone(body, 0.3, -0.1), ...rarityGlow(rar) });
  if (rar && rar.rank >= 3) glows.push(hubMat);
  const c = 0.3;
  const gy = (1.25 + L.ty0) / 2;
  const hp = [[0, 0], [L.lowR - 1.3, 0], [L.lowR - 0.7, 0.6], [L.lowR - 0.7, 0.95], [L.lowR, 1.25]];
  if (L.ty0 - 1.25 > 1.0) hp.push([L.lowR, gy - 0.14], [L.lowR - 0.2, gy], [L.lowR, gy + 0.14]);
  hp.push([L.lowR, L.ty0 + 0.2], [L.rCap, L.ty0 + 0.2], [L.rCap, L.capTop - c], [L.rCap - c, L.capTop], [L.rc - 0.05, L.capTop], [L.rc - 0.05, L.chipY], [0, L.chipY]);
  // only the cap chamfer and cap top carry the print; the cap wall and chip
  // recess are plain body colour, everything under the cap the lower tone
  const capFrom = hp.length - 5;
  const plain = (k) => (k < capFrom - 1 ? UV_LOWER : k < capFrom || k >= hp.length - 3);
  g.add(inked(lathe(hp, n, { uvR: L.rCap, plain }), hubMat, inkW));

  // ---- tab ring
  const tabMat = toonMaterial(tabCol, { finish: d.tabFinish || 'gloss' });
  // plus keyed lugs at the foot of the hub (they ride in the ring's hole)
  const lugs = [];
  const lugR1 = Math.min(L.lowR + 0.4, L.rHole - 0.15);
  if (!lowQ) for (let i = 0; i < mainN; i++) {
    const a = L.tabA(i) + Math.PI / mainN;
    lugs.push(slab(polarShape(toPolar([[L.lowR - 0.9, -0.9], [lugR1, -0.75], [lugR1, 0.75], [L.lowR - 0.9, 0.9]], a)), 0.15, 0.95, 0.08, 1));
  }
  const tabGeo = merged([slab(tabRingShape(L, d.tabs, d.n), L.ty0, L.ty1, L.bevel, segs(q, 24, 18, 12)), ...lugs]);
  g.add(inked(tabGeo, tabMat, inkW));

  // ---- bezel
  const bz = d.bezel;
  const bezelMat = toonMaterial(bz.color, { finish: bz.finish || 'chrome', ...(bz.gem ? { flatShading: true, emissive: bz.color, emissiveIntensity: 0.22 } : {}) });
  if (bz.gem) glows.push(bezelMat);
  const by0 = L.capTop - 0.1, by1 = bz.low ? Math.min(L.bezelTop, L.capTop + 0.18) : L.bezelTop;
  let bezelGeo;
  if (bz.star) {
    const pts = [];
    const m = bz.star;
    for (let i = 0; i < m * 2; i++) pts.push([i % 2 ? L.rb - 0.25 : L.rb + 0.55, L.phase + (i / (m * 2)) * TAU]);
    const s = polarShape(pts);
    const hole = new THREE.Path();
    hole.absarc(0, 0, (L.rc - 0.15) * MM, 0, TAU, true);
    s.holes.push(hole);
    bezelGeo = slab(s, by0, by1, 0.1, segs(q, 40, 28, 18));
  } else if (bz.sides) {
    bezelGeo = bezelLathe(L.rc - 0.15, L.rb / Math.cos(Math.PI / bz.sides), by0, by1, bz.sides, { flat: true, phi0: L.phase + Math.PI / bz.sides, c: 0.22 });
  } else {
    bezelGeo = bezelLathe(L.rc - 0.15, L.rb, by0, by1, n, { c: bz.low ? 0.12 : 0.25 });
  }
  g.add(inked(bezelGeo, bezelMat, inkW));

  // ---- bit chip (emissive emblem), raised 0.06 mm off the recess floor
  const chipTex = canvasTexture(chipCanvas(ctx.beast, accent));
  // mostly self-lit (a backlit print) so the key light can't wash it out
  const chipMat = toonMaterial('#4a4a4a', { finish: 'matte', map: chipTex, emissive: '#ffffff', emissiveMap: chipTex, emissiveIntensity: 0.85, rim: 0 });
  const chipGeo = new THREE.CircleGeometry((L.rc - 0.1) * MM, n);
  chipGeo.rotateX(-Math.PI / 2);
  chipGeo.translate(0, (L.chipY + 0.06) * MM, 0);
  const chip = new THREE.Mesh(chipGeo, chipMat);
  chip.userData.noInk = true;
  g.add(chip);
  glows.push(chipMat);

  // ---- domed clear lens (open dome: its rim hides inside the bezel)
  const lensTex = canvasTexture(lensCanvas(d.lens || '#dff4ff', d.lensAlpha));
  const lensMat = toonMaterial('#ffffff', { finish: 'clear', map: lensTex, opacity: 0.999, rim: 0.5 });
  const rl = L.rc - 0.05, yb = L.chipY + 0.12, h = Math.min(d.lensH ?? 9, L.lensTop - yb);
  const lp = [];
  const lN = lowQ ? 4 : 7;
  const Rs = (rl * rl + h * h) / (2 * h);
  for (let i = 0; i <= lN; i++) { const r = rl * (1 - i / lN); lp.push([r, yb + Math.sqrt(Math.max(0, Rs * Rs - r * r)) - (Rs - h)]); }
  const lensGeo = lathe(lp, n, { smooth: true, uvR: rl });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.userData.noInk = true;
  lens.renderOrder = 1;
  g.add(lens);

  // ---- design extras: hardware, inlays, gems
  const k = {
    L, q, part, hardware: [], inlays: [], gems: [],
    screw(r, a, y = L.capTop - 0.05) { if (!lowQ) k.hardware.push(placed(hexBolt(0.5, 0.3), r, a, y)); },
    bolt(r, a, y, rad = 0.6, h2 = 0.4, washer = 0.12) { const w = lowQ ? 0 : washer; k.hardware.push(placed(hexBolt(rad, Math.min(h2, L.yMax - 0.03 - y - w), w), r, a, y)); },
    rivet(r, a, rad = 0.35, h2 = 0.2, y = L.capTop - 0.05) { if (!lowQ) k.hardware.push(placed(rivet(rad, h2), r, a, y)); },
    inlay(geo) { if (lowQ) geo.dispose(); else k.inlays.push(geo); },
    // accent inlay plate on every tab
    tabInlays(sx, sy, dx) {
      if (!lowQ) for (let i = 0; i < d.n; i++) k.inlays.push(slab(inlayShape(L, d.tabs, i, L.phase + (i / d.n) * TAU, sx, sy, dx), L.ty1 - 0.05, L.ty1 + 0.13, 0.04, 1));
    },
    // hexagonal crystal lying radially: base at r, length len, width w, height hgt
    crystal(r, a, y, w, len, hgt) {
      const p = [[0, 0], [w * 0.5, len * 0.18], [w * 0.5, len * 0.62], [0, len]];
      const geo = lathe(p, 6, { flat: true });
      geo.rotateZ(-Math.PI / 2); // axis along +X
      // flatten to the allowed height
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setY(i, pa.getY(i) * (hgt / w) * 0.95 + hgt * 0.5 * MM);
      geo.computeVertexNormals();
      k.gems.push(placed(geo, r, a, y));
    },
  };
  d.extras?.(k);
  if (k.hardware.length) {
    const hwMat = toonMaterial(d.hardwareColor || '#d9e1ec', { finish: 'chrome' });
    g.add(inked(merged(k.hardware), hwMat, fine));
  }
  if (k.inlays.length) {
    const inMat = toonMaterial(accent, { finish: 'gloss' });
    g.add(inked(merged(k.inlays), inMat, fine));
  }
  if (k.gems.length) {
    const cr = d.crystal || '#8ff5ff';
    const gemMat = toonMaterial(cr, { finish: 'gem', flatShading: true, emissive: cr, emissiveIntensity: 0.3 });
    g.add(inked(merged(k.gems), gemMat, fine));
    glows.push(gemMat);
  }

  const ring = ctx.parts?.ring;
  if (ring) clampEnvelope(g, L.yT, ring.rIn - 0.33, ring.rIn + 3.47, part.height + 0.78);
  return { group: g, height: L.yMax * MM, glows };
}
