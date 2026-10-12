// Touch controls for phones and tablets: an on-screen virtual gamepad.
// It joins the InputManager as one more standard-mapping gamepad (sticks on
// axes 0-3, buttons by standard index), so the launch and battle code read
// touch exactly like a controller and every binding preset keeps working.
// What it shows follows the battle: aim and lean sticks with a LAUNCH button
// before the launch, a steering stick and action buttons in battle, a
// Continue button between rounds, and nothing in menus (tapped directly).
// Sticks float: they appear where the thumb lands in their half of the
// screen.

import { h } from '../ui/ui.js';

const STICK_R = 54; // px of knob travel for full deflection
const STICK_ZONE_TOP = 0.2; // fraction of the height kept for the HUD

// Buttons per layout: [label, action, ctx, extra classes, HUD ability key];
// the pad button is looked up from the active bindings so every preset
// works, and in battle each button mirrors its ability's state from the HUD
// (ready, cooling down, locked), which hides the HUD's own ability bar.
const LAYOUTS = {
  launch: { left: 'aim', right: 'lean', buttons: [['LAUNCH', 'charge', 'launch', 'big launch'], ['TECH', 'technique', 'launch', 'b1'], ['SPIN', 'switch_config', 'launch', 'b2'], ['❚❚', 'pause', 'launch', 'pause']] },
  battle: {
    left: 'steer', right: 'camera',
    buttons: [['DASH', 'dash', 'battle', 'big dash', 'dash'], ['GRIP', 'brace', 'battle', 'r1', 'brace'], ['CNTR', 'counter', 'battle', 'r2', 'counter'], ['SKILL', 'ability1', 'battle', 'r3', 'signature'], ['SKILL 2', 'ability2', 'battle', 'r4', 'secondary'],
      ['GUARD', 'tactical1', 'battle', 's1', 'guard'], ['SURGE', 'tactical2', 'battle', 's2', 'surge'], ['ULT', ['tactical1', 'tactical2'], 'battle', 's3 ult', 'ultimate'], ['CAM', 'focus', 'battle', 'cam'], ['❚❚', 'pause', 'battle', 'pause']],
  },
  continue: { buttons: [['CONTINUE', 'confirm', 'menu', 'big continue'], ['❚❚', 'pause', 'battle', 'pause']] },
  watch: { right: 'camera', buttons: [['CAM', 'focus', 'battle', 'cam'], ['❚❚', 'pause', 'battle', 'pause']] },
};

export class TouchControls {
  constructor(app, root) {
    this.app = app;
    this.hold = new Array(17).fill(0); // pointers holding each button
    this.pulse = new Array(17).fill(false); // pressed since the last poll
    this.axes = [0, 0, 0, 0];
    this.layout = null;
    this.sticks = {};
    this.el = h('div', { class: 'touch-controls' });
    root.appendChild(this.el);
    app.input.addVirtualPad(() => this.pad());
    // phones start in touch mode; touch laptops switch on the first touch
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    if (coarse) app.input.setDevice('touch');
  }

  get active() { return this.app.input.lastDevice.type === 'touch'; }

  // The virtual pad the InputManager reads every frame.
  pad() {
    if (!this.active || !this.layout) return null;
    const buttons = this.hold.map((n, i) => {
      const v = n > 0 || this.pulse[i] ? 1 : 0;
      return { pressed: v > 0, touched: v > 0, value: v };
    });
    this.pulse.fill(false);
    return { id: 'Touch controls', index: 90, connected: true, mapping: 'standard', touch: true, timestamp: performance.now(), axes: this.axes.slice(), buttons };
  }

  // Which controls the current screen needs.
  pickLayout() {
    const ui = this.app.ui;
    if (!this.active || ui.modal) return null;
    const scr = ui.current;
    const b = scr?.battle;
    if (!b || scr.constructor.screenName !== 'BattleScreen' || scr.paused) return null;
    if (!scr.humans?.length) return 'watch';
    if (b.phase === 'intro') return null;
    if (b.phase === 'roundOver' || b.phase === 'matchOver') return scr.refs?.banner?.classList.contains('show') ? 'continue' : null;
    const me = b.fighters[scr.humans[0].index];
    if ((b.phase === 'setup' || b.phase === 'countdown') && !me?.launch?.released) return 'launch';
    return 'battle';
  }

  update() {
    const want = this.pickLayout();
    if (want !== this.layout) this.build(want);
    this.app.root.classList.toggle('touch-mode', this.active);
    this.app.root.classList.toggle('touch-play', !!this.layout);
    if (this.layout === 'launch') this.launchLabel();
    if (this.layout === 'battle' && (this._abT = (this._abT || 0) + 1) % 6 === 0) this.abilityStates();
  }

  // Mirror the HUD's ability states on the battle buttons; a button whose
  // ability this top doesn't have (no second skill) is hidden.
  abilityStates() {
    const refs = this.app.ui.current?.abilityRefs || [];
    for (const [el, key] of this.keyed || []) {
      const ref = refs.find((r) => r.key === key);
      el.hidden = !ref;
      if (!ref) continue;
      const s = ref.getState();
      el.dataset.state = s.state;
      const t = el.querySelector('i');
      const txt = s.state === 'ready' ? '' : (s.text || '');
      if (t.textContent !== txt) t.textContent = txt;
    }
  }

  padButtonFor(action, ctx) {
    const bind = this.app.input.bindings[ctx]?.[action];
    return (bind?.pad || []).find((p) => p.button != null)?.button ?? null;
  }

  releaseAll() {
    this.hold.fill(0);
    this.axes.fill(0);
    for (const s of Object.values(this.sticks)) s?.reset?.();
  }

  build(layout) {
    this.releaseAll();
    this.layout = layout;
    this.el.innerHTML = '';
    this.sticks = {};
    this.launchBtn = null;
    this.keyed = [];
    const L = LAYOUTS[layout];
    if (!L) return;
    if (L.left) this.sticks.left = this.stick('left', 0);
    if (L.right) this.sticks.right = this.stick('right', 2, L.right);
    for (const [label, action, ctx, cls, key] of L.buttons) {
      const el = h('div', { class: 'tc-btn ' + cls }, h('span', {}, label), key ? h('i', {}) : null);
      if (key) this.keyed.push([el, key]);
      const actions = Array.isArray(action) ? action : [action];
      this.el.appendChild(el);
      if (action === 'charge') this.launchBtn = el;
      let ids = [];
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        ids = actions.map((a) => this.padButtonFor(a, ctx));
        if (ids.some((i) => i == null)) for (const a of actions) this.app.input.inject(a, ctx); // unbound on pads: a tap
        for (const i of ids) if (i != null) { this.hold[i]++; this.pulse[i] = true; }
        el.classList.add('down');
      });
      const up = (e) => {
        if (!el.classList.contains('down')) return;
        e.preventDefault();
        for (const i of ids) if (i != null) this.hold[i] = Math.max(0, this.hold[i] - 1);
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }

  // A floating stick in the left or right part of the screen writing two axes.
  stick(side, axis, kind = '') {
    const zone = h('div', { class: `tc-zone ${side} ${kind}` });
    const base = h('div', { class: 'tc-stick' }, h('div', { class: 'tc-knob' }));
    const knob = base.firstChild;
    zone.appendChild(base);
    this.el.appendChild(zone);
    let id = null, x0 = 0, y0 = 0;
    const set = (dx, dy) => {
      const m = Math.hypot(dx, dy);
      const k = m > STICK_R ? STICK_R / m : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.axes[axis] = Math.max(-1, Math.min(1, dx / STICK_R));
      this.axes[axis + 1] = Math.max(-1, Math.min(1, dy / STICK_R));
    };
    const reset = () => { id = null; set(0, 0); base.classList.remove('live'); base.style.left = ''; base.style.top = ''; };
    zone.addEventListener('pointerdown', (e) => {
      if (id != null) return;
      const r = zone.getBoundingClientRect();
      if (e.clientY < window.innerHeight * STICK_ZONE_TOP) return;
      e.preventDefault();
      id = e.pointerId;
      zone.setPointerCapture?.(id);
      x0 = e.clientX; y0 = e.clientY;
      base.style.left = `${x0 - r.left}px`; base.style.top = `${y0 - r.top}px`;
      base.classList.add('live');
      set(0, 0);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) { e.preventDefault(); set(e.clientX - x0, e.clientY - y0); } });
    const end = (e) => { if (e.pointerId === id) reset(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    return { reset };
  }

  // READY before the countdown, then HOLD, then LET GO while charging.
  launchLabel() {
    const el = this.launchBtn;
    const scr = this.app.ui.current;
    if (!el || !scr?.battle) return;
    const b = scr.battle;
    const charging = el.classList.contains('down') && b.phase === 'countdown';
    const text = b.phase === 'setup' ? 'READY' : charging ? 'LET GO!' : 'HOLD';
    if (el.firstChild.textContent !== text) el.firstChild.textContent = text;
  }
}
