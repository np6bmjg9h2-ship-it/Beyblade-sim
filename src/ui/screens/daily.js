// Daily Seed screen: today's challenge (stadium twist, the fixed top, the
// five opponents), the run in progress with its part picks, today's best and
// the streak, and replay codes: copy your best run's code, or paste a
// friend's code to re-simulate it and see whether its score is real.

import { h, btn } from '../ui.js';
import { statRow, itemCard } from '../widgets.js';
import { SLOT_NAMES } from '../../data/parts.js';
import { ARENA_INDEX } from '../../data/arenas.js';
import { BEAST_INDEX } from '../../data/beasts.js';
import { itemName } from '../../systems/items.js';
import { compareBuildSwap } from '../../systems/compare.js';
import { compareMini } from '../compare.js';
import {
  dayKey, untilNextDay, dailyChallenge, dailyBuild, dailyState, dailySession, startDaily, recordDailyBattle, pickDue, pickOffer,
  finishDaily, abandonDaily, runScore, verifyRun, beginDailyBattle, forfeitDailyBattle, settleDaily, DAILY, SCORE,
} from '../../systems/daily.js';
import { encodeRun, decodeRun } from '../../systems/dailyCode.js';
import { BattleScreen } from './battle.js';
import { GAME_VERSION } from '../../version.js';

const fmtDay = (key) => new Date(key + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const hearts = (n) => '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, DAILY.hearts - n));
const pts = (n) => Math.round(n).toLocaleString();

export class DailyScreen {
  static screenName = 'DailyScreen';
  constructor() { this.verify = null; this.code = null; }
  get P() { return this.app.profile; }

  render() {
    const P = this.P;
    // a battle left without a result (the game was closed mid-battle) is lost
    if (this.ui?.current === this && settleDaily(P)) {
      if (P.daily.active?.done) this.finish();
      this.app.save('silent');
      this.ui.toast('A Daily battle was left unfinished: it counts as a loss.', 'warn', 4500);
    }
    const today = dayKey();
    const st = dailyState(P, today);
    const run = st.run;
    // a run started before UTC midnight is finished on its own day
    const key = run?.key || today;
    const ch = dailyChallenge(key);
    const left = h('div', { class: 'panel scroll', 'data-scroll': 'daily-today' }, ...this.today(ch, st, run));
    const right = h('div', { class: 'panel scroll', 'data-scroll': 'daily-scores' }, ...this.scores(ch, st, key));
    const head = key === today ? `${fmtDay(key)} · new challenge in ${this.countdown()}` : `Finishing your run from ${fmtDay(key)} · today's challenge opens when it ends`;
    return h('div', { class: 'std-screen daily' }, h('div', { class: 'screen-head' }, h('h1', {}, 'Daily Seed'), h('span', { class: 'muted' }, head)),
      h('div', { class: 'ws-cols two-wide' }, left, right));
  }

  countdown() {
    const m = Math.round(untilNextDay() / 60000);
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  today(ch, st, run) {
    const out = [];
    const arena = ARENA_INDEX[ch.arenaId];
    out.push(h('div', { class: 'daily-twist' }, h('b', {}, `${arena.name} · ${ch.twist.name}`), h('div', { class: 'small' }, ch.twist.desc)));
    if (run && pickDue(run)) return [...out, ...this.pick(ch, run)];
    // the top, with the picks made so far
    const build = dailyBuild(ch, run?.picks || []);
    out.push(h('h3', {}, 'Your top today'),
      h('div', { class: 'small' }, Object.entries(build).map(([s, it]) => h('div', {}, `${SLOT_NAMES[s]}: `, h('b', {}, itemName(it)), ` (${it.rarity})`))),
      h('div', { class: 'small muted' }, `${itemName(ch.start.launcher)} · ${itemName(ch.start.cable)} · ${ch.start.spin === 'L' ? 'left' : 'right'} spin · ${BEAST_INDEX[ch.start.beast]?.name || ''} (bond ${DAILY.beastBond})`),
      h('div', { class: 'small muted' }, 'Everyone gets this exact top today. Your own parts, skills and Bit-Beast bonds don\'t count here.'));
    out.push(h('h3', {}, 'Opponents'));
    ch.opponents.forEach((o, i) => {
      const r = run?.results[i];
      const mark = r ? (r.won ? `✓ +${pts(r.score)}` : r.summary.winner == null ? 'draw' : '✗ lost') : run && run.stage === i ? '▶ next' : '';
      out.push(h('div', { class: 'daily-opp' + (r ? (r.won ? ' won' : ' lost') : run?.stage === i ? ' next' : '') }, `${i + 1}. ${o.kind === 'rival' ? 'Rival ' : ''}${o.name}`, h('span', { class: 'small muted' }, ` · skill ${Math.round(o.difficulty * 100)}%`), mark ? h('span', { class: 'daily-mark' }, mark) : null));
    });
    if (run) {
      out.push(h('div', { class: 'daily-run row gap' }, h('span', { class: 'daily-hearts' }, hearts(run.hearts)), h('b', {}, `${pts(runScore(run))} points`), h('span', { class: 'small muted' }, `battle ${run.stage + 1} of ${DAILY.battles}`)),
        btn(`Battle ${run.stage + 1}: ${ch.opponents[run.stage].name}`, () => this.fight(ch), { class: 'primary big', id: 'daily-fight' }),
        btn('Abandon run', () => this.abandon(), { id: 'daily-abandon', desc: 'Ends the run with the points you have. It still counts for your streak.' }));
    } else {
      out.push(h('p', { class: 'small muted' }, `Win as many of the ${DAILY.battles} battles as you can: ${DAILY.hearts} hearts, a loss costs one. After each battle you pick one of three parts for your top. Points: ${pts(SCORE.win)} per win (more against tougher opponents), a bonus for the finish, for winning fast and for a perfect launch, and ${SCORE.heart} for every heart left.`),
        btn(st.best ? 'Play again (your best stays)' : 'Start today\'s run', () => this.start(), { class: 'primary big', id: 'daily-start' }));
    }
    return out;
  }

  // Choose one of three parts (or keep the top as it is).
  pick(ch, run) {
    const i = run.picks.length;
    const build = { parts: dailyBuild(ch, run.picks), launcher: ch.start.launcher, cable: ch.start.cable, spin: ch.start.spin };
    const out = [h('h3', {}, `Pick a part (${i + 1} of ${DAILY.offerRarity.length})`), h('div', { class: 'small muted' }, 'It replaces the part in the same slot for the rest of the run.')];
    ch.offers[i].forEach((it, k) => {
      let cmp = null;
      try { cmp = compareBuildSwap(build, it.slot, it); } catch { cmp = null; }
      out.push(h('div', { class: 'daily-offer' }, itemCard(it), cmp ? compareMini(cmp, 4) : null,
        btn(`Take ${itemName(it)} (${SLOT_NAMES[it.slot]})`, () => this.choose(k), { class: 'primary', id: 'daily-pick-' + k })));
    });
    out.push(btn('Keep my top as it is', () => this.choose(-1), { id: 'daily-pick-skip' }));
    return out;
  }

  scores(ch, st, key) {
    const out = [h('h3', {}, 'Today')];
    out.push(statRow('First run', st.first ? `${pts(st.first.score)} (${st.first.wins} win${st.first.wins === 1 ? '' : 's'})` : '—', { hint: 'your first finished run today: practice runs never change it' }),
      statRow('Best score', st.best ? `${pts(st.best.score)} (${st.best.wins} win${st.best.wins === 1 ? '' : 's'})` : '—'),
      statRow('Streak', st.streak ? `${st.streak} day${st.streak > 1 ? 's' : ''} 🔥` : '—', { hint: st.bestStreak ? `best ${st.bestStreak}` : '' }),
      statRow('Runs today', st.attempts),
      h('div', { class: 'small muted' }, 'Your first finished run each day earns credits and materials; every 7-day streak adds Relic Fragments.'));
    out.push(h('h3', {}, 'Share your run'));
    if (st.best?.run) {
      out.push(h('div', { class: 'small muted' }, 'A code holds your whole run, inputs and all. Anyone who pastes it into their game re-plays every battle and sees whether the score is real.'),
        btn('Copy my best run\'s code', () => this.copyCode(st, key), { id: 'daily-copy' }));
      if (this.code) out.push(h('textarea', { class: 'daily-code', readonly: true, rows: 3, onfocus: (e) => e.target.select() }, this.code));
    } else out.push(h('div', { class: 'small muted' }, 'Finish a run to get a code.'));
    out.push(h('h3', {}, 'Check a friend\'s code'));
    const box = h('textarea', { class: 'daily-code', rows: 3, placeholder: 'Paste a Daily Seed code here', id: 'daily-paste' });
    if (this.pasted) box.value = this.pasted;
    box.addEventListener('input', () => { this.pasted = box.value; });
    out.push(box, btn('Verify code', () => this.check(box.value), { id: 'daily-verify' }));
    if (this.verify) out.push(this.verifyCard(this.verify));
    if (st.history.length) {
      out.push(h('h3', {}, 'Recent days'));
      for (const d of st.history.slice(0, 7)) out.push(h('div', { class: 'small' }, `${fmtDay(d.key)}: ${pts(d.score)} (${d.wins} win${d.wins === 1 ? '' : 's'})`));
    }
    return out;
  }

  verifyCard(v) {
    if (v.busy) return h('div', { class: 'note-box' }, v.busy);
    if (v.error) return h('div', { class: 'warn-box' }, v.error);
    const ok = v.ok && v.matches;
    return h('div', { class: ok ? 'note-box daily-verified' : 'warn-box' },
      h('b', {}, ok ? `✓ Verified: ${pts(v.score)} points` : v.ok ? `✗ Claims ${pts(v.claimed)} but replays to ${pts(v.score)}` : `✗ ${v.reason}`),
      v.ok ? h('div', { class: 'small' }, `${v.name || 'A player'} on ${fmtDay(v.key)}${v.key === dayKey() ? ' (today)' : ''}: ${v.battles.map((b) => (b.won ? '✓' : b.forfeit ? '⨯ quit' : '✗')).join(' ')}${v.complete ? '' : ' (run not finished)'}`) : null,
      v.version && v.version !== GAME_VERSION ? h('div', { class: 'small muted' }, `Recorded on game version ${v.version} (you have ${GAME_VERSION}): if the physics changed in between, the replay can differ.`) : null);
  }

  // ------------------------------------------------------------ actions

  start() {
    startDaily(this.P);
    this.app.save('silent');
    this.ui.refresh(this);
  }

  choose(k) {
    const r = pickOffer(this.P, k);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); this.app.audio.ui('error'); return; }
    this.app.audio.ui('confirm');
    this.app.save('silent');
    this.ui.refresh(this);
  }

  fight(ch) {
    const P = this.P;
    const run = dailyState(P).run;
    if (!run || run.done || pickDue(run)) return;
    const stage = run.stage;
    const session = dailySession(ch, run, stage, { name: P.player.name, color: P.player.color });
    beginDailyBattle(P);
    this.app.save('silent');
    session.forfeitWarning = 'Quitting a Daily battle counts as a loss: no points and one heart.';
    session.onForfeit = async () => {
      const r = forfeitDailyBattle(P);
      if (!r) return;
      this.ui.toast(`Battle ${stage + 1} quit: it counts as a loss.`, 'warn', 3500);
      if (r.done) this.finish();
      await this.app.save('silent');
      this.ui.refresh(this);
    };
    session.onFinish = async (result, _rewards, screen) => {
      const cur = dailyState(P).run;
      if (!cur || cur.stage !== stage) return false;
      const r = recordDailyBattle(P, result, screen.battle.replayData());
      this.ui.toast(r.score ? `Battle ${stage + 1}: +${pts(r.score)} points` : r.lost ? `Battle ${stage + 1} lost: one heart gone` : `Battle ${stage + 1}: no points`, r.score ? 'good' : 'warn', 3500);
      if (r.done) this.finish();
      await this.app.save('silent');
      return false;
    };
    session.onExit = () => this.ui.refresh(this);
    this.ui.push(new BattleScreen(session));
  }

  finish() {
    const s = finishDaily(this.P);
    if (!s) return;
    this.code = null;
    const reward = s.reward ? ` · +${s.reward.credits} CR${s.reward.coreShard ? `, ${s.reward.coreShard} Core Shard` : ''}${s.reward.relicFragment ? `, ${s.reward.relicFragment} Relic Fragments` : ''}` : '';
    this.ui.toast(`Run over: ${pts(s.score)} points${s.newBest ? ' — new best!' : ''} · streak ${s.streak}${reward}`, 'good', 6000);
    this.app.audio.ui(s.newBest ? 'levelup' : 'confirm');
  }

  async abandon() {
    if (!(await this.ui.confirm('Abandon run?', 'The run ends with the points you have now. It still counts for your streak.', { danger: true, yes: 'Abandon' }))) return;
    const s = abandonDaily(this.P);
    if (s) this.ui.toast(`Run ended: ${pts(s.score)} points.`, 'info', 4000);
    await this.app.save('silent');
    this.ui.refresh(this);
  }

  async copyCode(st, key) {
    const best = st.best;
    this.code = await encodeRun({ key, name: this.P.player.name, score: best.score, picks: best.run.picks, battles: best.run.battles });
    this.ui.refresh(this);
    try { await navigator.clipboard.writeText(this.code); this.ui.toast(`Code copied (${this.code.length.toLocaleString()} characters).`, 'good'); } catch { this.ui.toast('Copy the code from the box (select it).', 'info'); }
  }

  async check(text) {
    if (!text.trim()) { this.ui.toast('Paste a code first.', 'warn'); return; }
    this.verify = { busy: 'Reading the code…' };
    this.ui.refresh(this);
    try {
      const data = await decodeRun(text);
      this.verify = { busy: `Re-playing ${data.battles.length} battle${data.battles.length > 1 ? 's' : ''}…` };
      this.ui.refresh(this);
      this.verify = await verifyRun(data, { slice: 30, onProgress: (i, n) => { this.verify = { busy: `Re-playing battle ${i + 1 > n ? n : i + 1} of ${n}…` }; this.ui.refresh(this); } });
    } catch (e) {
      this.verify = { error: `Could not read that code: ${e.message}.` };
    }
    this.ui.refresh(this);
  }

  onResume() { this.ui.refresh(this); }
}
