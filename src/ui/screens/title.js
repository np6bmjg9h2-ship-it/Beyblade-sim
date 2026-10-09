// Title screen and save-slot management (new / continue / load / delete /
// import / export), plus first-time player naming.

import { h, btn } from '../ui.js';
import { textEntry } from '../widgets.js';
import { SLOTS } from '../../systems/save.js';
import { MainMenu } from './mainMenu.js';
import { SettingsScreen } from './settings.js';

const NAME_SUGGESTIONS = ['Kaito', 'Rhea', 'Sena', 'Pip', 'Mika', 'Dax', 'Nova', 'Ren', 'Iris', 'Tomo', 'Vale', 'Kestrel', 'Ash', 'Lumi', 'Orion'];

export class TitleScreen {
  static screenName = 'TitleScreen';
  constructor() { this.stage = 'press'; this.slots = null; }

  render() {
    const logo = h('div', { class: 'logo' },
      h('div', { class: 'logo-main' }, 'CHAOS', h('span', { class: 'logo-spin' }, 'SPIN')),
      h('div', { class: 'logo-sub' }, 'ARENA ZERO'));
    if (this.stage === 'press') {
      const start = btn('Press to Begin', () => this.toSlots(), { class: 'primary big pulse' });
      start.dataset.autofocus = '';
      return h('div', { class: 'title-screen' }, logo, h('div', { class: 'title-press' }, start), h('div', { class: 'title-foot' }, 'Keyboard, mouse or any standard controller. Chrome recommended.'));
    }
    const list = h('div', { class: 'col gap slot-list', 'data-wrap': '' });
    if (!this.slots) list.append(h('div', { class: 'muted' }, 'Reading saves…'));
    else {
      for (const s of this.slots.slots) {
        const label = s.exists
          ? h('div', { class: 'slot-label' }, h('b', {}, s.name || 'Battler'), h('span', {}, ` · Lv ${s.level} · Chapter ${s.chapter} · ${fmtPlay(s.playtime)}`), h('span', { class: 'muted' }, ` · ${new Date(s.updatedAt).toLocaleString()}`))
          : h('div', { class: 'slot-label muted' }, 'Empty slot — start a new game');
        const b = btn(h('div', { class: 'slot-btn' }, h('span', { class: 'slot-n' }, s.slot.replace('slot', 'Slot ')), label), () => (s.exists ? this.load(s.slot) : this.newGame(s.slot)), { class: 'slot' + (this.slots.lastSlot === s.slot ? ' last' : '') });
        b.dataset.id = s.slot;
        if (this.slots.lastSlot === s.slot) b.dataset.autofocus = '';
        b.dataset.desc = s.exists ? 'Load this save. Press ' + this.app.input.glyph('alt') + ' for more options (export, delete).' : 'Create a new save in this slot.';
        list.append(b);
      }
    }
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    fileIn.addEventListener('change', () => this.importFile(fileIn.files[0]));
    return h('div', { class: 'title-screen' }, logo,
      h('div', { class: 'panel slot-panel' }, h('h2', {}, 'Save Slots'), list,
        h('div', { class: 'row gap' },
          btn('Import Save File', () => this.pickImport(fileIn), { desc: 'Load a save exported from this game (.json).' }),
          btn('Settings', () => this.ui.push(new SettingsScreen()), { desc: 'Graphics, audio, controls and accessibility.' })),
        fileIn));
  }

  prompts() { return this.stage === 'press' ? [['confirm', 'Begin']] : [['confirm', 'Select'], ['alt', 'Slot options'], ['back', 'Back']]; }

  async toSlots() {
    this.app.audio.unlock();
    this.app.audio.playMusic('menu');
    this.stage = 'slots';
    this.slots = await this.app.saves.listSlots();
    this.ui.refresh(this);
  }

  onBack() {
    if (this.stage === 'slots') { this.stage = 'press'; this.ui.refresh(this); return true; }
    return false;
  }

  async onAlt(focused) {
    const slot = focused?.dataset?.id;
    if (!slot || !SLOTS.includes(slot)) return;
    const info = this.slots.slots.find((s) => s.slot === slot);
    if (!info?.exists) return;
    const choice = await this.ui.choose(`${slot.replace('slot', 'Slot ')} — ${info.name}`, [
      { label: 'Load', value: 'load' },
      { label: 'Export to file', value: 'export', desc: 'Download this save as a .json file.' },
      { label: 'Delete save…', value: 'delete', desc: 'Permanently erase this slot (and its backup).' },
    ]);
    if (choice === 'load') this.load(slot);
    if (choice === 'export') {
      const r = await this.app.saves.load(slot);
      if (r.ok) downloadText(`chaos-spin-${slot}.json`, this.app.saves.exportString(r.data));
    }
    if (choice === 'delete') {
      const ok = await this.ui.confirm('Delete save?', `This permanently erases ${info.name}'s progress in ${slot.replace('slot', 'Slot ')}. This cannot be undone.`, { yes: 'Delete', danger: true });
      if (ok) { await this.app.saves.remove(slot); this.slots = await this.app.saves.listSlots(); this.ui.refresh(this); this.ui.toast('Save deleted.'); }
    }
  }

  async load(slot) {
    const r = await this.app.saves.load(slot);
    if (!r.ok) {
      if (r.corrupt) {
        const reset = await this.ui.confirm('Save could not be read', `The save in this slot is damaged (${r.reason}) and no valid backup exists. Start a new game in this slot?`, { yes: 'Start new', danger: true });
        if (reset) this.newGame(slot, true);
      }
      return;
    }
    if (r.recovered) this.ui.toast('The latest save was damaged — restored the previous backup.', 'warn', 5000);
    if (r.migrated?.length) this.ui.toast(`Save upgraded from version ${r.migrated[0]}.`, 'info');
    this.app.setProfile(r.data, slot);
    this.enterGame();
  }

  async newGame(slot, force = false) {
    const info = this.slots?.slots.find((s) => s.slot === slot);
    if (info?.exists && !force) {
      const ok = await this.ui.confirm('Overwrite save?', 'Starting a new game here will replace the existing save.', { yes: 'Overwrite', danger: true });
      if (!ok) return;
    }
    const p = await this.app.saves.createNew(slot, (Math.random() * 2 ** 31) | 0);
    this.app.setProfile(p, slot);
    this.ui.push(new NameEntryScreen((name) => {
      this.app.profile.player.name = name || 'Rookie';
      this.app.save('silent');
      this.enterGame();
    }));
  }

  enterGame() {
    this.ui.show(new MainMenu());
  }

  pickImport(fileIn) { fileIn.click(); }

  async importFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const profile = this.app.saves.importString(text);
      const slot = await this.ui.choose('Import into which slot?', SLOTS.map((s) => ({ label: s.replace('slot', 'Slot ') + (this.slots.slots.find((x) => x.slot === s)?.exists ? ' (overwrite)' : ''), value: s })));
      if (!slot) return;
      if (this.slots.slots.find((x) => x.slot === slot)?.exists) {
        const ok = await this.ui.confirm('Overwrite save?', 'Importing will replace the save in this slot.', { yes: 'Import', danger: true });
        if (!ok) return;
      }
      await this.app.saves.save(slot, profile);
      this.slots = await this.app.saves.listSlots();
      this.ui.refresh(this);
      this.ui.toast('Save imported.', 'good');
    } catch (e) {
      this.ui.toast('Import failed: ' + e.message, 'bad', 5000);
    }
  }
}

export class NameEntryScreen {
  static screenName = 'NameEntryScreen';
  constructor(onDone) { this.onDone = onDone; this.name = ''; }
  render() {
    const osk = textEntry({ value: '', max: 14, onChange: (v) => { this.name = v; }, onDone: (v) => this.finish(v), suggestions: NAME_SUGGESTIONS });
    this.osk = osk;
    return h('div', { class: 'center-screen' }, h('div', { class: 'panel name-panel' }, h('h2', {}, 'What should the stadium call you?'), h('p', { class: 'muted' }, 'Type with the keyboard, or use the on-screen keys with a controller.'), osk));
  }
  onEnter() { this.handler = (e) => this.osk._keyHandler(e); window.addEventListener('keydown', this.handler, true); this.app.input.textEntry = true; }
  onExit() { window.removeEventListener('keydown', this.handler, true); this.app.input.textEntry = false; }
  onBack() { return false; }
  finish(v) {
    const name = (v || '').trim() || NAME_SUGGESTIONS[Math.floor(Math.random() * NAME_SUGGESTIONS.length)];
    this.onDone(name);
  }
  prompts() { return [['confirm', 'Press key']]; }
}

function fmtPlay(s = 0) { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }

export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
