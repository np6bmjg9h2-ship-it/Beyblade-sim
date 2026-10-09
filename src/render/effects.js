// Pooled visual effects. Counts scale with the graphics quality / reduced
// effects setting; nothing here allocates per frame after construction.

import * as THREE from 'three';
import { emblemCanvas } from './emblems.js';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#ffffffff');
  g.addColorStop(0.3, '#ffffffcc');
  g.addColorStop(1, '#ffffff00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class ParticlePool {
  constructor(scene, count, opts) {
    this.count = count;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.baseCol = new Float32Array(count * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: opts.size, map: opts.map, vertexColors: true, transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.gravity = opts.gravity ?? -3;
    this.drag = opts.drag ?? 1.5;
    this.cursor = 0;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
  }
  emit(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseCol[i * 3] = r; this.baseCol[i * 3 + 1] = g; this.baseCol[i * 3 + 2] = b;
  }
  update(dt) {
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) { this.pos[k + 1] = -100; continue; }
      this.vel[k + 1] += this.gravity * dt;
      this.vel[k] *= damp; this.vel[k + 1] *= damp; this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.col[k] = this.baseCol[k] * f; this.col[k + 1] = this.baseCol[k + 1] * f; this.col[k + 2] = this.baseCol[k + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

class Trail {
  constructor(scene, color, n) {
    this.n = n;
    this.pts = new Float32Array(n * 3);
    this.cols = new Float32Array(n * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pts, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.cols, 3));
    this.line = new THREE.Line(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.line.frustumCulled = false;
    this.color = new THREE.Color(color);
    scene.add(this.line);
    this.reset(new THREE.Vector3(0, -100, 0));
  }
  reset(p) {
    for (let i = 0; i < this.n; i++) { this.pts[i * 3] = p.x; this.pts[i * 3 + 1] = p.y; this.pts[i * 3 + 2] = p.z; }
    this.geo.attributes.position.needsUpdate = true;
  }
  push(p, intensity) {
    this.pts.copyWithin(3, 0, (this.n - 1) * 3);
    this.pts[0] = p.x; this.pts[1] = p.y; this.pts[2] = p.z;
    for (let i = 0; i < this.n; i++) {
      const f = (1 - i / this.n) * intensity;
      this.cols[i * 3] = this.color.r * f; this.cols[i * 3 + 1] = this.color.g * f; this.cols[i * 3 + 2] = this.color.b * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.setQuality(quality);
    const tex = dotTexture();
    this.sparks = new ParticlePool(scene, this.q.sparks, { size: 0.006, map: tex, additive: true, gravity: -4, drag: 2.5 });
    this.dust = new ParticlePool(scene, this.q.dust, { size: 0.012, map: tex, additive: false, gravity: 0.05, drag: 3 });
    this.glow = new ParticlePool(scene, this.q.glow, { size: 0.018, map: tex, additive: true, gravity: 0.25, drag: 1.2 });
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, r0: 0, r1: 0 });
    }
    this.trails = new Map();
    this.manifest = [];
    this.debris = [];
    this.scratches = [];
    const scrGeo = new THREE.PlaneGeometry(1, 1);
    this.scratchMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false });
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(scrGeo, this.scratchMat);
      m.visible = false;
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      this.scratches.push(m);
    }
    this.scratchCursor = 0;
    this._c = new THREE.Color();
  }

  setQuality(q) {
    this.quality = q;
    const table = {
      low: { sparks: 160, dust: 80, glow: 120, trail: 0, mult: 0.35 },
      medium: { sparks: 400, dust: 160, glow: 300, trail: 24, mult: 0.7 },
      high: { sparks: 900, dust: 320, glow: 600, trail: 40, mult: 1 },
    };
    this.q = table[q] || table.high;
  }

  color(hex) { return this._c.set(hex); }

  impact(point, normal, impulse, colorA = '#ffd27a', colorB = '#7fd8ff') {
    const n = Math.min(80, Math.floor((8 + impulse * 900) * this.q.mult));
    const [x, y, z] = point;
    for (let i = 0; i < n; i++) {
      const c = this.color(i % 2 ? colorA : colorB);
      const sp = 0.4 + Math.random() * (0.6 + impulse * 30);
      const a = Math.random() * Math.PI * 2;
      this.sparks.emit(x, y, z, Math.cos(a) * sp, 0.2 + Math.random() * sp * 0.6, Math.sin(a) * sp, 0.25 + Math.random() * 0.35, c.r, c.g, c.b);
    }
    if (impulse > 0.03) this.ring(point, 0.005, 0.03 + impulse * 0.6, 0.35, impulse > 0.06 ? '#ffffff' : colorA);
  }

  grind(point, intensity, color = '#ffcc66') {
    if (Math.random() > intensity * 4 * this.q.mult) return;
    const c = this.color(color);
    const [x, y, z] = point;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.emit(x, y, z, Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5, 0.15, c.r, c.g, c.b);
    }
  }

  wall(point, impulse) {
    const n = Math.min(30, Math.floor((4 + impulse * 400) * this.q.mult));
    const [x, y, z] = point;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.emit(x, y, z, Math.cos(a) * 0.5, Math.random() * 0.6, Math.sin(a) * 0.5, 0.2 + Math.random() * 0.2, 1, 0.85, 0.6);
    }
  }

  dustPuff(p, amount = 10) {
    const n = Math.floor(amount * this.q.mult);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.05 + Math.random() * 0.15;
      this.dust.emit(p.x, p.y + 0.002, p.z, Math.cos(a) * s, 0.02 + Math.random() * 0.05, Math.sin(a) * s, 0.6 + Math.random() * 0.6, 0.55, 0.58, 0.62);
    }
  }

  scratch(p, dir, len = 0.01) {
    const m = this.scratches[this.scratchCursor];
    this.scratchCursor = (this.scratchCursor + 1) % this.scratches.length;
    m.visible = true;
    m.position.set(p.x, p.y + 0.0006, p.z);
    m.scale.set(len, 0.0008, 1);
    m.rotation.set(-Math.PI / 2, 0, -Math.atan2(dir.z, dir.x));
  }

  ring(point, r0, r1, dur, color) {
    const slot = this.rings.find((r) => r.t <= 0) || this.rings[0];
    slot.t = dur; slot.dur = dur; slot.r0 = r0; slot.r1 = r1;
    slot.mesh.position.set(point[0], point[1] + 0.001, point[2]);
    slot.mesh.material.color.set(color);
    slot.mesh.visible = true;
  }

  launchFlash(p, color) {
    this.ring([p.x, p.y, p.z], 0.01, 0.07, 0.5, color);
    const c = this.color(color);
    for (let i = 0; i < 40 * this.q.mult; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.emit(p.x, p.y + 0.01, p.z, Math.cos(a) * 0.3, Math.random() * 0.2, Math.sin(a) * 0.3, 0.6, c.r, c.g, c.b);
    }
    this.dustPuff(p, 16);
  }

  aura(p, color, amount = 3) {
    const c = this.color(color);
    for (let i = 0; i < amount * this.q.mult; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.02 + Math.random() * 0.01;
      this.glow.emit(p.x + Math.cos(a) * r, p.y + 0.005, p.z + Math.sin(a) * r, -Math.sin(a) * 0.08, 0.08 + Math.random() * 0.08, Math.cos(a) * 0.08, 0.5, c.r, c.g, c.b);
    }
  }

  // Bit-Beast manifestation: emblem billboard rising out of the top + swirl
  manifestation(target, beast, duration = 1.4, scale = 0.12) {
    const tex = new THREE.CanvasTexture(emblemCanvas(beast.emblem, beast.colors, 256));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    sp.scale.set(scale, scale, 1);
    this.scene.add(sp);
    this.manifest.push({ sp, target, t: 0, dur: duration, scale, color: beast.colors.glow || beast.colors.primary });
    this.ring([target.position.x, target.position.y - 0.01, target.position.z], 0.01, 0.09, 0.6, beast.colors.primary);
  }

  shockwave(p, range, color) {
    this.ring([p.x, p.y, p.z], 0.01, range, 0.45, color);
    this.ring([p.x, p.y + 0.004, p.z], 0.005, range * 0.7, 0.35, '#ffffff');
  }

  burst(visual, velocity) {
    // detach part meshes and let them fly apart
    const root = visual.root;
    const parts = [];
    root.updateMatrixWorld(true);
    for (const key of ['ring', 'disc', 'core', 'lock', 'tip', 'aux']) {
      const m = visual.meshes[key];
      if (!m) continue;
      const wp = new THREE.Vector3(); m.getWorldPosition(wp);
      const wq = new THREE.Quaternion(); m.getWorldQuaternion(wq);
      this.scene.attach(m);
      m.position.copy(wp); m.quaternion.copy(wq);
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 0.6;
      parts.push({ m, v: new THREE.Vector3(Math.cos(a) * s + velocity.x, 0.6 + Math.random() * 0.8, Math.sin(a) * s + velocity.z), w: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), t: 3 });
    }
    this.debris.push(...parts);
    visual.root.visible = false;
    this.ring([root.position.x, root.position.y, root.position.z], 0.01, 0.12, 0.6, '#ffffff');
    const c = this.color('#ffffff');
    for (let i = 0; i < 80 * this.q.mult; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 1.2;
      this.sparks.emit(root.position.x, root.position.y, root.position.z, Math.cos(a) * s, Math.random() * 1.2, Math.sin(a) * s, 0.5, c.r, c.g, c.b);
    }
  }

  trail(id, color) {
    if (!this.q.trail) return null;
    if (!this.trails.has(id)) this.trails.set(id, new Trail(this.scene, color, this.q.trail));
    return this.trails.get(id);
  }

  victory(p, color) {
    const c = this.color(color);
    for (let i = 0; i < 160 * this.q.mult; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.05;
      this.glow.emit(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r, Math.cos(a) * 0.1, 0.4 + Math.random() * 0.6, Math.sin(a) * 0.1, 1.5, c.r, c.g, c.b);
    }
    this.ring([p.x, p.y, p.z], 0.01, 0.2, 1.0, color);
  }

  clearTransient() {
    for (const tr of this.trails.values()) { this.scene.remove(tr.line); tr.geo.dispose(); }
    this.trails.clear();
    for (const d of this.debris) { this.scene.remove(d.m); }
    this.debris = [];
    for (const m of this.manifest) { this.scene.remove(m.sp); m.sp.material.map.dispose(); m.sp.material.dispose(); }
    this.manifest = [];
    for (const s of this.scratches) s.visible = false;
  }

  update(dt) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.glow.update(dt);
    for (const r of this.rings) {
      if (r.t <= 0) { r.mesh.visible = false; continue; }
      r.t -= dt;
      const f = 1 - r.t / r.dur;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - f) * (1 - f));
      r.mesh.scale.set(rad, rad, rad);
      r.mesh.material.opacity = Math.max(0, 1 - f) * 0.9;
    }
    for (let i = this.manifest.length - 1; i >= 0; i--) {
      const m = this.manifest[i];
      m.t += dt;
      const f = m.t / m.dur;
      const p = m.target.position;
      m.sp.position.set(p.x, p.y + 0.03 + f * 0.09, p.z);
      const fade = f < 0.2 ? f / 0.2 : f > 0.75 ? Math.max(0, (1 - f) / 0.25) : 1;
      m.sp.material.opacity = fade * 0.95;
      const s = m.scale * (0.8 + 0.4 * f);
      m.sp.scale.set(s, s, 1);
      if (Math.random() < 0.6) this.aura(p, m.color, 2);
      if (f >= 1) { this.scene.remove(m.sp); m.sp.material.map.dispose(); m.sp.material.dispose(); this.manifest.splice(i, 1); }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t -= dt;
      d.v.y -= 9.81 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      if (d.m.position.y < -0.06) { d.m.position.y = -0.06; d.v.set(d.v.x * 0.3, Math.abs(d.v.y) * 0.25, d.v.z * 0.3); }
      if (d.t <= 0) { this.scene.remove(d.m); this.debris.splice(i, 1); }
    }
  }
}
