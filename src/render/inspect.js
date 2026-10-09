// Inspect stage: a turntable showroom for one top, rendered instead of the
// main scene while the Inspect screen is open. Shows the individually
// modelled parts assembling, exploding apart and, one at a time, in focus
// (the others ghosted).

import * as THREE from 'three';
import { TopVisual } from './topMesh.js';
import { createLights } from './lighting.js';
import { INK_LAYER, toonMaterial, inked, disposeTree } from './toon.js';

export class InspectStage {
  constructor() {
    this.scene = new THREE.Scene();
    this.bgTex = backdropTexture();
    this.scene.background = this.bgTex;
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.005, 5);
    this.camera.layers.enable(INK_LAYER);
    this.lights = createLights(this.scene);
    this.lights.key.castShadow = true;
    this.lights.rimA.position.set(-0.25, 0.15, -0.2);
    this.lights.rimB.position.set(0.25, 0.12, 0.2);
    // pedestal
    this.pedestal = new THREE.Group();
    const base = inked(new THREE.CylinderGeometry(0.036, 0.04, 0.006, 48), toonMaterial('#1d2240', { finish: 'matte' }), { px: 2.5, maxMm: 2 });
    base.position.y = -0.003;
    base.receiveShadow = true;
    this.trim = new THREE.Mesh(new THREE.TorusGeometry(0.0362, 0.001, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4fc3ff' }));
    this.trim.userData.noInk = true;
    this.pedestal.add(base, this.trim);
    this.scene.add(this.pedestal);
    this.visual = null;
    this.yaw = 0.7; this.pitch = 0.45; this.dist = 0.15;
    this.auto = true;
    this.explodeTarget = 0;
    this.focus = null;
    this.t = 0;
    this.viewShift = 0.14; // fraction of the width the subject is moved right (UI panel on the left)
  }

  show(assembly, opts = {}) {
    this.clear();
    const v = new TopVisual(assembly, { color: opts.color, beast: opts.beast, quality: opts.quality });
    this.visual = v;
    this.height = assembly.spec.height;
    this.tipEnd = assembly.spec.tip.endZ;
    v.blur.visible = false;
    this.scene.add(v.root);
    this.trim.material.color.set(opts.color || '#4fc3ff');
    v.setExplode(this.explodeTarget);
    v.playAssemble(1.3);
    if (this.focus) v.setGhost(this.focus);
  }

  clear() {
    if (!this.visual) return;
    this.scene.remove(this.visual.root);
    this.visual.dispose();
    this.visual = null;
  }

  replayAssembly() { this.visual?.playAssemble(1.3); }
  setExploded(on) { this.explodeTarget = on ? 1 : 0; }
  setFocus(slot) { this.focus = slot || null; this.visual?.setGhost(this.focus); }

  // Orbit input: yaw/pitch deltas in radians, zoom as a factor.
  input(dYaw, dPitch, zoom = 1) {
    if (dYaw || dPitch) this.auto = false;
    this.yaw += dYaw;
    this.pitch = Math.max(-0.1, Math.min(1.35, this.pitch + dPitch));
    this.dist = Math.max(0.08, Math.min(0.36, this.dist * zoom));
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.setViewOffset(w, h, -w * this.viewShift, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    if (this.auto) this.yaw += dt * 0.35;
    const v = this.visual;
    const hover = 0.012 + Math.sin(this.t * 1.6) * 0.0015;
    if (v) {
      const e = v.explode + (this.explodeTarget - v.explode) * Math.min(1, dt * 6);
      v.setExplode(Math.abs(e - this.explodeTarget) < 1e-3 ? this.explodeTarget : e);
      v.animate(dt);
      // spin slowly so blades read; tip end hovers above the pedestal
      v.displayPhase += dt * 0.9;
      v.body.quaternion.setFromAxisAngle(UP, v.displayPhase);
      // lift by the lowest part's explode offset so nothing sinks into the pedestal
      const lift = ((v.partCount - 1) / 2) * 0.013 * v.explode;
      v.root.position.set(0, hover + lift - this.tipEnd, 0);
    }
    const cy = hover + (this.height || 0.03) * 0.5 + ((v ? v.partCount - 1 : 0) / 2) * 0.013 * (v?.explode || 0);
    const d = this.dist * (1 + 0.55 * (v?.explode || 0));
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * d, cy + Math.sin(this.pitch) * d, Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    this.camera.lookAt(0, cy, 0);
  }

  dispose() {
    this.clear();
    disposeTree(this.pedestal);
    this.bgTex.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

// Anime showroom backdrop: radial burst of speed lines over a deep gradient
// with a halftone dot band.
function backdropTexture() {
  const W = 1024, H = 576;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(W * 0.62, H * 0.5, 20, W * 0.62, H * 0.5, W * 0.7);
  grad.addColorStop(0, '#3a4a8c');
  grad.addColorStop(0.45, '#1b2150');
  grad.addColorStop(1, '#0a0c1e');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // speed lines radiating from the subject
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.save();
  g.translate(W * 0.62, H * 0.5);
  for (let i = 0; i < 140; i++) {
    const a = rnd() * Math.PI * 2, r0 = 120 + rnd() * 160, r1 = r0 + 200 + rnd() * 500;
    const w = 0.004 + rnd() * 0.012;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * r1, Math.sin(a - w) * r1);
    g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a + w) * r1, Math.sin(a + w) * r1);
    g.closePath();
    g.fillStyle = `rgba(160, 190, 255, ${0.05 + rnd() * 0.12})`;
    g.fill();
  }
  g.restore();
  // halftone band along the bottom
  for (let y = H * 0.7; y < H; y += 9) {
    const k = (y - H * 0.7) / (H * 0.3);
    for (let x = (y / 9) % 2 ? 4.5 : 0; x < W; x += 9) {
      g.beginPath();
      g.arc(x, y, 0.6 + k * 2.6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(90, 120, 220, 0.22)';
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

