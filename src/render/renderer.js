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
import { INK_LAYER, setInkResolution, setSpecBoost, disposeTree, toonMaterial, inked, setRenderStyle, renderStyle, setMaterialContext } from './toon.js';
import { createLights, TONE, TONE_REAL, styleLights } from './lighting.js';
import { arenaEnvironment, loadHallPanorama, loadCrowdSprite, crowdSpriteNow } from './environment.js';
import { PostFX } from './post.js';
import { InspectStage } from './inspect.js';
import { Arena } from '../physics/arena.js';

export class GameRenderer {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.settings = { quality: 'high', shadows: true, reducedEffects: false, debug: false, style: 'ink', ...settings };
    setRenderStyle(this.settings.style);
    // The canvas is multisampled only when nothing post-processes it: the
    // realistic style renders into its own multisampled target, so a
    // multisampled canvas would smooth the edges a second time for nothing.
    // Antialiasing can't be changed after this, so a style change later that
    // needs smooth edges gets them from a light pass instead (needsPost).
    this.canvasAA = this.settings.quality !== 'low' && this.settings.style !== 'realistic';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.canvasAA, powerPreference: 'high-performance' });
    // count every pass of a frame, not only the last (reset in render())
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the saturated cel palette from washing out
    this.renderer.toneMapping = TONE.mapping;
    this.renderer.toneMappingExposure = TONE.exposure;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.005, 30);
    this.rig = new CameraRig(this.camera);
    const L = createLights(this.scene);
    Object.assign(this, { hemi: L.hemi, key: L.key, rimA: L.rimA, rimB: L.rimB, spot: L.spot });
    this.lights = L;
    this.env = null;
    this.post = null;
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

  get realistic() { return renderStyle() === 'realistic'; }

  applyQuality() {
    const q = this.settings.quality;
    const T = this.realistic ? TONE_REAL : TONE;
    this.renderer.toneMapping = T.mapping;
    this.renderer.toneMappingExposure = T.exposure;
    styleLights(this.lights || { hemi: this.hemi, key: this.key, rimA: this.rimA, rimB: this.rimB, spot: this.spot }, renderStyle());
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1) * (this.settings.renderScale || 1);
    this.renderer.setPixelRatio(Math.max(0.35, dpr));
    this.renderer.shadowMap.enabled = !!this.settings.shadows && q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.key) {
      this.key.castShadow = this.renderer.shadowMap.enabled;
      const s = q === 'high' ? 2048 : 1024;
      this.key.shadow.mapSize.set(s, s);
    }
    // ink outlines live on their own layer (the realistic style draws none)
    const ink = this.settings.outlines !== false && !this.realistic;
    if (ink) this.camera.layers.enable(INK_LAYER); else this.camera.layers.disable(INK_LAYER);
    setSpecBoost(q === 'low' ? 0.7 : 1);
    setInkResolution(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight, this.renderer.getPixelRatio());
  }

  setSettings(s) {
    const prevQ = this.settings.quality, prevStyle = this.settings.style;
    Object.assign(this.settings, s);
    const styleChanged = (this.settings.style || 'ink') !== (prevStyle || 'ink');
    if (styleChanged) setRenderStyle(this.settings.style);
    this.applyQuality();
    if (this.effects) this.effects.setQuality(this.effectQuality());
    if ((prevQ !== this.settings.quality || styleChanged) && this.arenaDef) this.setArena(this.arenaDef);
    if (styleChanged && this.fighters) this.setFighters(this.fighters);
    const wantPost = this.needsPost();
    if (wantPost !== !!this.post || (wantPost && (styleChanged || prevQ !== this.settings.quality))) this.buildPost();
    // render scale changes the pixel ratio: the composer and ink lines follow
    this.resize();
  }

  // Post-processing: the realistic style above Low quality, or just smooth
  // edges when the canvas was created without them (style changed since).
  needsPost() { return this.settings.quality !== 'low' && (this.realistic || !this.canvasAA); }

  buildPost() {
    this.post?.dispose();
    this.post = null;
    if (!this.needsPost()) return;
    this.post = this.realistic
      ? new PostFX(this.renderer, this.scene, this.camera, { quality: this.settings.quality })
      : new PostFX(this.renderer, this.scene, this.camera, { quality: 'high', bloom: false });
  }

  // What the graphics chip did for the last frame (debug panel).
  renderStats() {
    const i = this.renderer.info, px = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, width: px.x, height: px.y, post: !!this.post };
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    setInkResolution(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.inspect?.resize(w, h);
  }

  // ------------------------------------------------------------ inspect view

  // Switch rendering to the turntable showroom (the main scene keeps running).
  openInspect() {
    if (!this.inspect) this.inspect = new InspectStage();
    this.inspectActive = true;
    this.resize();
    return this.inspect;
  }

  closeInspect() {
    this.inspectActive = false;
    this.inspect?.clear();
  }

  setArena(def) {
    if (this.arenaObj) {
      this.scene.remove(this.arenaObj.group);
      disposeTree(this.arenaObj.group);
    }
    this.arenaDef = def;
    setMaterialContext('arena');
    this.arenaObj = buildArena(def, this.settings.quality);
    setMaterialContext('top');
    const floor = new Arena(def);
    this.effects.spirits.floorAt = (x, z) => floor.heightAtR(Math.hypot(x, z));
    this.scene.add(this.arenaObj.group);
    this.env?.dispose();
    this.env = null;
    if (this.realistic) {
      // image-based lighting from a procedural hall in the stadium's colours
      this.env = arenaEnvironment(this.renderer, def.theme);
      this.scene.environment = this.env.texture;
      this.scene.background = this.env.texture;
      this.scene.backgroundBlurriness = 0.45;
      this.scene.backgroundIntensity = 0.5;
      this.scene.environmentIntensity = 0.85;
      this.scene.fog = new THREE.Fog(def.theme.fog, 2.2, 7);
      // the stands get the Blender-rendered crowd once it has decoded
      if (!crowdSpriteNow()) loadCrowdSprite().then((img) => { if (img && this.realistic && this.arenaDef === def) this.setArena(def); });
      // upgrade to the Blender-rendered hall once its panorama has decoded
      const token = this._envToken = {};
      loadHallPanorama().then((pano) => {
        if (!pano || this._envToken !== token || !this.realistic) return;
        this.env?.dispose();
        this.env = arenaEnvironment(this.renderer, def.theme, pano);
        this.scene.environment = this.env.texture;
        this.scene.background = pano;
        this.scene.backgroundBlurriness = 0.03;
        this.scene.backgroundIntensity = 0.8;
      });
    } else {
      this._envToken = null;
      this.scene.environment = null;
      this.scene.background = new THREE.Color(def.theme.sky);
      this.scene.fog = new THREE.Fog(def.theme.fog, 1.4, 4.5);
    }
    if (!this.post && this.needsPost()) this.buildPost();
    this.rimA.color.set(def.theme.accent);
    this.rimB.color.set(def.theme.ring);
    this.effects.spirits.warmup(this.renderer, this.scene, this.camera);
  }

  // ------------------------------------------------------------ battle

  clearFighters() {
    for (const v of this.visuals) { this.scene.remove(v.root); v.dispose(); }
    for (const l of this.launchers) { for (const o of [l.group, l.arrowGroup, l.zone]) { this.scene.remove(o); disposeTree(o); } }
    this.visuals = [];
    this.launchers = [];
    this.effects.clearTransient();
  }

  setFighters(fighters) {
    this.clearFighters();
    this.fighters = fighters;
    for (const f of fighters) {
      const v = new TopVisual(f.assembly, { color: f.p.color || f.assembly.parts.ring.color, beast: f.p.beast?.id, quality: this.settings.quality });
      v.root.visible = false;
      v.fighter = f;
      v.playAssemble();
      this.scene.add(v.root);
      this.visuals.push(v);
      this.launchers.push(this.makeLauncher(f.p.color || f.assembly.parts.ring.color));
    }
    // build and upload both battlers' spirits now, so a summon never stalls mid-battle
    const beasts = fighters.map((f) => BEAST_INDEX[f.p.beast?.id]).filter(Boolean);
    if (beasts.length) this.effects.spirits.preload(beasts, this.renderer, this.scene, this.camera);
  }

  // Launcher ghost: a cel-shaded ripcord launcher with a glowing ring
  // in the battler's colour.
  makeLauncher(color) {
    const group = new THREE.Group();
    const body = toonMaterial('#2b3150', { finish: 'gloss' });
    const trim = toonMaterial('#e8edf7', { finish: 'metal' });
    const accent = new THREE.MeshBasicMaterial({ color });
    const housing = inked(new THREE.TorusGeometry(0.03, 0.005, 10, 40), body, { px: 2 });
    housing.rotation.x = Math.PI / 2;
    group.add(housing);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0016, 6, 40), accent);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.005;
    glow.userData.noInk = true;
    group.add(glow);
    const handle = inked(new THREE.BoxGeometry(0.012, 0.01, 0.062), body, { px: 2 });
    handle.position.set(0, 0.012, 0.056);
    group.add(handle);
    const grip = inked(new THREE.CylinderGeometry(0.006, 0.006, 0.028, 12), trim, { px: 1.5 });
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.012, 0.09);
    group.add(grip);
    for (const s of [-1, 1]) {
      const fin = inked(new THREE.BoxGeometry(0.004, 0.012, 0.018), trim, { px: 1.5 });
      fin.position.set(s * 0.027, 0.006, 0.02);
      group.add(fin);
    }
    // aim arrow
    const arrowGeo = new THREE.ConeGeometry(0.006, 0.02, 8);
    arrowGeo.rotateX(Math.PI / 2);
    const arrow = inked(arrowGeo, toonMaterial(color, { finish: 'gloss', emissive: color, emissiveIntensity: 0.4 }), { px: 1.5 });
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
      lv.glow.scale.setScalar(1 + charge * 0.12);
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
      // destabilisation: pulse while the top is past the same CRITICAL line the HUD shows
      const t = f.top;
      if (t.active && (t.scraping || t.tilt > 0.38 || t.spinAbs < 1.4 * f.assembly.summary.critSpin)) {
        v._wobbleT = (v._wobbleT || 0) + dt;
        if (v._wobbleT > 0.3) { v._wobbleT = 0; this.effects.wobble(v.root.position); }
      } else v._wobbleT = 0.3;
      // low-spin wobble dust and scraping sparks
      if (f.top.active && f.top.scraping && Math.random() < 0.5) this.effects.grind([v.root.position.x, v.root.position.y - 0.012, v.root.position.z], 0.3, '#ffaa55');
      if (f.ability.channel && Math.random() < 0.8) this.effects.aura(v.root.position, BEAST_INDEX[f.p.beast?.id]?.colors.glow || '#ffffff', 2);
      if (f.mods.timed.some((t) => t.origin === 'ability') && Math.random() < 0.35) this.effects.aura(v.root.position, BEAST_INDEX[f.p.beast?.id]?.colors.primary || '#ffffff', 1);
    }
    if (this.settings.debug) this.drawDebug(battle);
    else this.hideDebug();
  }

  // Physics debug overlay: contact points, normals, velocity, spin axis, COM.
  // Arrows and markers are pooled and reused every frame (no per-frame GPU allocations).
  drawDebug(battle) {
    const D = this._debug || (this._debug = {
      arrows: [], coms: [], comGeo: new THREE.SphereGeometry(0.002, 8, 6),
      comMat: new THREE.MeshBasicMaterial({ color: '#ff3333', depthTest: false }),
      from: new THREE.Vector3(), dir: new THREE.Vector3(),
    });
    let nArrows = 0, nComs = 0;
    const add = (len, color) => {
      let a = D.arrows[nArrows++];
      if (!a) { a = new THREE.ArrowHelper(); D.arrows.push(a); this.debugGroup.add(a); }
      a.visible = true;
      a.position.copy(D.from);
      a.setDirection(D.dir.normalize());
      a.setLength(Math.max(0.002, len), 0.006, 0.004);
      a.setColor(color);
    };
    for (const f of battle.fighters) {
      const t = f.top;
      if (!f.launch.launched) continue;
      D.from.set(t.p.x, t.p.y, t.p.z);
      D.dir.set(t.a.x, t.a.y, t.a.z); add(0.05, '#ffff00'); // spin axis
      D.dir.set(t.L.x, t.L.y, t.L.z); add(0.035, '#ff00ff'); // angular momentum direction
      const sp = t.v.length();
      if (sp > 0.01) { D.dir.set(t.v.x, t.v.y, t.v.z); add(sp * 0.06, '#00ffff'); } // velocity
      let com = D.coms[nComs++];
      if (!com) { com = new THREE.Mesh(D.comGeo, D.comMat); D.coms.push(com); this.debugGroup.add(com); }
      com.visible = true;
      com.position.copy(D.from);
    }
    const dbg = battle.sim?.debug;
    if (dbg) {
      dbg.enabled = true;
      const cs = dbg.contacts;
      for (let i = Math.max(0, cs.length - 40); i < cs.length; i++) {
        const c = cs[i];
        D.from.fromArray(c.p); D.dir.fromArray(c.n);
        add(0.012 + Math.min(0.04, c.l * 3), c.type === 'top' ? '#ff4444' : c.type === 'wall' ? '#44ff44' : c.type === 'scrape' ? '#ff9900' : '#4488ff');
      }
    }
    for (let i = nArrows; i < D.arrows.length; i++) D.arrows[i].visible = false;
    for (let i = nComs; i < D.coms.length; i++) D.coms[i].visible = false;
  }

  hideDebug() {
    for (const o of this.debugGroup.children) o.visible = false;
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
        fx.impact(e.point, e.normal, e.impulse, colorOf(e.A), colorOf(e.B), e.glance, e.tangent);
        this.rig.shake(Math.min(0.01, e.impulse * 0.12));
        if (e.critical) this.rig.emphasize(e.point);
        break;
      case 'grind': fx.grind(e.point, Math.min(1, e.impulse * 40)); break;
      case 'wall': fx.wall(e.point, e.impulse); if (e.impulse > 0.03) this.rig.shake(e.impulse * 0.05); break;
      case 'ability': {
        const v = this.visuals[e.fighter.index];
        if (e.beast) fx.manifestation(v.root, e.beast, e.slot === 'ultimate' ? 2.2 : 1.4, e.slot === 'ultimate' ? 0.2 : 0.13, this.visuals[1 - e.fighter.index]?.root);
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
        if (e.how === 'out') { fx.knockout(e.fighter.top.p, colorOf(e.fighter)); this.rig.shake(0.012); this.rig.emphasize([e.fighter.top.p.x, e.fighter.top.p.y, e.fighter.top.p.z]); }
        break;
      }
      case 'restore': fx.ring([e.fighter.top.p.x, e.fighter.top.p.y, e.fighter.top.p.z], 0.01, 0.07, 0.6, '#ffe28a'); break;
      // Rift Run: statuses, fusions, sweet spots, Second Wind
      case 'riftStatus': { const p = e.fighter.top.p; fx.ring([p.x, p.y, p.z], 0.015, 0.05, 0.45, e.color); fx.aura(p, e.color, 12); break; }
      case 'riftFusion': { const p = e.fighter.top.p; fx.ring([p.x, p.y, p.z], 0.02, 0.09, 0.6, e.color); fx.aura(p, e.color, 30); this.rig.shake(0.006); break; }
      case 'sweetSpot': { const p = e.fighter.top.p; fx.ring([p.x, p.y, p.z], 0.01, 0.06, 0.35, '#fff27a'); break; }
      case 'meltdownHit': { const p = e.fighter.top.p; fx.ring([p.x, p.y, p.z], 0.015, 0.08, 0.5, '#ff8a3d'); this.rig.shake(0.008); break; }
      case 'secondWind': { const p = e.fighter.top.p; fx.ring([p.x, p.y, p.z], 0.01, 0.08, 0.7, '#7fe3a8'); fx.aura(p, '#7fe3a8', 20); break; }
      case 'mechanism': {
        const p = e.fighter.top.p;
        if (e.kind === 'clutch') { fx.ring([p.x, p.y, p.z], 0.012, 0.085, 0.5, '#ffe14d'); fx.aura(p, '#ffb21e', 24); this.rig.shake(0.004); }
        else if (e.kind === 'shift') fx.ring([p.x, p.y, p.z], 0.01, 0.045, 0.35, '#9fe8ff');
        else if (e.kind === 'springHop') fx.ring([p.x, p.y - 0.01, p.z], 0.008, 0.035, 0.25, '#b6ff8a');
        break;
      }
      default:
    }
  }

  render(dt, frameTime = dt) {
    this.renderer.info.reset();
    if (this.inspectActive) {
      this.inspect.update(dt);
      this.inspect.setStyle?.(this.renderer, renderStyle());
      this.renderer.render(this.inspect.scene, this.inspect.camera);
      this.frameTimes.push(frameTime);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
      return;
    }
    for (const v of this.visuals) {
      if (!v.assembling) continue;
      if (v.animate(dt) && v.root.visible) this.effects.ring([v.root.position.x, v.root.position.y, v.root.position.z], 0.004, 0.035, 0.22, '#ffffff');
    }
    this.effects.update(dt);
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
  }

  // The graphics chip's name, for play data (the debug extension when offered).
  gpuName() {
    try {
      const gl = this.renderer.getContext();
      const x = gl.getExtension('WEBGL_debug_renderer_info');
      return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 120);
    } catch { return null; }
  }

  fps() {
    if (!this.frameTimes.length) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return 1 / Math.max(1e-4, avg);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.clearFighters();
    this.inspect?.dispose();
    if (this._debug) {
      for (const a of this._debug.arrows) a.dispose();
      this._debug.comGeo.dispose();
      this._debug.comMat.dispose();
    }
    this.renderer.dispose();
  }
}
