// More modes: Practice Lab, Custom Battle, Challenges, Survival and League.

import { h, btn, selector } from '../ui.js';
import { statRow, beastImg, itemCard } from '../widgets.js';
import { ARENAS, ARENA_INDEX } from '../../data/arenas.js';
import { ARCHETYPES, ARCHETYPE_INDEX, DIFFICULTIES } from '../../data/opponents.js';
import { AI_PROFILES } from '../../data/aiProfiles.js';
import { CHARACTERS, CHARACTER_INDEX } from '../../data/characters.js';
import { FORMATS, FINISH_NAMES } from '../../game/battle.js';
import { TOURNAMENT_INDEX } from '../../data/tournaments.js';
import { validateLoadout, buildParticipant } from '../../systems/loadout.js';
import { itemName } from '../../systems/items.js';
import { standings, playerEliminated, PLAYER } from '../../systems/tournament.js';
import {
  CHALLENGES, challengeStatus, checkConstraint, evaluateChallenge, grantChallengeReward, opponentFrom,
  startSurvival, survivalStage, survivalWin, survivalRepair, endSurvival, DIVISIONS, leagueState, startSeason,
} from '../../systems/modes.js';
import { markSeen } from '../../systems/rivals.js';
import { BattleScreen } from './battle.js';
import { WorkshopScreen } from './workshop.js';
import { PracticeLabScreen } from './lab.js';
import { TournamentHubScreen } from './tournament.js';

const loadoutSelector = (scr, id = 'mode-loadout') => {
  const P = scr.app.profile;
  return selector('Your loadout', P.loadouts.map((x, i) => ({ value: i, label: x.name + (validateLoadout(P, x).ok ? '' : ' ⚠') })), P.activeLoadout, (v) => { P.activeLoadout = v; scr.ui.refresh(scr); }, { id, desc: 'Loadouts are edited in the Workshop.' });
};

function playerReady(scr) {
  const P = scr.app.profile;
  const L = P.loadouts[P.activeLoadout];
  const v = L ? validateLoadout(P, L) : { ok: false, errors: ['No loadout'] };
  if (!v.ok) { scr.ui.toast(v.errors[0], 'bad', 4000); return null; }
  return buildParticipant(P, L, { id: 'player' });
}

// ====================================================================== hub

const MODES = [
  { id: 'mode-lab', name: 'Practice Lab', desc: 'Launch range, sparring targets, physics debug overlay and the Build Lab.', make: () => new PracticeLabScreen() },
  { id: 'mode-custom', name: 'Custom Battle', desc: 'Pick both sides, the stadium, format and rules — or watch two AIs battle.', make: () => new CustomBattleScreen() },
  { id: 'mode-challenges', name: 'Challenges', desc: 'Hand-made battles with build constraints and specific goals.', make: () => new ChallengesScreen() },
  { id: 'mode-survival', name: 'Survival', desc: 'An endless gauntlet. Wear carries over; cash out before you fall.', make: () => new SurvivalScreen() },
  { id: 'mode-league', name: 'League', desc: 'Season after season in a division ladder with promotion and relegation.', make: () => new LeagueScreen() },
];

export class ModesScreen {
  static screenName = 'ModesScreen';
  render() {
    const P = this.app.profile;
    const extra = { 'mode-challenges': `${Object.keys(P.stats.challengesDone || {}).length}/${CHALLENGES.length} complete`, 'mode-survival': `Best: ${P.survival?.best || 0} wins${P.survival?.active ? ' · run in progress' : ''}`, 'mode-league': `${DIVISIONS.find((d) => d.n === leagueState(P).division).name}${P.league?.active ? ' · season in progress' : ''}` };
    return h('div', { class: 'std-screen modes' }, h('div', { class: 'screen-head' }, h('h1', {}, 'Modes')),
      h('div', { class: 'menu-grid modes-grid', 'data-wrap': '' }, MODES.map((m) => btn(h('div', { class: 'tile' }, h('div', { class: 'tile-title' }, m.name), h('div', { class: 'tile-desc' }, m.desc), extra[m.id] ? h('div', { class: 'tile-desc gold' }, extra[m.id]) : null), () => this.ui.push(m.make()), { class: 'tile-btn', id: m.id, desc: m.desc }))));
  }
  onResume() { this.ui.refresh(this); }
}

// ====================================================================== custom battle

export class CustomBattleScreen {
  static screenName = 'CustomBattleScreen';
  constructor() { this.cfg = { side1: 'player', ai1: 'balanced', build1: 'arch:all', opp: 'arch:striker', ai2: 'aggressive', diff: 'regular', arena: 'standard', format: 'bo3', time: 120, durability: false, abilities: true, slowmo: true }; }

  oppOptions() {
    const P = this.app.profile;
    return [
      ...ARCHETYPES.map((a) => ({ value: 'arch:' + a.id, label: `Archetype: ${a.name}`, desc: a.desc })),
      ...CHARACTERS.filter((c) => P.rivals?.[c.id]?.met || P.rivals?.[c.id]?.seen).map((c) => ({ value: 'rival:' + c.id, label: `Rival: ${c.name}`, desc: c.signature })),
      ...P.loadouts.map((x, i) => ({ value: 'loadout:' + i, label: `Your loadout: ${x.name}` })),
    ];
  }

  participant(key, ai, diff, id) {
    const P = this.app.profile;
    const [kind, val] = key.split(':');
    if (kind === 'rival') { const tier = Math.max(1, Math.min(5, Math.round(diff * 4 - 1.4))); return { ...opponentFrom({ rival: val, tier, difficulty: diff }, { id }), ai }; }
    if (kind === 'loadout') { const L = P.loadouts[+val]; if (!L || !validateLoadout(P, L).ok) return null; return { ...buildParticipant(P, L, { id, human: false }), human: false, ai, difficulty: diff, name: L.name }; }
    return { ...opponentFrom({ archetype: val, difficulty: diff, tier: 2 }, { id, seedKey: 'custom' + val }), ai };
  }

  render() {
    const P = this.app.profile;
    const c = this.cfg;
    const ais = Object.keys(AI_PROFILES).filter((k) => k !== 'dummy').map((k) => ({ value: k, label: AI_PROFILES[k].name, desc: AI_PROFILES[k].desc }));
    const opts = this.oppOptions();
    const arenas = ARENAS.filter((a) => P.arenasUnlocked.includes(a.id));
    const spectate = c.side1 === 'ai';
    const left = h('div', { class: 'panel col gap', 'data-wrap': '' },
      h('h3', {}, 'Side 1'),
      selector('Controlled by', [{ value: 'player', label: 'You' }, { value: 'ai', label: 'AI (spectate)' }], c.side1, (v) => { c.side1 = v; this.ui.refresh(this); }, { id: 'cb-side1' }),
      spectate ? selector('Build', opts, c.build1, (v) => { c.build1 = v; }, { id: 'cb-build1' }) : loadoutSelector(this, 'cb-loadout'),
      spectate ? selector('AI personality', ais, c.ai1, (v) => { c.ai1 = v; }, { id: 'cb-ai1' }) : null,
      h('h3', {}, 'Side 2'),
      selector('Opponent', opts, c.opp, (v) => { c.opp = v; }, { id: 'cb-opp' }),
      selector('AI personality', ais, c.ai2, (v) => { c.ai2 = v; }, { id: 'cb-ai2' }),
      selector('AI skill', DIFFICULTIES.map((d) => ({ value: d.id, label: d.name })), c.diff, (v) => { c.diff = v; }, { id: 'cb-diff', desc: 'Scales launch accuracy, reactions and steering only — never physics.' }));
    const right = h('div', { class: 'panel col gap', 'data-wrap': '' },
      h('h3', {}, 'Rules'),
      selector('Stadium', arenas.map((a) => ({ value: a.id, label: a.name, desc: a.desc })), c.arena, (v) => { c.arena = v; }, { id: 'cb-arena' }),
      selector('Format', Object.values(FORMATS).filter((f) => !f.hidden).map((f) => ({ value: f.id, label: f.name })), c.format, (v) => { c.format = v; }, { id: 'cb-format' }),
      selector('Round time limit', [60, 120, 180, 300].map((t) => ({ value: t, label: `${t} s` })), c.time, (v) => { c.time = v; }, { id: 'cb-time' }),
      selector('Bit-Beast abilities', [{ value: true, label: 'On' }, { value: false, label: 'Off' }], c.abilities, (v) => { c.abilities = v; }, { id: 'cb-abilities' }),
      selector('Durability wear', [{ value: false, label: 'Off' }, { value: true, label: 'On (normal rewards)' }], c.durability, (v) => { c.durability = v; }, { id: 'cb-durability', desc: 'With wear off, custom battles give half rewards and no loot.' }),
      selector('Impact slow-motion', [{ value: true, label: 'On' }, { value: false, label: 'Off' }], c.slowmo, (v) => { c.slowmo = v; }, { id: 'cb-slowmo' }),
      btn(spectate ? 'Watch battle' : 'Start battle', () => this.start(), { class: 'primary big', id: 'cb-start' }));
    return h('div', { class: 'std-screen' }, h('div', { class: 'screen-head' }, h('h1', {}, 'Custom Battle')), h('div', { class: 'two-col' }, left, right));
  }

  start() {
    const c = this.cfg;
    const diff = DIFFICULTIES.find((d) => d.id === c.diff).value;
    let p1;
    if (c.side1 === 'ai') p1 = this.participant(c.build1, c.ai1, diff, 'side1');
    else p1 = playerReady(this);
    const p2 = this.participant(c.opp, c.ai2, diff, 'side2');
    if (!p1 || !p2) { if (!p2 || c.side1 === 'ai') this.ui.toast('That build is not valid.', 'bad'); return; }
    const spectate = c.side1 === 'ai';
    this.ui.push(new BattleScreen({
      mode: spectate ? 'exhibition' : 'custom', title: spectate ? 'Exhibition' : 'Custom Battle', arenaId: c.arena, format: c.format, roundTime: c.time,
      participants: [p1, p2], difficulty: diff, noRewards: spectate, rewardScale: c.durability ? 1 : 0.5,
      rules: { durability: !spectate && c.durability, abilities: c.abilities, slowmo: c.slowmo, loot: !spectate && c.durability ? undefined : false },
      opponentKey: 'custom-' + c.opp, allowRematch: true,
    }));
  }

  prompts() { return [['nav_left', 'Change'], ['confirm', 'Select'], ['back', 'Back']]; }
}

// ====================================================================== challenges

export class ChallengesScreen {
  static screenName = 'ChallengesScreen';
  constructor() { this.sel = CHALLENGES[0].id; }

  render() {
    const P = this.app.profile;
    const list = h('div', { class: 'col gap', 'data-wrap': '' }, CHALLENGES.map((c) => {
      const st = challengeStatus(P, c);
      return btn(h('div', {}, h('div', { class: 'tt-name' }, `${st.done ? '✓ ' : st.locked ? '🔒 ' : ''}${c.name}`), h('div', { class: 'small muted' }, st.locked ? st.reason : c.desc)), () => { this.sel = c.id; this.ui.refresh(this); }, { class: 'tour-btn' + (this.sel === c.id ? ' sel' : '') + (st.locked ? ' locked' : ''), id: 'ch-' + c.id });
    }));
    const c = CHALLENGES.find((x) => x.id === this.sel);
    const st = challengeStatus(P, c);
    const L = P.loadouts[P.activeLoadout];
    const errs = L ? checkConstraint(P, L, c) : ['No loadout'];
    const opp = c.opponent.rival ? CHARACTER_INDEX[c.opponent.rival].name : ARCHETYPE_INDEX[c.opponent.archetype].name;
    const r = c.reward;
    const detail = h('div', { class: 'col gap' },
      h('h2', {}, c.name), h('div', {}, c.desc),
      statRow('Opponent', opp), statRow('Stadium', ARENA_INDEX[c.arena].name), statRow('Format', FORMATS[c.format].name),
      c.rules?.abilities === false ? statRow('Rule', 'No Bit-Beast abilities') : null,
      statRow('First-clear reward', `${r.credits} cr · ${r.xp} XP${r.loot ? ` · ${r.loot.minRarity ? r.loot.minRarity + '+ ' : ''}${r.loot.slots ? r.loot.slots.join('/') : 'part'}` : ''}${r.title ? ` · title “${r.title}”` : ''}`),
      st.done ? h('div', { class: 'good small' }, `Completed ${new Date(st.done).toLocaleDateString()} — replays pay 10% credits.`) : null,
      loadoutSelector(this, 'ch-loadout'),
      errs.length ? h('div', { class: 'warn-box small' }, errs.join(' ')) : null,
      btn('Attempt challenge', () => this.start(c), { class: 'primary big', id: 'ch-start', disabled: st.locked || errs.length > 0 }),
      btn('Workshop', () => this.ui.push(new WorkshopScreen()), { id: 'ch-workshop' }));
    return h('div', { class: 'std-screen' }, h('div', { class: 'screen-head' }, h('h1', {}, 'Challenges'), h('span', { class: 'muted' }, `${Object.keys(P.stats.challengesDone || {}).length}/${CHALLENGES.length} complete`)),
      h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel scroll' }, list), h('div', { class: 'panel scroll' }, detail)));
  }

  onResume() { this.ui.refresh(this); }

  start(c) {
    const me = playerReady(this);
    if (!me) return;
    const opp = opponentFrom(c.opponent, { id: 'challenge', tier: c.opponent.tier || 2, seedKey: c.id });
    if (c.opponent.rival) markSeen(this.app.profile, c.opponent.rival);
    let verdict = null;
    this.ui.push(new BattleScreen({
      mode: 'challenge', title: `Challenge · ${c.name}`, arenaId: c.arena, format: c.format, participants: [me, opp],
      difficulty: c.opponent.difficulty ?? 1, rules: { ...(c.rules || {}), loot: false }, rewardScale: 0.6, opponentKey: 'challenge-' + c.id,
      allowRematch: true, rivalId: c.opponent.rival || null,
      onFinish: async (result, rewards) => {
        verdict = evaluateChallenge(c, result);
        if (verdict.ok) {
          const g = grantChallengeReward(this.app.profile, c);
          if (rewards) {
            rewards.unlocks.push(`Challenge complete: ${c.name}${g.first ? '' : ' (repeat)'}`);
            rewards.notes.unshift(`Challenge reward: +${g.credits} cr${g.xp ? `, +${g.xp} XP` : ''}${g.items.length ? `, ${g.items.map((i) => itemName(i)).join(', ')}` : ''}.`);
            rewards.items.push(...g.items);
          }
          await this.app.save('silent');
        } else if (rewards) rewards.notes.unshift(`Challenge not met: ${verdict.fails.join(' ')}`);
        return false;
      },
    }));
  }
}

// ====================================================================== survival

export class SurvivalScreen {
  static screenName = 'SurvivalScreen';
  get P() { return this.app.profile; }

  render() {
    const P = this.P;
    const S = P.survival || { best: 0, runs: 0 };
    const run = S.active;
    let main;
    if (!run) {
      main = h('div', { class: 'col gap', 'data-wrap': '' },
        h('h2', {}, 'Survival'),
        h('div', {}, 'Battle an endless line of opponents, one round each. Opponents get sharper every stage and every fifth stage is a rival. Wear carries over between stages — every third win earns a field repair. Lose and the run ends; cash out any time between stages to keep your full winnings (losing keeps 75%).'),
        statRow('Best run', `${S.best || 0} wins`), statRow('Runs', S.runs || 0),
        h('div', { class: 'small muted' }, 'Milestone loot at 3, 6, 10, 15 and 20 wins.'),
        loadoutSelector(this, 'sv-loadout'),
        btn('Start a run', () => this.begin(), { class: 'primary big', id: 'sv-start' }));
    } else {
      const st = survivalStage(P, run);
      main = h('div', { class: 'col gap', 'data-wrap': '' },
        h('h2', {}, `Stage ${run.stage + 1}${st.boss ? ' — RIVAL STAGE' : ''}`),
        statRow('Wins', run.wins), statRow('Winnings banked', `${run.bank} cr`), statRow('Field repairs', run.repairs),
        statRow('Next opponent', `${st.name} · skill ${Math.round(st.difficulty * 100)}%`), statRow('Stadium', ARENA_INDEX[st.arena].name),
        btn('Battle!', () => this.fight(), { class: 'primary big', id: 'sv-fight' }),
        btn(`Use field repair (+30% condition)`, () => { if (survivalRepair(P, run)) { this.app.save('silent'); this.ui.toast('Loadout repaired by 30%.', 'good'); this.ui.refresh(this); } }, { id: 'sv-repair', disabled: !(run.repairs > 0) }),
        btn(`Cash out (${run.bank} cr)`, () => this.finish(true), { id: 'sv-cash' }));
    }
    return h('div', { class: 'std-screen' }, h('div', { class: 'screen-head' }, h('h1', {}, 'Survival')), h('div', { class: 'panel' }, main));
  }

  onResume() { this.ui.refresh(this); }

  begin() {
    const P = this.P;
    const L = P.loadouts[P.activeLoadout];
    if (!validateLoadout(P, L).ok) { this.ui.toast('Your loadout is invalid.', 'bad'); return; }
    startSurvival(P, L.id, (Date.now() ^ 0x5f3759df) >>> 0);
    this.app.save('silent');
    this.ui.refresh(this);
  }

  fight() {
    const P = this.P;
    const run = P.survival.active;
    const L = P.loadouts.find((l) => l.id === run.loadoutId);
    if (!L || !validateLoadout(P, L).ok) { this.ui.toast('The run\'s loadout is no longer valid — repair or fix it in the Workshop.', 'bad', 4000); return; }
    const st = survivalStage(P, run);
    const me = buildParticipant(P, L, { id: 'player' });
    const opp = opponentFrom(st.spec, { id: 'sv-' + st.stage, name: st.boss ? null : st.name, seedKey: `sv${run.seed}:${st.stage}` });
    if (st.spec.rival) markSeen(P, st.spec.rival);
    let won = null;
    this.ui.push(new BattleScreen({
      mode: 'survival', title: `Survival · Stage ${st.stage + 1}`, arenaId: st.arena, format: 'single', participants: [me, opp],
      difficulty: st.difficulty, rewardScale: 0.35, rules: { loot: false }, opponentKey: 'survival', noRepetitionPenalty: true,
      allowRematch: false, allowRestart: false, continueLabel: 'Continue',
      forfeitLabel: 'Abandon run', forfeitWarning: 'Abandoning ends the run: you keep 75% of your winnings.',
      onForfeit: async () => { const r = endSurvival(P); await this.app.save('silent'); this.ui.toast(`Run over: ${r.wins} wins, ${r.credits} cr.`, 'warn', 4000); },
      onFinish: async (result, rewards) => {
        const cur = P.survival?.active;
        if (!cur) return false;
        won = result.winner === 0;
        if (won) {
          const out = survivalWin(P, cur);
          rewards?.notes.unshift(`Stage cleared! +${out.pay} cr banked (${cur.bank} total).${out.repair ? ' Field repair earned.' : ''}`);
          if (out.items.length) { rewards?.items.push(...out.items); rewards?.unlocks.push(`Milestone: ${cur.wins} wins!`); }
        } else {
          const r = endSurvival(P);
          rewards?.notes.unshift(`Run over after ${r.wins} wins. Kept ${r.credits} cr (75%).${r.newBest ? ' New personal best!' : ''}`);
        }
        await this.app.save('silent');
        return false;
      },
    }));
  }

  async finish(cash) {
    const r = endSurvival(this.P, { cashOut: cash });
    await this.app.save('silent');
    this.ui.toast(`Cashed out: ${r.wins} wins, ${r.credits} cr${r.newBest ? ' — new best!' : ''}`, 'good', 4000);
    this.ui.refresh(this);
  }
}

// ====================================================================== league

export class LeagueScreen {
  static screenName = 'LeagueScreen';
  get P() { return this.app.profile; }

  render() {
    const P = this.P;
    const LG = leagueState(P);
    const div = DIVISIONS.find((d) => d.n === LG.division);
    const t = LG.active;
    const ladder = h('div', { class: 'col' }, DIVISIONS.map((d) => h('div', { class: 'trophy-row' + (d.n === LG.division ? ' won' : '') }, h('span', {}, d.n === LG.division ? '▶' : ''), h('span', {}, d.name), h('span', { class: 'muted small' }, TOURNAMENT_INDEX[d.def].rivals.map((r) => CHARACTER_INDEX[r].name.split(' ')[0]).join(', ')))));
    const left = h('div', { class: 'panel col gap', 'data-wrap': '' },
      h('h2', {}, div.name), h('div', { class: 'muted' }, `Season ${LG.season}`),
      h('div', { class: 'small' }, 'Eight battlers, everyone meets once (best of 3). Top two are promoted, bottom two relegated. Season prizes by final position.'),
      t ? btn(playerEliminated(t) || t.status === 'complete' ? 'Season over — see results' : 'Continue season', () => this.ui.push(new TournamentHubScreen({ slot: 'league' })), { class: 'primary big', id: 'lg-continue' })
        : h('div', { class: 'col gap' }, loadoutSelector(this, 'lg-loadout'), btn(`Start Season ${LG.season}`, () => this.begin(), { class: 'primary big', id: 'lg-start' })),
      h('h3', {}, 'Divisions'), ladder);
    const right = h('div', { class: 'panel scroll col gap' });
    if (t) {
      const st = t.stages[0];
      const rows = standings(t, st);
      right.append(h('h3', {}, 'Table'), h('table', { class: 'standings' },
        h('tr', {}, ['#', 'Battler', 'P', 'W', 'D', 'L', 'Pts'].map((x) => h('th', {}, x))),
        rows.map((r, i) => h('tr', { class: (r.idx === PLAYER ? 'you ' : '') + (i < 2 ? 'promo' : i >= rows.length - 2 ? 'releg' : '') },
          h('td', {}, String(i + 1)), h('td', { class: 'st-name', style: { borderLeftColor: t.entrants[r.idx].color } }, t.entrants[r.idx].name),
          h('td', {}, String(r.played)), h('td', {}, String(r.w)), h('td', {}, String(r.d)), h('td', {}, String(r.l)), h('td', { class: 'st-pts' }, String(r.pts))))));
    }
    right.append(h('h3', {}, 'Season history'), ...(LG.history.length ? LG.history.map((x) => h('div', { class: 'hist-row' }, h('span', { class: 'hr-place ' + (x.move === 'promoted' ? 'good' : x.move === 'relegated' ? 'bad' : '') }, x.place ? `#${x.place}` : 'WD'), h('span', { class: 'hr-name' }, `Season ${x.season} · ${DIVISIONS.find((d) => d.n === x.division).name}`), h('span', { class: 'muted small' }, x.move))) : [h('div', { class: 'muted' }, 'No seasons played yet.')]));
    return h('div', { class: 'std-screen' }, h('div', { class: 'screen-head' }, h('h1', {}, 'League')), h('div', { class: 'ws-cols two-wide' }, left, right));
  }

  onResume() { this.ui.refresh(this); }

  async begin() {
    const P = this.P;
    const L = P.loadouts[P.activeLoadout];
    if (!validateLoadout(P, L).ok) { this.ui.toast('Your loadout is invalid.', 'bad'); return; }
    const t = startSeason(P, P.activeLoadout, (Date.now() ^ 0x2545f491) >>> 0);
    for (const e of t.entrants) if (e.rivalId) markSeen(P, e.rivalId);
    await this.app.save('silent');
    this.app.tournaments.kick();
    this.ui.push(new TournamentHubScreen({ slot: 'league' }));
  }
}
