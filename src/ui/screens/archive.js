// The Archive: research projects that recover the Four Founders' legendary
// tops (data/legends.js). Each project costs research and opens a page of
// the Founders' story; the third project of a legend awakens it into the
// Legend loadout slot.

import { h, btn } from '../ui.js';
import { beastImg } from '../widgets.js';
import { LEGENDS } from '../../data/legends.js';
import { BEAST_INDEX } from '../../data/beasts.js';
import { projectStatus, completeProject, archiveOf, legendUnlocked } from '../../systems/legends.js';

export class ArchiveScreen {
  static screenName = 'ArchiveScreen';
  get P() { return this.app.profile; }

  render() {
    const P = this.P;
    const A = archiveOf(P);
    const cols = LEGENDS.map((L) => {
      const B = BEAST_INDEX[L.beast];
      const awake = legendUnlocked(P, L.id);
      return h('div', { class: 'panel skill-col', style: { '--pc': L.color } },
        h('div', { class: 'row gap' }, beastImg(L.beast, 48), h('div', {}, h('div', { class: 'sk-path' }, L.name), h('div', { class: 'small muted' }, `${B.name}, ${B.title}`))),
        h('div', { class: 'small sk-pdesc' }, L.blurb),
        h('div', { class: 'small muted' }, `Founder: ${L.founder.name}, from ${L.founder.home}. ${L.role}, ${L.spin === 'L' ? 'left' : 'right'} spin.`),
        h('div', { class: 'col gap', 'data-wrap': '' }, L.projects.map((pr, i) => {
          const st = projectStatus(P, pr.id);
          return btn(h('div', { class: 'sk-node' },
            h('div', { class: 'sk-head' }, h('b', {}, `${i + 1}. ${pr.name}`), h('span', { class: 'sk-rank' }, st.done ? 'Done' : `${pr.cost} research`)),
            st.done ? h('div', { class: 'small' }, pr.page) : h('div', { class: 'small ' + (st.available ? 'good' : 'muted') }, st.available ? (i === L.projects.length - 1 ? 'Ready: awakens the legend.' : 'Ready to research.') : st.reason)),
          () => this.research(pr.id), { class: 'skill-btn' + (st.done ? ' learned' : '') + (st.available ? ' can' : ''), id: 'proj-' + pr.id, desc: st.done ? 'Finished.' : st.available ? `Spend ${pr.cost} research.` : st.reason });
        })),
        awake ? h('div', { class: 'small good' }, 'Awakened: field it from the Legend slot in the Workshop.') : null);
    });
    const done = Object.keys(A.done).length;
    return h('div', { class: 'std-screen skills archive' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Archive'),
        h('span', { class: 'mats' }, `Research ${P.currency.research} · ${done}/${LEGENDS.length * 3} projects · ${LEGENDS.filter((L) => legendUnlocked(P, L.id)).length}/${LEGENDS.length} legends awakened`)),
      h('div', { class: 'small muted' }, 'Before the League and Arena Zero, four kids won the first world championship as one team. Their tops were lost when the old crater stadium fell. Research what is left, and bring them back.'),
      h('div', { class: 'skill-cols' }, cols));
  }

  research(id) {
    const r = completeProject(this.P, id);
    if (!r.ok) { this.ui.toast(r.reason, 'bad'); return; }
    this.app.audio.ui('confirm');
    this.app.save('silent');
    this.ui.toast(r.awakened ? `${r.legend.name} awakens! ${BEAST_INDEX[r.legend.beast].name} joins you; the Legend slot is in your Workshop.` : `Research complete: ${r.project.name}.`, 'good', r.awakened ? 6000 : 3000);
    this.ui.refresh(this);
  }

  prompts() { return [['confirm', 'Research'], ['back', 'Back']]; }
}
