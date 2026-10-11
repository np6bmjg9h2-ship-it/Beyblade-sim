// Input abstraction. Gameplay and UI query named actions per context; this
// class resolves them from keyboard events and the Gamepad API every frame,
// applying dead zones, sensitivity curves, trigger thresholds, menu
// auto-repeat, device tracking (for button prompts), rumble, connection
// handling and capture-based remapping.

import { Emitter } from '../core/events.js';
import { buildBindings, presetReleaseMode, detectPadType, PAD_GLYPHS, AXIS_GLYPHS, keyGlyph } from './bindings.js';
import { normalizePad } from './padLayouts.js';

export const DEFAULT_INPUT_SETTINGS = {
  preset: 'competitive',
  deadzone: 0.18,
  stickSensitivity: 1.0,
  triggerDeadzone: 0.06,
  triggerSensitivity: 1.0,
  cameraSensitivity: 1.0,
  invertCameraY: false,
  vibration: true,
  vibrationStrength: 1.0,
  releaseOnChargeUp: null, // null = follow preset
  keyboardReleaseOnKeyUp: true,
};

const NAV_DIRS = ['nav_up', 'nav_down', 'nav_left', 'nav_right'];
const REPEAT_DELAY = 0.36;
const REPEAT_RATE = 0.085;

export class InputManager extends Emitter {
  constructor(opts = {}) {
    super();
    this.win = opts.window || (typeof window !== 'undefined' ? window : null);
    this.getGamepads = opts.getGamepads || null; // injectable for tests
    this.warnedPads = new Set();
    this.settings = { ...DEFAULT_INPUT_SETTINGS, ...(opts.settings || {}) };
    this.bindings = opts.bindings || buildBindings(this.settings.preset);
    this.context = 'menu';
    this.keysDown = new Set();
    this.keysPressedQ = new Map(); // code -> presses since last poll
    this.keysReleasedQ = new Set();
    this.state = {}; // ctx -> action -> { v, prev }
    this.padPrev = new Map(); // pad index -> buttons values
    this.pads = [];
    this.lastDevice = { type: 'keyboard', padType: 'generic' };
    this.capture = null;
    this.navTimers = {};
    this.navFired = new Map(); // dir -> count this frame
    this.enabled = true;
    this.textEntry = false;
    this.lastPadId = '';
    this._listeners = [];
    if (this.win) this.attach();
  }

  attach() {
    const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); this._listeners.push([target, type, fn, o]); };
    on(this.win, 'keydown', (e) => this.onKeyDown(e));
    on(this.win, 'keyup', (e) => this.onKeyUp(e));
    on(this.win, 'blur', () => { this.keysDown.clear(); });
    on(this.win, 'mousemove', () => this.setDevice('keyboard'), { passive: true });
    on(this.win, 'mousedown', () => this.setDevice('keyboard'), { passive: true });
    on(this.win, 'gamepadconnected', (e) => {
      this.emit('padConnected', { index: e.gamepad.index, id: e.gamepad.id, type: detectPadType(e.gamepad.id) });
    });
    on(this.win, 'gamepaddisconnected', (e) => {
      this.padPrev.delete(e.gamepad.index);
      this.emit('padDisconnected', { index: e.gamepad.index, id: e.gamepad.id });
    });
  }

  detach() {
    for (const [t, type, fn, o] of this._listeners) t.removeEventListener(type, fn, o);
    this._listeners = [];
  }

  setPreset(presetId) {
    this.settings.preset = presetId;
    this.bindings = buildBindings(presetId);
    this.emit('bindingsChanged');
  }

  setBindings(b) { this.bindings = b; this.emit('bindingsChanged'); }

  releaseOnChargeUp() {
    if (this.settings.releaseOnChargeUp != null) return this.settings.releaseOnChargeUp;
    if (this.lastDevice.type === 'keyboard' && this.settings.keyboardReleaseOnKeyUp) return true;
    return presetReleaseMode(this.settings.preset);
  }

  onKeyDown(e) {
    const tag = e.target?.tagName;
    const typing = this.textEntry || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (this.capture) {
      e.preventDefault();
      const cap = this.capture; this.capture = null;
      if (e.code === 'Escape' || cap.kind === 'pad' || cap.kind === 'axis') cap.resolve(null);
      else cap.resolve({ key: e.code });
      return;
    }
    if (typing) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'PageUp', 'PageDown'].includes(e.code)) e.preventDefault();
    if (!this.keysDown.has(e.code)) this.keysPressedQ.set(e.code, (this.keysPressedQ.get(e.code) || 0) + 1);
    this.keysDown.add(e.code);
    this.setDevice('keyboard');
  }

  onKeyUp(e) {
    if (this.keysDown.has(e.code)) this.keysReleasedQ.add(e.code);
    this.keysDown.delete(e.code);
  }

  setDevice(type, padType) {
    const pt = padType || this.lastDevice.padType;
    if (this.lastDevice.type !== type || this.lastDevice.padType !== pt) {
      this.lastDevice = { type, padType: pt };
      this.emit('deviceChanged', this.lastDevice);
    }
  }

  readPads() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    let raw = [];
    // a page embedded without gamepad permission throws here; keyboard input must keep working
    try { raw = this.getGamepads ? this.getGamepads() : nav && nav.getGamepads ? nav.getGamepads() : []; } catch { raw = []; }
    const pads = [];
    for (const p of raw || []) {
      if (!p || p.connected === false) continue;
      if (p.mapping === 'standard') { pads.push(p); continue; }
      // raw layout: present it in the standard layout, and say so once per controller
      pads.push(normalizePad(p));
      if (!this.warnedPads.has(p.id)) { this.warnedPads.add(p.id); this.emit('padNonStandard', { index: p.index, id: p.id }); }
    }
    this.pads = pads;
    return pads;
  }

  // ---------------------------------------------------------------- shaping

  shapeStick(x, y) {
    const dz = this.settings.deadzone;
    const mag = Math.hypot(x, y);
    if (mag < dz) return [0, 0];
    const n = Math.min(1, (mag - dz) / (1 - dz));
    const curve = 1 / Math.max(0.3, this.settings.stickSensitivity);
    const s = Math.pow(n, curve) / mag;
    return [Math.max(-1, Math.min(1, x * s)), Math.max(-1, Math.min(1, y * s))];
  }

  shapeTrigger(v) {
    const dz = this.settings.triggerDeadzone;
    if (v < dz) return 0;
    const n = Math.min(1, (v - dz) / (1 - dz));
    return Math.pow(n, 1 / Math.max(0.3, this.settings.triggerSensitivity));
  }

  padButton(p, i) {
    const btn = p.buttons[i];
    if (!btn) return 0;
    const v = typeof btn === 'object' ? (btn.value ?? (btn.pressed ? 1 : 0)) : btn;
    if (i === 6 || i === 7) return this.shapeTrigger(Math.max(v, btn.pressed && v === 0 ? 1 : 0));
    return btn.pressed || v > 0.5 ? 1 : 0;
  }

  padAxes(p) {
    const a = p.axes || [];
    const [lx, ly] = this.shapeStick(a[0] || 0, a[1] || 0);
    const [rx, ry] = this.shapeStick(a[2] || 0, a[3] || 0);
    return [lx, ly, rx, ry];
  }

  // ---------------------------------------------------------------- polling

  poll(dt = 1 / 60) {
    const pads = this.readPads();
    // detect pad activity for prompts + remap capture
    for (const p of pads) {
      const prev = this.padPrev.get(p.index) || [];
      const cur = p.buttons.map((bt, i) => this.padButton(p, i));
      const axes = this.padAxes(p);
      let active = false;
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] > 0.5 && !(prev[i] > 0.5)) {
          active = true;
          if (this.capture) {
            const cap = this.capture; this.capture = null;
            // Start/Menu cancels a capture; a keyboard capture is cancelled by any pad button
            cap.resolve(i === 9 || cap.kind === 'key' ? null : { button: i });
          }
        }
      }
      if (axes.some((v) => Math.abs(v) > 0.5)) {
        active = true;
        if (this.capture && this.capture.kind === 'axis') {
          const idx = axes.findIndex((v) => Math.abs(v) > 0.5);
          const cap = this.capture; this.capture = null;
          cap.resolve({ axis: idx, dir: Math.sign(axes[idx]) });
        }
      }
      if (active) { this.lastPadId = p.id; this.setDevice('gamepad', detectPadType(p.id)); }
      this.padPrev.set(p.index, cur);
      p._shapedAxes = axes;
      p._shapedButtons = cur;
    }

    for (const ctx of Object.keys(this.bindings)) {
      const cs = this.state[ctx] || (this.state[ctx] = {});
      for (const [action, bind] of Object.entries(this.bindings[ctx])) {
        const st = cs[action] || (cs[action] = { v: 0, prev: 0, pressedKey: false, releasedKey: false });
        st.prev = st.v;
        st.v = this.enabled ? this.evaluate(bind, pads) : 0;
        st.pressedKey = false; st.releasedKey = false; st.pressCount = 0;
        const keys = bind.axis ? [...(bind.neg || []), ...(bind.pos || [])] : (bind.keys || []);
        for (const kc of keys) {
          const n = this.keysPressedQ.get(kc) || 0;
          if (n) { st.pressedKey = true; st.pressCount += n; }
          if (this.keysReleasedQ.has(kc)) st.releasedKey = true;
        }
      }
    }
    this.keysPressedQ.clear();
    this.keysReleasedQ.clear();
    this.updateNav(dt);
  }

  evaluate(bind, pads) {
    if (bind.axis) {
      let v = 0;
      for (const kc of bind.neg || []) if (this.keysDown.has(kc)) v -= 1;
      for (const kc of bind.pos || []) if (this.keysDown.has(kc)) v += 1;
      for (const p of pads) for (const pb of bind.pad || []) {
        if (pb.axis != null) v += p._shapedAxes?.[pb.axis] ?? 0;
        if (pb.button != null) v += (p._shapedButtons?.[pb.button] ?? 0) * (pb.dir || 1);
      }
      return Math.max(-1, Math.min(1, v));
    }
    let v = 0;
    for (const kc of bind.keys || []) if (this.keysDown.has(kc)) v = 1;
    for (const p of pads) for (const pb of bind.pad || []) {
      if (pb.button != null) v = Math.max(v, p._shapedButtons?.[pb.button] ?? 0);
      if (pb.axis != null) {
        const a = (p._shapedAxes?.[pb.axis] ?? 0) * (pb.dir || 1);
        v = Math.max(v, a > 0.5 ? 1 : 0);
      }
    }
    return v;
  }

  updateNav(dt) {
    this.navFired.clear();
    const cs = this.state.menu;
    if (!cs) return;
    for (const d of NAV_DIRS) {
      const st = cs[d];
      if (!st) continue;
      // fresh key presses since the last poll always navigate (even several per frame)
      if (st.pressedKey) { this.navFired.set(d, st.pressCount); this.navTimers[d] = st.v > 0.5 ? 0 : null; continue; }
      if (st.v > 0.5) {
        const t = this.navTimers[d];
        if (t == null) { this.navTimers[d] = 0; this.navFired.set(d, Math.max(1, st.pressCount)); }
        else {
          const nt = t + dt;
          this.navTimers[d] = nt;
          if (nt > REPEAT_DELAY) {
            const before = Math.floor((t - REPEAT_DELAY) / REPEAT_RATE);
            const after = Math.floor((nt - REPEAT_DELAY) / REPEAT_RATE);
            if (after > before || t <= REPEAT_DELAY) this.navFired.set(d, 1);
          }
        }
      } else this.navTimers[d] = null;
    }
  }

  // ---------------------------------------------------------------- queries

  _st(action, ctx) { return this.state[ctx || this.context]?.[action]; }
  value(action, ctx) { return this._st(action, ctx)?.v ?? 0; }
  held(action, ctx) { return (this._st(action, ctx)?.v ?? 0) > 0.5; }
  pressed(action, ctx) {
    const s = this._st(action, ctx);
    if (!s) return false;
    return (s.v > 0.5 && s.prev <= 0.5) || s.pressedKey;
  }
  released(action, ctx) {
    const s = this._st(action, ctx);
    if (!s) return false;
    return (s.v <= 0.5 && s.prev > 0.5) || (s.releasedKey && s.v <= 0.5);
  }
  nav(dir) { return this.navFired.get('nav_' + dir) || 0; }
  consume(action, ctx) {
    const s = this._st(action, ctx);
    if (s) { s.prev = s.v; s.pressedKey = false; }
  }
  consumeAll() {
    for (const ctx of Object.keys(this.state)) for (const s of Object.values(this.state[ctx])) { s.prev = s.v; s.pressedKey = false; s.releasedKey = false; }
    this.navFired.clear();
  }

  // ---------------------------------------------------------------- prompts

  glyph(action, ctx) {
    const bind = this.bindings[ctx || this.context]?.[action];
    if (!bind) return '?';
    if (this.lastDevice.type === 'gamepad') {
      const g = PAD_GLYPHS[this.lastDevice.padType] || PAD_GLYPHS.generic;
      const pb = (bind.pad || []).find((x) => x.button != null) || (bind.pad || [])[0];
      if (!pb) return '—';
      if (pb.button != null) return g[pb.button] ?? `B${pb.button}`;
      if (pb.axis != null) return AXIS_GLYPHS[pb.axis] ?? `Axis ${pb.axis}`;
      return '?';
    }
    if (bind.axis) return `${keyGlyph(bind.neg?.[0])}/${keyGlyph(bind.pos?.[0])}`;
    return keyGlyph(bind.keys?.[0]) || '—';
  }

  // ---------------------------------------------------------------- rumble

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (!this.settings.vibration) return;
    const k = this.settings.vibrationStrength;
    for (const p of this.pads) {
      const act = p.vibrationActuator;
      if (act && act.playEffect) {
        try {
          act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) });
        } catch { /* unsupported */ }
      }
    }
  }

  // ---------------------------------------------------------------- remap

  captureNext(kind = 'any') {
    if (this.capture) this.capture.resolve(null);
    return new Promise((resolve) => { this.capture = { kind, resolve }; });
  }
  cancelCapture() { if (this.capture) { const c = this.capture; this.capture = null; c.resolve(null); } }
}
