// Builds a top's 3D model from its assembled parts. The attack ring outline
// is extruded from the same radial profile the collision code samples, so
// blades you see are the blades that strike. Display spin is decoupled from
// the physical spin rate (which is far above the frame rate) to avoid
// strobing; a motion-blur disc conveys the true speed.

import * as THREE from 'three';
import { profileOutline } from '../physics/profile.js';
import { emblemCanvas } from './emblems.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { RARITY_INDEX } from '../data/rarity.js';

const MM = 0.001;
const UP = new THREE.Vector3(0, 1, 0);

function metal(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: opts.metalness ?? 0.65, roughness: opts.roughness ?? 0.32, emissive: opts.emissive || '#000000', emissiveIntensity: opts.emissiveIntensity ?? 0 });
}
function plastic(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: opts.roughness ?? 0.45, emissive: opts.emissive || '#000000', emissiveIntensity: opts.emissiveIntensity ?? 0, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
}

function rarityGlow(part) {
  const r = part?._item?.rarity;
  if (!r) return {};
  const R = RARITY_INDEX[r];
  if (!R || R.rank < 3) return {};
  return { emissive: R.color, emissiveIntensity: 0.08 + 0.05 * (R.rank - 3) };
}

function extrudeRing(outline, rIn, thickness, bevel = 0.0004) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0005, thickness - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

function discShape(rIn, rOut, holes, holeR, holeAt) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); shape.holes.push(h);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2;
    const p = new THREE.Path();
    p.absarc(Math.cos(a) * holeAt, Math.sin(a) * holeAt, holeR, 0, Math.PI * 2, true);
    shape.holes.push(p);
  }
  return shape;
}

function tipGeometry(tip, len) {
  const pts = [];
  const L = len * MM, br = tip.bodyRadius * MM, ball = tip.ballRadius * MM, fr = tip.flatRadius * MM;
  if (fr > 0.0002) {
    pts.push(new THREE.Vector2(0.00001, 0));
    pts.push(new THREE.Vector2(fr, 0));
    for (let i = 1; i <= 5; i++) {
      const a = (i / 5) * (Math.PI / 2);
      pts.push(new THREE.Vector2(fr + Math.sin(a) * ball, ball - Math.cos(a) * ball));
    }
  } else {
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.00001, Math.sin(a) * ball), ball - Math.cos(a) * ball));
    }
  }
  const last = pts[pts.length - 1];
  pts.push(new THREE.Vector2(Math.max(last.x, br * 0.55), Math.max(last.y, L * 0.4)));
  pts.push(new THREE.Vector2(br, L * 0.72));
  pts.push(new THREE.Vector2(br, L));
  pts.push(new THREE.Vector2(0.00001, L));
  return new THREE.LatheGeometry(pts, 24);
}

export class TopVisual {
  constructor(assembly, opts = {}) {
    this.assembly = assembly;
    const { parts: P, spec } = assembly;
    const g = spec.geometry;
    const zCom = -spec.tip.endZ;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // spins (display phase)
    this.root.add(this.body);
    const inner = new THREE.Group();
    inner.position.set(spec.axisOffset[0], 0, spec.axisOffset[2]);
    this.body.add(inner);
    const y = (mm) => mm * MM - zCom;
    const accent = opts.color || P.ring.color || '#4fc3ff';
    this.meshes = {};

    // tip
    const tip = new THREE.Mesh(tipGeometry(P.tip, g.tipLen), plastic(P.tip.color || '#eeeeee', { roughness: P.tip.wear === 'rubber' ? 0.9 : 0.35 }));
    tip.position.y = y(0);
    inner.add(tip);
    this.meshes.tip = tip;

    // lock
    const lockGeo = new THREE.CylinderGeometry(P.lock.radius * MM * 0.92, P.lock.radius * MM, g.lockH * MM, 24);
    const lock = new THREE.Mesh(lockGeo, plastic(P.lock.color || '#d0d5dd', rarityGlow(P.lock)));
    lock.position.y = y(g.zLock0 + g.lockH / 2);
    inner.add(lock);
    const notchMat = plastic(accent, { emissive: accent, emissiveIntensity: 0.4 });
    for (let i = 0; i < P.lock.notches; i++) {
      const a = (i / P.lock.notches) * Math.PI * 2;
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.0016, g.lockH * MM * 0.6, 0.0012), notchMat);
      n.position.set(Math.cos(a) * P.lock.radius * MM, lock.position.y, Math.sin(a) * P.lock.radius * MM);
      n.rotation.y = -a;
      inner.add(n);
    }
    this.meshes.lock = lock;

    // disc
    const holes = P.disc.mass < 16 ? 8 : P.disc.massDist > 0.5 ? 5 : 6;
    const holeAt = (P.disc.rIn + P.disc.rOut) * 0.5 * MM * (P.disc.massDist > 0.5 ? 0.8 : 1);
    const dShape = discShape(P.disc.rIn * MM, P.disc.rOut * MM, holes, (P.disc.rOut - P.disc.rIn) * 0.16 * MM, holeAt);
    const discGeo = new THREE.ExtrudeGeometry(dShape, { depth: P.disc.thickness * MM, bevelEnabled: false, curveSegments: 32 });
    discGeo.rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, metal(P.disc.color || '#b8bec8', rarityGlow(P.disc)));
    disc.position.y = y(g.zDisc0);
    inner.add(disc);
    this.meshes.disc = disc;

    // ring — the physics contact layer outline
    const ringLayer = spec.layers.find((l) => l.id === 'ring');
    const outline = profileOutline(ringLayer, 192);
    const ringGeo = extrudeRing(outline, P.ring.rIn * MM, P.ring.thickness * MM);
    const ring = new THREE.Mesh(ringGeo, plastic(accent, { roughness: 0.3, ...rarityGlow(P.ring) }));
    ring.position.y = y(g.zRing0);
    inner.add(ring);
    // translucent overlay rim for depth
    const rimGeo = new THREE.TorusGeometry(ringLayer.baseRadius * 0.92, 0.0008, 6, 48);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, metal('#ffffff', { metalness: 0.9, roughness: 0.2 }));
    rim.position.y = y(g.zRing0 + P.ring.thickness);
    inner.add(rim);
    this.meshes.ring = ring;

    // aux
    const aux = spec.layers.find((l) => l.id === 'aux');
    if (P.aux) {
      let auxMesh;
      if (aux) {
        const out = profileOutline({ ...aux }, 128);
        auxMesh = new THREE.Mesh(extrudeRing(out, aux.radius - 0.003, aux.thickness), plastic(P.aux.color || '#e9f6ff', { opacity: aux.freeSpin ? 0.75 : 0, roughness: 0.2 }));
        auxMesh.position.y = aux.z + zCom - aux.thickness / 2 - zCom;
        auxMesh.position.y = aux.z - aux.thickness / 2;
      } else if (P.aux.ringRadius) {
        const geo = new THREE.CylinderGeometry(P.aux.ringRadius[1] * MM, P.aux.ringRadius[1] * MM, 0.003, 32, 1, true);
        auxMesh = new THREE.Mesh(geo, metal(P.aux.color || '#c0c6d0'));
        auxMesh.position.y = y(P.aux.lowMount ? g.zLock0 + g.lockH * 0.2 : g.zLock0 + g.lockH * 0.5);
      } else {
        auxMesh = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0015, 6, 32).rotateX(Math.PI / 2), plastic(P.aux.color || '#b8a6ff'));
        auxMesh.position.y = y(g.zRingC);
      }
      inner.add(auxMesh);
      this.meshes.aux = auxMesh;
    }

    // core with emblem cap
    const coreGeo = new THREE.CylinderGeometry(P.core.radius * MM * 0.96, P.core.radius * MM, P.core.height * MM, 32);
    const core = new THREE.Mesh(coreGeo, plastic(P.core.color || '#d9e2ec', { roughness: 0.25, ...rarityGlow(P.core) }));
    core.position.y = y(g.zCore0 + P.core.height / 2);
    inner.add(core);
    const beast = opts.beast ? BEAST_INDEX[opts.beast] : null;
    const emb = beast ? emblemCanvas(beast.emblem, beast.colors, 128, { background: false }) : emblemCanvas('blank', { primary: accent }, 128, { background: false });
    const capTex = new THREE.CanvasTexture(emb);
    capTex.colorSpace = THREE.SRGBColorSpace;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(P.core.radius * MM * 0.85, 32), new THREE.MeshStandardMaterial({ map: capTex, transparent: true, emissive: '#ffffff', emissiveMap: capTex, emissiveIntensity: 0.6, roughness: 0.3 }));
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = core.position.y + P.core.height * MM * 0.5 + 0.0002;
    inner.add(cap);
    this.meshes.core = core;

    // motion blur disc (not spinning, fades with spin rate)
    const blurTex = makeBlurTexture(accent);
    this.blur = new THREE.Mesh(new THREE.CircleGeometry(ringLayer.radius * 1.02, 48), new THREE.MeshBasicMaterial({ map: blurTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.blur.rotation.x = -Math.PI / 2;
    this.blur.position.y = y(g.zRing0 + P.ring.thickness + 0.3);
    this.tiltGroup = new THREE.Group();
    this.tiltGroup.add(this.blur);
    this.root.add(this.tiltGroup);

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.blur.castShadow = false;
    this.displayPhase = 0;
    this.qAxis = new THREE.Quaternion();
    this.qSpin = new THREE.Quaternion();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._a = new THREE.Vector3();
    this.visibleState = true;
  }

  // Interpolate between the previous and current physics states.
  update(top, alpha, dt) {
    const p0 = top.prevP, p1 = top.p;
    this.root.position.set(p0.x + (p1.x - p0.x) * alpha, p0.y + (p1.y - p0.y) * alpha, p0.z + (p1.z - p0.z) * alpha);
    this._qa.set(top.prevQ.x, top.prevQ.y, top.prevQ.z, top.prevQ.w);
    this._qb.set(top.q.x, top.q.y, top.q.z, top.q.w);
    this._qa.slerp(this._qb, alpha);
    this._a.copy(UP).applyQuaternion(this._qa);
    this.qAxis.setFromUnitVectors(UP, this._a);
    const w = top.spinRate;
    const aw = Math.abs(w);
    const rate = Math.sign(w) * Math.min(48, 48 * Math.pow(aw / 600, 0.7));
    if (top.active || top.state === 'out' || top.state === 'burst') this.displayPhase += rate * dt;
    this.qSpin.setFromAxisAngle(UP, this.displayPhase);
    this.body.quaternion.copy(this.qAxis).multiply(this.qSpin);
    this.tiltGroup.quaternion.copy(this.qAxis);
    this.blur.material.opacity = Math.max(0, Math.min(0.5, (aw - 80) / 700));
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
}

const blurCache = new Map();
function makeBlurTexture(color) {
  if (blurCache.has(color)) return blurCache.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, '#00000000');
  g.addColorStop(0.7, color + '30');
  g.addColorStop(0.92, color + 'aa');
  g.addColorStop(1, '#00000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  blurCache.set(color, t);
  return t;
}
