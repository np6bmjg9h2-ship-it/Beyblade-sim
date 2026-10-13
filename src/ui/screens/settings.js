// Settings: gameplay, graphics, audio, controls (presets, dead zones,
// sensitivity, vibration, remapping, calibration) and accessibility.
// Everything is controller-navigable; changes apply immediately and persist.

import { STORY_DIFFICULTY } from '../../systems/story.js';
import { h, btn, selector, slider, toggle } from '../ui.js';
import { PRESETS, ACTION_LABELS, CONTEXTS, buildBindings, PAD_GLYPHS, AXIS_GLYPHS, keyGlyph, detectPadType } from '../../input/bindings.js';
import { CAMERA_NAMES } from '../../render/camera.js';

const TABS = [
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'controls', label: 'Controls' },
  { id: 'access', label: 'Accessibility' },
];

export class SettingsScreen {
  static screenName = 'SettingsScreen';
  constructor() { this.tab = 'gameplay'; }

  render() {
    const app = this.app;
    const S = app.settings;
    const commit = () => { app.applySettings(); app.saveSettings(); };
    const rows = h('div', { class: 'col gap settings-rows', 'data-wrap': '', 'data-scroll': 'settings' });
    const pct = (v) => `${Math.round(v * 100)}%`;
    switch (this.tab) {
      case 'gameplay':
        rows.append(
          toggle('Slow-motion on critical impacts', S.gameplay.slowmo, (v) => { S.gameplay.slowmo = v; commit(); }, { desc: 'Briefly slows time on very heavy collisions and finishes. The simulation itself stays fixed-step.' }),
          selector('Default camera', Object.keys(CAMERA_NAMES).filter((k) => !['launch', 'victory'].includes(k)).map((k) => ({ value: k, label: CAMERA_NAMES[k] })), S.gameplay.camera, (v) => { S.gameplay.camera = v; commit(); }, { desc: 'Camera mode at the start of each battle. Cycle in battle with ' + app.input.glyph('focus', 'battle') + '.' }),
          toggle('Advanced telemetry by default', S.gameplay.telemetry, (v) => { S.gameplay.telemetry = v; commit(); }, { desc: 'Show the detailed physics panel (energy ledger, tilt, speeds) at battle start.' }),
          slider('HUD scale', 0.8, 1.3, 0.05, S.gameplay.hudScale, (v) => { S.gameplay.hudScale = v; commit(); }, { format: pct }),
          selector('Story difficulty', Object.entries(STORY_DIFFICULTY).map(([k, d]) => ({ value: k, label: d.name, desc: d.desc })), S.gameplay.storyDifficulty || 'normal', (v) => { S.gameplay.storyDifficulty = v; commit(); }, { id: 'story-difficulty', desc: 'Scales story opponents\' launch accuracy, reaction time and steering. Physics never changes. Can be changed at any time.' }),
          toggle('Story subtitles', S.gameplay.subtitles, (v) => { S.gameplay.subtitles = v; commit(); }),
          toggle('Share play data', S.gameplay.shareData === true, (v) => { S.gameplay.shareData = v; commit(); }, { id: 'share-data', desc: app.telemetry?.available ? 'Sends battle results, builds, frame rate and errors from this browser to the game’s developer to help balance the game. No names or saves.' : 'Only works in the shared online version of the game, for players who may save data there.' }),
          slider('Dialogue text speed', 0.5, 3, 0.25, S.gameplay.dialogueSpeed, (v) => { S.gameplay.dialogueSpeed = v; commit(); }, { format: (v) => `${v.toFixed(2)}×` }),
        );
        break;
      case 'graphics':
        rows.append(
          selector('Art style', [{ value: 'ink', label: 'Anime ink' }, { value: 'realistic', label: 'Realistic' }], S.graphics.style || 'ink', (v) => { S.graphics.style = v; commit(); }, { id: 'gfx-style', desc: 'Anime ink: cel shading with ink outlines. Realistic: glossy plastic and metal lit by the stadium, with bloom on Medium and High. Realistic costs more on slow graphics chips: try Medium or Low there.' }),
          selector('Quality', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }], S.graphics.quality, (v) => { S.graphics.quality = v; commit(); }, { desc: 'Resolution scale, crowd, particle budgets and shadow resolution. In the Realistic style: High adds bloom and smooth edges, Medium keeps bloom, Low turns post-processing off.' }),
          selector('Render resolution', [1, 0.85, 0.7, 0.5].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })), S.graphics.renderScale ?? 1, (v) => { S.graphics.renderScale = v; commit(); }, { id: 'gfx-scale', desc: 'Renders the 3D scene at a lower resolution for speed on slower machines. The interface stays sharp.' }),
          selector('Frame rate cap', [{ value: 0, label: 'Unlimited (display)' }, { value: 60, label: '60 fps' }, { value: 30, label: '30 fps' }], S.graphics.fpsCap ?? 0, (v) => { S.graphics.fpsCap = v; commit(); }, { id: 'gfx-fps', desc: 'Caps rendering to save power. The physics always runs at a fixed 120 Hz step either way.' }),
          toggle('Shadows', S.graphics.shadows, (v) => { S.graphics.shadows = v; commit(); }),
          toggle('Ink outlines', S.graphics.outlines !== false, (v) => { S.graphics.outlines = v; commit(); }, { id: 'gfx-ink', desc: 'Anime-style ink lines around tops and the stadium. Turning them off saves about a third of the draw calls on slow machines.' }),
          toggle('Reduced effects', S.graphics.reducedEffects, (v) => { S.graphics.reducedEffects = v; commit(); }, { desc: 'Fewer particles, no spin trails, lighter flashes.' }),
          toggle('Show FPS', S.graphics.showFps, (v) => { S.graphics.showFps = v; commit(); }),
          toggle('Physics debug overlay', S.graphics.debugOverlay, (v) => { S.graphics.debugOverlay = v; commit(); }, { desc: 'Draws contact points, collision normals, velocity, spin axis, angular momentum and centre of mass during battles.' }),
        );
        break;
      case 'audio':
        rows.append(
          slider('Master volume', 0, 1, 0.05, S.audio.master, (v) => { S.audio.master = v; commit(); }, { format: pct }),
          slider('Effects', 0, 1, 0.05, S.audio.sfx, (v) => { S.audio.sfx = v; commit(); this.app.audio.ui('confirm'); }, { format: pct }),
          slider('Music', 0, 1, 0.05, S.audio.music, (v) => { S.audio.music = v; commit(); }, { format: pct }),
          slider('Crowd & ambience', 0, 1, 0.05, S.audio.ambience, (v) => { S.audio.ambience = v; commit(); }, { format: pct }),
          toggle('Mute all', S.audio.muted, (v) => { S.audio.muted = v; commit(); }),
        );
        break;
      case 'controls': {
        const I = app.input.settings;
        const ic = () => { Object.assign(S.input, I); commit(); };
        rows.append(
          selector('Control preset', [...Object.entries(PRESETS).map(([id, p]) => ({ value: id, label: p.name, desc: p.desc })), ...(I.preset === 'custom' ? [{ value: 'custom', label: 'Custom', desc: 'Your remapped layout.' }] : [])], I.preset, (v) => {
            if (v === 'custom') return;
            app.input.setPreset(v); I.preset = v; ic(); this.ui.toast(`Preset: ${PRESETS[v].name}`);
          }, { desc: PRESETS[I.preset]?.desc || 'Custom layout.' }),
          slider('Stick dead zone', 0.05, 0.45, 0.01, I.deadzone, (v) => { I.deadzone = v; ic(); }, { format: pct, desc: 'Radial dead zone for both sticks. Increase if your top drifts with no input.' }),
          slider('Stick sensitivity', 0.5, 2, 0.05, I.stickSensitivity, (v) => { I.stickSensitivity = v; ic(); }, { format: (v) => v.toFixed(2) + '×', desc: 'Response curve: higher reaches full steering with less stick travel.' }),
          slider('Trigger dead zone', 0, 0.4, 0.01, I.triggerDeadzone, (v) => { I.triggerDeadzone = v; ic(); }, { format: pct }),
          slider('Trigger sensitivity', 0.5, 2, 0.05, I.triggerSensitivity, (v) => { I.triggerSensitivity = v; ic(); }, { format: (v) => v.toFixed(2) + '×', desc: 'Analog charge speed scales with trigger pressure.' }),
          slider('Camera sensitivity', 0.3, 2.5, 0.05, I.cameraSensitivity, (v) => { I.cameraSensitivity = v; ic(); }, { format: (v) => v.toFixed(2) + '×' }),
          toggle('Invert camera Y', I.invertCameraY, (v) => { I.invertCameraY = v; ic(); }),
          toggle('Vibration', I.vibration, (v) => { I.vibration = v; ic(); if (v) app.input.rumble(0.6, 0.6, 200); }),
          slider('Vibration strength', 0, 1, 0.05, I.vibrationStrength, (v) => { I.vibrationStrength = v; ic(); app.input.rumble(0.6, 0.6, 120); }, { format: pct }),
          selector('Keyboard launch release', [{ value: true, label: 'Let go of Space' }, { value: false, label: 'Press Release key' }], I.keyboardReleaseOnKeyUp, (v) => { I.keyboardReleaseOnKeyUp = v; ic(); }, { desc: 'With the keyboard, launch by letting go of the charge key, or by pressing the release key (J / Enter).' }),
          btn('Remap controls…', () => this.ui.push(new RemapScreen()), { desc: 'Rebind any action for keyboard or controller, per context (menus, launch, battle).' }),
          btn('Controller calibration…', () => this.ui.push(new CalibrationScreen()), { desc: 'Live view of sticks, triggers and buttons; test dead zones and vibration.' }),
        );
        break;
      }
      case 'access':
        rows.append(
          toggle('High-contrast UI', S.gameplay.highContrast, (v) => { S.gameplay.highContrast = v; commit(); }),
          toggle('Colour-blind friendly meters', S.gameplay.colorblind, (v) => { S.gameplay.colorblind = v; commit(); }, { desc: 'Uses blue/orange instead of green/red and adds patterns to critical meters.' }),
          toggle('Reduced effects', S.graphics.reducedEffects, (v) => { S.graphics.reducedEffects = v; commit(); }, { desc: 'Fewer particles and flashes, and no freeze-frame on heavy hits. Finish callouts and sounds stay.' }),
          toggle('Slow-motion on impacts', S.gameplay.slowmo, (v) => { S.gameplay.slowmo = v; commit(); }),
        );
        break;
      default:
    }
    return h('div', { class: 'std-screen' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Settings'), this.tabs()),
      h('div', { class: 'panel settings-panel' }, rows));
  }

  tabs() {
    return h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => { this.tab = t.id; this.ui.refresh(this); } }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next')));
  }

  onTab(d) {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.tab = TABS[(i + d + TABS.length) % TABS.length].id;
    this.ui.refresh(this);
    return true;
  }

  prompts() { return [['nav_left', 'Adjust'], ['confirm', 'Select'], ['tab_prev', 'Tabs'], ['back', 'Back']]; }
}

// ------------------------------------------------------------ remapping

export class RemapScreen {
  static screenName = 'RemapScreen';
  constructor() { this.ctx = 'battle'; this.capturing = null; }

  render() {
    const app = this.app;
    const B = app.input.bindings[this.ctx];
    const list = h('div', { class: 'col remap-list', 'data-wrap': '', 'data-scroll': 'remap' });
    for (const [action, label] of Object.entries(ACTION_LABELS[this.ctx])) {
      const bind = B[action];
      if (!bind) continue;
      const keyStr = bind.axis ? `${keyGlyph(bind.neg?.[0])} / ${keyGlyph(bind.pos?.[0])}` : (bind.keys || []).map(keyGlyph).join(', ') || '—';
      const padType = app.input.lastDevice.padType || 'xbox';
      const padStr = (bind.pad || []).map((p) => p.button != null ? (PAD_GLYPHS[padType] || PAD_GLYPHS.generic)[p.button] : p.axis != null ? AXIS_GLYPHS[p.axis] + (p.dir ? (p.dir > 0 ? '+' : '−') : '') : '?').join(', ') || '—';
      const capturingThis = this.capturing?.action === action;
      const row = h('div', { class: 'remap-row' },
        h('span', { class: 'remap-label' }, label),
        btn(capturingThis && this.capturing.kind === 'key' ? 'Press a key…' : keyStr, () => this.capture(action, 'key'), { class: 'remap-btn', desc: bind.axis ? 'Axis action: press the key for the negative direction, then the positive.' : 'Rebind keyboard key.' }),
        btn(capturingThis && this.capturing.kind !== 'key' ? 'Press a button…' : padStr, () => this.capture(action, bind.axis ? 'axis' : 'pad'), { class: 'remap-btn', desc: bind.axis ? 'Move a stick to rebind this axis.' : 'Rebind controller button.' }));
      list.append(row);
    }
    return h('div', { class: 'std-screen' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Remap Controls'),
        h('div', { class: 'tabbar' }, h('kbd', {}, app.input.glyph('tab_prev')), CONTEXTS.map((c) => h('div', { class: 'tab' + (c === this.ctx ? ' active' : ''), onclick: () => { this.ctx = c; this.ui.refresh(this); } }, c === 'menu' ? 'Menus' : c === 'launch' ? 'Launch' : 'Battle')), h('kbd', {}, app.input.glyph('tab_next')))),
      h('div', { class: 'panel' }, list, h('div', { class: 'row gap' }, btn('Reset to Competitive defaults', () => this.reset(), { desc: 'Discard custom bindings.' }))));
  }

  async capture(action, kind) {
    const app = this.app;
    this.capturing = { action, kind };
    this.ui.refresh(this);
    const bind = app.input.bindings[this.ctx][action];
    const res = await app.input.captureNext(kind === 'key' ? 'key' : kind);
    if (res) {
      if (kind === 'key') {
        if (bind.axis) {
          bind.neg = [res.key];
          this.ui.toast('Now press the key for the positive direction');
          const res2 = await app.input.captureNext('key');
          if (res2) bind.pos = [res2.key];
        } else bind.keys = [res.key];
      } else if (kind === 'axis' && res.axis != null) {
        bind.pad = [{ axis: res.axis }];
      } else if (kind === 'pad' && res.button != null) {
        bind.pad = [{ button: res.button }];
      }
      app.input.settings.preset = 'custom';
      app.input.setBindings(app.input.bindings);
      await app.saveSettings();
      this.ui.toast('Binding updated.', 'good');
    }
    this.capturing = null;
    app.input.consumeAll();
    this.ui.refresh(this);
  }

  async reset() {
    const ok = await this.ui.confirm('Reset bindings?', 'All custom bindings will be replaced with the Competitive preset.', { yes: 'Reset', danger: true });
    if (!ok) return;
    this.app.input.setPreset('competitive');
    this.app.input.settings.preset = 'competitive';
    await this.app.saveSettings();
    this.ui.refresh(this);
  }

  onTab(d) {
    const i = CONTEXTS.indexOf(this.ctx);
    this.ctx = CONTEXTS[(i + d + CONTEXTS.length) % CONTEXTS.length];
    this.ui.refresh(this);
    return true;
  }

  onBack() { if (this.capturing) { this.app.input.cancelCapture(); return true; } this.ui.pop(); return true; }
  get captureNav() { return !!this.capturing; }
  prompts() { return this.capturing ? [['back', 'Cancel']] : [['confirm', 'Rebind'], ['tab_prev', 'Context'], ['back', 'Back']]; }
}

// ------------------------------------------------------------ calibration

export class CalibrationScreen {
  static screenName = 'CalibrationScreen';
  render() {
    this.canvas = h('canvas', { width: 720, height: 300, class: 'calib-canvas' });
    this.info = h('div', { class: 'muted' });
    return h('div', { class: 'std-screen' }, h('div', { class: 'screen-head' }, h('h1', {}, 'Controller Calibration')),
      h('div', { class: 'panel' }, this.info, this.canvas,
        h('div', { class: 'row gap' },
          btn('Test vibration', () => this.app.input.rumble(0.8, 0.8, 400), { desc: 'Plays a strong rumble if your controller and browser support it.' }),
          slider('Stick dead zone', 0.05, 0.45, 0.01, this.app.input.settings.deadzone, (v) => { this.app.input.settings.deadzone = v; this.app.settings.input.deadzone = v; this.app.saveSettings(); }, { format: (v) => `${Math.round(v * 100)}%` })),
        h('p', { class: 'muted' }, 'Move both sticks in full circles and squeeze the triggers. The grey circle is the dead zone; the green dot is the shaped input the game uses.')));
  }

  update() {
    const c = this.canvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const pads = this.app.input.pads;
    if (!pads.length) { this.info.textContent = 'No controller detected. Connect one and press any button.'; return; }
    const p = pads[0];
    this.info.textContent = p.nonStandard
      ? `${p.id} — non-standard controller, translated using the ${p.layout === 'sony' ? 'PlayStation (DirectInput)' : 'generic'} layout. If a button below lights the wrong label, remap it in Controls.`
      : `${p.id} — detected as ${detectPadType(p.id)} layout, standard mapping`;
    const dz = this.app.input.settings.deadzone;
    const drawStick = (cx, cy, rx, ry, sx, sy, label) => {
      ctx.strokeStyle = '#3a4a66'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff18'; ctx.beginPath(); ctx.arc(cx, cy, 70 * dz, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8a5a'; ctx.beginPath(); ctx.arc(cx + rx * 70, cy + ry * 70, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5aff9a'; ctx.beginPath(); ctx.arc(cx + sx * 70, cy + sy * 70, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9ab'; ctx.font = '12px sans-serif'; ctx.fillText(`${label} raw ${rx.toFixed(2)}, ${ry.toFixed(2)}`, cx - 70, cy + 92);
    };
    const a = p.axes;
    const s = p._shapedAxes || [0, 0, 0, 0];
    drawStick(100, 120, a[0] || 0, a[1] || 0, s[0], s[1], 'LS');
    drawStick(300, 120, a[2] || 0, a[3] || 0, s[2], s[3], 'RS');
    const g = PAD_GLYPHS[detectPadType(p.id)] || PAD_GLYPHS.generic;
    for (const [i, x] of [[6, 420], [7, 470]]) {
      const v = p.buttons[i]?.value ?? 0;
      ctx.strokeStyle = '#3a4a66'; ctx.strokeRect(x, 40, 30, 150);
      ctx.fillStyle = '#4fc3ff'; ctx.fillRect(x, 40 + 150 * (1 - v), 30, 150 * v);
      ctx.fillStyle = '#9ab'; ctx.fillText(g[i], x + 4, 210);
    }
    let x = 530, y = 40;
    p.buttons.forEach((b, i) => {
      if (i === 6 || i === 7) return;
      ctx.fillStyle = b.pressed ? '#ffd84d' : '#22304a';
      ctx.fillRect(x, y, 52, 24);
      ctx.fillStyle = b.pressed ? '#000' : '#9ab';
      ctx.fillText(g[i] ?? `B${i}`, x + 6, y + 16);
      y += 28; if (y > 250) { y = 40; x += 60; }
    });
  }

  prompts() { return [['back', 'Back']]; }
}
