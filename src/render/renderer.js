// Scene renderer. Owns the Three.js renderer, lights, camera rig, arena and
// top visuals, and translates battle events into effects. Rendering never
// feeds back into the simulation: tops are drawn by interpolating between the
// last two fixed physics states.

import * as THREE from 'three';
import { buildArena } from './arenaMesh.js';
import { TopVisual } from './topMesh.js';
import { Effects } from './effects.js';
import { CameraRig } from './camera.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { INK_LAYER, setInkResolution, setSpecBoost } from './toon.js';
import { createLights, TONE } from './lighting.js';

export class GameRenderer {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.settings = { quality: 'high', shadows: true, reducedEffects: false, debug: false, ...settings };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the saturated cel palette from washing out
    this.renderer.toneMapping = TONE.mapping;
    this.renderer.toneMappingExposure = TONE.exposure;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.005, 30);
    this.rig = new CameraRig(this.camera);
    const L = createLights(this.scene);
    Object.assign(this, { hemi: L.hemi, key: L.key, rimA: L.rimA, rimB: L.rimB, spot: L.spot });
    this.applyQuality();
    this.effects = new Effects(this.scene, this.effectQuality());
    this.arenaObj = null;
    this.visuals = [];
    this.launchers = [];
    this.debugGroup = new THREE.Group();
    this.scene.add(this.debugGroup);
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.frameTimes = [];
  }

  effectQuality() { return this.settings.reducedEffects ? 'low' : this.settings.quality; }

  applyQuality() {
    const q = this.settings.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1) * (this.settings.renderScale || 1);
    this.renderer.setPixelRatio(Math.max(0.35, dpr));
    this.renderer.shadowMap.enabled = !!this.settings.shadows && q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.key) {
      this.key.castShadow = this.renderer.shadowMap.enabled;
      const s = q === 'high' ? 2048 : 1024;
      this.key.shadow.mapSize.set(s, s);
    }
    // ink outlines live on their own layer
    const ink = this.settings.outlines !== false;
    if (ink) this.camera.layers.enable(INK_LAYER); else this.camera.layers.disable(INK_LAYER);
    setSpecBoost(q === 'low' ? 0.7 : 1);
    setInkResolution(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight, this.renderer.getPixelRatio());
  }

  setSettings(s) {
    const prevQ = this.settings.quality;
    Object.assign(this.settings, s);
    this.applyQuality();
    if (this.effects) this.effects.setQuality(this.effectQuality());
    if (prevQ !== this.settings.quality && this.arenaDef) this.setArena(this.arenaDef);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    setInkResolution(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setArena(def) {
    if (this.arenaObj) {
      this.scene.remove(this.arenaObj.group);
      this.arenaObj.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose?.(); } });
    }
    this.arenaDef = def;
    this.arenaObj = buildArena(def, this.settings.quality);
    this.scene.add(this.arenaObj.group);
    this.scene.background = new THREE.Color(def.theme.sky);
    this.scene.fog = new THREE.Fog(def.theme.fog, 1.4, 4.5);
    this.rimA.color.set(def.theme.accent);
    this.rimB.color.set(def.theme.ring);
  }

  // ------------------------------------------------------------ battle

  clearFighters() {
    for (const v of this.visuals) { this.scene.remove(v.root); v.dispose(); }
    for (const l of this.launchers) { this.scene.remove(l.group); this.scene.remove(l.arrowGroup); this.scene.remove(l.zone); }
    this.visuals = [];
    this.launchers = [];
    this.effects.clearTransient();
  }

  setFighters(fighters) {
    this.clearFighters();
    for (const f of fighters) {
      const v = new TopVisual(f.assembly, { color: f.p.color || f.assembly.parts.ring.color, beast: f.p.beast?.id, quality: this.settings.quality });
      v.root.visible = false;
      v.fighter = f;
      v.playAssemble();
      this.scene.add(v.root);
      this.visuals.push(v);
      this.launchers.push(this.makeLauncher(f.p.color || f.assembly.parts.ring.color));
    }
  }

  makeLauncher(color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#2a3140', metalness: 0.4, roughness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    const housing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 8, 32), mat);
    housing.rotation.x = Math.PI / 2;
    group.add(housing);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0015, 6, 32), accent);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.005;
    group.add(glow);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.07), mat);
    handle.position.set(0, 0.012, 0.05);
    group.add(handle);
    // aim arrow
    const arrowGeo = new THREE.ConeGeometry(0.006, 0.02, 8);
    arrowGeo.rotateX(Math.PI / 2);
    const arrow = new THREE.Mesh(arrowGeo, accent);
    const arrowGroup = new THREE.Group();
    arrow.position.z = 0.055;
    arrowGroup.add(arrow);
    const zone = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.03, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    zone.rotation.x = -Math.PI / 2;
    this.scene.add(group);
    this.scene.add(arrowGroup);
    this.scene.add(zone);
    return { group, arrowGroup, zone, glow, accent, visible: false };
  }

  // show/update launcher ghosts and preview tops during setup/countdown
  updateLaunch(battle, showFor) {
    const arena = battle.arena;
    battle.fighters.forEach((f, i) => {
      const L = f.launch;
      const lv = this.launchers[i];
      const vis = this.visuals[i];
      const show = !L.launched && (showFor == null || showFor.includes(i));
      lv.group.visible = show; lv.arrowGroup.visible = show; lv.zone.visible = show;
      if (!show) return;
      const r = Math.hypot(L.aim.x, L.aim.z);
      const fy = arena.heightAtR(r);
      const lean = L.aim.lean;
      lv.zone.position.set(L.aim.x, fy + 0.0015, L.aim.z);
      lv.group.position.set(L.aim.x, fy + 0.045, L.aim.z);
      // tilt launcher by lean toward dir
      const axis = new THREE.Vector3(Math.sin(lean) * Math.cos(L.aim.dir), Math.cos(lean), Math.sin(lean) * Math.sin(L.aim.dir));
      lv.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      lv.arrowGroup.position.set(L.aim.x, fy + 0.006, L.aim.z);
      lv.arrowGroup.rotation.set(0, -L.aim.dir + Math.PI / 2, 0);
      lv.arrowGroup.scale.setScalar(0.6 + lean * 3);
      const charge = L.meter?.charge || 0;
      lv.glow.material.emissiveIntensity = 0.4 + charge * 2;
      // preview top hangs under the launcher
      vis.root.visible = true;
      vis.root.position.set(L.aim.x, fy + 0.03, L.aim.z);
      vis.body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      vis.tiltGroup.quaternion.copy(vis.body.quaternion);
      vis.blur.material.opacity = 0;
    });
  }

  updateBattle(battle, alpha, dt) {
    for (const v of this.visuals) {
      const f = v.fighter;
      if (!f.launch.launched) continue;
      v.root.visible = f.top.state !== 'burst' || v._burstDone !== true;
      if (v._burstDone) continue;
      v.update(f.top, alpha, dt);
      const tr = this.effects.trail(f.id, f.p.color || f.assembly.parts.ring.color);
      if (tr) {
        const spinK = Math.min(1, f.top.spinAbs / 500);
        const sp = Math.hypot(f.top.v.x, f.top.v.z);
        tr.push(v.root.position, f.top.active ? Math.min(1, sp * 1.5) * spinK : 0);
      }
      // low-spin wobble dust and scraping sparks
      if (f.top.active && f.top.scraping && Math.random() < 0.5) this.effects.grind([v.root.position.x, v.root.position.y - 0.012, v.root.position.z], 0.3, '#ffaa55');
      if (f.ability.channel && Math.random() < 0.8) this.effects.aura(v.root.position, BEAST_INDEX[f.p.beast?.id]?.colors.glow || '#ffffff', 2);
      if (f.mods.timed.some((t) => t.origin === 'ability') && Math.random() < 0.35) this.effects.aura(v.root.position, BEAST_INDEX[f.p.beast?.id]?.colors.primary || '#ffffff', 1);
    }
    if (this.settings.debug) this.drawDebug(battle);
    else if (this.debugGroup.children.length) this.debugGroup.clear();
  }

  // Physics debug overlay: contact points, normals, velocity, spin axis, COM.
  drawDebug(battle) {
    this.debugGroup.clear();
    const add = (from, dir, len, color) => {
      const a = new THREE.ArrowHelper(dir.clone().normalize(), from, Math.max(0.002, len), color, 0.006, 0.004);
      this.debugGroup.add(a);
    };
    for (const f of battle.fighters) {
      const t = f.top;
      if (!f.launch.launched) continue;
      const p = new THREE.Vector3(t.p.x, t.p.y, t.p.z);
      add(p, new THREE.Vector3(t.a.x, t.a.y, t.a.z), 0.05, '#ffff00'); // spin axis
      const L = new THREE.Vector3(t.L.x, t.L.y, t.L.z);
      add(p, L, 0.035, '#ff00ff'); // angular momentum direction
      const v = new THREE.Vector3(t.v.x, t.v.y, t.v.z);
      if (v.length() > 0.01) add(p, v, v.length() * 0.06, '#00ffff'); // velocity
      const com = new THREE.Mesh(new THREE.SphereGeometry(0.002, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3333', depthTest: false }));
      com.position.copy(p);
      this.debugGroup.add(com);
    }
    const dbg = battle.sim?.debug;
    if (dbg) {
      dbg.enabled = true;
      for (const c of dbg.contacts.slice(-40)) {
        const pt = new THREE.Vector3(...c.p);
        const n = new THREE.Vector3(...c.n);
        const col = c.type === 'top' ? '#ff4444' : c.type === 'wall' ? '#44ff44' : c.type === 'scrape' ? '#ff9900' : '#4488ff';
        add(pt, n, 0.012 + Math.min(0.04, c.l * 3), col);
      }
    }
  }

  onBattleEvent(type, e, battle) {
    const fx = this.effects;
    const colorOf = (f) => f?.p.color || f?.assembly?.parts.ring.color || '#ffffff';
    switch (type) {
      case 'launch': {
        const v = this.visuals[e.fighter.index];
        v.root.visible = true;
        v.update(e.fighter.top, 1, 0);
        this.effects.trail(e.fighter.id, colorOf(e.fighter))?.reset(v.root.position);
        fx.launchFlash(e.fighter.top.p, colorOf(e.fighter));
        break;
      }
      case 'impact':
        fx.impact(e.point, e.normal, e.impulse, colorOf(e.A), colorOf(e.B));
        this.rig.shake(Math.min(0.01, e.impulse * 0.12));
        if (e.critical) this.rig.emphasize(e.point);
        break;
      case 'grind': fx.grind(e.point, Math.min(1, e.impulse * 40)); break;
      case 'wall': fx.wall(e.point, e.impulse); if (e.impulse > 0.03) this.rig.shake(e.impulse * 0.05); break;
      case 'ability': {
        const v = this.visuals[e.fighter.index];
        if (e.beast) fx.manifestation(v.root, e.beast, e.slot === 'ultimate' ? 2.2 : 1.4, e.slot === 'ultimate' ? 0.18 : 0.12);
        break;
      }
      case 'shockwave': fx.shockwave(e.fighter.top.p, e.range, BEAST_INDEX[e.fighter.p.beast?.id]?.colors.primary || '#ffffff'); break;
      case 'counter': fx.ring([e.fighter.top.p.x, e.fighter.top.p.y, e.fighter.top.p.z], 0.02, 0.06, 0.3, '#7fffd4'); break;
      case 'technique':
        if (e.name === 'dash') fx.dustPuff(e.fighter.top.p, 8);
        if (e.name === 'guard' || e.name === 'surge') fx.ring([e.fighter.top.p.x, e.fighter.top.p.y, e.fighter.top.p.z], 0.02, 0.05, 0.4, e.name === 'guard' ? '#9ad0ff' : '#ffd36b');
        break;
      case 'topFinished': {
        const v = this.visuals[e.fighter.index];
        if (e.how === 'burst') { fx.burst(v, e.fighter.top.v); v._burstDone = true; }
        if (e.how === 'toppled' || e.how === 'stopped') fx.dustPuff(e.fighter.top.p, 20);
        break;
      }
      case 'restore': fx.ring([e.fighter.top.p.x, e.fighter.top.p.y, e.fighter.top.p.z], 0.01, 0.07, 0.6, '#ffe28a'); break;
      default:
    }
  }

  render(dt) {
    for (const v of this.visuals) {
      if (!v.assembling) continue;
      if (v.animate(dt) && v.root.visible) this.effects.ring([v.root.position.x, v.root.position.y, v.root.position.z], 0.004, 0.035, 0.22, '#ffffff');
    }
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
  }

  fps() {
    if (!this.frameTimes.length) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return 1 / Math.max(1e-4, avg);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.clearFighters();
    this.renderer.dispose();
  }
}
