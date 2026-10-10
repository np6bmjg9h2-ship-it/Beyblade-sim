// Application shell: owns input, audio, renderer, UI, saves and the active
// profile; runs the frame loop (input poll -> UI/screen update -> render).
// While menus are open, an AI exhibition match plays behind them.

import { InputManager } from './input/inputManager.js';
import { buildBindings } from './input/bindings.js';
import { AudioEngine } from './audio/audio.js';
import { GameRenderer } from './render/renderer.js';
import { UI } from './ui/ui.js';
import { SaveManager } from './systems/save.js';
import { defaultSettings, normalizeProfile } from './systems/profile.js';
import { Battle } from './game/battle.js';
import { ARCHETYPES, participantFromDef } from './data/opponents.js';
import { ARENA_INDEX } from './data/arenas.js';
import { Rng } from './core/rng.js';
import { TitleScreen } from './ui/screens/title.js';
import { processMatch } from './systems/progression.js';
import { TournamentRunner } from './game/tournamentRunner.js';

export class App {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#scene');
    this.uiRoot = root.querySelector('#ui');
    this.profile = null;
    this.slot = null;
    this.sceneMode = 'showcase';
    this.showcase = null;
    this.last = 0;
    this.playtimeAcc = 0;
    this.autosaveT = 0;
    this.rng = new Rng(Date.now());
  }

  async init() {
    this.saves = await SaveManager.create();
    const gs = await this.saves.globalSettings().catch(() => null);
    this.settings = gs ? mergeSettings(gs) : defaultSettings();
    this.input = new InputManager({ settings: this.settings.input, bindings: this.settings.bindings || buildBindings(this.settings.input.preset) });
    this.audio = new AudioEngine(this.settings.audio);
    try {
      this.renderer = new GameRenderer(this.canvas, this.settings.graphics);
    } catch (e) {
      console.error(e);
      this.uiRoot.innerHTML = '<div class="fatal">WebGL is not available in this browser. Chaos Spin needs WebGL (Chrome recommended).</div>';
      throw e;
    }
    this.ui = new UI(this, this.uiRoot);
    this.tournaments = new TournamentRunner(this);
    // audio needs a user gesture
    const unlock = () => { this.audio.unlock(); if (this.sceneMode === 'showcase') this.audio.playMusic('menu'); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    this.input.on('padConnected', (e) => { this.ui.toast(`Controller connected (${e.type === 'playstation' ? 'PlayStation' : e.type === 'xbox' ? 'Xbox' : e.type === 'nintendo' ? 'Nintendo' : 'Generic'})`, 'good'); unlock(); });
    this.input.on('padNonStandard', () => {
      this.ui.toast('This controller reports a non-standard layout. If buttons feel wrong, check Settings → Controls → Controller calibration and remap.', 'warn', 6000);
    });
    this.input.on('padDisconnected', () => {
      this.ui.toast('Controller disconnected — game paused. Reconnect or use the keyboard.', 'warn', 4000);
      this.ui.current?.onControllerLost?.();
    });
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    this.root.appendChild(this.fpsEl);
    this.applySettings();
    this.startShowcase();
    this.ui.show(new TitleScreen());
    requestAnimationFrame((t) => this.frame(t));
    window.__app = this;
    return this;
  }

  // ------------------------------------------------------------ settings

  applySettings() {
    const s = this.settings;
    this.audio.setSettings(s.audio);
    Object.assign(this.input.settings, s.input);
    this.renderer.setSettings(s.graphics);
    this.renderer.rig.sensitivity = s.input.cameraSensitivity;
    this.renderer.rig.invertY = s.input.invertCameraY;
    this.root.classList.toggle('high-contrast', !!s.gameplay.highContrast);
    this.root.classList.toggle('colorblind', !!s.gameplay.colorblind);
    this.root.style.setProperty('--hud-scale', s.gameplay.hudScale);
    this.fpsEl && (this.fpsEl.style.display = s.graphics.showFps ? 'block' : 'none');
  }

  async saveSettings() {
    this.settings.bindings = this.input.bindings;
    this.settings.input = { ...this.input.settings };
    await this.saves.setGlobalSettings(this.settings).catch((e) => console.warn(e));
  }

  // ------------------------------------------------------------ profile

  setProfile(profile, slot) {
    this.profile = normalizeProfile(profile);
    this.slot = slot;
    this.tournaments?.reset();
  }

  async save(reason = 'manual') {
    if (!this.profile || !this.slot) return false;
    try {
      await this.saves.save(this.slot, this.profile);
      if (reason !== 'silent') this.flashSaved();
      return true;
    } catch (e) {
      console.error(e);
      this.ui.toast('Save failed: ' + e.message, 'bad', 5000);
      return false;
    }
  }

  // Apply a finished match to the active profile and autosave (safe point).
  async processMatch(result, session, battle) {
    if (!this.profile || session.noRewards) return null;
    const rw = processMatch(this.profile, result, session, battle);
    await this.save('silent');
    if (rw?.items?.length) this.audio.ui('loot');
    if (rw?.levelUps) this.audio.ui('levelup');
    return rw;
  }

  flashSaved() {
    let el = this.root.querySelector('.save-indicator');
    if (!el) { el = document.createElement('div'); el.className = 'save-indicator'; el.textContent = 'Saving…'; this.root.appendChild(el); }
    el.classList.add('show');
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => el.classList.remove('show'), 1200);
  }

  // ------------------------------------------------------------ background exhibition

  startShowcase() {
    this.sceneMode = 'showcase';
    const pick = () => this.rng.pick(ARCHETYPES);
    const a = pick(); let b = pick();
    while (b === a) b = pick();
    const arenas = ['standard', 'vortex', 'edgebreaker', 'crystal'];
    const arenaId = this.rng.pick(arenas);
    const battle = new Battle({ arenaId, format: 'single', seed: this.rng.nextU32(), rules: { slowmo: false }, participants: [participantFromDef(a, { difficulty: 1 }), participantFromDef(b, { difficulty: 1 })], mode: 'exhibition' });
    battle.autoAdvance = true;
    this.showcase = battle;
    this.renderer.setArena(ARENA_INDEX[arenaId]);
    this.renderer.rig.override = 'showcase';
    battle.on('roundStart', () => this.renderer.setFighters(battle.fighters));
    battle.on('*', (type, e) => this.renderer.onBattleEvent(type, e, battle));
    battle.on('matchEnd', () => { this._showcaseRestart = 2.5; });
    this._showcaseRestart = 0;
  }

  stopShowcase() {
    this.showcase = null;
    this.renderer.clearFighters();
  }

  updateShowcase(dt) {
    const b = this.showcase;
    if (!b) return;
    if (this._showcaseRestart > 0) {
      this._showcaseRestart -= dt;
      if (this._showcaseRestart <= 0) this.startShowcase();
    }
    b.update(dt, []);
    if (b.phase === 'setup') for (const f of b.fighters) b.confirmSetup(f.index);
    if (b.sim) {
      const alpha = Math.min(1, b.acc / (1 / 120));
      this.renderer.updateLaunch(b);
      this.renderer.updateBattle(b, alpha, dt);
    }
    this.renderer.rig.update(dt, { tops: this.renderer.visuals.map((v) => v.root), arenaRadius: b.arena.radius });
  }

  // ------------------------------------------------------------ frame loop

  frame(t) {
    // optional frame-rate cap (the simulation step is fixed regardless)
    const cap = this.settings.graphics.fpsCap;
    if (cap && this.last && t - this.last < 1000 / cap - 2) { requestAnimationFrame((tt) => this.frame(tt)); return; }
    // the game steps at most 0.1 s per frame; the fps readout uses the real frame time
    const frameTime = this.last ? (t - this.last) / 1000 : 1 / 60;
    const dt = Math.min(0.1, frameTime);
    this.last = t;
    try {
      this.input.poll(dt);
      this.ui.update(dt);
      if (this.sceneMode === 'showcase') this.updateShowcase(dt);
      this.renderer.render(dt, frameTime);
      if (this.profile) {
        this.profile.playtime += dt;
        this.autosaveT += dt;
      }
      if (this.settings.graphics.showFps) this.fpsEl.textContent = `${this.renderer.fps().toFixed(0)} fps`;
    } catch (e) {
      console.error(e);
      if (!this._errShown) { this._errShown = true; this.ui?.toast('Error: ' + e.message, 'bad', 6000); }
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }
}

function mergeSettings(gs) {
  const d = defaultSettings();
  for (const k of Object.keys(d)) {
    if (k === 'bindings') { d.bindings = gs.bindings || null; continue; }
    d[k] = { ...d[k], ...(gs[k] || {}) };
  }
  return d;
}
