// Bit-Beast collection: identities, lore unlocked through bond, abilities
// with activation/cost/cooldown/counterplay, resonance, awakening progress,
// Spirit Trials (recruitment) and Awakening Trials.

import { h, btn } from '../ui.js';
import { beastImg, statRow } from '../widgets.js';
import { BEASTS, BEAST_INDEX, ELEMENTS, BOND_UNLOCKS } from '../../data/beasts.js';
import { RARITY_INDEX } from '../../data/rarity.js';
import { SET_INDEX } from '../../data/sets.js';
import { bondInfo, unlockedLore, trialStatus, awakeningStatus, recruitBeast, awakenBeast, trialOpponent } from '../../systems/beasts.js';
import { validateLoadout, buildParticipant } from '../../systems/loadout.js';
import { BattleScreen } from './battle.js';

export class BeastsScreen {
  static screenName = 'BeastsScreen';
  constructor() { this.sel = 'orrery'; }

  render() {
    const P = this.app.profile;
    const list = h('div', { class: 'beast-grid', 'data-wrap': '' });
    for (const b of BEASTS) {
      const owned = !!P.beasts[b.id];
      const tr = trialStatus(P, b.id);
      const el = btn(h('div', { class: 'beast-tile' }, owned ? beastImg(b.id, 64) : h('div', { class: 'beast-unknown' }, '?'),
        h('div', { class: 'bt-name' }, owned || tr.available ? b.name : '???'),
        h('div', { class: 'bt-sub' }, owned ? `Bond ${bondInfo(P.beasts[b.id]).level}${P.beasts[b.id].awakened ? ' · Awakened' : ''}` : tr.available ? 'Trial available!' : 'Unknown signal')),
      () => { this.sel = b.id; this.ui.refresh(this); }, { class: 'beast-btn' + (this.sel === b.id ? ' sel' : '') + (tr.available ? ' glow' : '') });
      el.dataset.id = 'beast-' + b.id;
      list.append(el);
    }
    return h('div', { class: 'std-screen beasts' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Bit-Beasts'), h('span', { class: 'muted' }, `${Object.keys(P.beasts).length}/${BEASTS.length} bonded`)),
      h('div', { class: 'ws-cols two-wide beast-cols' }, h('div', { class: 'panel scroll' }, list), h('div', { class: 'panel scroll', 'data-scroll': 'beast' }, this.detail(this.sel))));
  }

  detail(id) {
    const P = this.app.profile;
    const b = BEAST_INDEX[id];
    const st = P.beasts[id];
    const tr = trialStatus(P, id);
    const el = ELEMENTS[b.element];
    if (!st) {
      return h('div', { class: 'col gap' }, h('h2', {}, tr.available ? b.name : 'Unknown spirit'), h('p', { class: 'muted' }, tr.available ? `${b.name}, ${b.title}, waits for a worthy partner. ${tr.hint}` : tr.reason),
        tr.available ? btn(`Begin Spirit Trial — defeat ${trialOpponent(id).name}`, () => this.trial(id, 'spirit'), { class: 'primary big', id: 'spirit-trial', desc: 'Win a best-of-3 against the spirit\'s current champion to bond with it.' }) : null);
    }
    const bi = bondInfo(st);
    const aw = awakeningStatus(P, id);
    const ab = (slot, label) => {
      const d = b.abilities[slot];
      if (!d) return null;
      const locked = slot === 'secondary' ? bi.level < (d.bond || 0) : slot === 'ultimate' ? !st.awakened : false;
      return h('div', { class: 'ability-card' + (locked ? ' locked' : '') },
        h('div', { class: 'ac-head' }, h('b', {}, `${label}: ${d.name}`), h('span', { class: 'chip' }, d.category), locked ? h('span', { class: 'chip' }, slot === 'ultimate' ? 'Requires awakening' : `Bond ${d.bond}`) : null),
        h('div', { class: 'small' }, d.desc),
        h('div', { class: 'small muted' }, `Cost ${d.cost} spirit · cooldown ${d.cooldown} s · duration ${d.duration} s${d.condition?.spinBelow ? ` · only below ${d.condition.spinBelow * 100}% spin` : ''}`),
        h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Counterplay: '), d.counterplay));
    };
    const lore = unlockedLore(id, st);
    const res = b.resonance;
    const L = P.loadouts[P.activeLoadout];
    return h('div', { class: 'col gap' },
      h('div', { class: 'row gap' }, beastImg(id, 110, st.awakened ? 'awakened' : ''), h('div', {},
        h('h2', {}, `${st.nickname || b.name}`), h('div', { class: 'muted cap' }, b.title),
        h('div', { class: 'row gap small' }, h('span', { class: 'chip', style: { color: el.color, borderColor: el.color } }, el.name), h('span', { class: 'chip', style: { color: RARITY_INDEX[b.rarity].color } }, RARITY_INDEX[b.rarity].name), h('span', { class: 'chip' }, `Style: ${b.style}`)),
        h('div', { class: 'small' }, b.personality))),
      h('div', {}, h('div', { class: 'small' }, `Bond level ${bi.level} — ${bi.xp} XP${bi.next ? ` (next at ${bi.next})` : ' (max)'}`), h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: `${bi.frac * 100}%`, background: b.colors.primary } })),
        h('div', { class: 'small muted' }, `Grows by battling in its preferred style: ${b.preferred.desc}.`)),
      h('h3', {}, 'Passive'), h('div', { class: 'small' }, h('b', {}, b.passive.name), ': ', b.passive.desc, bi.level >= 5 ? ' (strengthened +50% at bond 5)' : ''),
      h('h3', {}, 'Abilities'), ab('signature', 'Signature (RT)'), ab('secondary', 'Secondary (LT)'), ab('ultimate', 'Ultimate (LB+RB)'),
      h('h3', {}, 'Resonance'), h('div', { class: 'small' }, res.desc, h('div', { class: 'muted' }, `Resonates with cores of affinity: ${res.affinity.join(', ')}${res.set ? ` · or any ${SET_INDEX[res.set].name} piece` : ''}`)),
      h('h3', {}, 'Awakening'),
      st.awakened ? h('div', { class: 'small good' }, `${b.awakening.name} achieved — ultimate unlocked.`)
        : h('div', { class: 'col gap' }, h('div', { class: 'small' }, `${b.awakening.name}: ${b.awakening.desc}`),
          h('div', { class: 'small' }, `Bond ${aw.bond}/${aw.needBond} ${aw.bondOk ? '✓' : ''} · Requirement ${aw.progress} ${aw.reqOk ? '✓' : ''}`),
          btn('Begin Awakening Trial', () => this.trial(id, 'awakening'), { class: 'primary', id: 'awaken-trial', disabled: !aw.eligible, desc: 'A best-of-3 against the echo of the spirit itself. Win to awaken.' })),
      h('h3', {}, 'Bond unlocks'), h('div', { class: 'col small' }, BOND_UNLOCKS.map((u) => h('div', { class: bi.level >= u.level ? 'good' : 'muted' }, `Bond ${u.level}: ${u.desc}`))),
      h('h3', {}, 'Memories'), ...lore.map((l) => h('div', { class: 'lore' + (l.unlocked ? '' : ' locked') }, l.unlocked ? l.text : `Unlocks at bond ${l.level}.`)),
      h('h3', {}, 'Origin'), h('div', { class: 'small' }, b.lore, ' ', b.origin),
      h('div', { class: 'row gap' }, btn(L?.beast === id ? `Bonded to ${L.name} ✓` : `Bond to active loadout (${L?.name})`, () => { L.beast = id; this.ui.refresh(this); this.ui.toast(`${b.name} now spins with ${L.name}.`, 'good'); }, { id: 'bond-loadout', disabled: L?.beast === id })),
      h('h3', {}, 'Record together'), statRow('Battles', st.stats.battlesWith || 0), statRow('Wins', st.stats.winsWith || 0), statRow('Ring outs', st.stats.ringOutsWith || 0), statRow('Shatters', st.stats.burstsWith || 0), statRow('Counters', st.stats.countersWith || 0));
  }

  trial(id, kind) {
    const app = this.app;
    const P = app.profile;
    const L = P.loadouts[P.activeLoadout];
    const v = validateLoadout(P, L);
    if (!v.ok) { this.ui.toast('Your active loadout is invalid: ' + v.errors[0], 'bad', 4000); return; }
    const me = buildParticipant(P, L, { id: 'player' });
    const opp = trialOpponent(id, kind);
    const b = BEAST_INDEX[id];
    this.ui.push(new BattleScreen({
      mode: 'trial', title: kind === 'awakening' ? `${b.awakening.name}` : `Spirit Trial: ${b.name}`, arenaId: kind === 'awakening' ? 'zero' : 'standard', format: 'bo3',
      participants: [me, opp], difficulty: opp.difficulty, opponentKey: 'trial-' + id + kind, allowRematch: true,
      loot: { label: `${b.name} trial`, tier: 2, winChance: 1, lossChance: 0.2, favour: [] },
      onFinish: async (result, rewards, screen) => {
        if (result.winner === 0) {
          screen.session.allowRematch = false; // the trial is complete
          if (kind === 'spirit' && recruitBeast(P, id)) { rewards?.unlocks?.push(`${b.name}, ${b.title}, has bonded with you!`); this.ui.toast(`${b.name} joins you!`, 'good', 5000); }
          if (kind === 'awakening' && awakenBeast(P, id)) { rewards?.unlocks?.push(`${b.awakening.name}: ${b.abilities.ultimate.name} unlocked!`); this.ui.toast(`${b.name} awakens!`, 'good', 5000); }
          await app.save('silent');
        }
        return false;
      },
    }));
  }

  onResume() { this.ui.refresh(this); }
  prompts() { return [['confirm', 'Select'], ['back', 'Back']]; }
}
