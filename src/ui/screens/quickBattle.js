// Quick Battle setup: pick a loadout, an opponent archetype and difficulty,
// an unlocked stadium and a match format.

import { h, btn, selector } from '../ui.js';
import { ARCHETYPES, ARCHETYPE_INDEX, DIFFICULTIES, participantFromDef } from '../../data/opponents.js';
import { ARENAS, ARENA_INDEX } from '../../data/arenas.js';
import { FORMATS } from '../../game/battle.js';
import { AI_PROFILES } from '../../data/aiProfiles.js';
import { validateLoadout, buildParticipant } from '../../systems/loadout.js';
import { BattleScreen } from './battle.js';
import { beastImg } from '../widgets.js';

export class QuickBattleScreen {
  static screenName = 'QuickBattleScreen';
  constructor(opts = {}) {
    this.opts = opts;
    this.cfg = { opponent: 'all', difficulty: 'regular', arena: 'standard', format: 'bo3' };
  }

  render() {
    const p = this.app.profile;
    const unlocked = ARENAS.filter((a) => p.arenasUnlocked.includes(a.id));
    if (!unlocked.some((a) => a.id === this.cfg.arena)) this.cfg.arena = unlocked[0].id;
    const L = p.loadouts[p.activeLoadout] || p.loadouts[0];
    const val = L ? validateLoadout(p, L) : { ok: false, errors: ['No loadout'] };
    const opp = ARCHETYPE_INDEX[this.cfg.opponent];
    const arena = ARENA_INDEX[this.cfg.arena];
    const rows = h('div', { class: 'col gap', 'data-wrap': '' },
      selector('Your loadout', p.loadouts.map((x, i) => ({ value: i, label: x.name + (validateLoadout(p, x).ok ? '' : ' ⚠') })), p.activeLoadout, (v) => { p.activeLoadout = v; this.ui.refresh(this); }, { id: 'loadout', desc: 'Loadouts are edited in the Workshop.' }),
      selector('Opponent', ARCHETYPES.map((a) => ({ value: a.id, label: a.name, desc: `${a.desc} AI: ${AI_PROFILES[a.ai].name}.` })), this.cfg.opponent, (v) => { this.cfg.opponent = v; this.ui.refresh(this); }, { id: 'opp' }),
      selector('Difficulty', DIFFICULTIES.map((d) => ({ value: d.id, label: d.name, desc: 'Scales the AI\'s launch accuracy, reaction time and steering precision — never its physics.' })), this.cfg.difficulty, (v) => { this.cfg.difficulty = v; }, { id: 'diff' }),
      selector('Stadium', unlocked.map((a) => ({ value: a.id, label: a.name, desc: a.desc })), this.cfg.arena, (v) => { this.cfg.arena = v; this.ui.refresh(this); }, { id: 'arena' }),
      selector('Format', Object.values(FORMATS).filter((f) => !f.hidden).map((f) => ({ value: f.id, label: f.name })), this.cfg.format, (v) => { this.cfg.format = v; }, { id: 'format', desc: 'Points race: Spin Finish 1, Ring Out 2, Shatter 2, Judge Decision 1.' }),
    );
    const start = btn('Start Battle', () => this.start(), { class: 'primary big', disabled: !val.ok });
    start.dataset.id = 'start';
    return h('div', { class: 'std-screen' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Quick Battle')),
      h('div', { class: 'two-col' },
        h('div', { class: 'panel' }, rows, val.ok ? null : h('div', { class: 'warn-box' }, h('b', {}, 'Loadout invalid: '), val.errors.join(' ')), val.warnings?.length ? h('div', { class: 'note-box' }, val.warnings.join(' ')) : null, start),
        h('div', { class: 'panel preview' },
          h('h3', {}, 'Opponent'), h('div', { class: 'row gap' }, beastImg(opp.beast, 56), h('div', {}, h('b', {}, opp.name), h('div', { class: 'muted' }, opp.desc), h('div', { class: 'muted' }, `Personality: ${AI_PROFILES[opp.ai].name} — ${AI_PROFILES[opp.ai].desc}`))),
          h('h3', {}, arena.name), h('div', { class: 'muted' }, arena.desc), h('ul', { class: 'tactics' }, arena.tactics.map((t) => h('li', {}, t))))));
  }

  start() {
    const app = this.app;
    const p = app.profile;
    const L = p.loadouts[p.activeLoadout];
    const val = validateLoadout(p, L);
    if (!val.ok) { this.ui.toast(val.errors.join(' '), 'bad'); return; }
    const me = buildParticipant(p, L, { id: 'player' });
    const def = ARCHETYPE_INDEX[this.cfg.opponent];
    const diff = DIFFICULTIES.find((d) => d.id === this.cfg.difficulty).value;
    const opp = participantFromDef(def, { difficulty: diff, id: 'cpu' });
    this.ui.push(new BattleScreen({
      mode: 'quick', title: 'Quick Battle', arenaId: this.cfg.arena, format: this.cfg.format,
      participants: [me, opp], loadoutIndex: p.activeLoadout, difficulty: diff, opponentDef: def,
    }));
  }

  prompts() { return [['nav_left', 'Change'], ['confirm', 'Select'], ['back', 'Back']]; }
}
