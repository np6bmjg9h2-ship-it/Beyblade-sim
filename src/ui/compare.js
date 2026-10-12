// Comparison panel for a part or launch-gear swap (see systems/compare.js):
// a verdict, then how the finished top changes, then the part's own numbers,
// traits and set bonuses gained or lost, and whether the swap is legal.

import { h } from './ui.js';
import { ROLES } from '../systems/compare.js';
import { itemName } from '../systems/items.js';

const ARROW = { 1: '▲', '-1': '▼' };

function roleTags(r) {
  if (!r.roles || r.tone === 'same' || r.tone === 'info') return null;
  const d = Math.sign(r.b - r.a);
  return h('span', { class: 'cmp-tags' }, Object.entries(r.roles).map(([role, sign]) => {
    const s = Math.sign(sign * d);
    return h('span', { class: 'cmp-tag ' + (s > 0 ? 'good' : 'bad') }, `${ROLES[role]} ${ARROW[s]}`);
  }));
}

function row(r) {
  return h('div', { class: 'cmp-row t-' + r.tone, title: r.hint || '' },
    h('span', { class: 'cmp-label' }, r.label),
    h('span', { class: 'cmp-vals' }, h('span', { class: 'cmp-a' }, r.text[0]), h('span', { class: 'cmp-arrow' }, '→'), h('b', { class: 'cmp-b' }, r.text[1]), r.unit ? h('span', { class: 'cmp-unit' }, r.unit) : null),
    h('span', { class: 'cmp-delta' }, r.delta),
    roleTags(r));
}

function section(title, rows) {
  const changed = rows.filter((r) => r.tone !== 'same');
  const same = rows.filter((r) => r.tone === 'same');
  if (!rows.length) return null;
  return h('div', { class: 'cmp-sec' }, h('div', { class: 'cmp-sec-title' }, title),
    changed.length ? changed.map(row) : h('div', { class: 'small muted' }, 'No measurable change.'),
    same.length && changed.length ? h('div', { class: 'cmp-same small muted' }, 'Unchanged: ' + same.map((r) => r.label).join(', ')) : null);
}

export function verdictChips(cmp) {
  if (cmp.same) return h('div', { class: 'cmp-verdict' }, h('span', { class: 'vd same' }, 'Equipped'));
  const v = cmp.verdict;
  const chips = [...v.better.map((x) => h('span', { class: 'vd good' }, '▲ ' + x)), ...v.worse.map((x) => h('span', { class: 'vd bad' }, '▼ ' + x))];
  return h('div', { class: 'cmp-verdict' }, chips.length ? chips : h('span', { class: 'vd same' }, 'About the same'));
}

export function compareBlock(cmp, { title = null, loadoutName = null } = {}) {
  const where = loadoutName ? ` in ${loadoutName}` : '';
  const head = cmp.same ? `Equipped${where}.` : cmp.current ? `Instead of your ${itemName(cmp.current)}${where}` : `Your slot is empty${where}`;
  const el = h('div', { class: 'cmp' },
    h('div', { class: 'cmp-head' }, h('b', {}, title || head), verdictChips(cmp)));
  if (cmp.same) return el;
  el.append(section('Your finished top', cmp.top));
  el.append(section(cmp.slot === 'launcher' || cmp.slot === 'cable' ? 'Launch' : 'Launch (from the new inertia)', cmp.gear));
  el.append(section('This part', cmp.part));
  const t = cmp.traits;
  if (t.gained.length || t.lost.length || t.changed.length) {
    el.append(h('div', { class: 'cmp-sec' }, h('div', { class: 'cmp-sec-title' }, 'Traits'),
      t.gained.map((x) => h('div', { class: 'cmp-trait gain' + (x.special ? ' special' : '') }, h('b', {}, '+ ' + x.name), ': ', x.desc)),
      t.changed.map((x) => h('div', { class: 'cmp-trait ' + (x.mag > x.from ? 'gain' : 'loss') }, h('b', {}, '~ ' + x.name), ` ${Math.round(x.from * 100)}% → ${Math.round(x.mag * 100)}% strength: `, x.desc)),
      t.lost.map((x) => h('div', { class: 'cmp-trait loss' + (x.special ? ' special' : '') }, h('b', {}, '− ' + x.name), ': ', x.desc))));
  }
  const s = cmp.sets;
  if (s.gained.length || s.lost.length) {
    el.append(h('div', { class: 'cmp-sec' }, h('div', { class: 'cmp-sec-title' }, 'Set bonuses'),
      s.gained.map((x) => h('div', { class: 'cmp-trait gain' }, h('b', { style: { color: x.color } }, `+ ${x.name} (${x.tier})`), ': ', x.desc)),
      s.lost.map((x) => h('div', { class: 'cmp-trait loss' }, h('b', { style: { color: x.color } }, `− ${x.name} (${x.tier})`), ': ', x.desc))));
  }
  const v = cmp.valid;
  if (v && !v.ok) el.append(h('div', { class: 'warn-box' }, 'Not legal in this loadout: ' + v.errors.join(' ')));
  else if (v?.warnings?.length) el.append(h('div', { class: 'note-box' }, v.warnings.join(' ')));
  return el;
}

// Compact form for loot cards: the verdict and the biggest changes to the top.
export function compareMini(cmp, n = 4) {
  if (cmp.same) return h('div', { class: 'cmp-mini' }, verdictChips(cmp));
  const rows = (cmp.top.length ? cmp.top : cmp.gear).filter((r) => r.tone !== 'same').sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel)).slice(0, n);
  return h('div', { class: 'cmp-mini' }, verdictChips(cmp),
    rows.map((r) => h('div', { class: 'cmp-row t-' + r.tone }, h('span', { class: 'cmp-label' }, r.label), h('span', { class: 'cmp-vals' }, h('span', { class: 'cmp-a' }, r.text[0]), h('span', { class: 'cmp-arrow' }, '→'), h('b', { class: 'cmp-b' }, r.text[1]), r.unit ? h('span', { class: 'cmp-unit' }, r.unit) : null))));
}
