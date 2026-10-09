// Story mode screens: chapter select with a "next up" card, the scene runner
// (dialogue, choices, rewards, tutorials), battler creation, chapter title
// cards, and the battle / training / tournament node flows. Progress is
// saved after every node; losing never blocks progress (retry, change the
// loadout in the Workshop, or lower the story difficulty in Settings).

import { h, btn, selector } from '../ui.js';
import { beastImg, statRow } from '../widgets.js';
import { CHARACTER_INDEX } from '../../data/characters.js';
import { ARENA_INDEX } from '../../data/arenas.js';
import { TOURNAMENT_INDEX, FORMAT_NAMES } from '../../data/tournaments.js';
import { FORMATS } from '../../game/battle.js';
import { AI_PROFILES } from '../../data/aiProfiles.js';
import {
  CHAPTERS, CHAPTER_INDEX, STORY_STYLES, STORY_DIFFICULTY, storyState, chapterUnlocked, chapterProgress, currentNode, nextChapter, startChapter, advance,
  grantStoryReward, rewardLines, resolveLines, applyChoice, applyCreation, storyOpponent, storyDifficulty, fillText,
} from '../../systems/story.js';
import { validateLoadout, buildParticipant } from '../../systems/loadout.js';
import { createTournament } from '../../systems/tournament.js';
import { markSeen } from '../../systems/rivals.js';
import { BattleScreen } from './battle.js';
import { WorkshopScreen } from './workshop.js';
import { DialogueScreen } from './dialogue.js';
import { TournamentHubScreen } from './tournament.js';
import { NameEntryScreen } from './title.js';

const PLAYER_COLORS = ['#4fc3ff', '#ff5a5a', '#ffd84d', '#7fe3a8', '#c04bff', '#ff9f43', '#e8f0ff', '#ff6ad5'];

export class StoryScreen {
  static screenName = 'StoryScreen';
  constructor() { this.sel = null; this.busy = false; }

  get P() { return this.app.profile; }

  onEnter() { this.app.audio.playMusic('story'); }

  onResume() {
    this.app.audio.playMusic('story');
    if (this.busy) return;
    this.ui.refresh(this);
    // a story tournament just finished (ceremony closed)
    const node = currentNode(this.P);
    if (node?.type === 'tournament') {
      const res = storyState(this.P).results[node.id];
      if (res && !res.processed) queueMicrotask(() => this.afterTournament(node, res));
    }
  }

  render() {
    const P = this.P;
    const S = storyState(P);
    if (!this.sel) this.sel = nextChapter(P)?.id || CHAPTERS[0].id;
    const list = h('div', { class: 'col gap', 'data-wrap': '' });
    for (const ch of CHAPTERS) {
      const unlocked = chapterUnlocked(P, ch);
      const pr = chapterProgress(P, ch);
      const status = pr.active ? `In progress · ${pr.done}/${pr.total}` : pr.complete ? 'Complete ✓' : unlocked ? 'Ready' : 'Locked';
      const el = btn(h('div', { class: 'ch-tile', style: { '--chc': ch.color } },
        h('div', { class: 'ch-num' }, `Chapter ${ch.n}`), h('div', { class: 'ch-title' }, unlocked ? ch.title : '???'),
        h('div', { class: 'small muted' }, unlocked ? `${ch.location} · ${status}` : `Complete Chapter ${ch.n - 1} to unlock`)),
      () => { this.sel = ch.id; this.ui.refresh(this); }, { class: 'tour-btn' + (this.sel === ch.id ? ' sel' : '') + (unlocked ? '' : ' locked'), id: 'ch-' + ch.id });
      list.append(el);
    }
    return h('div', { class: 'std-screen story' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Story'), h('span', { class: 'muted' }, `${S.completed.length}/${CHAPTERS.length} chapters complete · difficulty: ${storyDifficulty(this.app).name}`)),
      h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel scroll' }, list), h('div', { class: 'panel scroll', 'data-scroll': 'story' }, this.detail(CHAPTER_INDEX[this.sel]))));
  }

  detail(ch) {
    const P = this.P;
    const unlocked = chapterUnlocked(P, ch);
    const pr = chapterProgress(P, ch);
    const node = currentNode(P);
    const inThis = node?.chapter === ch.id;
    const head = h('div', { class: 'ch-head', style: { '--chc': ch.color } }, h('div', { class: 'ch-num' }, `Chapter ${ch.n} · ${ch.location}`), h('h2', {}, unlocked ? ch.title : '???'),
      h('div', {}, unlocked ? ch.summary : `Complete Chapter ${ch.n - 1} to unlock.`),
      h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: `${(pr.done / pr.total) * 100}%`, background: ch.color } })));
    if (!unlocked) return h('div', { class: 'col gap' }, head);
    const items = [head];
    if (inThis) items.push(this.nextUp(node));
    else if (node && !inThis) items.push(h('div', { class: 'note-box small' }, `You are in the middle of Chapter ${CHAPTER_INDEX[node.chapter].n}. Starting this chapter will leave that one; you can return later from its first scene.`));
    if (!inThis) items.push(btn(pr.complete ? `Replay Chapter ${ch.n}` : `Start Chapter ${ch.n}`, () => this.begin(ch), { class: 'primary big', id: 'story-start', desc: pr.complete ? 'Replay scenes and battles. Rewards are not granted twice.' : '' }));
    items.push(selector('Story difficulty', Object.entries(STORY_DIFFICULTY).map(([k, d]) => ({ value: k, label: d.name, desc: d.desc })), this.app.settings.gameplay.storyDifficulty || 'normal', (v) => { this.app.settings.gameplay.storyDifficulty = v; this.app.saveSettings(); this.ui.refresh(this); }, { id: 'story-diff' }));
    items.push(btn('Workshop', () => this.ui.push(new WorkshopScreen()), { id: 'story-workshop', desc: 'Change parts and loadouts before the next battle.' }));
    return h('div', { class: 'col gap' }, ...items);
  }

  nextUp(node) {
    const P = this.P;
    const S = storyState(P);
    const tries = S.attempts[node.id] || 0;
    const hint = tries >= 2 ? h('div', { class: 'note-box small' }, `Stuck? Try a different loadout in the Workshop, read the scouting tips, or lower the story difficulty below. (${tries} attempts)`) : null;
    if (node.type === 'scene' || node.type === 'create') {
      return h('div', { class: 'col gap' }, h('h3', {}, 'Next'), h('div', {}, node.location || 'Story'), btn('Continue story', () => this.play(), { class: 'primary big', id: 'story-continue' }));
    }
    if (node.type === 'battle' || node.type === 'training') {
      const opp = storyOpponent(P, node, storyDifficulty(this.app).mul);
      const p = opp.participant;
      const c = opp.rivalId ? CHARACTER_INDEX[opp.rivalId] : null;
      const L = P.loadouts[P.activeLoadout];
      const val = validateLoadout(P, L);
      return h('div', { class: 'col gap' },
        h('h3', {}, node.type === 'training' ? `Training: ${node.title}` : `Battle: ${node.title || p.name}`),
        h('div', { class: 'row gap' }, p.beast ? beastImg(p.beast.id, 64) : null, h('div', {}, h('b', { style: { color: p.color } }, p.name), h('div', { class: 'small muted' }, c ? c.title : AI_PROFILES[p.ai]?.name || ''))),
        node.type === 'battle' ? statRow('Format', FORMATS[node.format || 'bo3'].name) : null,
        statRow('Stadium', ARENA_INDEX[node.arena || 'standard'].name),
        node.type === 'training' ? h('div', { class: 'col small' }, node.objectives.map((o) => h('div', {}, `☐ ${o.text}`))) : null,
        c && p.plan?.notes?.length ? h('div', { class: 'note-box small' }, `${c.name.split(' ')[0]} has studied you: ${p.plan.notes[0]}`) : null,
        node.onLose === 'continue' ? h('div', { class: 'small muted' }, 'Win or lose, the story continues.') : null,
        statRow('Your loadout', `${L.name}${val.ok ? '' : ' (invalid)'}`),
        !val.ok ? h('div', { class: 'warn-box small' }, val.errors.join(' ')) : null,
        hint,
        btn(node.type === 'training' ? 'Start training' : tries ? 'Retry battle' : 'Battle!', () => (node.type === 'training' ? this.runTraining(node) : this.runBattle(node)), { class: 'primary big', id: 'story-play', disabled: !val.ok }));
    }
    if (node.type === 'tournament') {
      const def = TOURNAMENT_INDEX[node.tournament];
      const act = P.tournaments.active;
      const mine = act && act.storyNode === node.id;
      const blocked = act && !mine;
      return h('div', { class: 'col gap' },
        h('h3', {}, `Tournament: ${def.name}`), h('div', { class: 'small' }, `${FORMAT_NAMES[def.format]} · ${def.size} entrants · you need to finish ${node.need === 1 ? 'first' : `in the top ${node.need}`}.`),
        hint,
        blocked ? h('div', { class: 'warn-box small' }, `Finish or withdraw from the ${act.name} first (Tournaments menu).`) : null,
        btn(mine ? 'Continue tournament' : tries ? 'Enter again' : 'Enter tournament', () => this.runTournament(node), { class: 'primary big', id: 'story-play', disabled: !!blocked }));
    }
    return null;
  }

  // ------------------------------------------------------------ flow helpers

  dialog(lines, opts = {}) {
    return new Promise((resolve) => {
      if (!lines.length && !opts.choices) { resolve(undefined); return; }
      this.ui.push(new DialogueScreen({ lines: lines.length ? lines : [{ speaker: '', text: '' }], title: opts.title, choices: opts.choices, onDone: resolve }));
    });
  }

  async tip(text) {
    if (!text) return;
    await this.dialog([{ speaker: 'Tip', text, color: '#ffd84d' }], { title: 'Tutorial' });
  }

  async showReward(r, title = 'Rewards') {
    const lines = rewardLines(r);
    if (!lines.length) return;
    await this.dialog([{ speaker: title, text: lines.join(' · '), color: '#ffd84d' }]);
    if (r.levelUps) this.app.audio.ui('levelup'); else this.app.audio.ui('loot');
  }

  async card(ch) {
    await new Promise((resolve) => this.ui.push(new ChapterCardScreen(ch, resolve)));
  }

  save() { return this.app.save('silent'); }

  async begin(ch) {
    if (this.busy) return;
    startChapter(this.P, ch.id);
    await this.save();
    this.ui.refresh(this);
    await this.play();
  }

  // Plays scene/create nodes until the next interactive node or chapter end.
  async play() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let guard = 0; guard < 40; guard++) {
        const node = currentNode(this.P);
        if (!node) break;
        const ch = CHAPTER_INDEX[node.chapter];
        if (node.index === 0 && !this._carded?.[ch.id]) { (this._carded = this._carded || {})[ch.id] = true; await this.card(ch); }
        if (node.type === 'scene') {
          const lines = resolveLines(this.P, node.lines);
          const choices = node.choice ? node.choice.options.map((o) => ({ label: o.label, value: o.value })) : null;
          const val = await this.dialog(lines, { title: node.location, choices });
          if (node.choice) {
            const { option, reward } = applyChoice(this.P, node, val);
            await this.dialog(resolveLines(this.P, option.reply || []), { title: node.location });
            await this.showReward(reward);
          }
          const r = grantStoryReward(this.P, node.id, node.reward);
          await this.showReward(r);
          await this.tip(node.tutorial);
        } else if (node.type === 'create') {
          if (!this.P.player.created || !this.P.player.archetype) {
            const r = await new Promise((resolve) => this.ui.push(new CreatorScreen(resolve)));
            await this.showReward(r, 'Starter parts');
            await this.tip('Your starter parts are in the Workshop. Equip them from the Loadouts tab whenever you like.');
          }
        } else break;
        const adv = advance(this.P);
        await this.save();
        if (adv.chapterComplete) { await this.chapterComplete(adv.chapter, adv.firstTime); break; }
      }
    } finally {
      this.busy = false;
      if (this.ui.current === this) this.ui.refresh(this);
    }
  }

  async chapterComplete(ch, first) {
    this.app.audio.victory?.();
    const next = CHAPTERS[ch.n];
    await this.dialog([{ speaker: `Chapter ${ch.n} complete`, text: first ? (next ? `“${ch.title}” is complete. Chapter ${next.n}, “${next.title}”, is now open.` : 'You have finished the story. The circuit is always open — and every chapter can be replayed.') : `Replay of “${ch.title}” complete.`, color: ch.color }]);
    if (next) this.sel = next.id;
  }

  // ------------------------------------------------------------ battles

  playerParticipant() {
    const P = this.P;
    return buildParticipant(P, P.loadouts[P.activeLoadout], { id: 'player' });
  }

  async runBattle(node) {
    const P = this.P;
    const opp = storyOpponent(P, node, storyDifficulty(this.app).mul);
    if (opp.rivalId) markSeen(P, opp.rivalId);
    await this.dialog(resolveLines(P, node.pre || []), { title: node.title });
    const S = storyState(P);
    let outcome = null;
    const session = {
      mode: 'story', title: `Story · ${node.title || opp.participant.name}`, arenaId: node.arena || 'standard', format: node.format || 'bo3',
      participants: [this.playerParticipant(), opp.participant], difficulty: opp.difficulty, rivalId: opp.rivalId || null,
      opponentKey: 'story-' + node.id, noRepetitionPenalty: true, rewardScale: 0.8,
      allowRematch: false, continueLabel: 'Continue story', forfeitLabel: 'Leave battle',
      forfeitWarning: 'You can retry this battle from the story screen.',
      onForfeit: () => { S.attempts[node.id] = (S.attempts[node.id] || 0) + 1; this.save(); },
      onFinish: (res) => { outcome = { won: res.winner === 0 }; return false; },
      onExit: () => { if (outcome) queueMicrotask(() => this.afterBattle(node, outcome.won)); },
    };
    this.ui.push(new BattleScreen(session));
  }

  async afterBattle(node, won) {
    const P = this.P;
    const S = storyState(P);
    this.busy = true;
    try {
      await this.dialog(resolveLines(P, won ? node.win : node.lose), { title: node.title });
      if (won || node.onLose === 'continue') {
        const r = grantStoryReward(P, node.id, node.reward);
        await this.showReward(r);
        await this.tip(node.tutorial);
        delete S.attempts[node.id];
        advance(P);
      } else {
        S.attempts[node.id] = (S.attempts[node.id] || 0) + 1;
      }
      await this.save();
    } finally { this.busy = false; }
    this.ui.refresh(this);
    if (won || node.onLose === 'continue') await this.play();
  }

  async runTraining(node) {
    const P = this.P;
    const S = storyState(P);
    await this.dialog(resolveLines(P, node.pre || []), { title: node.title });
    const opp = storyOpponent(P, node, 1);
    const session = {
      mode: 'training', title: `Training · ${node.title}`, arenaId: node.arena || 'standard', format: 'bo5', roundTime: 90,
      participants: [this.playerParticipant(), opp.participant], difficulty: opp.difficulty, noRewards: true,
      rules: { durability: false, loot: false }, objectives: node.objectives, objectivesTitle: node.title, tips: node.tips,
      allowRematch: false, forfeitLabel: 'Leave training', forfeitWarning: 'You can restart training from the story screen.',
      onFinish: (res, rw, screen) => {
        const done = !!screen.objectives?.complete;
        screen.exit();
        queueMicrotask(() => this.afterTraining(node, done));
        return true;
      },
    };
    S.attempts[node.id] = (S.attempts[node.id] || 0);
    this.ui.push(new BattleScreen(session));
  }

  async afterTraining(node, done) {
    const P = this.P;
    const S = storyState(P);
    this.busy = true;
    try {
      if (done) {
        await this.dialog(resolveLines(P, node.post || []), { title: node.title });
        const r = grantStoryReward(P, node.id, node.reward);
        await this.showReward(r);
        delete S.attempts[node.id];
        advance(P);
      } else {
        S.attempts[node.id] = (S.attempts[node.id] || 0) + 1;
        await this.dialog([{ speaker: 'Training', text: 'Not all objectives were met before the session ended. Objectives you complete count again on the next try — give it another go.', color: '#ffd84d' }]);
      }
      await this.save();
    } finally { this.busy = false; }
    this.ui.refresh(this);
    if (done) await this.play();
  }

  // ------------------------------------------------------------ tournaments

  async runTournament(node) {
    const P = this.P;
    const act = P.tournaments.active;
    if (act && act.storyNode === node.id) { this.ui.push(new TournamentHubScreen()); return; }
    if (act) { this.ui.toast('Finish or withdraw from your current tournament first.', 'bad'); return; }
    const def = TOURNAMENT_INDEX[node.tournament];
    await this.dialog(resolveLines(P, node.pre || []), { title: node.title });
    const seed = (Date.now() ^ ((storyState(P).attempts[node.id] || 0) * 2654435761)) >>> 0;
    const t = createTournament(def, P, { seed, loadoutIndex: P.activeLoadout });
    t.storyNode = node.id;
    // story difficulty scales the AI entrants
    const mul = storyDifficulty(this.app).mul;
    for (const e of t.entrants) if (e.difficulty) e.difficulty = Math.max(0.4, Math.min(1.35, e.difficulty * mul));
    for (const e of t.entrants) if (e.rivalId) markSeen(P, e.rivalId);
    P.tournaments.active = t;
    delete storyState(P).results[node.id];
    await this.save();
    this.app.tournaments.kick();
    this.ui.push(new TournamentHubScreen());
  }

  async afterTournament(node, res) {
    if (this.busy) return;
    const P = this.P;
    const S = storyState(P);
    res.processed = true;
    const ok = res.place != null && res.place <= node.need;
    this.busy = true;
    try {
      await this.dialog(resolveLines(P, ok ? node.win : node.lose), { title: node.title });
      if (ok) {
        const r = grantStoryReward(P, node.id, node.reward);
        await this.showReward(r);
        delete S.attempts[node.id];
        advance(P);
      } else S.attempts[node.id] = (S.attempts[node.id] || 0) + 1;
      await this.save();
    } finally { this.busy = false; }
    this.ui.refresh(this);
    if (ok) await this.play();
  }

  prompts() { return [['confirm', 'Select'], ['back', 'Back']]; }
}

// ====================================================================== chapter card

export class ChapterCardScreen {
  static screenName = 'ChapterCardScreen';
  constructor(ch, onDone) { this.overlay = true; this.ch = ch; this.onDone = onDone; this.t = 0; }
  render() {
    const ch = this.ch;
    return h('div', { class: 'chapter-card', style: { '--chc': ch.color }, onclick: () => this.close() },
      h('div', { class: 'cc-num' }, `CHAPTER ${ch.n}`), h('div', { class: 'cc-title' }, ch.title), h('div', { class: 'cc-loc' }, ch.location));
  }
  update(dt) { this.t += dt; }
  handleInput(input) { if (input.pressed('confirm', 'menu') && this.t > 0.4) { this.close(); return true; } return false; }
  onBack() { this.close(); return true; }
  close() { if (this.closed) return; this.closed = true; this.ui.pop(); this.onDone?.(); }
  prompts() { return [['confirm', 'Begin']]; }
}

// ====================================================================== battler creation

export class CreatorScreen {
  static screenName = 'CreatorScreen';
  constructor(onDone) {
    this.onDone = onDone;
    this.style = 'striker';
    this.color = null;
    this.pronouns = 'they';
  }

  render() {
    const P = this.app.profile;
    if (!this.color) this.color = P.player.color || PLAYER_COLORS[0];
    const styles = h('div', { class: 'col gap', 'data-wrap': '' }, STORY_STYLES.map((s) => {
      const b = btn(h('div', {}, h('div', { class: 'tt-name' }, s.name), h('div', { class: 'small muted' }, s.desc)), () => { this.style = s.id; this.ui.refresh(this); }, { class: 'tour-btn' + (this.style === s.id ? ' sel' : ''), id: 'style-' + s.id });
      return b;
    }));
    const swatches = h('div', { class: 'row gap wrap', 'data-wrap': '' }, PLAYER_COLORS.map((c) => btn(h('span', { class: 'swatch', style: { background: c } }), () => { this.color = c; this.ui.refresh(this); }, { class: 'swatch-btn' + (this.color === c ? ' sel' : ''), id: 'color-' + c.slice(1) })));
    return h('div', { class: 'std-screen creator' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Create your battler')),
      h('div', { class: 'ws-cols two-wide' },
        h('div', { class: 'panel col gap' },
          h('div', { class: 'creator-name', style: { color: this.color } }, P.player.name),
          btn('Change name', () => this.ui.push(new NameEntryScreen((name) => { P.player.name = name; this.ui.pop(); })), { id: 'creator-name' }),
          h('h3', {}, 'Colour'), swatches,
          selector('Pronouns', [{ value: 'they', label: 'they / them' }, { value: 'she', label: 'she / her' }, { value: 'he', label: 'he / him' }], this.pronouns, (v) => { this.pronouns = v; }, { id: 'creator-pronouns', desc: 'Saved with your profile for anywhere you are referred to in the third person.' })),
        h('div', { class: 'panel col gap' }, h('h3', {}, 'Battle style'), h('div', { class: 'small muted' }, 'Your style decides your starter parts. Any build can be used later — this is just where you begin.'), styles,
          btn('Begin', () => this.finish(), { class: 'primary big', id: 'creator-done' }))));
  }

  onResume() { this.ui.refresh(this); }
  onBack() { return true; }

  finish() {
    const P = this.app.profile;
    const r = applyCreation(P, { name: P.player.name, color: this.color, style: this.style, pronouns: this.pronouns });
    this.ui.pop();
    this.onDone?.(r);
  }

  prompts() { return [['confirm', 'Select']]; }
}

export { fillText };
