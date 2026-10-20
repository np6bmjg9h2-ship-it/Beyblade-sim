// Playbook: equip D-pad patterns. Pick a D-pad slot, then a learned pattern
// to put there; a pattern sits in one slot only (assigning it elsewhere swaps).
// Saves like the Workshop does (app.save('silent')).

import { h, btn } from '../ui.js';
import { PATTERNS, PATTERN_IDS, PLAYBOOK_SLOTS } from '../../game/playbook.js';

const SLOT_CMD = { up: 'cmd_up', down: 'cmd_down', left: 'cmd_left', right: 'cmd_right' };
const LEARN = {
  herd: 'Learn: story chapter 2 (beat Rook)',
  feint: 'Learn: story chapter 2 (beat Mirelle)',
};
const DOUBLE_TAP = {
  orbit: 'Circles the other way.',
  slingshot: 'Climbs higher before the dive.',
  feint: 'Brakes tighter for a closer stop.',
};
const COUNTER = {
  anchor: 'Beats a Feint. Loses to a Slingshot.',
  orbit: 'Loses to a Herd near the rim.',
  sidestep: 'Beats a Slingshot.',
  slingshot: 'Beats an Anchor. Loses to a Sidestep.',
  feint: 'Beats a counter-happy foe. Loses to an Anchor.',
  herd: 'Beats an Orbit near the rim.',
};

export class PlaybookScreen {
  static screenName = 'PlaybookScreen';
  constructor() { this.slot = 0; this.sel = null; }

  get pb() { return this.app.profile.playbook; }
  glyph(i) { return this.app.input.glyph(SLOT_CMD[PLAYBOOK_SLOTS[i]], 'battle'); }

  render() {
    const pb = this.pb;
    if (!this.sel) this.sel = pb.slots[this.slot] || pb.owned[0];
    const pad = h('div', { class: 'pb-dpad' }, PLAYBOOK_SLOTS.map((dir, i) => {
      const id = pb.slots[i], def = id && PATTERNS[id];
      return btn(h('div', { class: 'pb-slot-in' },
        h('kbd', {}, this.glyph(i)),
        h('b', {}, def ? def.name : 'Empty'),
        h('span', { class: 'small muted' }, def ? def.callout : dir.toUpperCase())),
      () => { this.slot = i; this.sel = id || this.sel; this.ui.refresh(this); },
      { class: 'loadout-btn pb-slot pbd-' + dir + (i === this.slot ? ' sel' : ''), id: 'pbslot-' + dir, desc: `D-pad ${dir}: choose it, then pick a pattern below.` });
    }));
    const list = h('div', { class: 'col gap pb-list scroll', 'data-wrap': '', 'data-scroll': 'pblist' }, PATTERN_IDS.map((id) => {
      const def = PATTERNS[id], owned = pb.owned.includes(id), at = pb.slots.indexOf(id);
      const b = btn(h('div', { class: 'pb-row' },
        h('b', {}, def.name), h('span', { class: 'small muted' }, def.callout),
        h('span', { class: 'small ' + (owned ? 'good' : 'muted') }, owned ? (at >= 0 ? `On ${PLAYBOOK_SLOTS[at]} (${this.glyph(at)})` : 'Learned') : (LEARN[id] || 'Not learned'))),
      () => this.assign(id), { class: 'loadout-btn pb-pat' + (owned ? '' : ' locked') + (at === this.slot ? ' sel' : ''), id: 'pbpat-' + id, desc: owned ? `Put ${def.name} on ${PLAYBOOK_SLOTS[this.slot]}.` : (LEARN[id] || 'Not learned yet.') });
      b.addEventListener('focus', () => this.show(id));
      b.addEventListener('mouseenter', () => this.show(id));
      return b;
    }));
    this.detailEl = h('div', { class: 'panel pb-detail scroll', 'data-scroll': 'pbdetail' });
    this.fillDetail();
    return h('div', { class: 'std-screen playbook' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Playbook'),
        h('span', { class: 'mats' }, 'In battle press a D-pad key to run its pattern; press it twice for the variant.')),
      h('div', { class: 'pb-cols' },
        h('div', { class: 'panel pb-left' }, pad, h('h3', {}, 'Patterns'), list),
        this.detailEl));
  }

  show(id) { if (this.sel === id) return; this.sel = id; this.fillDetail(); }
  // controller/keyboard focus (the UI's own focus, not DOM focus events)
  onFocus(el) { const k = el?.dataset?.id || ''; const id = k.startsWith('pbpat-') ? k.slice(6) : null; if (id && PATTERNS[id]) this.show(id); }

  fillDetail() {
    const id = this.sel, def = PATTERNS[id], owned = this.pb.owned.includes(id);
    if (!this.detailEl || !def) return;
    this.detailEl.replaceChildren(...[
      h('h2', {}, def.name), h('div', { class: 'pb-callout' }, `"${def.callout}"`),
      h('p', {}, def.desc),
      h('div', { class: 'small' }, h('b', {}, 'Duration: '), `${def.dur.toFixed(1)} s`),
      h('div', { class: 'small' }, h('b', {}, 'Double-tap: '), DOUBLE_TAP[id] || 'No variant.'),
      h('div', { class: 'small' }, h('b', {}, 'Matchup: '), COUNTER[id] || ''),
      owned ? null : h('div', { class: 'small bad' }, LEARN[id] || 'Not learned yet.')].filter(Boolean));
  }

  assign(id) {
    const pb = this.pb;
    if (!pb.owned.includes(id)) { this.ui.toast(LEARN[id] || 'Not learned yet.', 'bad'); return; }
    const from = pb.slots.indexOf(id), cur = pb.slots[this.slot];
    if (from === this.slot) return;
    if (from >= 0) pb.slots[from] = cur; // swap (cur may be null)
    pb.slots[this.slot] = id;
    this.sel = id;
    this.app.audio.ui('confirm');
    this.app.save('silent');
    this.ui.refresh(this);
  }

  onBack() { this.app.save('silent'); this.ui.pop(); return true; }
  prompts() { return [['confirm', 'Choose / Assign'], ['back', 'Back']]; }
}
