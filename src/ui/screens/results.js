// Match summary: outcome, per-round explanations, notable collisions,
// energy breakdown, durability loss with causes, rewards and progression.

import { h, btn } from '../ui.js';
import { FINISH_NAMES } from '../../game/battle.js';
import { SLOT_NAMES } from '../../data/parts.js';
import { itemCard } from '../widgets.js';

const LEDGER_NAMES = { tipFriction: 'Tip friction', floor: 'Landings', scrape: 'Body scrape', collision: 'Collisions', wall: 'Walls', drag: 'Air drag', control: 'Steering', ability: 'Abilities', damping: 'Wobble damping' };
const PART_NAMES = { ...SLOT_NAMES, 'launcher.drive': 'Launcher drive', 'launcher.trigger': 'Launcher trigger', 'launcher.grip': 'Launcher grip' };

export class ResultsScreen {
  static screenName = 'ResultsScreen';
  constructor(opts) { this.opts = opts; this.tab = 'summary'; }

  render() {
    const { result: r, rewards, battle } = this.opts;
    const hi = r.fighters.findIndex((f) => f.human);
    const me = hi >= 0 ? hi : 0;
    const won = r.winner === me;
    const title = r.winner == null ? 'DRAW' : hi < 0 ? `${r.winnerName} WINS` : won ? 'VICTORY' : 'DEFEAT';
    const score = r.score.map((s) => (battle.format.pointsToWin ? s.points : s.rounds)).join(' – ');
    const rounds = h('div', { class: 'col' }, r.rounds.map((rr) => h('div', { class: 'round-row' },
      h('b', {}, `Round ${rr.round}`), ' ', h('span', { class: 'chip' }, FINISH_NAMES[rr.how] || rr.how), ' ',
      h('span', {}, rr.winner == null ? 'Draw' : r.fighters[rr.winner].name), h('span', { class: 'muted' }, ` · ${rr.time.toFixed(1)} s`),
      h('div', { class: 'small muted' }, rr.explanation))));
    const notable = h('div', { class: 'col' }, r.notable.length ? r.notable.map((n) => h('div', { class: 'stat-row' }, h('span', { class: 'stat-label' }, `R${n.round} · ${n.time.toFixed(1)} s`), h('span', { class: 'stat-value' }, `${n.impulse.toFixed(3)} N·s`), h('span', { class: 'stat-hint' }, `closing ${n.approach.toFixed(2)} m/s, struck by ${r.fighters[n.by].name}`))) : h('div', { class: 'muted' }, 'No collisions.'));
    const f = r.fighters[me];
    const energy = Object.entries(f.stats.energy || {}).filter(([k, v]) => LEDGER_NAMES[k] && v < -0.001).sort((a, b) => a[1] - b[1]);
    const totalE = energy.reduce((s, [, v]) => s - v, 0) || 1;
    const energyEl = h('div', { class: 'col' }, energy.map(([k, v]) => h('div', { class: 'ebar-row' }, h('span', { class: 'stat-label' }, LEDGER_NAMES[k]), h('div', { class: 'ebar' }, h('div', { class: 'ebar-fill', style: { width: `${(-v / totalE) * 100}%` } })), h('span', { class: 'stat-value' }, `${(-v).toFixed(2)} J`))));
    const wearCauses = {};
    for (const [k, v] of Object.entries(f.stats.wearCauses || {})) { const [part, cause] = k.split('|'); (wearCauses[part] = wearCauses[part] || []).push(`${cause} ${v.toFixed(1)}`); }
    const wear = h('div', { class: 'col' }, Object.entries(f.stats.wear || {}).sort((a, b) => b[1] - a[1]).map(([part, v]) => h('div', { class: 'stat-row' }, h('span', { class: 'stat-label' }, PART_NAMES[part] || part), h('span', { class: 'stat-value' }, `-${v.toFixed(1)}`), h('span', { class: 'stat-hint' }, (wearCauses[part] || []).join(', ')))));
    const launches = h('div', { class: 'col' }, f.stats.launches.map((l) => h('div', { class: 'stat-row' }, h('span', { class: 'stat-label' }, `R${l.round} ${l.technique}`), h('span', { class: 'stat-value' }, l.label), h('span', { class: 'stat-hint' }, `${Math.round(l.spin * 9.549)} RPM · ${l.energy.toFixed(2)} J · tilt ${l.tilt.toFixed(1)}°`))));
    const statsEl = h('div', { class: 'col' },
      row('Impacts', f.stats.impacts), row('Heaviest impact', `${f.stats.impulseMax.toFixed(3)} N·s`), row('Wall hits', f.stats.wallHits),
      row('Distance travelled', `${f.stats.distance.toFixed(1)} m`), row('Abilities used', f.stats.abilitiesUsed), row('Ability hits', f.stats.abilityHits || 0),
      row('Counters', f.stats.counters || 0), row('Dashes', f.stats.dashes || 0), row('Lock slips taken / dealt', `${f.stats.lockClicksTaken} / ${f.stats.lockClicksDealt}`));
    const rewardsEl = rewards ? renderRewards(rewards, this.app) : h('div', { class: 'muted' }, 'No rewards in this mode.');
    const actions = h('div', { class: 'row gap' },
      this.opts.onRematch ? btn('Rematch', () => this.opts.onRematch(), { class: 'primary' }) : null,
      btn(this.opts.session.continueLabel || 'Continue', () => this.opts.onExit(), { class: this.opts.onRematch ? '' : 'primary' }));
    return h('div', { class: 'std-screen results' },
      h('div', { class: 'results-head ' + (r.winner == null ? 'draw' : won || hi < 0 ? 'win' : 'lose') }, h('h1', {}, title), h('div', { class: 'res-score' }, `${r.fighters[0].name}  ${score}  ${r.fighters[1].name}`)),
      h('div', { class: 'results-grid', 'data-scroll': 'results' },
        h('div', { class: 'panel' }, h('h3', {}, 'Rounds'), rounds, h('h3', {}, 'Launches'), launches),
        h('div', { class: 'panel' }, h('h3', {}, 'Rewards'), rewardsEl, h('h3', {}, 'Durability loss'), wear.childElementCount ? wear : h('div', { class: 'muted' }, 'No wear.')),
        h('div', { class: 'panel' }, h('h3', {}, 'Where your spin went'), energyEl, h('h3', {}, 'Notable collisions'), notable, h('h3', {}, 'Battle stats'), statsEl)),
      actions);
  }

  prompts() { return [['confirm', 'Select'], ['back', 'Continue']]; }
  onBack() { this.opts.onExit(); return true; }
}

function row(label, v) { return h('div', { class: 'stat-row' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, String(v))); }

export function renderRewards(rw, app) {
  const el = h('div', { class: 'col gap' });
  if (rw.credits || rw.playerXp) el.append(h('div', { class: 'reward-line' }, `+${rw.credits || 0} credits · +${rw.playerXp || 0} player XP${rw.research ? ` · +${rw.research} research` : ''}`));
  if (rw.levelUps) el.append(h('div', { class: 'reward-line gold' }, `LEVEL UP! Now level ${app.profile.player.level} (+${rw.levelUps} skill point${rw.levelUps > 1 ? 's' : ''})`));
  if (rw.materials && Object.keys(rw.materials).length) el.append(h('div', { class: 'reward-line' }, 'Materials: ' + Object.entries(rw.materials).map(([k, v]) => `${k} +${v}`).join(', ')));
  if (rw.bond) el.append(h('div', { class: 'reward-line' }, `${rw.bond.name}: +${rw.bond.xp} bond XP${rw.bond.levelUp ? ` — Bond level ${rw.bond.level}!` : ''}`));
  for (const u of rw.unlocks || []) el.append(h('div', { class: 'reward-line gold' }, u));
  if (rw.itemXp?.length) el.append(h('div', { class: 'small muted' }, 'Item XP: ' + rw.itemXp.map((x) => `${x.name} +${x.xp}${x.mastery ? ` (${x.mastery}!)` : ''}`).join(', ')));
  for (const it of rw.items || []) el.append(itemCard(it, { compact: false, class: 'new-loot' }));
  if (rw.notes) for (const n of rw.notes) el.append(h('div', { class: 'small muted' }, n));
  return el;
}
