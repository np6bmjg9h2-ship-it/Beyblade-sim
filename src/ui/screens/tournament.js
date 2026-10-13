// Tournament screens: the circuit board (tournaments, career, rivals), the
// tournament hub (bracket / standings, next match, scouting, workshop,
// withdraw), the scouting report and the award ceremony. All controller
// navigable; LB/RB switch tabs.

import { h, btn, selector } from '../ui.js';
import { beastImg, statRow, itemCard, rarityChip } from '../widgets.js';
import { TOURNAMENTS, TOURNAMENT_INDEX, CIRCUIT_TIERS, FORMAT_NAMES, FORMAT_DESC, rankTitle } from '../../data/tournaments.js';
import { CHARACTERS, CHARACTER_INDEX } from '../../data/characters.js';
import { ARENA_INDEX } from '../../data/arenas.js';
import { AI_PROFILES } from '../../data/aiProfiles.js';
import { FORMATS } from '../../game/battle.js';
import { BEAST_INDEX } from '../../data/beasts.js';
import { PART_INDEX } from '../../data/parts.js';
import { RARITY_INDEX } from '../../data/rarity.js';
import { baseOf, itemName } from '../../systems/items.js';
import { assembleTop } from '../../systems/assembly.js';
import { validateLoadout, buildParticipant } from '../../systems/loadout.js';
import { buildRole, ROLE_NAMES, describeHabits, preMatchLine, postMatchLine, rivalRecord, markSeen } from '../../systems/rivals.js';
import {
  canEnter, createTournament, checkLoadoutRules, readyMatches, playerMatch, playerEliminated, playerPlace, standings,
  applyResult, matchFormat, matchArena, ensurePlan, entrantParticipant, finishTournament, withdraw, prizeFor, unlockLabel, playerRecord, PLAYER, bestPlace,
} from '../../systems/tournament.js';
import { BattleScreen } from './battle.js';
import { WorkshopScreen } from './workshop.js';
import { DialogueScreen } from './dialogue.js';

const ordinal = (n) => {
  if (n == null) return '—';
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return n + suf;
};
const tierOf = (t) => CIRCUIT_TIERS.find((x) => x.tier === t);
const FMT_NAME = (id) => FORMATS[id]?.name || id;

function prizeText(p) {
  if (!p) return '—';
  const parts = [`${p.credits} cr`, `${p.xp} XP`, `${p.ranking} pts`];
  if (p.loot?.length) parts.push(`${p.loot.length} item${p.loot.length > 1 ? 's' : ''}${p.loot.some((l) => l.minRarity) ? ` (${p.loot.map((l) => l.minRarity ? RARITY_INDEX[l.minRarity].name + '+' : 'any').join(', ')})` : ''}`);
  return parts.join(' · ');
}

// ====================================================================== board

const BOARD_TABS = [{ id: 'circuit', label: 'Circuit' }, { id: 'career', label: 'Career' }, { id: 'rivals', label: 'Rivals' }];

export class TournamentsScreen {
  static screenName = 'TournamentsScreen';
  constructor(opts = {}) { this.opts = opts; this.tab = 'circuit'; this.sel = null; this.loadoutIdx = null; this.rivalSel = null; }

  get P() { return this.app.profile; }

  onEnter() {
    // jump straight back into a tournament in progress
    if (this.opts.openActive && this.P.tournaments.active) queueMicrotask(() => this.openHub());
  }

  render() {
    const P = this.P;
    const pts = P.tournaments.ranking.points || 0;
    const body = this.tab === 'circuit' ? this.renderCircuit() : this.tab === 'career' ? this.renderCareer() : this.renderRivals();
    return h('div', { class: 'std-screen tournaments' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Tournaments'),
        h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), BOARD_TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => this.setTab(t.id) }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next'))),
        h('div', { class: 'mats' }, `${rankTitle(pts)} · ${pts} circuit pts · ${P.currency.credits.toLocaleString()} cr`)),
      body);
  }

  setTab(t) { this.tab = t; this.ui.refresh(this); }
  onTab(d) { const i = BOARD_TABS.findIndex((t) => t.id === this.tab); this.setTab(BOARD_TABS[(i + d + BOARD_TABS.length) % BOARD_TABS.length].id); return true; }
  onResume() { this.ui.refresh(this); }
  prompts() { return [['confirm', 'Select'], ['tab_prev', 'Tabs'], ['back', 'Back']]; }

  // -------------------------------------------------------------- circuit

  renderCircuit() {
    const P = this.P;
    const active = P.tournaments.active;
    const list = h('div', { class: 'col gap', 'data-wrap': '' });
    if (active) {
      const b = btn(h('div', { class: 'tour-tile active-tour' }, h('div', { class: 'tt-name' }, `▶ Continue: ${active.name}`), h('div', { class: 'small muted' }, playerEliminated(active) ? 'You are out — collect your result' : 'In progress')), () => this.openHub(), { class: 'tour-btn primary', id: 'continue' });
      list.append(b);
    }
    for (const tier of CIRCUIT_TIERS) {
      const defs = TOURNAMENTS.filter((d) => d.tier === tier.tier);
      if (!defs.length) continue;
      list.append(h('div', { class: 'tier-head', style: { color: tier.color } }, `${tier.name} circuit`));
      for (const d of defs) {
        const ce = canEnter(P, { ...d, fee: 0 });
        const rec = P.tournaments.records?.[d.id];
        const locked = !ce.ok && !(active && ce.reasons.length === 1);
        const el = btn(h('div', { class: 'tour-tile' },
          h('div', { class: 'tt-name' }, d.name, rec?.wins ? h('span', { class: 'trophy' }, ' 🏆'.repeat(Math.min(3, rec.wins))) : null),
          h('div', { class: 'small muted' }, `${FORMAT_NAMES[d.format]} · ${d.size} entrants${rec ? ` · best ${ordinal(rec.best)}` : ''}${locked ? ' · 🔒' : ''}`)),
        () => { this.sel = d.id; this.ui.refresh(this); }, { class: 'tour-btn' + (this.sel === d.id ? ' sel' : '') + (locked ? ' locked' : ''), id: 'tour-' + d.id });
        list.append(el);
      }
    }
    if (!this.sel) this.sel = (TOURNAMENTS.find((d) => canEnter(P, { ...d, fee: 0 }).ok) || TOURNAMENTS[0]).id;
    return h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel scroll' }, list), h('div', { class: 'panel scroll', 'data-scroll': 'tour' }, this.renderDetail(TOURNAMENT_INDEX[this.sel])));
  }

  renderDetail(def) {
    const P = this.P;
    const ce = canEnter(P, def);
    if (this.loadoutIdx == null) this.loadoutIdx = P.activeLoadout;
    const L = P.loadouts[this.loadoutIdx];
    const val = L ? validateLoadout(P, L) : { ok: false, errors: ['No loadout'] };
    const ruleErr = L ? checkLoadoutRules(P, L, def) : [];
    const tier = tierOf(def.tier);
    const rules = def.rules || {};
    const R = def.req || {};
    const req = [];
    if (R.level) req.push([`Player level ${R.level}`, P.player.level >= R.level]);
    if (R.ranking) req.push([`${R.ranking} circuit points`, (P.tournaments.ranking.points || 0) >= R.ranking]);
    for (const [id, pl] of R.placed || []) { const b = bestPlace(P, id); req.push([`Top ${pl} in ${TOURNAMENT_INDEX[id].name}`, b != null && b <= pl]); }
    if (R.wonAny) req.push([`Win ${R.wonAny.map((id) => TOURNAMENT_INDEX[id].name).join(' or ')}`, R.wonAny.some((id) => bestPlace(P, id) === 1)]);
    const rec = P.tournaments.records?.[def.id];
    const arenas = [...new Set([...(def.arenas || []), ...(def.finalArena ? [def.finalArena] : [])])].map((a) => ARENA_INDEX[a]?.name || a);
    const restrict = rules.restrict?.roles ? `Builds: ${rules.restrict.roles.map((r) => ROLE_NAMES[r]).join(', ')} only` : null;
    const mf = def.matchFormat || {};
    return h('div', { class: 'col gap' },
      h('div', {}, h('h2', {}, def.name), h('div', { class: 'row gap small' }, h('span', { class: 'chip', style: { color: tier.color, borderColor: tier.color } }, `${tier.name} · Tier ${def.tier}`), h('span', { class: 'chip' }, FORMAT_NAMES[def.format]), h('span', { class: 'chip' }, `${def.size} entrants`))),
      h('div', {}, def.desc),
      h('div', { class: 'small muted' }, FORMAT_DESC[def.format]),
      h('h3', {}, 'Rules'),
      statRow('Matches', `${FMT_NAME(mf.default || 'bo3')}${mf.lower ? ` · lower bracket ${FMT_NAME(mf.lower)}` : ''}${mf.playoff ? ` · playoffs ${FMT_NAME(mf.playoff)}` : ''}${mf.final ? ` · final ${FMT_NAME(mf.final)}` : ''}`),
      statRow('Stadiums', arenas.join(', ')),
      statRow('Durability', rules.durability === false ? 'Off' : 'On — wear carries between matches'),
      statRow('Repairs', rules.repairs === false ? 'Iron Endurance: no repairs to your tournament parts until you finish' : 'Allowed between matches (Workshop)'),
      statRow('Loadout', rules.lockLoadout ? 'Locked: you battle with the parts you register' : 'Free: any valid loadout between matches'),
      restrict ? statRow('Restriction', restrict) : null,
      statRow('Entry fee', def.fee ? `${def.fee} cr` : 'Free'),
      req.length ? h('h3', {}, 'Requirements') : null,
      ...req.map(([t, ok]) => h('div', { class: 'small ' + (ok ? 'good' : 'bad') }, `${ok ? '✓' : '✗'} ${t}`)),
      h('h3', {}, 'Entrants'),
      h('div', { class: 'row gap wrap' }, (def.rivals || []).map((id) => { const c = CHARACTER_INDEX[id]; return h('div', { class: 'rival-chip', style: { borderColor: c.color } }, beastImg(c.beast, 28), c.name); }),
        def.size - 1 - (def.rivals || []).length > 0 ? h('div', { class: 'small muted' }, `+ ${def.size - 1 - def.rivals.length} open entrants`) : null),
      h('h3', {}, 'Prizes'),
      ...Object.keys(def.prizes).map(Number).sort((a, b) => a - b).map((k, i, arr) => statRow(k === 1 ? 'Winner' : k === 2 ? 'Runner-up' : `${(arr[i - 1] || 0) + 1}–${k}`, prizeText(def.prizes[k]))),
      def.firstWin ? h('div', { class: 'small gold' }, `First win: ${def.firstWin.note}`) : null,
      rec ? h('div', { class: 'small muted' }, `Your record: ${rec.entries} entries · ${rec.wins} wins · ${rec.podiums} podiums · best ${ordinal(rec.best)}`) : null,
      h('h3', {}, 'Register'),
      selector('Loadout', P.loadouts.map((x, i) => ({ value: i, label: x.name + (validateLoadout(P, x).ok && !checkLoadoutRules(P, x, def).length ? '' : ' ⚠') })), this.loadoutIdx, (v) => { this.loadoutIdx = v; this.ui.refresh(this); }, { id: 'reg-loadout', desc: 'The loadout you will battle with. Edit it in the Workshop.' }),
      !val.ok ? h('div', { class: 'warn-box small' }, val.errors.join(' ')) : null,
      ruleErr.length ? h('div', { class: 'warn-box small' }, ruleErr.join(' ')) : null,
      !ce.ok ? h('div', { class: 'warn-box small' }, ce.reasons.join(' ')) : null,
      btn(`Enter ${def.name}${def.fee ? ` (${def.fee} cr)` : ''}`, () => this.enter(def), { class: 'primary big', id: 'enter', disabled: !ce.ok || !val.ok || ruleErr.length > 0 }));
  }

  async enter(def) {
    const P = this.P;
    const ok = await this.ui.confirm(`Enter the ${def.name}?`, `${FORMAT_NAMES[def.format]}, ${def.size} entrants.${def.fee ? ` Entry fee: ${def.fee} credits.` : ''}${def.rules?.repairs === false ? ' Iron Endurance: no repairs until you finish.' : ''}${def.rules?.lockLoadout ? ' Your loadout will be locked.' : ''} Your progress is saved after every match; you can leave and continue later.`, { yes: 'Enter' });
    if (!ok) return;
    const ce = canEnter(P, def);
    if (!ce.ok) { this.ui.toast(ce.reasons[0], 'bad'); return; }
    P.currency.credits -= def.fee || 0;
    const seed = (Date.now() ^ (P.seeds.counter * 2654435761)) >>> 0;
    P.tournaments.active = createTournament(def, P, { seed, loadoutIndex: this.loadoutIdx });
    for (const e of P.tournaments.active.entrants) if (e.rivalId) markSeen(P, e.rivalId);
    P.activeLoadout = this.loadoutIdx;
    await this.app.save('silent');
    this.app.tournaments.kick();
    this.openHub();
  }

  openHub() { this.ui.push(new TournamentHubScreen()); }

  // -------------------------------------------------------------- career

  renderCareer() {
    const P = this.P;
    const T = P.tournaments;
    const S = P.stats;
    const pts = T.ranking.points || 0;
    const recs = Object.entries(T.records || {});
    const hist = h('div', { class: 'col' }, T.history.length ? T.history.slice(0, 30).map((x) => h('div', { class: 'hist-row' },
      h('span', { class: 'hr-place ' + (x.place === 1 ? 'gold' : x.place && x.place <= 3 ? 'good' : '') }, x.withdrawn ? 'WD' : ordinal(x.place)),
      h('span', { class: 'hr-name' }, x.name),
      h('span', { class: 'muted small' }, `${x.record.w}-${x.record.l}${x.record.d ? `-${x.record.d}` : ''} · ${new Date(x.date).toLocaleDateString()}${x.credits ? ` · ${x.credits} cr` : ''}`))) : h('div', { class: 'muted' }, 'No tournaments played yet.'));
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel scroll', 'data-wrap': '' },
        h('h2', {}, rankTitle(pts)), h('div', { class: 'muted' }, `${pts} circuit points`),
        h('h3', {}, 'Career'),
        statRow('Tournaments won', S.tournamentsWon || 0), statRow('Finals reached', S.finals || 0),
        statRow('Entries', recs.reduce((s, [, r]) => s + r.entries, 0)), statRow('Podiums', recs.reduce((s, [, r]) => s + r.podiums, 0)),
        statRow('Battles', `${S.wins}W ${S.losses}L ${S.draws}D`), statRow('Prize & battle earnings', `${(S.earnings || 0).toLocaleString()} cr`),
        (P.player.titles || []).length ? h('div', {}, h('h3', {}, 'Titles'), ...(P.player.titles || []).map((t) => h('div', { class: 'gold' }, t))) : null,
        h('h3', {}, 'Trophy cabinet'),
        ...TOURNAMENTS.map((d) => { const r = T.records?.[d.id]; return h('div', { class: 'trophy-row' + (r?.wins ? ' won' : '') }, h('span', {}, r?.wins ? '🏆' : r ? '·' : '🔒'), h('span', {}, d.name), h('span', { class: 'muted small' }, r ? `${r.wins} win${r.wins === 1 ? '' : 's'} · best ${ordinal(r.best)} · ${r.entries} entries` : 'Not entered')); }),
        h('h3', {}, 'Your battle habits'), ...describeHabits(P.habits).map((x) => h('div', { class: 'small' }, x)),
        h('div', { class: 'small muted' }, 'Adaptive rivals read these habits and change their builds and tactics to counter them.')),
      h('div', { class: 'panel scroll', 'data-scroll': 'hist' }, h('h3', {}, 'Tournament history'), hist,
        h('h3', {}, 'Recent battles'), ...(S.history || []).slice(0, 15).map((x) => h('div', { class: 'hist-row' }, h('span', { class: 'hr-place ' + (x.won ? 'good' : x.draw ? '' : 'bad') }, x.won ? 'W' : x.draw ? 'D' : 'L'), h('span', { class: 'hr-name' }, `vs ${x.opp}`), h('span', { class: 'muted small' }, `${x.score} · ${x.mode} · ${ARENA_INDEX[x.arena]?.name || x.arena}`)))));
  }

  // -------------------------------------------------------------- rivals

  renderRivals() {
    const P = this.P;
    const list = h('div', { class: 'col gap', 'data-wrap': '' });
    for (const c of CHARACTERS) {
      const r = P.rivals?.[c.id];
      const known = r?.met || r?.seen;
      const el = btn(h('div', { class: 'row gap' }, known ? beastImg(c.beast, 36) : h('div', { class: 'beast-unknown small' }, '?'), h('div', {}, h('div', { class: 'tt-name' }, known ? c.name : '???'), h('div', { class: 'small muted' }, r?.met ? `You ${r.playerWins}–${r.playerLosses}${r.draws ? `–${r.draws}` : ''} ${c.name.split(' ')[0]}` : known ? 'Seen on the circuit — not battled yet' : 'Not met yet'))),
        () => { this.rivalSel = c.id; this.ui.refresh(this); }, { class: 'tour-btn' + (this.rivalSel === c.id ? ' sel' : ''), id: 'rival-' + c.id });
      list.append(el);
    }
    const id = this.rivalSel || CHARACTERS[0].id;
    return h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel scroll' }, list), h('div', { class: 'panel scroll', 'data-scroll': 'rival' }, rivalDetail(P, id)));
  }
}

function rivalDetail(P, id) {
  const c = CHARACTER_INDEX[id];
  const r = P.rivals?.[id];
  if (!r?.met && !r?.seen) return h('div', { class: 'col gap' }, h('h2', {}, 'Unknown rival'), h('div', { class: 'muted' }, 'Meet this battler in a tournament or the story to learn about them.'));
  const prof = AI_PROFILES[c.ai];
  if (!r.met) {
    return h('div', { class: 'col gap' },
      h('div', { class: 'row gap' }, beastImg(c.beast, 90), h('div', {}, h('h2', { style: { color: c.color } }, c.name), h('div', { class: 'muted' }, `${c.title} · ${c.home}`), h('div', { class: 'small' }, c.bio))),
      statRow('Personality', `${prof.name} — ${prof.desc}`), statRow('Spirit Chip', BEAST_INDEX[c.beast]?.name || '—'),
      h('h3', {}, 'Signature'), h('div', { class: 'small' }, c.signature),
      h('div', { class: 'muted small' }, 'Battle them to record a head-to-head and the builds they use against you.'));
  }
  return h('div', { class: 'col gap' },
    h('div', { class: 'row gap' }, beastImg(c.beast, 90), h('div', {}, h('h2', { style: { color: c.color } }, c.name), h('div', { class: 'muted' }, `${c.title} · ${c.home}`), h('div', { class: 'small' }, c.bio))),
    statRow('Head to head', `You ${r.playerWins} – ${r.playerLosses} ${c.name.split(' ')[0]}${r.draws ? ` (${r.draws} draws)` : ''}`),
    statRow('Last result', r.lastResult === 'win' ? 'You won' : r.lastResult === 'loss' ? 'You lost' : 'Draw'),
    statRow('Personality', `${prof.name} — ${prof.desc}`),
    statRow('Spirit Chip', BEAST_INDEX[c.beast]?.name || '—'),
    statRow('Adaptability', c.adapt >= 0.8 ? 'Very high: changes builds to counter your latest style' : c.adapt >= 0.5 ? 'High: counters your favourite style' : c.adapt >= 0.3 ? 'Moderate' : 'Low: sticks to their style'),
    h('h3', {}, 'Signature'), h('div', { class: 'small' }, c.signature),
    h('h3', {}, 'Builds seen'), ...(r.buildsSeen.length ? r.buildsSeen.map((b) => { const B = c.builds.find((x) => x.id === b); return h('div', { class: 'small' }, B ? `${B.name} (${ROLE_NAMES[B.role]}) — ${Object.values(B.parts).map((p) => PART_INDEX[p]?.name).join(', ')}` : b); }) : [h('div', { class: 'small muted' }, 'None recorded yet.')]),
    h('h3', {}, 'Scouting notes'), h('div', { class: 'small' }, c.dialogue.scout),
    h('h3', {}, 'History'), ...(r.events || []).map((e) => h('div', { class: 'small muted' }, e)));
}

// ====================================================================== hub

export class TournamentHubScreen {
  static screenName = 'TournamentHubScreen';
  constructor({ slot = 'tournament' } = {}) { this.dirty = false; this.view = 'bracket'; this.slot = slot; }

  get P() { return this.app.profile; }
  get t() { return this.slot === 'league' ? this.P.league?.active || null : this.P.tournaments.active; }

  onEnter() {
    this.off = this.app.tournaments.on('result', () => { if (this.ui.current === this) this.ui.refresh(this); else this.dirty = true; });
    this.app.tournaments.kick();
    this.tick = 0;
    this.app.audio.playMusic('tournament');
  }
  onExit() { this.off?.(); }
  onResume() {
    const t = this.t;
    if (!t) { this.ui.pop(); return; }
    this.app.audio.playMusic('tournament');
    this.ui.refresh(this);
  }

  update(dt) {
    // refresh the "simulating" indicator now and then
    this.tick += dt;
    if (this.tick > 1 && this.ui.current === this) { this.tick = 0; const el = this.el?.querySelector('.sim-status'); if (el) el.textContent = this.simStatus(); }
  }

  simStatus() {
    const r = this.app.tournaments;
    const n = r.pending;
    if (!n) return 'All other matches up to date.';
    return `Simulating ${n} other match${n === 1 ? '' : 'es'} (${r.mode === 'worker' ? 'background worker' : 'main thread'})…`;
  }

  render() {
    const t = this.t;
    if (!t) return h('div', { class: 'std-screen' }, h('h1', {}, 'No active tournament'));
    const def = TOURNAMENT_INDEX[t.defId];
    const st = t.stages[t.stage];
    const tier = tierOf(def.tier);
    const out = playerEliminated(t);
    const place = playerPlace(t);
    const rec = playerRecord(t);
    const m = playerMatch(t);
    const left = h('div', { class: 'panel scroll hub-left', 'data-scroll': 'bracket' },
      h('div', { class: 'row gap' }, h('h3', {}, st.name), h('span', { class: 'muted small' }, t.stages.length > 1 ? `Stage ${t.stage + 1} of ${t.stages.length}` : '')),
      stageView(t, st),
      t.stages.length > 1 && t.stage > 0 ? h('div', {}, h('h3', {}, t.stages[0].name), standingsTable(t, t.stages[0])) : null,
      h('h3', {}, 'Results'),
      h('div', { class: 'col small hub-log' }, [...t.log].reverse().slice(0, 14).map((x) => h('div', {}, x.text))));
    let right;
    if (t.status === 'complete' || out) {
      right = h('div', { class: 'col gap' },
        h('h2', {}, t.status === 'complete' ? (place === 1 ? 'Champion!' : `Finished ${ordinal(place)}`) : `Knocked out — ${ordinal(place)} place`),
        h('div', { class: 'muted' }, `Your record: ${rec.w}W ${rec.l}L${rec.d ? ` ${rec.d}D` : ''}`),
        h('div', { class: 'small' }, `Prize: ${prizeText(prizeFor(def, place))}`),
        h('div', { class: 'sim-status small muted' }, t.status === 'complete' ? 'Tournament complete.' : this.simStatus()),
        btn(t.status === 'complete' ? 'Award ceremony' : 'Collect prize & leave', () => this.finish(), { class: 'primary big', id: 'collect' }),
        t.status !== 'complete' ? h('div', { class: 'small muted' }, 'You can also stay and watch the remaining matches resolve. Your place is already decided.') : null);
    } else {
      right = this.nextMatchCard(t, m);
    }
    return h('div', { class: 'std-screen tour-hub' },
      h('div', { class: 'screen-head' }, h('h1', {}, t.name || def.name),
        h('div', { class: 'row gap small' }, h('span', { class: 'chip', style: { color: tier.color, borderColor: tier.color } }, tier.name), h('span', { class: 'chip' }, FORMAT_NAMES[def.format]), h('span', { class: 'chip' }, `Record ${rec.w}-${rec.l}${rec.d ? `-${rec.d}` : ''}`))),
      h('div', { class: 'ws-cols hub-cols' }, left, h('div', { class: 'panel scroll hub-right' }, right)));
  }

  nextMatchCard(t, m) {
    const P = this.P;
    const def = TOURNAMENT_INDEX[t.defId];
    const L = P.loadouts.find((l) => l.id === t.loadout.id) || P.loadouts[t.loadout.index];
    const val = L ? validateLoadout(P, L) : { ok: false, errors: ['Registered loadout missing'] };
    const ruleErr = L ? checkLoadoutRules(P, L, def, t) : [];
    const loadoutSel = t.loadout.locked ? h('div', { class: 'small' }, `Loadout: ${L?.name} (locked)`)
      : selector('Loadout', P.loadouts.map((x, i) => ({ value: x.id, label: x.name })), t.loadout.id, (v) => { t.loadout.id = v; t.loadout.index = P.loadouts.findIndex((x) => x.id === v); this.ui.refresh(this); }, { id: 'hub-loadout' });
    const actions = [
      btn('Workshop', () => this.ui.push(new WorkshopScreen()), { id: 'hub-workshop', desc: def.rules?.repairs === false ? 'Iron Endurance: repairs to your tournament parts are blocked until you finish.' : 'Repair and tune between matches.' }),
      btn('Withdraw', () => this.withdraw(), { class: 'danger', id: 'hub-withdraw' }),
    ];
    if (!m) {
      return h('div', { class: 'col gap' }, h('h2', {}, 'Waiting for the round to finish'), h('div', { class: 'sim-status small muted' }, this.simStatus()), loadoutSel, ...actions);
    }
    ensurePlan(t, m, P);
    const oppIdx = m.a === PLAYER ? m.b : m.a;
    const e = t.entrants[oppIdx];
    const ch = e.rivalId ? CHARACTER_INDEX[e.rivalId] : null;
    const r = e.rivalId ? rivalRecord(P, e.rivalId) : null;
    const arena = ARENA_INDEX[matchArena(t, m)];
    return h('div', { class: 'col gap' },
      h('div', { class: 'muted small' }, `${m.roundName}${m.isFinal ? ' — FINAL' : ''}`),
      h('div', { class: 'row gap next-opp' }, beastImg(e.beast, 72), h('div', {}, h('h2', { style: { color: e.color } }, e.name), h('div', { class: 'small muted' }, ch ? ch.title : 'Open entrant'), r?.met ? h('div', { class: 'small' }, `Head to head: you ${r.playerWins}–${r.playerLosses}`) : null)),
      statRow('Format', FMT_NAME(matchFormat(t, m))),
      statRow('Stadium', arena?.name || '—'),
      m.plan?.adapted ? h('div', { class: 'note-box small' }, `${e.name.split(' ')[0]} has studied you: ${m.plan.notes[0]}`) : null,
      loadoutSel,
      !val.ok ? h('div', { class: 'warn-box small' }, val.errors.join(' ')) : null,
      ruleErr.length ? h('div', { class: 'warn-box small' }, ruleErr.join(' ')) : null,
      btn('Battle!', () => this.play(m), { class: 'primary big', id: 'hub-play', disabled: !val.ok || ruleErr.length > 0 }),
      btn('Scouting report', () => this.ui.push(new ScoutScreen(t, oppIdx, m)), { id: 'hub-scout' }),
      ...actions,
      h('div', { class: 'sim-status small muted' }, this.simStatus()));
  }

  play(m) {
    const app = this.app;
    const P = this.P;
    const t = this.t;
    const def = TOURNAMENT_INDEX[t.defId];
    const L = P.loadouts.find((l) => l.id === t.loadout.id);
    const val = validateLoadout(P, L);
    const errs = [...(val.ok ? [] : val.errors), ...checkLoadoutRules(P, L, def, t)];
    if (errs.length) { this.ui.toast(errs[0], 'bad', 4000); return; }
    ensurePlan(t, m, P);
    const side = m.a === PLAYER ? 0 : 1;
    const oppIdx = side === 0 ? m.b : m.a;
    const e = t.entrants[oppIdx];
    const me = buildParticipant(P, L, { id: 'player' });
    const opp = entrantParticipant(t, oppIdx, P, m);
    const matchId = m.id;
    const tid = t.id;
    const record = (res) => {
      const cur = this.t;
      if (!cur || cur.id !== tid) return;
      // tournament sides are relative to the bracket slot; the battle has the player first
      const flip = (arr) => (side === 0 ? arr : [arr[1], arr[0]]);
      applyResult(cur, matchId, { winnerSide: res.winnerSide == null ? null : side === 0 ? res.winnerSide : 1 - res.winnerSide, score: flip(res.score), points: flip(res.points), how: res.how, forfeit: res.forfeit });
    };
    const session = {
      mode: 'tournament', title: `${t.name || def.name} · ${m.roundName}`, arenaId: matchArena(t, m), format: matchFormat(t, m),
      participants: [me, opp], difficulty: e.difficulty, opponentKey: 'tour-' + (e.rivalId || e.name), rivalId: e.rivalId || null,
      isFinal: !!m.isFinal, rewardScale: 0.6, rules: { loot: false, durability: def.rules?.durability !== false },
      allowRematch: false, allowRestart: false, continueLabel: 'Back to tournament',
      forfeitLabel: 'Forfeit match', forfeitWarning: 'Forfeiting counts as a loss in this tournament. Wear from completed rounds is kept.',
      onForfeit: async () => { record({ winnerSide: 1, score: [0, 1], points: [0, 0], how: 'forfeit', forfeit: true }); await app.save('silent'); app.tournaments.kick(); },
      onFinish: async (result, rewards) => {
        const won = result.winner === 0;
        record({ winnerSide: result.winner, score: result.score.map((s) => s.rounds), points: result.score.map((s) => s.points), how: result.rounds[result.rounds.length - 1]?.how });
        if (e.rivalId && rewards) rewards.notes.unshift(`${e.name}: “${postMatchLine(P, e.rivalId, won, mixSeed(t, m))}”`);
        if (rewards) rewards.notes.unshift(won ? `Win recorded in the ${t.name}.` : playerEliminated(this.t || t) ? `Eliminated from the ${t.name}.` : `Result recorded in the ${t.name}.`);
        await app.save('silent');
        app.tournaments.kick();
        return false;
      },
      onExit: () => {},
    };
    const start = () => this.ui.push(new BattleScreen(session));
    if (e.rivalId) {
      const line = preMatchLine(P, e.rivalId, { plan: m.plan, final: m.isFinal, seed: mixSeed(t, m) });
      const c = CHARACTER_INDEX[e.rivalId];
      this.ui.push(new DialogueScreen({ title: `${m.roundName}`, lines: [{ speaker: c.name, text: line, beast: c.beast, color: c.color }], onDone: start }));
    } else start();
  }

  async withdraw() {
    const ok = await this.ui.confirm('Withdraw from the tournament?', 'You leave with no prize and your entry fee is not refunded. This is recorded in your career.', { danger: true, yes: 'Withdraw' });
    if (!ok) return;
    const summary = withdraw(this.P, this.t);
    await this.app.save('silent');
    this.app.tournaments.reset();
    this.ui.pop();
    this.ui.push(new CeremonyScreen(summary));
  }

  async finish() {
    const t = this.t;
    const summary = finishTournament(this.P, t);
    await this.app.save('silent');
    this.app.tournaments.reset();
    if (summary.levelUps) this.app.audio.ui('levelup');
    this.ui.pop();
    this.ui.push(new CeremonyScreen(summary, t));
  }

  onTab() { return false; }
  prompts() { return [['confirm', 'Select'], ['back', 'Leave (progress saved)']]; }
}

const mixSeed = (t, m) => (t.seed ^ m.id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)) >>> 0;

// ------------------------------------------------------------ bracket / standings views

function entrantLine(t, m, side) {
  const idx = side === 'a' ? m.a : m.b;
  const known = side === 'a' ? m.aKnown : m.bKnown;
  const e = idx != null ? t.entrants[idx] : null;
  const won = m.status === 'done' && m.winner === idx && idx != null && !m.draw;
  const score = m.status === 'done' && !m.bye && !m.skipped ? (side === 'a' ? m.score[0] : m.score[1]) : '';
  return h('div', { class: 'bm-line' + (won ? ' win' : '') + (idx === PLAYER ? ' you' : '') + (m.status === 'done' && !won && idx != null && !m.draw ? ' lose' : '') },
    h('span', { class: 'bm-name', style: e ? { borderLeftColor: e.color } : {} }, e ? e.name : known ? 'BYE' : 'TBD'),
    h('span', { class: 'bm-score' }, String(score)));
}

function matchBox(t, m) {
  if (m.skipped) return h('div', { class: 'bm skipped' }, h('div', { class: 'small muted' }, 'Reset not needed'));
  const cls = 'bm' + (m.status === 'ready' ? ' ready' : '') + (m.a === PLAYER || m.b === PLAYER ? ' has-you' : '');
  return h('div', { class: cls, title: m.how ? `${m.roundName}: ${m.how}` : m.roundName }, entrantLine(t, m, 'a'), entrantLine(t, m, 'b'));
}

function bracketColumns(t, ms, label) {
  const rounds = [...new Set(ms.map((m) => m.round))].sort((a, b) => a - b);
  return h('div', { class: 'bracket-block' }, label ? h('div', { class: 'bb-label' }, label) : null,
    h('div', { class: 'bracket' }, rounds.map((r) => {
      const col = ms.filter((m) => m.round === r);
      return h('div', { class: 'b-col' }, h('div', { class: 'b-round' }, col[0].roundName.replace(/^(Upper |Playoff )/, '')), h('div', { class: 'b-matches' }, col.map((m) => matchBox(t, m))));
    })));
}

function stageView(t, st) {
  if (st.type === 'single') return bracketColumns(t, st.matches, null);
  if (st.type === 'double') {
    return h('div', { class: 'col gap' },
      bracketColumns(t, st.matches.filter((m) => m.bracket === 'W'), 'Upper bracket'),
      bracketColumns(t, st.matches.filter((m) => m.bracket === 'L'), 'Lower bracket'),
      bracketColumns(t, st.matches.filter((m) => m.bracket === 'GF'), 'Grand final'));
  }
  // round robin / league season / swiss: standings + current round fixtures
  const open = st.matches.filter((m) => m.status !== 'done');
  const cur = open.length ? Math.min(...open.map((m) => m.round)) : Math.max(0, ...st.matches.map((m) => m.round));
  const fixtures = st.matches.filter((m) => m.round === cur);
  return h('div', { class: 'col gap' }, standingsTable(t, st),
    h('div', { class: 'bb-label' }, fixtures[0]?.roundName || ''),
    h('div', { class: 'fixtures' }, fixtures.map((m) => matchBox(t, m))));
}

function standingsTable(t, st) {
  const rows = standings(t, st);
  const swiss = st.type === 'swiss';
  return h('table', { class: 'standings' },
    h('tr', {}, ['#', 'Battler', 'P', 'W', 'D', 'L', swiss ? 'Wins' : 'Pts', swiss ? 'Opp W' : 'RD', 'FP'].map((x) => h('th', {}, x))),
    rows.map((r, i) => h('tr', { class: r.idx === PLAYER ? 'you' : '' },
      h('td', {}, String(i + 1)), h('td', { class: 'st-name', style: { borderLeftColor: t.entrants[r.idx].color } }, t.entrants[r.idx].name),
      h('td', {}, String(r.played)), h('td', {}, String(r.w)), h('td', {}, String(r.d)), h('td', {}, String(r.l)),
      h('td', { class: 'st-pts' }, String(r.pts)), h('td', {}, swiss ? String(r.buch) : `${r.rw - r.rl > 0 ? '+' : ''}${r.rw - r.rl}`), h('td', {}, String(r.fp)))));
}

// ====================================================================== scouting

const COUNTER_TIPS = {
  attack: 'They hunt collisions and burn spin doing it. A stable defense or stamina build that stays central outlasts them — keep away from the edge.',
  defense: 'Ring-outs are unlikely against a planted ball tip. Win the spin race with stamina, or crack their lock with burst/upper rings.',
  stamina: 'Their spin lead grows every second. Pressure early with attack or upper builds before the late game.',
  balance: 'No glaring weakness. Win the launch, stay out of their counters and play the spin race.',
  burst: 'They gamble on Shatter finishes. A strong lock (more notches), a heavy disc and Grip Brace survive the first rush.',
  upper: 'Their flares lift low, wide tops. Stay upright: ball or wide tips and heavy discs resist lift; avoid their slope charges.',
};

export class ScoutScreen {
  static screenName = 'ScoutScreen';
  constructor(t, idx, m) { this.t = t; this.idx = idx; this.m = m; }

  render() {
    const P = this.app.profile;
    const t = this.t;
    const e = t.entrants[this.idx];
    const p = entrantParticipant(t, this.idx, P, this.m);
    let asm = null;
    try { asm = assembleTop(p.build, { spin: p.spin }); } catch { asm = null; }
    const role = buildRole(p.build);
    const prof = AI_PROFILES[p.ai];
    const ch = e.rivalId ? CHARACTER_INDEX[e.rivalId] : null;
    const myL = P.loadouts.find((l) => l.id === t.loadout.id);
    const mySpin = myL?.spin || 'R';
    const theirMatches = t.stages.flatMap((st) => st.matches).filter((m) => m.status === 'done' && !m.bye && !m.skipped && (m.a === this.idx || m.b === this.idx));
    const s = asm?.summary || {};
    const parts = [...Object.entries(p.build), ['launcher', p.launcher], ['cable', p.cable]].filter(([, it]) => it);
    return h('div', { class: 'std-screen scout' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Scouting report'), h('span', { class: 'muted' }, e.name)),
      h('div', { class: 'ws-cols two-wide' },
        h('div', { class: 'panel scroll', 'data-wrap': '' },
          h('div', { class: 'row gap' }, beastImg(e.beast, 80), h('div', {}, h('h2', { style: { color: e.color } }, e.name), h('div', { class: 'muted small' }, ch ? `${ch.title} · ${ch.home}` : 'Open entrant'), ch ? h('div', { class: 'small' }, ch.bio) : null)),
          statRow('Style', `${ROLE_NAMES[role]} build`),
          statRow('Personality', `${prof.name}`), h('div', { class: 'small muted' }, prof.desc),
          statRow('Spirit Chip', p.beast ? `${BEAST_INDEX[p.beast.id]?.name} (bond ${p.beast.bondLevel}${p.beast.awakened ? ', awakened' : ''})` : 'None'),
          statRow('Spin', `${p.spin === 'L' ? 'Left' : 'Right'}${p.spin !== mySpin ? ' — opposite to yours: contacts equalise spin' : ' — same as yours: contacts repel hard'}`),
          statRow('Launch technique', p.technique),
          asm ? statRow('Mass', `${s.massG.toFixed(1)} g · lock ${s.lockNotches} notches · tip ${s.tipFlatMm > 0.5 ? 'flat' : 'point/ball'}`) : null,
          asm ? statRow('Estimated spin time', `${Math.round(s.estSpinTime || 0)} s`) : null,
          ch ? h('h3', {}, 'Signature') : null, ch ? h('div', { class: 'small' }, ch.signature) : null,
          p.plan?.notes?.length ? h('h3', {}, 'Adapted to you') : null,
          ...(p.plan?.notes || []).map((n) => h('div', { class: 'small warn' }, n)),
          h('h3', {}, 'How to beat them'), h('div', { class: 'small' }, COUNTER_TIPS[role] || COUNTER_TIPS.balance),
          ch ? h('div', { class: 'small muted' }, ch.dialogue.scout) : null),
        h('div', { class: 'panel scroll', 'data-scroll': 'scout' },
          h('h3', {}, p.plan?.buildName ? `Build: ${p.plan.buildName}` : 'Build'),
          ...parts.map(([slot, it]) => itemCard(it, { class: 'compact' })),
          h('h3', {}, 'This tournament'),
          ...(theirMatches.length ? theirMatches.map((m) => { const won = m.winner === this.idx; const opp = t.entrants[m.a === this.idx ? m.b : m.a]; return h('div', { class: 'small ' + (won ? 'good' : m.draw ? '' : 'bad') }, `${m.roundName}: ${won ? 'beat' : m.draw ? 'drew with' : 'lost to'} ${opp.name} ${m.a === this.idx ? m.score.join('-') : [...m.score].reverse().join('-')}${m.how ? ` (${m.how})` : ''}`); }) : [h('div', { class: 'small muted' }, 'No matches yet.')]))));
  }

  prompts() { return [['back', 'Back']]; }
}

// ====================================================================== ceremony

export class CeremonyScreen {
  static screenName = 'CeremonyScreen';
  constructor(summary, t = null) { this.s = summary; this.t = t; }

  onEnter() {
    if (this.s.place === 1) { this.app.audio.victory?.(); }
  }

  render() {
    const s = this.s;
    const title = s.withdrawn ? 'Withdrawn' : s.place === 1 ? 'CHAMPION!' : s.place === 2 ? 'Runner-up' : `${ordinal(s.place)} place`;
    let finalStand = null;
    if (this.t) {
      const def = TOURNAMENT_INDEX[this.t.defId];
      const winnerIdx = [...(this.t.stages[this.t.stages.length - 1].matches)].reverse().find((m) => m.isFinal && m.status === 'done' && !m.skipped)?.winner;
      const top = winnerIdx != null ? this.t.entrants[winnerIdx] : null;
      if (top && top.idx !== PLAYER) finalStand = h('div', { class: 'small' }, `Tournament winner: ${top.name}`);
      if (top?.rivalId) finalStand = h('div', { class: 'col' }, h('div', { class: 'small' }, `Tournament winner: ${top.name}`), h('div', { class: 'small muted' }, `“${CHARACTER_INDEX[top.rivalId].dialogue.win[0]}”`));
      if (def.format !== 'single' && def.format !== 'double') {
        const st = this.t.stages[0];
        finalStand = h('div', {}, finalStand, standingsTable(this.t, st));
      }
    }
    return h('div', { class: 'std-screen ceremony' },
      h('div', { class: 'cer-head' }, h('div', { class: 'cer-title ' + (s.place === 1 ? 'gold' : '') }, title), h('div', { class: 'muted' }, `${s.name} · ${s.size} entrants · record ${s.record.w}-${s.record.l}${s.record.d ? `-${s.record.d}` : ''}`)),
      h('div', { class: 'ws-cols two-wide' },
        h('div', { class: 'panel scroll', 'data-wrap': '' },
          h('h3', {}, 'Prizes'),
          s.credits ? statRow('Credits', `+${s.credits}`) : null,
          s.xp ? statRow('Player XP', `+${s.xp}${s.levelUps ? ` (level up ×${s.levelUps}!)` : ''}`) : null,
          s.ranking ? statRow('Circuit points', `+${s.ranking}`) : null,
          Object.keys(s.materials).length ? statRow('Materials', Object.entries(s.materials).map(([k, v]) => `${k} +${v}`).join(', ')) : null,
          ...s.unlocks.map((u) => h('div', { class: 'reward-line gold' }, `Unlocked — ${unlockLabel(u)}`)),
          ...s.notes.map((n) => h('div', { class: 'small' }, n)),
          !s.credits && !s.items.length ? h('div', { class: 'muted' }, s.withdrawn ? 'No prize for withdrawing.' : 'No prize this time.') : null,
          ...s.items.map((it) => itemCard(it, { class: 'new-loot' })),
          btn('Continue', () => this.ui.pop(), { class: 'primary big', id: 'cer-continue' })),
        h('div', { class: 'panel scroll' }, h('h3', {}, 'Your matches'),
          ...s.record.opponents.map((o) => h('div', { class: 'hist-row' }, h('span', { class: 'hr-place ' + (o.won ? 'good' : o.draw ? '' : 'bad') }, o.won ? 'W' : o.draw ? 'D' : 'L'), h('span', { class: 'hr-name' }, `${o.round}: vs ${o.name}`), h('span', { class: 'muted small' }, o.score))),
          finalStand)));
  }

  prompts() { return [['confirm', 'Continue']]; }
}
