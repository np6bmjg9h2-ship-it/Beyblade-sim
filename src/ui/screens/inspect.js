// Inspect: a 3D turntable of a build. Each part is its own model; moving
// through the part list brings that part into focus (the rest ghost out),
// X explodes the stack apart, Y replays the assembly. Right stick / left and
// right / mouse drag orbit, mouse wheel zooms.

import { h, btn } from '../ui.js';
import { rarityChip, statRow } from '../widgets.js';
import { SLOT_NAMES } from '../../data/parts.js';
import { baseOf, itemName } from '../../systems/items.js';

// top-to-bottom, as the stack is read
const ORDER = ['core', 'ring', 'aux', 'disc', 'lock', 'tip'];

// item instances carry seeded (non-round) stats
const f1 = (v) => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : v);

function partFacts(slot, p) {
  const raw = partFactsRaw(slot, p);
  return raw.map(([k, v]) => [k, typeof v === 'number' ? f1(v) : v]);
}

function partFactsRaw(slot, p) {
  switch (slot) {
    case 'ring': return [['Reach', `${f1(p.rOut)} mm`], ['Blades', p.blades ? `${p.blades} × ${f1(p.faceAngle)}° face` : 'smooth'], ['Slope', `${f1(p.slope || 0)}°`], ['Spin', p.spin === 'dual' ? 'either' : p.spin === 'R' ? 'right' : 'left']];
    case 'core': return [['Frame', p.arch], ['Radius', `${f1(p.radius)} mm`], ['Affinity', p.affinity], ['Offset', p.ecc ? `${f1(p.ecc)} mm` : 'centred']];
    case 'disc': return [['Radius', `${f1(p.rIn)}–${f1(p.rOut)} mm`], ['Thickness', `${f1(p.thickness)} mm`], ['Rim weighting', `${Math.round(p.massDist * 100)}%`], ['Offset', p.ecc ? `${f1(p.ecc)} mm` : 'centred']];
    case 'lock': return [['Notches', p.notches], ['Strength', p.threshold.toFixed(2)], ['Reseat', `${f1(p.recovery)}/s`], ['Socket', p.tipSocket]];
    case 'tip': return [['Type', p.wear], ['Friction μ', p.mu.toFixed(2)], ['Flat', `${f1(p.flatRadius)} mm`], ['Ball', `${f1(p.ballRadius)} mm`]];
    case 'aux': return [['Mount', p.mount]];
    default: return [];
  }
}

export class InspectScreen {
  static screenName = 'InspectScreen';

  // opts: { assembly, color, beast, title, items: { slot: item }, focus }
  constructor(opts) {
    this.opts = opts;
    this.exploded = false;
    this.focusSlot = opts.focus || null;
    this.drag = null;
  }

  render() {
    const { assembly, items = {}, title } = this.opts;
    const P = assembly.parts;
    const rows = ORDER.filter((s) => P[s]).map((slot) => {
      const it = items[slot];
      const part = P[slot];
      const b = btn(h('div', { class: 'slot-row' }, h('span', { class: 'slot-name' }, SLOT_NAMES[slot]),
        h('span', { class: 'slot-item' }, h('span', { class: 'swatch', style: { background: it?.visual?.color || part.color } }), it ? itemName(it) : part.name, it ? [' ', rarityChip(it.rarity)] : null)),
      () => {}, { class: 'slot-btn', id: 'ins-' + slot, desc: (it ? baseOf(it) : part).desc });
      b.dataset.slot = slot;
      return b;
    });
    const all = btn('Whole top', () => {}, { id: 'ins-all', desc: 'Show every part together.' });
    this.info = h('div', { class: 'col inspect-info' });
    this.explodeBtn = btn(this.exploded ? 'Assemble' : 'Explode parts', () => this.toggleExplode(), { id: 'ins-explode', class: 'primary', desc: 'Pull the parts apart along the spin axis to see how they stack.' });
    const panel = h('div', { class: 'panel col gap inspect-panel', style: { position: 'absolute', left: '40px', top: '28px', bottom: '70px', width: '360px', overflow: 'auto' } },
      h('h1', {}, 'Inspect'),
      h('div', { class: 'small muted' }, title || ''),
      h('div', { class: 'col gap', 'data-wrap': '' }, all, ...rows),
      this.info,
      h('div', { class: 'row gap' }, this.explodeBtn, btn('Replay assembly', () => this.app.renderer.inspect?.replayAssembly(), { id: 'ins-replay', desc: 'Watch the parts click together again.' })));
    const view = h('div', { class: 'inspect-view', style: { position: 'absolute', left: '420px', right: '0', top: '0', bottom: '0', cursor: 'grab' } });
    view.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY }; view.setPointerCapture?.(e.pointerId); view.style.cursor = 'grabbing'; });
    view.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.app.renderer.inspect?.input(-(e.clientX - this.drag.x) * 0.008, (e.clientY - this.drag.y) * 0.006);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { this.drag = null; view.style.cursor = 'grab'; };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    view.addEventListener('wheel', (e) => { e.preventDefault(); this.app.renderer.inspect?.input(0, 0, e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
    const el = h('div', { class: 'inspect-screen' }, view, panel);
    this.showInfo(this.focusSlot);
    return el;
  }

  onEnter() {
    const stage = this.app.renderer.openInspect();
    stage.setExploded(this.exploded);
    stage.setFocus(this.focusSlot);
    stage.show(this.opts.assembly, { color: this.opts.color, beast: this.opts.beast, quality: this.app.settings.graphics.quality });
    if (this.focusSlot) {
      const el = this.el.querySelector(`[data-id="ins-${this.focusSlot}"]`);
      if (el) this.ui.focus(el, { silent: true });
    }
  }

  onExit() { this.app.renderer.closeInspect(); }

  onFocus(el) {
    if (!el.dataset.slot && el.dataset.id !== 'ins-all') return;
    const slot = el.dataset.slot || null;
    if (slot === this.focusSlot) return;
    this.focusSlot = slot;
    this.app.renderer.inspect?.setFocus(slot);
    this.showInfo(slot);
  }

  showInfo(slot) {
    if (!this.info) return;
    this.info.innerHTML = '';
    const P = this.opts.assembly.parts;
    if (!slot) {
      const s = this.opts.assembly.summary;
      this.info.append(h('h3', {}, 'Assembled'), statRow('Mass', `${s.massG.toFixed(1)} g`), statRow('Reach', `${s.reachMm.toFixed(1)} mm`), statRow('Centre of mass', `${s.comMm.toFixed(1)} mm above tip`), statRow('Parts', `${Object.keys(P).filter((k) => P[k]).length}`));
      return;
    }
    const p = P[slot];
    this.info.append(h('h3', {}, p.name), ...partFacts(slot, p).map(([k, v]) => statRow(k, String(v))), statRow('Mass', `${f1(p.mass)} g`));
  }

  toggleExplode() {
    this.exploded = !this.exploded;
    this.app.renderer.inspect?.setExploded(this.exploded);
    this.explodeBtn.textContent = this.exploded ? 'Assemble' : 'Explode parts';
    this.app.audio.ui('confirm');
  }

  update(dt) {
    const input = this.app.input;
    // orbit: right stick (and left/right keys, which don't navigate this list)
    const x = input.value('cam_x', 'battle');
    if (Math.abs(x) > 0.15) this.app.renderer.inspect?.input(-x * dt * 2.4, 0);
  }

  onNav(d) { return d === 'left' || d === 'right'; }
  onAlt() { this.toggleExplode(); }
  onAlt2() { this.app.renderer.inspect?.replayAssembly(); this.app.audio.ui('confirm'); }
  prompts() { return [['alt', 'Explode'], ['alt2', 'Replay assembly'], ['back', 'Back']]; }
}
