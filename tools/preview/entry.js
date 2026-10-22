// Part/top preview page (bundled by tools/preview/shoot.js). Renders a grid of
// individually built part models or assembled tops with the game's lighting,
// toon materials and ink, for visual checks. Config comes from window.PREVIEW.

import * as THREE from 'three';
import { assembleTop } from '../../src/systems/assembly.js';
import { PART_INDEX, partsForSlot } from '../../src/data/parts.js';
import { PART_BUILDERS, partContext } from '../../src/render/parts/index.js';
import { TopVisual } from '../../src/render/topMesh.js';
import { INK_LAYER, setInkResolution, setRenderStyle, toonMaterial } from '../../src/render/toon.js';
import { createLights, TONE, TONE_REAL, styleLights } from '../../src/render/lighting.js';
import { arenaEnvironment } from '../../src/render/environment.js';
import { BEASTS } from '../../src/data/beasts.js';
import { resolveArena } from '../../src/data/arenas.js';
import { buildArena } from '../../src/render/arenaMesh.js';
import { Effects } from '../../src/render/effects.js';
import { sampleProfile } from '../../src/physics/profile.js';
import { SpiritSystem } from '../../src/render/spirits.js';
import { Arena } from '../../src/physics/arena.js';

// Envelope audit of a part model (mm, model space, ink hulls excluded): how
// far geometry strays outside the space the physics gives the part.
function audit(part, model, ctx) {
  const P = ctx.parts, v = new THREE.Vector3(), tmp = { radius: 0, face: 0 };
  const a = { id: part.id, yMin: Infinity, yMax: -Infinity, rMax: 0 };
  const T = P.ring.thickness, lockH = ctx.geo.lockH;
  const mm = (x) => Math.round(x * 1e4) / 10;
  let ringExcess = -Infinity, ringHoleMin = Infinity, coreLowR = 0, coreHighR = 0, bossR = 0, tipBottomR = 0, lockR = 0;
  model.group.updateMatrixWorld(true);
  model.group.traverse((o) => {
    if (!o.isMesh || o.userData.isInk) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const r = Math.hypot(v.x, v.z), y = v.y;
      a.yMin = Math.min(a.yMin, y); a.yMax = Math.max(a.yMax, y); a.rMax = Math.max(a.rMax, r);
      if (part.slot === 'ring') {
        // profile radius, max over ±0.5° (blade faces are near-vertical steps)
        const psi = Math.atan2(-v.z, v.x);
        let pr = 0;
        for (const d of [-0.0087, 0, 0.0087]) { sampleProfile(ctx.layer, psi + d, 1, tmp); pr = Math.max(pr, tmp.radius); }
        ringExcess = Math.max(ringExcess, r - pr);
        if (y > 0.0002 && y < T * 0.001 - 0.0002) ringHoleMin = Math.min(ringHoleMin, r);
      }
      if (part.slot === 'core') { if (y < T * 0.65 * 0.001) coreLowR = Math.max(coreLowR, r); else coreHighR = Math.max(coreHighR, r); }
      if (part.slot === 'lock') { if (y > lockH * 0.75 * 0.001 + 0.0001) bossR = Math.max(bossR, r); else lockR = Math.max(lockR, r); }
      if (part.slot === 'tip' && y < 0.00015) tipBottomR = Math.max(tipBottomR, r);
    }
  });
  const out = { id: part.id, yMinMm: mm(a.yMin), yMaxMm: mm(a.yMax), rMaxMm: mm(a.rMax) };
  if (part.slot === 'ring') Object.assign(out, { outsideProfileMm: mm(ringExcess), limit: '<= 0.3', holeMinMm: mm(ringHoleMin), holeLimit: `>= ${P.core.radius + 0.3} (core radius + 0.3)`, heightLimit: `y in [0, ${T + 1.5}]` });
  if (part.slot === 'core') Object.assign(out, { rBelowRingTopMm: mm(coreLowR), limit: `<= ${P.ring.rIn - 0.3}`, rAboveRingTopMm: mm(coreHighR), aboveLimit: `<= ${P.ring.rIn + 3.5}`, heightLimit: `y in [0, ${part.height + 0.8}]` });
  if (part.slot === 'lock') Object.assign(out, { bossRMm: mm(bossR), bossLimit: `<= ${P.disc.rIn - 0.3}`, bodyRMm: mm(lockR), bodyLimit: `<= ${part.radius + 1.2}`, heightLimit: `y in [0, ${Math.round(lockH * 100) / 100}]` });
  if (part.slot === 'tip') Object.assign(out, { contactRadiusAtFloorMm: mm(tipBottomR), contactNote: part.flatRadius > 0.2 ? `flat face radius ${part.flatRadius}` : `point/ball (r ${part.ballRadius})`, bodyLimit: `rMax <= ${part.bodyRadius + 0.3}`, heightLimit: `y in [0, ${ctx.geo.tipLen + 0.3}]` });
  if (part.slot === 'disc') Object.assign(out, { limit: `rMax <= ${part.rOut + 0.2}, y in [0, ${part.thickness}]` });
  if (part.slot === 'aux') Object.assign(out, { mount: ctx.mount?.kind });
  return out;
}
window.__audit = [];

// triangles / visible meshes (ink hulls excluded) of an object
function stats(obj) {
  let tris = 0, meshes = 0;
  obj.traverse((o) => {
    if (!o.isMesh || o.userData.isInk) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return `${Math.round(tris / 100) / 10}k tris · ${meshes} meshes`;
}

const C = window.PREVIEW || {};
// --style realistic: physically based materials and environment lighting
if (C.style === 'realistic') setRenderStyle('realistic');
const cell = C.size || 320;
const BASE = { ring: 'ring_galefang', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_flatstrike' };
const ARCH_BASE = {
  helix: { core: 'core_helix', lock: 'lock_click3' },
  quad: { core: 'core_quad', lock: 'lock_ironclasp' },
  apex: { core: 'core_apex', lock: 'lock_snap', disc: 'disc_compact' },
};
const REF = [
  { ring: 'ring_galefang', core: 'core_helix', disc: 'disc_ten', lock: 'lock_click3', tip: 'tip_flatstrike' },
  { ring: 'ring_bastion', core: 'core_quad', disc: 'disc_heavyring', lock: 'lock_ironclasp', tip: 'tip_pivotball' },
  { ring: 'ring_tidalhalo', core: 'core_helix', disc: 'disc_heavyring', lock: 'lock_click3', tip: 'tip_needle', aux: 'aux_freespin' },
  { ring: 'ring_cometarc', core: 'core_resonant', disc: 'disc_wide', lock: 'lock_stabilizer', tip: 'tip_semiflat', aux: 'aux_gyro' },
  { ring: 'ring_rifttalon', core: 'core_lunar', disc: 'disc_feather', lock: 'lock_spring', tip: 'tip_rubberflat' },
  { ring: 'ring_solarflare', core: 'core_solar', disc: 'disc_orbit', lock: 'lock_click3', tip: 'tip_hybrid', aux: 'aux_wedge' },
  { ring: 'ring_voidmaw', core: 'core_gravity', disc: 'disc_titan', lock: 'lock_ironclasp', tip: 'tip_wideball', aux: 'aux_ballast' },
  { ring: 'ring_starlance', core: 'core_storm', disc: 'disc_counter', lock: 'lock_widesocket', tip: 'tip_orbit', aux: 'aux_damper' },
];

// ids may carry `finish` and `tint` (an item's visual variant) for ring and disc
function resolve(ids) {
  const parts = Object.fromEntries(Object.entries(ids).filter(([s]) => PART_INDEX[ids[s]]).map(([s, id]) => [s, PART_INDEX[id]]));
  if (ids.finish || ids.tint) for (const s of ['ring', 'disc']) if (parts[s]) parts[s] = { ...parts[s], itemFinish: ids.finish, color: s === 'ring' && ids.tint ? ids.tint : parts[s].color };
  return parts;
}

// A build that hosts `part` in its slot (compatible architecture where possible).
function hostBuild(part) {
  const ids = { ...BASE };
  if (part.slot === 'core') Object.assign(ids, ARCH_BASE[part.arch] || {});
  if (part.slot === 'ring') { const a = part.arch[0]; Object.assign(ids, ARCH_BASE[a] || {}); }
  if (part.slot === 'lock' && !part.arch.includes('helix')) Object.assign(ids, ARCH_BASE[part.arch[0]]);
  if (part.slot === 'tip' && part.socket === 'wide') ids.lock = 'lock_widesocket';
  if (part.slot === 'aux') { if (part.mount === 'skirt') ids.disc = 'disc_orbit'; if (part.mount === 'band') ids.lock = 'lock_stabilizer'; }
  ids[part.slot] = part.id;
  return resolve(ids);
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const T = C.style === 'realistic' ? TONE_REAL : TONE;
renderer.toneMapping = T.mapping;
renderer.toneMappingExposure = T.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const lights = createLights(scene);
if (C.style === 'realistic') {
  styleLights(lights, 'realistic');
  scene.environment = arenaEnvironment(renderer, { sky: '#151a30', accent: '#4fc3ff', ring: '#b07cff' }).texture;
}
lights.key.castShadow = true;
lights.key.shadow.mapSize.set(1024, 1024);
const floorMat = C.style === 'realistic' ? toonMaterial(C.floor || '#2a3352', { finish: 'matte' }) : new THREE.MeshToonMaterial({ color: C.floor || '#2a3352' });
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.06, 48), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function frameCamera(view, radius, centerY) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.005, 5);
  const d = (radius * 2.4) / Math.tan((30 * Math.PI) / 360) / 2;
  const el = view === 'top' ? 89.5 : view === 'side' ? 4 : view === 'low' ? 14 : 32;
  const az = (C.yaw ?? 35) * Math.PI / 180, e = el * Math.PI / 180;
  cam.position.set(Math.cos(e) * Math.sin(az) * d, centerY + Math.sin(e) * d, Math.cos(e) * Math.cos(az) * d);
  cam.lookAt(0, centerY, 0);
  cam.layers.enable(INK_LAYER);
  if (C.ink === false) cam.layers.disable(INK_LAYER);
  return cam;
}

const items = [];
if (C.mode === 'slot') {
  const list = C.ids ? C.ids.map((id) => PART_INDEX[id]) : partsForSlot(C.slot);
  for (const part of list) {
    const asm = assembleTop(hostBuild(part), { force: true });
    const ctx = partContext(part.slot, asm, { color: C.color || part.color, beast: C.beast, quality: C.quality });
    const model = PART_BUILDERS[part.slot](part, ctx);
    const a = audit(part, model, ctx);
    a.draws = 0; // objects the renderer issues a draw call for (ink hulls and lines included)
    model.group.traverse((o) => { if (o.isMesh || o.isLine) a.draws++; });
    window.__audit.push(a);
    const obj = new THREE.Group();
    obj.add(model.group);
    const box = new THREE.Box3().setFromObject(model.group);
    model.group.position.y = -box.min.y + 0.0005;
    items.push({ obj, label: `${part.name} (${part.id}) · ${stats(model.group)}`, radius: Math.max(0.012, box.max.x, -box.min.x, box.max.z, -box.min.z, (box.max.y - box.min.y) * 0.6), cy: (box.max.y - box.min.y) * 0.5 });
  }
} else if (C.mode === 'arena') {
  renderArenaScene();
} else if (C.mode === 'spirits') {
  // every Spirit Chip spirit mid-manifestation, standing on a small top-sized disc
  const sys = new SpiritSystem(scene, C.quality || 'high');
  for (const beast of BEASTS) {
    const obj = new THREE.Group();
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.018, 0);
    obj.add(anchor);
    const inst = sys.spawn(beast, anchor, { duration: 1.4, height: 0.13 });
    sys.active.length = 0; // driven manually below
    inst.t = (C.fxTime ?? 0.5) * inst.dur;
    sys.scene = obj; obj.add(inst.root, inst.pillar, inst.sigil);
    inst.root.parent && sys.place(inst, 0.016);
    obj.updateMatrixWorld(true);
    items.push({ obj, label: `${beast.name} (${beast.emblem})`, radius: 0.085, cy: 0.085 });
  }
  scene.background = new THREE.Color(C.bg || '#101830');
} else {
  const builds = C.builds || REF;
  builds.forEach((ids, i) => {
    const asm = assembleTop(resolve(ids), { force: true });
    const beast = C.beasts !== false ? BEASTS[i % BEASTS.length] : null;
    const v = new TopVisual(asm, { color: ids.color || PART_INDEX[ids.ring].color, beast: beast?.id, quality: C.quality });
    if (C.explode) v.setExplode(C.explode);
    const obj = new THREE.Group();
    obj.add(v.root);
    const box = new THREE.Box3().setFromObject(v.root);
    v.root.position.y = -box.min.y + 0.0005;
    items.push({ obj, label: Object.values(ids).filter((x) => x.startsWith?.('ring_') || x.startsWith?.('tip_')).join(' + '), radius: Math.max(0.028, (box.max.y - box.min.y) * 0.6), cy: (box.max.y - box.min.y) * 0.45 });
  });
}

function renderArenaScene() {
  const def = resolveArena(C.arena || 'standard');
  const W = C.width || 1280, H = C.height || 720;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  setInkResolution(W, H, 1);
  document.body.appendChild(renderer.domElement);
  scene.remove(floor);
  const arena = buildArena(def, C.quality || 'high');
  scene.add(arena.group);
  scene.background = new THREE.Color(def.theme.sky);
  scene.fog = new THREE.Fog(def.theme.fog, 1.4, 4.5);
  lights.rimA.color.set(def.theme.accent);
  lights.rimB.color.set(def.theme.ring);
  // two tops on the floor
  const tops = [];
  const builds = (C.builds || REF).slice(0, 2);
  const spots = [[-0.05, 0.02], [0.06, -0.03]];
  builds.forEach((ids, i) => {
    const asm = assembleTop(resolve(ids), { force: true });
    const v = new TopVisual(asm, { color: PART_INDEX[ids.ring].color, beast: BEASTS[i].id, quality: C.quality });
    const box = new THREE.Box3().setFromObject(v.root);
    const [x, z] = spots[i];
    v.root.position.set(x, -box.min.y + 0.0004, z);
    v.root.rotation.z = i ? 0.12 : -0.08;
    scene.add(v.root);
    tops.push(v);
  });
  // effects
  if (C.fx) {
    const fx = new Effects(scene, C.quality || 'high');
    const floor = new Arena(def);
    fx.spirits.floorAt = (x, z) => floor.heightAtR(Math.hypot(x, z));
    window.__fx = fx;
    const p = (x, z) => [x, 0.012, z];
    for (const name of C.fx) {
      if (name === 'impact') fx.impact(p(0.005, -0.005), [1, 0, 0], 0.08, '#3fa9ff', '#9aa4b5');
      if (name === 'grind') for (let i = 0; i < 20; i++) fx.grind(p(0.0, 0.0), 1);
      if (name === 'wall') fx.wall([0.0, 0.03, -0.2], 0.05);
      if (name === 'shockwave') fx.shockwave({ x: 0.06, y: 0.01, z: -0.03 }, 0.12, '#ffb33c');
      if (name === 'launch') fx.launchFlash({ x: -0.05, y: 0.01, z: 0.02 }, '#3fa9ff');
      if (name === 'dust') fx.dustPuff({ x: 0.08, y: 0.002, z: 0.06 }, 20);
      if (name === 'counter') fx.ring([0.06, 0.01, -0.03], 0.02, 0.06, 0.3, '#7fffd4');
      if (name === 'aura') for (let i = 0; i < 12; i++) fx.aura({ x: -0.05, y: 0.01, z: 0.02 }, '#ff5a5a', 3);
      if (name === 'manifest') fx.manifestation(tops[0].root, BEASTS.find((b) => b.id === C.beast) || BEASTS[0], 1.4, 0.13, tops[1].root);
      if (name === 'burst') fx.burst(tops[1], { x: 0.2, y: 0, z: 0 });
      if (name === 'victory') fx.victory({ x: -0.05, y: 0.01, z: 0.02 }, '#ffd84d');
      if (name === 'graze') fx.impact([0.07, 0.012, -0.04], [1, 0, 0], 0.05, '#3fa9ff', '#9aa4b5', 0.8, [0, 0, 1]);
      if (name === 'knockout') fx.knockout({ x: 0.12, y: 0.03, z: -0.16 }, '#3fa9ff');
      if (name === 'wobble') fx.wobble({ x: 0.06, y: 0.012, z: -0.03 });
      if (name === 'trail') { const tr = fx.trail('a', '#3fa9ff'); if (tr) for (let i = 0; i < 40; i++) tr.push(new THREE.Vector3(-0.05 + Math.cos(i * 0.15) * 0.08, 0.01, 0.02 + Math.sin(i * 0.15) * 0.08), 1); }
    }
    const steps = Math.round((C.fxTime ?? 0.06) / (1 / 120));
    for (let i = 0; i < steps; i++) fx.update(1 / 120);
  }
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.005, 30);
  const R = def.radius;
  const view = (C.views || ['broadcast'])[0];
  if (view === 'close') { cam.position.set(0.02, 0.09, 0.2); cam.lookAt(0, 0.01, 0); }
  else if (view === 'overhead') { cam.position.set(0, R * 3.2, 0.001); cam.lookAt(0, 0, 0); }
  else { const d = R * 2.15, pitch = 0.95; cam.position.set(0, Math.sin(pitch) * d, Math.cos(pitch) * d); cam.lookAt(0, 0, 0); }
  cam.layers.enable(INK_LAYER);
  if (C.ink === false) cam.layers.disable(INK_LAYER);
  renderer.render(scene, cam);
  const lab = document.createElement('div');
  lab.textContent = `${def.name} · ${stats(arena.group)} · ${renderer.info.render.calls} draw calls`;
  Object.assign(lab.style, { position: 'absolute', left: '6px', top: '4px', font: '12px sans-serif', color: '#fff', textShadow: '0 1px 2px #000' });
  document.body.appendChild(lab);
  window.__done = { W, H, count: 1 };
}

const views = C.views || ['34'];
const cols = Math.min(C.cols || 4, items.length * views.length);
const rows = Math.ceil((items.length * views.length) / cols);
const W = Math.max(1, cols) * cell, H = Math.max(1, rows) * cell;
if (C.mode !== 'arena') {
renderer.setPixelRatio(1);
renderer.setSize(W, H);
setInkResolution(cell, cell, 1);
document.body.appendChild(renderer.domElement);
renderer.setScissorTest(true);
renderer.setClearColor(C.bg || '#1b2238');
let k = 0;
for (const it of items) {
  for (const view of views) {
    const cx = k % cols, cy = Math.floor(k / cols);
    scene.add(it.obj);
    const cam = frameCamera(view, it.radius, it.cy);
    const vy = H - (cy + 1) * cell;
    renderer.setViewport(cx * cell, vy, cell, cell);
    renderer.setScissor(cx * cell, vy, cell, cell);
    renderer.render(scene, cam);
    scene.remove(it.obj);
    const lab = document.createElement('div');
    lab.textContent = `${it.label}${views.length > 1 ? ' · ' + view : ''}`;
    Object.assign(lab.style, { position: 'absolute', left: cx * cell + 6 + 'px', top: cy * cell + 4 + 'px', width: cell - 12 + 'px', font: '11px sans-serif', color: '#fff', textShadow: '0 1px 2px #000' });
    document.body.appendChild(lab);
    k++;
  }
}
window.__done = { W, H, count: items.length };
}
