// Dialogue overlay: speaker portrait (Spirit Chip emblem or initials), name and
// typewriter text. Confirm completes the current line or advances; Back skips
// the rest. Used for rival pre-match lines and story scenes.

import { h } from '../ui.js';
import { beastImg } from '../widgets.js';

export class DialogueScreen {
  static screenName = 'DialogueScreen';
  constructor({ lines, onDone = null, title = null, choices = null }) {
    this.overlay = true;
    this.lines = lines.filter(Boolean);
    this.i = 0;
    this.shown = 0;
    this.onDone = onDone;
    this.title = title;
    this.choices = choices; // optional final choice: [{ label, value }]
    this.choiceIdx = 0;
    this.done = false;
  }

  get line() { return this.lines[this.i]; }

  render() {
    const L = this.line || { text: '' };
    const portrait = L.narrator || !L.speaker ? null : L.beast ? beastImg(L.beast, 84) : h('div', { class: 'dlg-initials', style: { background: L.color || '#2a3a5c' } }, L.speaker.split(/\s+/).map((w) => w[0]).join('').slice(0, 2));
    this.textEl = h('div', { class: 'dlg-text' }, '');
    const last = this.i >= this.lines.length - 1;
    const choiceEls = last && this.choices ? h('div', { class: 'dlg-choices' }, this.choices.map((c, k) => h('div', { class: 'dlg-choice' + (k === this.choiceIdx ? ' sel' : ''), onclick: () => { this.choiceIdx = k; this.finish(); } }, c.label))) : null;
    const el = h('div', { class: 'dialogue-wrap', onclick: () => this.advance() },
      this.title ? h('div', { class: 'dlg-title' }, this.title) : null,
      h('div', { class: 'dialogue panel' + (L.side === 'right' ? ' right' : '') },
        portrait ? h('div', { class: 'dlg-portrait', style: { borderColor: L.color || '#4fc3ff' } }, portrait) : null,
        h('div', { class: 'dlg-body' },
          h('div', { class: 'dlg-speaker', style: { color: L.color || '#9fd7ff' } }, L.speaker || ''),
          (this.textEl.className = 'dlg-text' + (L.narrator ? ' narration' : ''), this.textEl),
          choiceEls,
          h('div', { class: 'dlg-hint muted small' }, `${this.i + 1}/${this.lines.length}`))));
    this.shown = 0;
    this.full = L.text || '';
    return el;
  }

  update(dt) {
    if (!this.textEl || this.shown >= this.full.length) return;
    const speed = 45 * (this.app.settings.gameplay.dialogueSpeed || 1);
    this.shown = Math.min(this.full.length, this.shown + Math.max(1, speed * dt));
    this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
  }

  advance() {
    if (this.shown < this.full.length) { this.shown = this.full.length; this.textEl.textContent = this.full; return; }
    if (this.i < this.lines.length - 1) { this.i++; this.ui.refresh(this); this.app.audio.ui('move'); return; }
    this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.ui.pop();
    this.onDone?.(this.choices ? this.choices[this.choiceIdx]?.value : undefined);
  }

  handleInput(input) {
    if (this.choices && this.i >= this.lines.length - 1) {
      const d = input.nav('down') + input.nav('right') - input.nav('up') - input.nav('left');
      if (d) {
        this.choiceIdx = (this.choiceIdx + Math.sign(d) + this.choices.length) % this.choices.length;
        this.ui.refresh(this);
        this.shown = this.full.length; this.textEl.textContent = this.full;
        this.app.audio.ui('move');
        return true;
      }
    }
    if (input.pressed('confirm', 'menu')) { this.advance(); return true; }
    return false;
  }

  onBack() {
    if (this.choices) { this.i = this.lines.length - 1; this.ui.refresh(this); this.shown = this.full.length; this.textEl.textContent = this.full; return true; }
    this.finish();
    return true;
  }

  prompts() { return [['confirm', 'Continue'], ['back', this.choices ? 'Skip to choice' : 'Skip']]; }
}
