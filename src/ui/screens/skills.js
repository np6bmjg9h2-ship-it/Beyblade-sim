// Player skill trees: five paths, ranks bought with skill points from
// levelling, requirements, and a credit-priced respec that refunds every
// point. Each node changes a defined mechanic (see data/skills.js).

import { h, btn } from '../ui.js';
import { SKILL_PATHS, SKILLS, SKILL_INDEX, canLearn, respecCost, computeSkillEffects } from '../../data/skills.js';

export class SkillsScreen {
  static screenName = 'SkillsScreen';
  get P() { return this.app.profile; }

  render() {
    const P = this.P;
    const ranks = P.player.skills;
    const spent = Object.values(ranks).reduce((s, r) => s + r, 0);
    const cols = SKILL_PATHS.map((path) => h('div', { class: 'panel skill-col', style: { '--pc': path.color } },
      h('div', { class: 'sk-path' }, path.name), h('div', { class: 'small muted sk-pdesc' }, path.desc),
      h('div', { class: 'col gap', 'data-wrap': '' }, SKILLS.filter((s) => s.path === path.id).map((s) => {
        const r = ranks[s.id] || 0;
        const can = canLearn(ranks, s.id, P.player.skillPoints);
        const reqMissing = s.req && !(ranks[s.req] > 0);
        const el = btn(h('div', { class: 'sk-node' },
          h('div', { class: 'sk-head' }, h('b', {}, s.name), h('span', { class: 'sk-rank' }, `${r}/${s.max}`)),
          h('div', { class: 'small' }, r > 0 ? s.desc(r) : s.desc(1)),
          r < s.max && r > 0 ? h('div', { class: 'small muted' }, `Next: ${s.desc(r + 1)}`) : null,
          reqMissing ? h('div', { class: 'small bad' }, `Requires ${SKILL_INDEX[s.req].name}`) : null),
        () => this.learn(s.id), { class: 'skill-btn' + (r >= s.max ? ' maxed' : r > 0 ? ' learned' : '') + (can.ok ? ' can' : ''), id: 'skill-' + s.id, desc: can.ok ? 'Spend 1 skill point.' : can.reason });
        return el;
      }))));
    return h('div', { class: 'std-screen skills' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Skills'),
        h('span', { class: 'mats' }, `${P.player.skillPoints} point${P.player.skillPoints === 1 ? '' : 's'} available · ${spent} spent · level ${P.player.level}`),
        btn(`Respec (${respecCost(P.player.level)} cr)`, () => this.respec(), { id: 'respec', disabled: spent === 0, desc: 'Refund every skill point for credits.' })),
      h('div', { class: 'small muted' }, 'Skill points come from levelling up (one per level). Bonuses are modest by design: aiming, launching and timing are still yours.'),
      h('div', { class: 'skill-cols' }, cols));
  }

  learn(id) {
    const P = this.P;
    const c = canLearn(P.player.skills, id, P.player.skillPoints);
    if (!c.ok) { this.ui.toast(c.reason, 'bad'); return; }
    P.player.skills[id] = (P.player.skills[id] || 0) + 1;
    P.player.skillPoints--;
    this.app.audio.ui('confirm');
    this.app.save('silent');
    this.ui.refresh(this);
  }

  async respec() {
    const P = this.P;
    const cost = respecCost(P.player.level);
    if (P.currency.credits < cost) { this.ui.toast(`Respec costs ${cost} credits.`, 'bad'); return; }
    if (!(await this.ui.confirm('Reset all skills?', `Every spent point is refunded for ${cost} credits.`, { yes: 'Respec' }))) return;
    const spent = Object.values(P.player.skills).reduce((s, r) => s + r, 0);
    P.currency.credits -= cost;
    P.player.skills = {};
    P.player.skillPoints += spent;
    await this.app.save('silent');
    this.ui.refresh(this);
    this.ui.toast(`${spent} points refunded.`, 'good');
  }

  prompts() { return [['confirm', 'Learn'], ['back', 'Back']]; }
}

export { computeSkillEffects };
