// A top's 3D model, assembled from individually built part models
// (render/parts/*) stacked at the heights the physics uses. Each part is its
// own object: it can be exploded apart, animated into place, inspected and,
// on a Shatter, flies off on its own. Display spin is decoupled from the
// physical spin rate (which is far above the frame rate) to avoid strobing;
// a streaked speed-ring conveys the true speed.

import * as THREE from 'three';
import { buildPartModels, STACK_ORDER } from './parts/index.js';
import { disposeTree, MM } from './toon.js';

const UP = new THREE.Vector3(0, 1, 0);
const EXPLODE_GAP = 13 * MM;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class TopVisual {
  constructor(assembly, opts = {}) {
    this.assembly = assembly;
    const { spec } = assembly;
    const accent = opts.color || assembly.parts.ring.color || '#4fc3ff';
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // spins (display phase)
    this.root.add(this.body);
    this.inner = new THREE.Group(); // geometric axis (offset from the COM by eccentric mass)
    this.inner.position.set(spec.axisOffset[0], 0, spec.axisOffset[2]);
    this.body.add(this.inner);

    // individually modelled parts
    this.parts = {};
    this.meshes = {}; // slot -> part group (burst detaches these)
    this.partGroups = [];
    this.spinners = [];
    this.glows = [];
    const built = buildPartModels(assembly, { color: accent, beast: opts.beast, quality: opts.quality });
    let order = 0;
    // explode/assembly order follows the real stack height
    const slots = STACK_ORDER.filter((s) => built[s]).sort((a, b) => built[a].y - built[b].y);
    for (const slot of slots) {
      const b = built[slot];
      const g = b.model.group;
      g.position.y = b.y;
      this.inner.add(g);
      this.parts[slot] = { group: g, baseY: b.y, order: order++, height: b.model.height || 0, anim: null };
      this.meshes[slot] = g;
      this.partGroups.push(g);
      if (b.model.spinners) this.spinners.push(...b.model.spinners);
      if (b.model.glows) this.glows.push(...b.model.glows);
    }
    this.partCount = order;
    this.explode = 0;

    // speed ring (not spinning with the body; fades in with spin rate)
    const ringLayer = spec.layers.find((l) => l.id === 'ring');
    const g = spec.geometry;
    const zCom = -spec.tip.endZ;
    this.blur = new THREE.Mesh(new THREE.CircleGeometry(ringLayer.radius * 1.08, 48), new THREE.MeshBasicMaterial({ map: speedRingTexture(accent), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.blur.rotation.x = -Math.PI / 2;
    this.blur.position.y = (g.zRing0 + assembly.parts.ring.thickness + 0.4) * MM - zCom;
    this.blur.userData.noInk = true;
    this.tiltGroup = new THREE.Group();
    this.tiltGroup.add(this.blur);
    this.root.add(this.tiltGroup);

    this.root.traverse((o) => { if (o.isMesh && !o.userData.isInk) o.castShadow = true; });
    this.blur.castShadow = false;
    this.displayPhase = 0;
    this.qAxis = new THREE.Quaternion();
    this.qSpin = new THREE.Quaternion();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._a = new THREE.Vector3();
    this.visibleState = true;
    this.assembling = false;
  }

  // Spread the parts apart along the spin axis (0 = assembled, 1 = exploded).
  setExplode(e) {
    this.explode = e;
    if (!this.assembling) this._layout();
  }

  _layout() {
    const mid = (this.partCount - 1) / 2;
    for (const p of Object.values(this.parts)) {
      if (p.group.parent !== this.inner) continue; // detached (burst)
      p.group.position.y = p.baseY + (p.order - mid) * EXPLODE_GAP * this.explode;
    }
  }

  // Ghost every part except `slot` (null restores all) for the inspect view.
  setGhost(slot) {
    for (const [s, p] of Object.entries(this.parts)) {
      const ghost = !!slot && s !== slot;
      p.group.traverse((o) => {
        if (o.userData.isInk) { o.visible = !ghost; return; }
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const g = m.userData._ghost || (m.userData._ghost = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
          m.transparent = ghost || g.transparent;
          m.opacity = ghost ? Math.min(g.opacity, 0.14) : g.opacity;
          m.depthWrite = ghost ? false : g.depthWrite;
          m.needsUpdate = true;
        }
      });
    }
  }

  // Parts drop in one after another and click into place.
  playAssemble(duration = 1.1) {
    this.assembling = true;
    this._asmT = 0;
    this._asmDur = duration;
    for (const p of Object.values(this.parts)) { p.group.visible = false; }
    this.animate(0);
  }

  finishAssemble() {
    if (!this.assembling) return;
    this.assembling = false;
    for (const p of Object.values(this.parts)) { p.group.visible = true; p.group.rotation.set(0, 0, 0); p.group.scale.setScalar(1); }
    this._layout();
  }

  // Advance animations (assembly drop-in, free-spinning modules). Returns
  // the slot that just clicked into place, if any.
  animate(dt) {
    if (!this.assembling) return null;
    this._asmT += dt;
    const n = this.partCount;
    const step = (this._asmDur * 0.62) / Math.max(1, n - 1);
    const drop = this._asmDur * 0.38;
    const mid = (n - 1) / 2;
    let clicked = null;
    for (const [slot, p] of Object.entries(this.parts)) {
      const t0 = p.order * step;
      const f = Math.min(1, Math.max(0, (this._asmT - t0) / drop));
      p.group.visible = this._asmT >= t0;
      const target = p.baseY + (p.order - mid) * EXPLODE_GAP * this.explode;
      const k = easeOutBack(f);
      p.group.position.y = target + (1 - k) * 0.045;
      p.group.rotation.y = (1 - f) * 2.4 * (p.order % 2 ? 1 : -1);
      if (f >= 1 && !p.landed) { p.landed = true; clicked = slot; }
      if (f < 1) p.landed = false;
    }
    if (this._asmT >= (n - 1) * step + drop) this.finishAssemble();
    return clicked;
  }

  // Interpolate between the previous and current physics states.
  update(top, alpha, dt) {
    if (this.assembling) this.finishAssemble();
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
    // free-spinning modules lag behind the body
    for (const s of this.spinners) s.rotation.y = -this.displayPhase * 0.85;
    this.blur.rotation.z = this.displayPhase * 0.35;
    this.blur.material.opacity = Math.max(0, Math.min(0.75, (aw - 80) / 600));
  }

  dispose() {
    for (const g of this.partGroups) { g.parent?.remove(g); disposeTree(g); }
    this.blur.geometry.dispose();
    this.blur.material.dispose();
  }
}

// Anime speed ring: streaked arcs in the top's colour with white highlights.
const ringCache = new Map();
function speedRingTexture(color) {
  if (ringCache.has(color)) return ringCache.get(color);
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  ctx.lineCap = 'round';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const r = S * (0.3 + rnd() * 0.19);
    const a0 = rnd() * Math.PI * 2, len = 0.5 + rnd() * 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a0 + len);
    ctx.strokeStyle = i % 4 === 0 ? '#ffffff' : color;
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    ctx.lineWidth = 1.5 + rnd() * 3.5;
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  ringCache.set(color, t);
  return t;
}
