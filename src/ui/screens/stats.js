// Statistics: overview, finishes, launches, stadiums, Bit-Beasts, builds,
// records and recent battles, all from the saved profile.

import { h, btn } from '../ui.js';
import { replayScreen } from './results.js';
import { statRow, fmtTime } from '../widgets.js';
import { barList } from '../charts.js';
import { ARENA_INDEX } from '../../data/arenas.js';
import { BEAST_INDEX, bondLevel } from '../../data/beasts.js';
import { FINISH_NAMES } from '../../game/battle.js';
import { describeHabits } from '../../systems/rivals.js';

const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'usage', label: 'Usage' }, { id: 'history', label: 'History' }, { id: 'replays', label: 'Replays' }];
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export class StatsScreen {
  static screenName = 'StatsScreen';
  constructor() { this.tab = 'overview'; }

  render() {
    const S = this.app.profile.stats;
    const body = this.tab === 'overview' ? this.overview(S) : this.tab === 'usage' ? this.usage(S) : this.tab === 'replays' ? this.replaysView() : this.history(S);
    return h('div', { class: 'std-screen stats' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Statistics'),
        h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => { this.tab = t.id; this.ui.refresh(this); } }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next')))),
      body);
  }

  onTab(d) { const i = TABS.findIndex((t) => t.id === this.tab); this.tab = TABS[(i + d + TABS.length) % TABS.length].id; this.ui.refresh(this); return true; }

  overview(S) {
    const P = this.app.profile;
    const finishes = Object.keys(FINISH_NAMES).filter((k) => k !== 'draw');
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel scroll', 'data-scroll': 'ov' },
        h('h3', {}, 'Battles'),
        statRow('Played', S.battles), statRow('Won', `${S.wins} (${pct(S.wins, S.battles)})`), statRow('Lost', S.losses), statRow('Drawn', S.draws),
        statRow('Rounds won', `${S.roundsWon} of ${S.rounds} (${pct(S.roundsWon, S.rounds)})`),
        statRow('Current / best streak', `${S.streak} / ${S.bestStreak}`),
        statRow('Total battle time', fmtTime(S.totalBattleTime || 0)),
        statRow('Tournaments won', S.tournamentsWon || 0), statRow('Story chapters', `${P.story.completed?.length || 0} / 6`),
        h('h3', {}, 'Launches'),
        statRow('Launches', S.launches), statRow('Perfect launches', `${S.perfectLaunches} (${pct(S.perfectLaunches, S.launches)})`),
        h('h3', {}, 'Records'),
        statRow('Heaviest impact', `${(S.highestImpact || 0).toFixed(3)} N·s`), statRow('Longest round', fmtTime(S.longestSpin || 0)),
        statRow('Impacts', S.impacts || 0), statRow('Successful counters', S.counters || 0), statRow('Distance travelled', `${(S.distance || 0).toFixed(1)} m`),
        statRow('Abilities used', S.abilityUses), statRow('Survival best', S.survivalBest || 0)),
      h('div', { class: 'panel scroll' },
        h('h3', {}, 'Rounds won by finish'), barList(finishes.map((k) => ({ label: FINISH_NAMES[k], value: S.finishes[k] || 0 }))),
        h('h3', {}, 'Rounds lost by finish'), barList(finishes.map((k) => ({ label: FINISH_NAMES[k], value: S.losses_by[k] || 0 }))),
        h('h3', {}, 'Your habits (what adaptive rivals see)'), ...describeHabits(P.habits).map((x) => h('div', { class: 'small' }, x))));
  }

  usage(S) {
    const P = this.app.profile;
    const top = (obj, map) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: map(k), value: v }));
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel scroll' },
        h('h3', {}, 'Stadiums'), barList(top(S.arenaUse, (k) => ARENA_INDEX[k]?.name || k), { format: (v) => `${v} battles` }),
        h('h3', {}, 'Builds'), barList(top(S.buildUse, (k) => k), { format: (v) => `${v} battles` })),
      h('div', { class: 'panel scroll' },
        h('h3', {}, 'Bit-Beasts'), barList(top(S.beastUse, (k) => BEAST_INDEX[k]?.name || k), { format: (v) => `${v} battles` }),
        ...Object.values(P.beasts).map((b) => statRow(BEAST_INDEX[b.id]?.name || b.id, `Bond ${bondLevel(b.bondXp)} · ${b.stats.winsWith || 0} wins together${b.awakened ? ' · Awakened' : ''}`))));
  }

  async loadReplays() {
    this.replays = await this.app.saves.listReplays(this.app.slot).catch(() => []);
    if (this.ui.current === this && this.tab === 'replays') this.ui.refresh(this);
  }

  onEnter() { this.loadReplays(); }
  onResume() { this.loadReplays(); }

  replaysView() {
    const list = this.replays || [];
    return h('div', { class: 'panel scroll col gap', 'data-wrap': '' },
      h('h3', {}, 'Replays'),
      h('div', { class: 'small muted' }, 'Every match you play is recorded as your inputs plus the battle seed, then re-simulated on playback with the same physics — the replay is checked against the original result. The newest 12 are kept; pinned replays are kept until deleted.'),
      ...(list.length ? list.map((r) => h('div', { class: 'replay-row' },
        btn(h('div', {}, h('b', {}, `${r.pinned ? '📌 ' : ''}${r.names.join(' vs ')}`), h('div', { class: 'small muted' }, `${r.title} · ${r.score} · ${new Date(r.date).toLocaleString()}`)), () => this.watch(r.id), { class: 'tour-btn', id: 'rep-' + r.id, desc: 'Watch this replay.' }),
        btn(r.pinned ? 'Unpin' : 'Pin', async () => { await this.app.saves.pinReplay(this.app.slot, r.id, !r.pinned); this.loadReplays(); }, { id: 'pin-' + r.id }),
        btn('Delete', async () => { if (await this.ui.confirm('Delete replay?', `${r.names.join(' vs ')} · ${r.score}`, { danger: true, yes: 'Delete' })) { await this.app.saves.deleteReplay(this.app.slot, r.id); this.loadReplays(); } }, { class: 'danger', id: 'del-' + r.id }))) : [h('div', { class: 'muted' }, this.replays ? 'No replays yet — play a match.' : 'Loading…')]));
  }

  async watch(id) {
    const rep = await this.app.saves.getReplay(this.app.slot, id).catch(() => null);
    if (!rep) { this.ui.toast('Replay not available.', 'bad'); return; }
    this.ui.push(replayScreen(rep));
  }

  history(S) {
    const H = S.history || [];
    return h('div', { class: 'panel scroll' }, h('h3', {}, 'Recent battles'),
      H.length ? H.map((x) => h('div', { class: 'hist-row' }, h('span', { class: 'hr-place ' + (x.won ? 'good' : x.draw ? '' : 'bad') }, x.won ? 'W' : x.draw ? 'D' : 'L'), h('span', { class: 'hr-name' }, `vs ${x.opp}`), h('span', { class: 'muted small' }, `${x.score} · ${x.mode} · ${ARENA_INDEX[x.arena]?.name || x.arena} · ${new Date(x.t).toLocaleString()}`))) : h('div', { class: 'muted' }, 'No battles yet.'));
  }

  prompts() { return [['tab_prev', 'Tabs'], ['back', 'Back']]; }
}
