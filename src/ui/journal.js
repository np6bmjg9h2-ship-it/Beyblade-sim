// The Journal (Workshop tab): relics and how to earn them, parts with where
// to find them, traits by family, sets, and milestone rewards for filling
// the pages in, plus how close the next guaranteed Epic and Legendary are.

import { h, btn } from './ui.js';
import { costChips } from './widgets.js';
import { SLOT_NAMES } from '../data/parts.js';
import { SETS } from '../data/sets.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { relicStatus, recastRelic, RECAST_COST } from '../systems/relics.js';
import { ALL_BASES, JOURNAL_TRAITS, journalCounts, partSources, pityStatus, milestoneStatus, claimMilestone, unclaimedMilestones } from '../systems/journal.js';
import * as WS from '../systems/workshop.js';

const SLOT_ORDER = ['ring', 'core', 'disc', 'lock', 'tip', 'aux', 'launcher', 'cable'];
const FAMILY_NAMES = { offense: 'Offense', defense: 'Defense', endurance: 'Endurance', mobility: 'Mobility', technical: 'Technical', risk: 'Risk', elemental: 'Elemental', mastery: 'Mastery', synergy: 'Part synergy', curse: 'Curses' };
const rewardText = (r) => Object.entries(r).map(([k, v]) => `${k === 'credits' ? 'CR' : k === 'relicFragment' ? 'Relic Fragment' : k === 'coreShard' ? 'Core Shard' : k === 'spiritDust' ? 'Spirit Dust' : k} ${v.toLocaleString()}`).join(' · ');

export function renderJournal(ws) {
  const P = ws.p;
  const view = ws.journalView || 'relics';
  const c = journalCounts(P);
  const unclaimed = unclaimedMilestones(P);
  const views = [
    ['relics', `Relics ${c.relics.have}/${c.relics.of}`], ['parts', `Parts ${c.parts.have}/${c.parts.of}`], ['traits', `Traits ${c.traits.have}/${c.traits.of}`],
    ['sets', `Sets ${c.sets.have}/${c.sets.of}`], ['milestones', unclaimed ? `Milestones (${unclaimed} to collect)` : 'Milestones'],
  ];
  const bar = h('div', { class: 'row gap journal-views' }, views.map(([id, label]) => btn(label, () => { ws.journalView = id; ws.ui.refresh(ws); }, { class: 'jv' + (id === view ? ' primary' : '') + (id === 'milestones' && unclaimed ? ' pulse' : ''), id: 'jv-' + id })));
  const body = { relics: relicsView, parts: partsView, traits: traitsView, sets: setsView, milestones: milestonesView }[view](ws);
  return h('div', { class: 'panel scroll journal', 'data-scroll': 'journal-' + view }, bar, body);
}

function progressBar(have, need) {
  return h('div', { class: 'bar jr-bar' }, h('div', { class: 'bar-fill', style: { width: `${Math.round((Math.min(have, need) / need) * 100)}%` } }));
}

function relicsView(ws) {
  const P = ws.p;
  const out = h('div', { class: 'col gap', 'data-wrap': '' }, h('p', { class: 'small muted' }, 'Relics are handcrafted parts, one of each, with a signature power no other part has. Each has its own path; complete it and the relic arrives in your inventory.'));
  for (const s of relicStatus(P)) {
    const d = s.def;
    const sig = TRAIT_INDEX[d.signature];
    const card = h('div', { class: 'relic-card' + (s.earned ? ' earned' : ''), style: { '--relic': d.color } },
      h('div', { class: 'row gap' }, h('span', { class: 'swatch', style: { background: s.earned ? d.color : '#2a3050' } }), h('b', { class: 'relic-name' }, d.name), h('span', { class: 'small muted' }, SLOT_NAMES[d.slot]), s.earned ? h('span', { class: 'chip relic-chip' }, s.owned ? 'Earned' : 'Earned · not in inventory') : null),
      h('div', { class: 'small' }, h('b', {}, `Signature: ${sig.name}. `), sig.desc(1)),
      h('div', { class: 'small muted' }, 'Also: ' + d.traits.map(([id, m]) => `${TRAIT_INDEX[id].name} (${TRAIT_INDEX[id].desc(m)})`).join(' ')),
      h('div', { class: 'small lore' }, d.lore),
      h('div', { class: 'row gap small' }, h('b', {}, s.earned ? '✓ ' : 'How to earn: '), d.earn.text, s.earned ? null : h('span', { class: 'muted' }, ` ${Math.floor(s.have).toLocaleString()} / ${s.need.toLocaleString()}`)),
      s.earned ? null : progressBar(s.have, s.need));
    if (s.earned && !s.owned) {
      card.append(btn(h('div', { class: 'row gap' }, h('span', {}, 'Recast this relic'), costChips(P, RECAST_COST)), () => {
        const r = recastRelic(P, d.id, WS);
        if (!r.ok) { ws.ui.toast(r.reason, 'bad'); ws.app.audio.ui('error'); return; }
        ws.app.audio.ui('levelup');
        ws.ui.toast(`${d.name} recast. It is back in your inventory.`, 'good', 4000);
        ws.app.save('silent');
        ws.ui.refresh(ws);
      }, { class: 'craft-btn' + (WS.canAfford(P, RECAST_COST) ? '' : ' cant'), id: 'recast-' + d.id, desc: 'An earned relic you no longer have can be cast again.' }));
    }
    out.append(card);
  }
  return out;
}

function partsView(ws) {
  const P = ws.p;
  const out = h('div', { class: 'col' }, h('p', { class: 'small muted' }, 'Select a part to see where it turns up. Undiscovered parts still show where to look.'));
  for (const s of SLOT_ORDER) {
    const all = ALL_BASES.filter((b) => b.slot === s);
    out.append(h('div', { class: 'coll-row' }, h('b', {}, `${SLOT_NAMES[s]} ${all.filter((b) => P.discovery.parts[b.id]).length}/${all.length}`),
      h('div', { class: 'coll-items', 'data-wrap': '' }, all.map((b) => {
        const known = !!P.discovery.parts[b.id];
        const where = partSources(b.id, P);
        return h('span', { class: 'coll-item' + (known ? '' : ' unknown'), 'data-focus': '', 'data-id': 'jp-' + b.id, 'data-desc': `${known ? `${b.name}: ${b.desc}` : 'Undiscovered.'} Found: ${where.join(' · ')}.` }, known ? b.name : '???');
      }))));
  }
  return out;
}

function traitsView(ws) {
  const P = ws.p;
  const out = h('div', { class: 'col' }, h('p', { class: 'small muted' }, 'Every trait at full strength. Traits you have not found yet show their family and which parts can carry them.'));
  const fams = [...new Set(JOURNAL_TRAITS.map((t) => t.family))];
  for (const f of fams) {
    const list = JOURNAL_TRAITS.filter((t) => t.family === f);
    const found = list.filter((t) => P.discovery.traits[t.id]).length;
    out.append(h('h3', {}, `${FAMILY_NAMES[f] || f} ${found}/${list.length}`));
    for (const t of list) {
      const known = !!P.discovery.traits[t.id];
      out.append(h('div', { class: 'jr-trait' + (known ? '' : ' unknown') + (t.special ? ' special' : '') + (t.curse ? ' curse' : '') },
        h('b', {}, known ? t.name : '???'), ' ',
        h('span', { class: 'small muted' }, `${t.slots.map((x) => SLOT_NAMES[x]).join(', ')}${t.rarityMin !== 'common' ? ` · ${t.rarityMin}+` : ''}${t.special ? ' · special' : ''}`),
        known ? h('div', { class: 'small' }, t.desc(1)) : null));
    }
  }
  return out;
}

function setsView(ws) {
  const P = ws.p;
  const owned = Object.values(P.inventory);
  return h('div', { class: 'col gap' }, SETS.map((s) => {
    const n = owned.filter((i) => i.set === s.id).length;
    return h('div', { class: 'set-block', style: { borderColor: s.color } }, h('b', { style: { color: s.color } }, s.name), ` — ${s.theme} (${n} owned${P.discovery.sets[s.id] ? '' : ', undiscovered'})`,
      h('div', { class: 'small' }, Object.entries(s.bonuses).map(([k, v]) => h('div', {}, `${k} pieces: ${v.desc}`))),
      h('div', { class: 'small muted' }, 'Slots: ' + s.slots.map((x) => SLOT_NAMES[x]).join(', ')));
  }));
}

function milestonesView(ws) {
  const P = ws.p;
  const pity = pityStatus(P);
  const out = h('div', { class: 'col gap', 'data-wrap': '' },
    h('div', { class: 'note-box' }, `Bad-luck protection: an Epic or better is guaranteed within ${pity.epicIn} random drop${pity.epicIn > 1 ? 's' : ''}, a Legendary or better within ${pity.legendaryIn}.`));
  for (const s of milestoneStatus(P)) {
    const row = h('div', { class: 'jr-milestone' + (s.claimed ? ' claimed' : s.done ? ' ready' : '') },
      h('div', { class: 'row gap' }, h('b', {}, s.def.name), h('span', { class: 'small muted' }, `${s.have}/${s.need}`), h('span', { class: 'small' }, rewardText(s.def.reward))),
      s.claimed ? h('div', { class: 'small muted' }, '✓ Collected') : progressBar(s.have, s.need));
    if (s.done && !s.claimed) {
      row.append(btn('Collect reward', () => {
        const r = claimMilestone(P, s.def.id);
        if (!r.ok) { ws.ui.toast(r.reason, 'bad'); return; }
        ws.app.audio.ui('loot');
        ws.ui.toast(`Collected: ${rewardText(r.reward)}`, 'good', 3600);
        ws.app.save('silent');
        ws.ui.refresh(ws);
      }, { class: 'primary', id: 'claim-' + s.def.id }));
    }
    out.append(row);
  }
  return out;
}
