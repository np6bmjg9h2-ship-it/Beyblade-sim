// Classic-series attack ring models: thin moulded plastic rings in the style
// of the first generation of tops. Each is built from its physics outline
// (physics/profile.js), so what you see is what collides, plus the parts
// that make it what it is: a hoop on spokes, free-spinning rollers, diamond
// spikes, swept wings. Printed stickers (canvas decals mapped top-down) give
// them the bright sticker-sheet look.
//
// Envelope (checked by tools/preview --audit): every point within the
// profile radius (+0.3 mm) at its azimuth, y in [0, thickness + 1.5], the
// hole at least the core radius + 0.3. Azimuth convention as profile.js:
// x = r cos(psi), z = -r sin(psi).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MM, TAU, partGroup, toonMaterial, inked, tone, segs, canvasTexture, rarityGlow, extrudeShape, makeCanvas, planarUV } from './common.js';
import { sampleProfile } from '../../physics/profile.js';

const UV_R = 28; // mm: decal sheets span [-UV_R, UV_R] top-down
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function layerOf(part, ctx) {
  return ctx.layer || { radius: part.rOut * MM, baseRadius: (part.blades > 0 ? part.rBase : part.rOut) * MM, blades: part.blades || 0, bladeWidth: part.bladeWidth ?? 0.55, hand: part.spin === 'R' ? -1 : part.spin === 'L' ? 1 : 0, slope: ((part.slope || 0) * Math.PI) / 180, thickness: part.thickness * MM };
}

// ------------------------------------------------------------ shapes (mm, shape space x = r cos psi, y = r sin psi)

const P2 = (r, psi) => new THREE.Vector2(r * Math.cos(psi), r * Math.sin(psi));
function outline(rf, n) { return Array.from({ length: n }, (_, i) => { const psi = (i / n) * TAU; return P2(rf(psi), psi); }); }
// round hole with `keys` small notches for the core's tabs
function keyedHole(r, keys, n) {
  const kw = 1.7 / r;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const psi = -(i / n) * TAU;
    const near = Math.abs(((psi * keys) % TAU + TAU + Math.PI) % TAU - Math.PI) / keys < kw;
    pts.push(P2(r + (near ? 0.9 : 0), psi));
  }
  return new THREE.Path(pts);
}
function shapeOf(pts, holes = []) { const s = new THREE.Shape(pts); for (const h of holes) s.holes.push(h); return s; }
function scaled(shape, curve = 10) {
  const s = new THREE.Shape(shape.getPoints(curve).map((p) => p.clone().multiplyScalar(MM)));
  for (const h of shape.holes) s.holes.push(new THREE.Path(h.getPoints(curve).map((p) => p.clone().multiplyScalar(MM))));
  return s;
}
// extruded solid between y0 and y1 mm (bevel inside the outline)
function solid(shape, y0, y1, bevel = 0.3) {
  const b = Math.min(bevel, (y1 - y0) * 0.3);
  const g = extrudeShape(scaled(shape), (y1 - y0) * MM, { bevel: b * MM, curveSegments: 10 });
  g.translate(0, y0 * MM, 0);
  return g;
}
// flat decal plate (mm shape) at height y mm, mapped top-down onto the sheet
function decalPlate(shape, y) {
  const g = new THREE.ShapeGeometry(scaled(shape), 10);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y * MM, 0);
  return planarUV(g, UV_R * MM);
}
// Faceted spike (mm): base diamond from r0 to r1 at psi (half-angle hw)
// rising to a ridge along its centre line at height yTop.
function gemSpike(r0, r1, psi, hw, y0, yTop) {
  const rm = r0 + (r1 - r0) * 0.45;
  const v = (r, p, y) => [r * Math.cos(p) * MM, y * MM, -r * Math.sin(p) * MM];
  const A = v(r0, psi, y0), B = v(rm, psi - hw, y0), C = v(r1, psi, y0), D = v(rm, psi + hw, y0);
  const Ra = v(r0 + (r1 - r0) * 0.2, psi, yTop), Rc = v(r1 - (r1 - r0) * 0.12, psi, yTop);
  const tris = [[A, Ra, B], [B, Ra, Rc], [B, Rc, C], [C, Rc, D], [D, Rc, Ra], [D, Ra, A], [A, B, C], [A, C, D]];
  const pos = new Float32Array(tris.flat(2));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // faces must point outward: flip any whose normal points at the spike's centre
  const cx = (rm) * Math.cos(psi) * MM, cz = -(rm) * Math.sin(psi) * MM, cy = ((y0 + yTop) / 2) * MM;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const m = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3).sub(new THREE.Vector3(cx, cy, cz));
    if (n.dot(m) < 0) { p.setXYZ(i + 1, c.x, c.y, c.z); p.setXYZ(i + 2, b.x, b.y, b.z); }
  }
  const flat = g.toNonIndexed ? g : g;
  flat.computeVertexNormals();
  flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return flat;
}

// a radial bar (spoke) from r0 to r1 at psi, half-width w mm
function bar(r0, r1, psi, w) {
  const c = Math.cos(psi), s = Math.sin(psi), nx = -s, ny = c;
  return shapeOf([new THREE.Vector2(r0 * c + nx * w, r0 * s + ny * w), new THREE.Vector2(r1 * c + nx * w, r1 * s + ny * w), new THREE.Vector2(r1 * c - nx * w, r1 * s - ny * w), new THREE.Vector2(r0 * c - nx * w, r0 * s - ny * w)]);
}

// ------------------------------------------------------------ sticker sheet

function sheet(size, draw) {
  return canvasTexture(makeCanvas(size, (g, s) => {
    const k = s / (2 * UV_R), c = s / 2;
    const xy = (r, psi) => [c + r * k * Math.cos(psi), c - r * k * Math.sin(psi)];
    const H = {
      g, k,
      poly(pts, col) { g.beginPath(); pts.forEach(([r, p], i) => { const [x, y] = xy(r, p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.fillStyle = col; g.fill(); },
      band(r0, r1, a, b, col) { const n = Math.max(8, Math.ceil(Math.abs(b - a) * 40)); const pts = []; for (let i = 0; i <= n; i++) pts.push([r1, a + ((b - a) * i) / n]); for (let i = n; i >= 0; i--) pts.push([r0, a + ((b - a) * i) / n]); H.poly(pts, col); },
      dot(r, psi, rad, col) { const [x, y] = xy(r, psi); g.beginPath(); g.arc(x, y, rad * k, 0, TAU); g.fillStyle = col; g.fill(); },
      star(r, psi, rad, col) { const pts = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? rad * 0.45 : rad; const [x, y] = xy(r, psi); pts.push([x + rr * k * Math.cos(a), y + rr * k * Math.sin(a)]); } g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = col; g.fill(); },
      text(str, r, psi, size, col, rot = 0) { const [x, y] = xy(r, psi); g.save(); g.translate(x, y); g.rotate(-psi + Math.PI / 2 + rot); g.font = `900 ${Math.round(size * k)}px "Chakra Petch", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(str, 0, 0); g.restore(); },
      grad(stops, x0, y0, x1, y1) { const gr = g.createLinearGradient(...xy(x0, y0), ...xy(x1, y1)); stops.forEach(([t, col]) => gr.addColorStop(t, col)); return gr; },
    };
    g.clearRect(0, 0, s, s);
    draw(H);
  }));
}

// ------------------------------------------------------------ build kit

function kit(part, ctx) {
  const q = ctx.quality || 'high';
  const L = layerOf(part, ctx);
  const tmp = { radius: 0, face: 0 };
  const Rp = (psi) => { sampleProfile(L, psi, 1, tmp); return tmp.radius / MM; };
  const coreR = ctx.parts?.core?.radius ?? 0;
  const hole = Math.max(part.rIn, coreR + 0.35);
  const keys = ctx.parts?.core?.arch === 'quad' ? 4 : 3;
  const main = ctx.accent || part.color || '#4fc3ff';
  return {
    part, ctx, q, L, Rp, hole, keys, T: part.thickness, main, low: q === 'low',
    n: segs(q, 180, 120, 72), nh: segs(q, 72, 48, 32),
    bins: { body: [], dark: [], sec: [], metal: [], decal: [] }, spinners: [],
  };
}
function finishKit(K, opts = {}) {
  const g = partGroup('ring');
  const glows = [];
  const fill = tone(K.main, 0, 0.04);
  const mats = {
    body: () => toonMaterial(fill, { finish: 'plastic', specEdge: 0.985, rimColor: tone(fill, 0.3), ...rarityGlow(K.ctx.rarity) }),
    dark: () => toonMaterial(opts.dark || tone(K.main, -0.32, -0.1), { finish: 'plastic', specEdge: 0.985 }),
    sec: () => toonMaterial(opts.sec || '#f2f5fb', { finish: 'gloss', specEdge: 0.975 }),
    metal: () => toonMaterial('#c9d2de', { finish: 'chrome' }),
  };
  for (const [k, list] of Object.entries(K.bins)) {
    if (!list.length || k === 'decal') continue;
    const mat = mats[k]();
    if (k === 'body' && K.ctx.rarity?.rank >= 3) glows.push(mat);
    const m = inked(mergeGeometries(list, false), mat, { px: 2, maxMm: 0.6 });
    m.name = 'ring-' + k;
    g.add(m);
  }
  if (K.bins.decal.length && opts.sheet && !K.low) {
    const mat = toonMaterial('#ffffff', { finish: 'gloss', specEdge: 0.985, map: opts.sheet });
    mat.transparent = true; mat.alphaTest = 0.45;
    const m = new THREE.Mesh(mergeGeometries(K.bins.decal, false), mat);
    m.userData.noInk = true; m.name = 'ring-stickers';
    g.add(m);
  }
  for (const s of K.spinners) g.add(s);
  return { group: g, height: K.T * MM, glows, spinners: K.spinners.length ? K.spinners.map((s) => s.userData.spin) : undefined };
}
// rarity trim: a thin printed line round the hub
const rarityLine = (K, H, r) => { if (K.ctx.rarity?.rank >= 1) H.band(r - 0.25, r + 0.25, 0, TAU, K.ctx.rarity.color); };

// ------------------------------------------------------------ designs

// Hoop Halo: hub ring, three spokes and a thin outer hoop at the full reach.
function hoop(part, ctx) {
  const K = kit(part, ctx), T = K.T, R = K.Rp(0);
  const hubR = K.hole + 4.2, hoopIn = R - 2.1;
  K.bins.body.push(solid(shapeOf(outline(() => hubR, K.nh), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35));
  K.bins.body.push(solid(shapeOf(outline(() => R - 0.35, K.n), [new THREE.Path(outline(() => hoopIn, K.n).reverse())]), 0.6, T - 0.6, 0.3));
  const spokes = [0, 1, 2].map((i) => (i * TAU) / 3 + Math.PI / 2);
  for (const a of spokes) K.bins.body.push(solid(bar(hubR - 0.8, hoopIn + 0.6, a, 2.1), 1.1, T - 1.3, 0.25));
  // studs where the spokes meet the hoop
  for (const a of spokes) K.bins.sec.push(solid(shapeOf(outline(() => 1.4, 16).map((p) => p.add(P2(hoopIn - 1.1, a)))), T - 1.3, T - 0.8, 0.15));
  for (const a of spokes) K.bins.decal.push(decalPlate(bar(hubR + 0.4, hoopIn - 2.8, a, 1.75), T - 1.28));
  K.bins.decal.push(decalPlate(shapeOf(outline(() => hubR - 0.4, K.nh), [new THREE.Path(outline(() => K.hole + 1.2, K.nh).reverse())]), T + 0.02));
  const st = sheet(K.low ? 256 : 512, (H) => {
    for (const a of spokes) {
      H.poly([[hubR + 0.4, a - 0.12], [hoopIn - 2.8, a - 0.075], [hoopIn - 2.8, a + 0.075], [hubR + 0.4, a + 0.12]], '#e23b3b');
      for (const o of [-0.04, 0.04]) H.poly([[hubR + 1.2, a + o * 1.3 - 0.012], [hoopIn - 3.4, a + o - 0.008], [hoopIn - 3.4, a + o + 0.008], [hubR + 1.2, a + o * 1.3 + 0.012]], '#2b4dd6');
      H.star(hubR + 2.6, a, 1.2, '#ffffff');
      H.star(hoopIn - 4.4, a, 0.9, '#ffffff');
    }
    H.band(K.hole + 1.2, hubR - 0.4, 0, TAU, '#2b4dd6');
    for (let i = 0; i < 6; i++) H.star((K.hole + hubR) / 2 + 0.4, (i * TAU) / 6 + Math.PI / 6, 0.85, '#ffe14d');
    rarityLine(K, H, hubR - 0.9);
  });
  return finishKit(K, { sheet: st, sec: '#2fbf4f' });
}

// Roller Guard: a round black guard with two free-spinning rollers at the lobes.
function roller(part, ctx) {
  const K = kit(part, ctx), T = K.T, L = K.L;
  const base = L.baseRadius / MM;
  const N = L.blades | 0, P = TAU / Math.max(1, N), w = L.bladeWidth ?? 0.24;
  const centres = Array.from({ length: N }, (_, k) => (k + w / 2) * P);
  const rr = 2.7; // roller radius
  const rcOf = (c) => K.Rp(c) - rr - 0.12;
  // the guard, with a round pocket cut for each roller
  const guard = (psi) => {
    let r = Math.min(K.Rp(psi), base) - 0.4;
    for (const c of centres) {
      const rc = rcOf(c), dx = Math.atan2(Math.sin(psi - c), Math.cos(psi - c)) * rc;
      if (Math.abs(dx) < rr + 0.5) r = Math.min(r, rc - Math.sqrt(Math.max(0, (rr + 0.5) ** 2 - dx * dx)));
    }
    return r;
  };
  K.bins.body.push(solid(shapeOf(outline(guard, K.n * 2), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35));
  // raised wing panels between the rollers
  for (let k = 0; k < N; k++) {
    const a0 = centres[k] + 0.55, a1 = centres[(k + 1) % N] + (k + 1 >= N ? TAU : 0) - 0.55;
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push(P2(base - 1.4, a0 + ((a1 - a0) * i) / 16));
    for (let i = 16; i >= 0; i--) pts.push(P2(K.hole + 3.2, a0 + ((a1 - a0) * i) / 16));
    K.bins.dark.push(solid(shapeOf(pts), T - 0.2, T + 0.7, 0.2));
    K.bins.decal.push(decalPlate(shapeOf(pts), T + 0.72));
  }
  for (const c of centres) {
    const rc = rcOf(c);
    // yoke arm from the guard over the roller, with a chrome axle cap
    K.bins.body.push(solid(bar(rc - rr - 1.6, rc, c, 1.3), T - 0.2, T + 0.5, 0.15));
    K.bins.body.push(solid(shapeOf(outline(() => 1.5, 20).map((p) => p.add(P2(rc, c)))), T - 0.2, T + 0.5, 0.15));
    K.bins.metal.push(solid(shapeOf(outline(() => 0.9, 14).map((p) => p.add(P2(rc, c)))), T + 0.5, T + 0.9, 0.1));
    const g = new THREE.CylinderGeometry(rr * MM, rr * MM, (T - 1.4) * MM, K.low ? 12 : 24);
    const rim = new THREE.CylinderGeometry((rr - 0.6) * MM, (rr - 0.6) * MM, (T - 0.9) * MM, K.low ? 10 : 20);
    const mesh = inked(mergeGeometries([g, rim], false), toonMaterial('#ff7a1f', { finish: 'gloss' }), { px: 1.5, maxMm: 0.4 });
    const spin = new THREE.Group();
    spin.add(mesh);
    const holder = new THREE.Group();
    holder.position.set(rc * Math.cos(c) * MM, (T / 2) * MM, -rc * Math.sin(c) * MM);
    holder.add(spin);
    holder.userData.spin = spin;
    K.spinners.push(holder);
  }
  const st = sheet(K.low ? 256 : 512, (H) => {
    for (let k = 0; k < N; k++) {
      const a0 = centres[k] + 0.55, a1 = centres[(k + 1) % N] + (k + 1 >= N ? TAU : 0) - 0.55, m = (a0 + a1) / 2;
      H.band(K.hole + 3.2, base - 1.4, a0, a1, '#1d2230');
      H.poly([[K.hole + 3.8, a0 + 0.1], [base - 2.0, m - 0.15], [base - 2.0, a1 - 0.1], [K.hole + 3.8, m + 0.25]], '#36d66a');
      H.poly([[K.hole + 4.6, a0 + 0.25], [base - 2.6, m - 0.05], [K.hole + 4.6, m + 0.1]], '#ffe14d');
      H.text('ROLLER', (K.hole + base) / 2 - 0.4, m + 0.55, 1.6, '#ffffff');
    }
    rarityLine(K, H, K.hole + 2.4);
  });
  return finishKit(K, { sheet: st, dark: '#14171e' });
}

// Quad Spike: four diamond spikes with printed arrow stickers.
function spike(part, ctx) {
  const K = kit(part, ctx), T = K.T, L = K.L;
  const N = L.blades | 0, P = TAU / N, w = L.bladeWidth ?? 0.28;
  const centres = Array.from({ length: N }, (_, k) => (k + w / 2) * P);
  K.bins.body.push(solid(shapeOf(outline((psi) => K.Rp(psi) - 0.4, K.n), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35));
  const base = L.baseRadius / MM;
  for (const c of centres) {
    // a big diamond spike riding each lobe, pointing outward
    const R = K.Rp(c) - 0.9, r0 = K.hole + 3.2, hw = 0.3;
    K.bins.sec.push(gemSpike(r0, R, c, hw, T - 0.25, T + 1.45));
  }
  // raised hub ring under the spikes
  K.bins.dark.push(solid(shapeOf(outline(() => K.hole + 3.4, K.nh), [new THREE.Path(outline(() => K.hole + 1.6, K.nh).reverse())]), T - 0.2, T + 0.6, 0.2));
  K.bins.decal.push(decalPlate(shapeOf(outline((psi) => K.Rp(psi) - 1.2, K.n), [new THREE.Path(outline(() => K.hole + 3.6, K.nh).reverse())]), T + 0.02));
  const st = sheet(K.low ? 256 : 512, (H) => {
    for (const c of centres) {
      // purple arrows printed between the spikes
      const m = c + Math.PI / 4, r = K.hole + 6.2;
      H.poly([[r - 2.2, m - 0.16], [r + 2.4, m], [r - 2.2, m + 0.16], [r - 0.8, m]], '#7b3cff');
    }
    rarityLine(K, H, K.hole + 4.0);
  });
  return finishKit(K, { sheet: st });
}

// Twin Wing: two broad swept wings raked upward, flame stickers on each.
function wing(part, ctx) {
  const K = kit(part, ctx), T = K.T, L = K.L;
  const N = L.blades | 0, P = TAU / N, w = L.bladeWidth ?? 0.5, hand = L.hand || 0;
  const tk = Math.tan(Math.abs(L.slope || 0));
  const body = solid(shapeOf(outline((psi) => K.Rp(psi) - 0.4, K.n), [keyedHole(K.hole, K.keys, K.nh)]), 0, T, 0.35);
  // upper slope: the outer wall leans inward above mid-height
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) / MM, z = p.getZ(i), r = Math.hypot(x, z) / MM;
    if (r < K.hole + 4) continue;
    const d = Math.max(0, y - T / 2) * tk * clamp((r - K.hole - 4) / 3, 0, 1);
    p.setXYZ(i, x * (r - d) / r, p.getY(i), z * (r - d) / r);
  }
  body.computeVertexNormals();
  K.bins.body.push(body);
  const base = L.baseRadius / MM;
  const sw = (k, t) => (hand < 0 ? (k + 1 - t * w) * P : (k + t * w) * P); // t: 0 = wing root (ramp) .. 1 = leading face
  // the wing: sticker over its whole top, a raised ridge along its outer edge
  const edge = (k, t) => K.Rp(sw(k, t)) - tk * (T / 2) - 1.0; // inside the raked top edge
  const wingPts = (k, rIn, inset, t0 = 0.04, t1 = 0.97) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const t = t0 + ((t1 - t0) * i) / 20; pts.push(P2(edge(k, t) - inset, sw(k, t))); }
    for (let i = 20; i >= 0; i--) { const t = t0 + ((t1 - t0) * i) / 20; pts.push(P2(rIn, sw(k, t))); }
    return pts;
  };
  for (let k = 0; k < N; k++) {
    K.bins.dark.push(solid(shapeOf(wingPts(k, base - 4.2, 0, 0.2, 0.96)), T - 0.2, T + 0.7, 0.2));
    K.bins.decal.push(decalPlate(shapeOf(wingPts(k, K.hole + 2.6, 0.4)), T + 0.02));
  }
  const st = sheet(K.low ? 256 : 512, (H) => {
    for (let k = 0; k < N; k++) {
      const gr = H.grad([[0, '#fff06a'], [0.45, '#ffb21e'], [1, '#ff5a1f']], K.hole + 3, sw(k, 0.5), edge(k, 0.5), sw(k, 0.5));
      H.poly(wingPts(k, K.hole + 2.6, 0.4).map((v) => [Math.hypot(v.x, v.y), Math.atan2(v.y, v.x)]), gr);
      for (let j = 0; j < 3; j++) {
        const t = 0.2 + j * 0.24;
        H.poly([[K.hole + 4.0, sw(k, t)], [edge(k, t + 0.12) - 1.8, sw(k, t + 0.12)], [edge(k, t + 0.16) - 1.8, sw(k, t + 0.16)], [K.hole + 4.0, sw(k, t + 0.05)]], '#fff6c8');
      }
      H.text('TWIN WING', K.hole + 4.6, sw(k, 0.5), 1.5, '#5a0d0d');
    }
    rarityLine(K, H, K.hole + 2.2);
  });
  return finishKit(K, { sheet: st });
}

export const CLASSIC_RINGS = { ring_hoophalo: hoop, ring_rollerguard: roller, ring_quadspike: spike, ring_twinwing: wing };
export function buildClassicRing(part, ctx) { return CLASSIC_RINGS[part.id](part, ctx); }
