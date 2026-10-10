// Bit-Beast manifestations: a translucent 3D spirit rises out of the top in
// a pillar of light over a spinning sigil, performs its idle motion (coils,
// wing beats, roars), faces the opponent and fades. Purely visual: it is
// triggered by the ability event and never feeds back into the simulation.
//
// The spirit material is cel-style energy: a flat inner tint, a hard bright
// rim band, rising scan stripes, and a lower body that fades out so the top
// underneath (and its collisions) stay readable.

import * as THREE from 'three';
import { buildSpiritForm } from './spiritForms.js';
import { drawEmblem } from './emblems.js';

const sharedTime = { value: 0 };

const VERT = `
attribute float aU;
uniform float uTime, uWave, uBase, uHeight;
varying vec3 vN; varying vec3 vV; varying float vY; varying float vWY;
void main() {
  vec3 p = position;
  float env = aU * (1.0 - aU) * 4.0;
  float ph = aU * 10.0 - uTime * 5.0;
  p += vec3(sin(ph), 0.25 * sin(ph * 0.5), cos(ph)) * uWave * env;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vY = (wp.y - uBase) / max(1e-4, uHeight); // height above the spirit's base, in spirit units
  vWY = wp.y;
  vec4 mv = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform vec3 uColor, uRim;
uniform float uOpacity, uTime, uFade;
varying vec3 vN; varying vec3 vV; varying float vY; varying float vWY;
void main() {
  // degenerate triangles can leave zero normals: guard against NaN (renders black when blended)
  float ln = length(vN);
  vec3 n = ln > 1e-5 ? vN / ln : vec3(0.0, 0.0, 1.0);
  float f = 1.0 - abs(dot(n, normalize(vV)));
  // two-tone cel light from the upper front, a hard rim band and a soft halo
  float lit = step(0.15, dot(n, normalize(vec3(0.35, 0.8, 0.5))));
  float rim = step(0.62, f);
  float soft = smoothstep(0.3, 0.95, f);
  vec3 col = mix(uColor * 0.7, uColor * 1.15, lit);
  col = mix(col, uRim, rim * 0.85) + uColor * soft * 0.2;
  float stripe = step(0.86, fract(vWY * 70.0 - uTime * 1.8)) * 0.12;
  float a = (0.42 + 0.1 * lit + 0.35 * rim + 0.1 * soft + stripe) * uOpacity;
  a *= smoothstep(0.0, uFade, vY);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export function spiritMaterial(color, rim, { wave = 0, fade = 0.2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uTime: sharedTime,
      uOpacity: { value: 0 }, uWave: { value: wave }, uFade: { value: fade }, uBase: { value: 0 }, uHeight: { value: 1 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    // translucent tint rather than additive light: keeps each beast's hue on bright floors too
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
  });
}

// Vertical light streaks for the pillar (scrolled upward).
function pillarTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#ffffffff'); g.addColorStop(0.5, '#ffffff66'); g.addColorStop(1, '#ffffff00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) { ctx.fillStyle = '#000000aa'; ctx.fillRect((i * 7.1) % 64, 0, 2 + (i % 3), 128); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Summoning sigil: concentric rings, tick marks and the beast's emblem.
function sigilTexture(beast) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = '#ffffff';
  for (const [r, w] of [[0.48, 4], [0.42, 2], [0.3, 2]]) { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r * S, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r0 = 0.42 * S, r1 = (i % 3 ? 0.45 : 0.48) * S;
    ctx.lineWidth = i % 3 ? 2 : 4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
  }
  ctx.translate(-S * 0.3, -S * 0.3);
  drawEmblem(ctx, beast.emblem, { primary: '#ffffff', secondary: '#ffffff', glow: '#ffffff' }, S * 0.6, { background: false });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class SpiritSystem {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.active = [];
    this.pool = new Map(); // beast id -> idle instances
    this.sigils = new Map(); // beast id -> texture
    this.pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
    this.sigilGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.pillarTex = typeof document !== 'undefined' ? pillarTexture() : null;
    this.floorAt = null; // (x, z) -> stadium floor height; set by the renderer
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    for (const list of this.pool.values()) for (const inst of list) this.disposeInstance(inst);
    this.pool.clear();
  }

  build(beast) {
    const c = beast.colors;
    const eye = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const body = spiritMaterial(c.primary, c.secondary || '#ffffff');
    const form = buildSpiritForm(beast.emblem, { body, eye }, this.quality);
    body.uniforms.uWave.value = form.wave;
    body.uniforms.uFade.value = form.fade;
    const root = new THREE.Group();
    root.add(form.group);
    root.traverse((o) => { o.frustumCulled = false; o.renderOrder = 5; });
    if (!this.sigils.has(beast.id)) this.sigils.set(beast.id, sigilTexture(beast));
    const glow = c.glow || c.primary;
    const pillar = new THREE.Mesh(this.pillarGeo, new THREE.MeshBasicMaterial({ map: this.pillarTex, color: glow, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    const sigil = new THREE.Mesh(this.sigilGeo, new THREE.MeshBasicMaterial({ map: this.sigils.get(beast.id), color: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    return { beastId: beast.id, form, root, body, eye, pillar, sigil, color: glow };
  }

  // target: Object3D the spirit follows; face: Object3D to turn toward (or null).
  spawn(beast, target, { duration = 1.4, height = 0.13, face = null } = {}) {
    // a second summon while this spirit is still up re-energises it instead of stacking a copy
    const live = this.active.find((i) => i.beastId === beast.id && i.target === target);
    if (live) {
      live.t = Math.min(live.t, 0.22 * duration);
      live.dur = duration;
      live.height = Math.max(live.height, height);
      return live;
    }
    const idle = this.pool.get(beast.id);
    const inst = idle?.pop() || this.build(beast);
    Object.assign(inst, { target, face, t: 0, dur: duration, height, yaw: null, spin: 0 });
    this.scene.add(inst.root, inst.pillar, inst.sigil);
    this.active.push(inst);
    this.place(inst, 0);
    return inst;
  }

  place(inst, dt) {
    const k = Math.min(1, inst.t / inst.dur);
    const p = inst.target.position;
    const rise = easeOutBack(Math.min(1, k / 0.22));
    const fade = k < 0.12 ? k / 0.12 : k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1;
    inst.root.position.set(p.x, p.y + 0.022 + 0.025 * k, p.z);
    inst.root.scale.setScalar(inst.height * (0.3 + 0.7 * Math.max(0, rise)));
    if (inst.face) {
      _v.subVectors(inst.face.position, p);
      const want = Math.atan2(_v.x, _v.z);
      if (inst.yaw == null) inst.yaw = want;
      else inst.yaw += Math.atan2(Math.sin(want - inst.yaw), Math.cos(want - inst.yaw)) * Math.min(1, dt * 4);
      inst.root.rotation.y = inst.yaw;
    }
    inst.body.uniforms.uOpacity.value = fade * 0.9;
    inst.body.uniforms.uBase.value = inst.root.position.y;
    inst.body.uniforms.uHeight.value = inst.root.scale.y;
    inst.eye.opacity = fade;
    inst.form.animate(inst.t, k);
    const floorY = this.floorAt ? this.floorAt(p.x, p.z) : p.y - 0.018;
    inst.pillar.position.set(p.x, floorY, p.z);
    inst.pillar.scale.set(0.02, inst.height * 2.4 * Math.min(1, k * 5), 0.02);
    inst.pillar.material.opacity = fade * 0.32 * (1 - 0.6 * k);
    // the stadium is a bowl: lay the sigil on the local floor slope, lifted along its normal
    if (this.floorAt) {
      const e = 0.01, f = this.floorAt;
      _n.set(f(p.x - e, p.z) - f(p.x + e, p.z), 2 * e, f(p.x, p.z - e) - f(p.x, p.z + e)).normalize();
    } else _n.set(0, 1, 0);
    inst.spin = (inst.spin || 0) + dt * 1.4;
    _q1.setFromUnitVectors(UP, _n);
    _q2.setFromAxisAngle(UP, inst.spin);
    inst.sigil.quaternion.copy(_q1).multiply(_q2);
    inst.sigil.position.set(p.x, floorY, p.z).addScaledVector(_n, 0.002);
    inst.sigil.scale.setScalar(inst.height * 0.6 * (0.6 + 0.4 * Math.max(0, rise)));
    inst.sigil.material.opacity = fade * 0.8;
    return k;
  }

  update(dt) {
    sharedTime.value += dt;
    if (this.pillarTex) this.pillarTex.offset.y -= dt * 1.6;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i];
      inst.t += dt;
      if (this.place(inst, dt) >= 1) { this.release(inst); this.active.splice(i, 1); }
    }
  }

  // Draw the spirit materials once at load so the first summon doesn't stall
  // (drivers finish shader/pipeline setup on first draw, not at compile). The
  // warm-up materials stay alive, keeping the programs cached.
  warmup(renderer, scene, camera) {
    if (!this._warm) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1e-4, 0, 0, 0, 1e-4, 0], 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      geo.setAttribute('aU', new THREE.Float32BufferAttribute([0, 0, 0], 1));
      this._warm = new THREE.Group();
      const basic = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      for (const m of [spiritMaterial('#ffffff', '#ffffff'), basic(null), basic(this.pillarTex)]) this._warm.add(new THREE.Mesh(geo, m));
      this._warm.traverse((o) => { o.frustumCulled = false; });
    }
    scene.add(this._warm);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    scene.remove(this._warm);
  }

  // Build (and draw once, invisibly) a pooled instance for each beast that has none.
  preload(beasts, renderer, scene, camera) {
    const fresh = [];
    for (const b of beasts) {
      if (this.pool.get(b.id)?.length || fresh.some((i) => i.beastId === b.id)) continue;
      const inst = this.build(b);
      inst.root.scale.setScalar(0.001);
      fresh.push(inst);
      scene.add(inst.root, inst.pillar, inst.sigil);
    }
    if (!fresh.length) return;
    renderer.render(scene, camera);
    for (const inst of fresh) this.release(inst);
  }

  release(inst) {
    this.scene.remove(inst.root, inst.pillar, inst.sigil);
    if (!this.pool.has(inst.beastId)) this.pool.set(inst.beastId, []);
    this.pool.get(inst.beastId).push(inst);
  }

  clear() {
    for (const inst of this.active) this.release(inst);
    this.active.length = 0;
  }

  disposeInstance(inst) {
    inst.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    inst.body.dispose(); inst.eye.dispose(); inst.pillar.material.dispose(); inst.sigil.material.dispose();
  }
}
