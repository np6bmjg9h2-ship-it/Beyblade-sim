// UI core: screen stack, spatial focus navigation (controller/keyboard),
// mouse support, prompt bar with device-specific glyphs, toasts and modal
// dialogs. Screens are plain objects/classes with render() returning an
// element plus optional lifecycle hooks.

export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
};

// A focusable button. `onActivate` runs on click, Enter/A.
export function btn(label, onActivate, opts = {}) {
  const el = h('button', { class: 'btn ' + (opts.class || ''), type: 'button', 'data-focus': '', disabled: opts.disabled, title: opts.title }, label);
  el.addEventListener('click', (e) => { e.preventDefault(); if (!el.disabled) onActivate?.(e); });
  if (opts.desc) el.dataset.desc = opts.desc;
  return el;
}

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export class UI {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.stack = [];
    this.layer = h('div', { class: 'screen-layer' });
    this.overlay = h('div', { class: 'overlay-layer' });
    this.toasts = h('div', { class: 'toasts' });
    this.prompts = h('div', { class: 'prompt-bar' });
    this.descBar = h('div', { class: 'desc-bar' });
    root.append(this.layer, this.overlay, this.descBar, this.prompts, this.toasts);
    this.focused = null;
    this.modal = null;
    root.addEventListener('mouseover', (e) => {
      const f = e.target.closest?.('[data-focus]');
      if (f && this.inActiveScope(f) && !f.disabled) this.focus(f, { silent: true, noScroll: true });
    });
    app.input.on('deviceChanged', () => this.refreshPrompts());
    app.input.on('bindingsChanged', () => this.refreshPrompts());
  }

  get current() { return this.stack[this.stack.length - 1] || null; }

  // ------------------------------------------------------------ screens

  async show(screen, params = {}) {
    // replace the whole stack
    while (this.stack.length) this.popInternal();
    this.push(screen, params);
  }

  push(screen, params = {}) {
    const cur = this.current;
    if (cur) { cur.el.classList.add('inactive'); cur._lastFocus = this.focused; }
    screen.ui = this;
    screen.app = this.app;
    screen.params = params;
    screen.el = screen.render(params);
    screen.el.classList.add('screen');
    if (screen.overlay) screen.el.classList.add('screen-overlay');
    (screen.overlay ? this.overlay : this.layer).appendChild(screen.el);
    this.stack.push(screen);
    screen.onEnter?.(params);
    this.autoFocus(screen);
    this.refreshPrompts();
    return screen;
  }

  pop() {
    if (this.stack.length <= 1) return;
    this.popInternal();
    const cur = this.current;
    if (cur) {
      cur.el.classList.remove('inactive');
      cur.onResume?.();
      if (cur._lastFocus && cur.el.contains(cur._lastFocus) && cur._lastFocus.isConnected) this.focus(cur._lastFocus, { silent: true });
      else this.autoFocus(cur);
    }
    this.refreshPrompts();
  }

  popInternal() {
    const s = this.stack.pop();
    s.onExit?.();
    s.el.remove();
  }

  // Re-render the current screen in place, keeping focus by data-id when possible.
  refresh(screen = this.current) {
    if (!screen) return;
    const fid = this.focused?.dataset?.id;
    const old = screen.el;
    const scroll = [...old.querySelectorAll('[data-scroll]')].map((e) => [e.dataset.scroll, e.scrollTop]);
    screen.el = screen.render(screen.params);
    screen.el.classList.add('screen');
    if (screen.overlay) screen.el.classList.add('screen-overlay');
    old.replaceWith(screen.el);
    for (const [k, top] of scroll) { const e = screen.el.querySelector(`[data-scroll="${k}"]`); if (e) e.scrollTop = top; }
    const again = fid ? screen.el.querySelector(`[data-id="${CSS.escape(fid)}"]`) : null;
    if (again) this.focus(again, { silent: true, noScroll: true });
    else this.autoFocus(screen);
    this.refreshPrompts();
  }

  autoFocus(screen) {
    const pref = screen.el.querySelector('[data-autofocus]:not([disabled])') || this.focusables(screen.el)[0];
    if (pref) this.focus(pref, { silent: true });
    else this.focused = null;
  }

  inActiveScope(el) {
    if (this.modal) return this.modal.el.contains(el);
    return this.current?.el.contains(el);
  }

  focusables(scope) {
    return [...scope.querySelectorAll('[data-focus]')].filter((e) => !e.disabled && e.offsetParent !== null && !e.closest('.inactive'));
  }

  focus(el, opts = {}) {
    if (!el) return;
    if (this.focused === el) return;
    if (this.focused) this.focused.classList.remove('focused');
    this.focused = el;
    el.classList.add('focused');
    if (!opts.noScroll) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (!opts.silent) this.app.audio.ui('move');
    const d = el.dataset.desc;
    this.descBar.textContent = d || '';
    this.descBar.classList.toggle('show', !!d);
    this.current?.onFocus?.(el);
  }

  // Spatial navigation: pick the nearest focusable in the pressed direction.
  navigate(dir) {
    const scope = this.modal ? this.modal.el : this.current?.el;
    if (!scope) return false;
    const list = this.focusables(scope);
    if (!list.length) return false;
    const cur = this.focused && list.includes(this.focused) ? this.focused : null;
    if (!cur) { this.focus(list[0]); return true; }
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      let primary, ortho;
      switch (dir) {
        case 'up': primary = -dy; ortho = Math.abs(dx); if (r.bottom > r0.top + 2) continue; break;
        case 'down': primary = dy; ortho = Math.abs(dx); if (r.top < r0.bottom - 2) continue; break;
        case 'left': primary = -dx; ortho = Math.abs(dy); if (r.right > r0.left + 2) continue; break;
        case 'right': primary = dx; ortho = Math.abs(dy); if (r.left < r0.right - 2) continue; break;
        default: continue;
      }
      if (primary <= 0) continue;
      const score = primary + ortho * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // wrap vertically inside lists when nothing further
    if (!best && (dir === 'down' || dir === 'up')) {
      const group = cur.closest('[data-wrap]');
      if (group) {
        const items = list.filter((e) => group.contains(e));
        best = dir === 'down' ? items[0] : items[items.length - 1];
        if (best === cur) best = null;
      }
    }
    if (best) { this.focus(best); return true; }
    return false;
  }

  // ------------------------------------------------------------ per-frame input

  update(dt) {
    const input = this.app.input;
    const screen = this.modal || this.current;
    if (!screen) return;
    screen.update?.(dt);
    // screens with their own input loop (battle) can claim input
    if (screen.handleInput?.(input, dt)) return;
    if (screen.captureNav) return;
    for (const d of ['up', 'down', 'left', 'right']) {
      for (let n = input.nav(d); n > 0; n--) {
        const f = this.focused;
        // adjustable controls (sliders/selectors) consume left/right
        if ((d === 'left' || d === 'right') && f?.dataset.adjust != null && this.inActiveScope(f)) {
          f.dispatchEvent(new CustomEvent('adjust', { detail: d === 'left' ? -1 : 1 }));
          this.app.audio.ui('move');
          continue;
        }
        if (!screen.onNav?.(d)) this.navigate(d);
      }
    }
    if (input.pressed('confirm', 'menu')) {
      const f = this.focused;
      if (f && this.inActiveScope(f) && !f.disabled) { this.app.audio.ui('confirm'); f.click(); }
    }
    if (input.pressed('back', 'menu')) {
      if (this.modal) { this.closeModal(false); this.app.audio.ui('back'); }
      else if (screen.onBack) { if (screen.onBack() !== false) this.app.audio.ui('back'); }
      else if (this.stack.length > 1) { this.pop(); this.app.audio.ui('back'); }
    }
    if (input.pressed('tab_prev', 'menu')) { if (screen.onTab?.(-1)) this.app.audio.ui('tab'); }
    if (input.pressed('tab_next', 'menu')) { if (screen.onTab?.(1)) this.app.audio.ui('tab'); }
    if (input.pressed('alt', 'menu')) screen.onAlt?.(this.focused);
    if (input.pressed('alt2', 'menu')) screen.onAlt2?.(this.focused);
  }

  // ------------------------------------------------------------ prompts

  refreshPrompts() {
    const screen = this.modal || this.current;
    const items = screen?.prompts?.() ?? [['confirm', 'Select'], ['back', 'Back']];
    this.prompts.innerHTML = '';
    for (const [action, label, ctx] of items) {
      if (!label) continue;
      const g = this.app.input.glyph(action, ctx || 'menu');
      this.prompts.append(h('span', { class: 'prompt' }, h('kbd', {}, g), ' ', label));
    }
  }

  glyph(action, ctx = 'menu') { return this.app.input.glyph(action, ctx); }

  // ------------------------------------------------------------ toasts & modals

  toast(text, kind = 'info', ms = 2600) {
    const t = h('div', { class: 'toast toast-' + kind }, text);
    this.toasts.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, ms);
  }

  // Modal confirm dialog. Resolves true/false. Fully controller navigable.
  confirm(title, body, { yes = 'Confirm', no = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      const yesB = btn(yes, () => this.closeModal(true), { class: danger ? 'danger' : 'primary' });
      const noB = btn(no, () => this.closeModal(false));
      const el = h('div', { class: 'modal-backdrop' }, h('div', { class: 'modal panel' }, h('h2', {}, title), h('div', { class: 'modal-body' }, body), h('div', { class: 'row gap' }, noB, yesB)));
      this.root.append(el);
      this.modal = { el, resolve, prevFocus: this.focused, prompts: () => [['confirm', 'Select'], ['back', no]] };
      this.focus(danger ? noB : yesB, { silent: true });
      this.refreshPrompts();
    });
  }

  // Modal choice list. Resolves the chosen value or null.
  choose(title, options, { body = null } = {}) {
    return new Promise((resolve) => {
      const list = h('div', { class: 'col gap', 'data-wrap': '' });
      for (const o of options) list.append(btn(o.label, () => this.closeModal(o.value), { disabled: o.disabled, desc: o.desc }));
      const el = h('div', { class: 'modal-backdrop' }, h('div', { class: 'modal panel' }, h('h2', {}, title), body ? h('div', { class: 'modal-body' }, body) : null, list));
      this.root.append(el);
      this.modal = { el, resolve, prevFocus: this.focused, cancelValue: null, prompts: () => [['confirm', 'Select'], ['back', 'Cancel']] };
      const first = this.focusables(el)[0];
      if (first) this.focus(first, { silent: true });
      this.refreshPrompts();
    });
  }

  closeModal(value) {
    const m = this.modal;
    if (!m) return;
    this.modal = null;
    m.el.remove();
    if (m.prevFocus?.isConnected) this.focus(m.prevFocus, { silent: true });
    else if (this.current) this.autoFocus(this.current);
    this.refreshPrompts();
    m.resolve(value === false && m.cancelValue !== undefined ? m.cancelValue : value);
  }
}

// ------------------------------------------------------------ widgets

// Left/right adjustable selector. options: [{value,label}]
export function selector(label, options, value, onChange, opts = {}) {
  let idx = Math.max(0, options.findIndex((o) => o.value === value));
  const valEl = h('span', { class: 'sel-value' }, options[idx]?.label ?? '');
  const el = h('div', { class: 'selector', 'data-focus': '', 'data-adjust': '', 'data-id': opts.id || label, tabindex: -1 },
    h('span', { class: 'sel-label' }, label),
    h('span', { class: 'sel-arrows' }, h('span', { class: 'arrow' }, '◀'), valEl, h('span', { class: 'arrow' }, '▶')));
  if (opts.desc) el.dataset.desc = opts.desc;
  const set = (i) => {
    idx = (i + options.length) % options.length;
    valEl.textContent = options[idx].label;
    if (options[idx].desc) el.dataset.desc = options[idx].desc;
    onChange(options[idx].value, options[idx]);
  };
  el.addEventListener('adjust', (e) => set(idx + e.detail));
  el.addEventListener('click', (e) => {
    const r = el.getBoundingClientRect();
    set(idx + (e.clientX < r.left + r.width * 0.55 && e.detail ? -1 : 1));
  });
  return el;
}

// Numeric slider adjusted with left/right or mouse.
export function slider(label, min, max, step, value, onChange, opts = {}) {
  const fmt = opts.format || ((v) => v.toFixed(2));
  const fill = h('span', { class: 'slider-fill' });
  const valEl = h('span', { class: 'sel-value' }, fmt(value));
  const track = h('span', { class: 'slider-track' }, fill);
  const el = h('div', { class: 'selector slider', 'data-focus': '', 'data-adjust': '', 'data-id': opts.id || label }, h('span', { class: 'sel-label' }, label), track, valEl);
  if (opts.desc) el.dataset.desc = opts.desc;
  let v = value;
  const upd = () => { fill.style.width = `${((v - min) / (max - min)) * 100}%`; valEl.textContent = fmt(v); };
  upd();
  const set = (nv) => { v = Math.min(max, Math.max(min, Math.round(nv / step) * step)); upd(); onChange(v); };
  el.addEventListener('adjust', (e) => set(v + e.detail * step));
  track.addEventListener('mousedown', (e) => {
    const r = track.getBoundingClientRect();
    set(min + ((e.clientX - r.left) / r.width) * (max - min));
  });
  return el;
}

export function toggle(label, value, onChange, opts = {}) {
  const valEl = h('span', { class: 'sel-value' }, value ? 'On' : 'Off');
  const el = h('div', { class: 'selector', 'data-focus': '', 'data-adjust': '', 'data-id': opts.id || label }, h('span', { class: 'sel-label' }, label), valEl);
  if (opts.desc) el.dataset.desc = opts.desc;
  let v = value;
  const set = (nv) => { v = nv; valEl.textContent = v ? 'On' : 'Off'; onChange(v); };
  el.addEventListener('adjust', () => set(!v));
  el.addEventListener('click', () => set(!v));
  return el;
}

export function bar(frac, color, opts = {}) {
  return h('div', { class: 'bar ' + (opts.class || '') }, h('div', { class: 'bar-fill', style: { width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color } }));
}
