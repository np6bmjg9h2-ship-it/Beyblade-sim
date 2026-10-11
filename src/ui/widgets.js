// Shared UI widgets: on-screen keyboard (controller text entry), item cards,
// stat rows, tab bars, emblem images.

import { h, btn } from './ui.js';
import { emblemDataURL } from '../render/emblems.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { RARITY_INDEX } from '../data/rarity.js';
import { baseOf, masteryOf, itemName } from '../systems/items.js';
import { conditionOf, conditionBand } from '../systems/assembly.js';
import { SET_INDEX } from '../data/sets.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { SLOT_NAMES } from '../data/parts.js';

export function beastImg(id, size = 64, cls = '') {
  const b = BEAST_INDEX[id];
  if (!b) return h('div', { class: 'emblem-img empty ' + cls, style: { width: size + 'px', height: size + 'px' } });
  return h('img', { class: 'emblem-img ' + cls, src: emblemDataURL(b.emblem, b.colors, 128), width: size, height: size, alt: b.name });
}

// On-screen keyboard: works with d-pad/stick + A, or physical keyboard typing.
export function textEntry({ value = '', max = 16, onChange, onDone, suggestions = [] }) {
  let v = value;
  const display = h('div', { class: 'osk-display' }, v || ' ');
  const set = (nv) => { v = nv.slice(0, max); display.textContent = v || ' '; onChange?.(v); };
  const rows = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ-\'. ', '0123456789'];
  const grid = h('div', { class: 'osk-grid' });
  let lower = false;
  const keys = [];
  for (const row of rows) {
    const r = h('div', { class: 'osk-row' });
    for (const ch of row) {
      const label = ch === ' ' ? '␣' : ch;
      const k = btn(label, () => set(v + (lower ? ch.toLowerCase() : ch)), { class: 'osk-key' });
      k.dataset.ch = ch;
      keys.push(k);
      r.append(k);
    }
    grid.append(r);
  }
  const ctl = h('div', { class: 'osk-row' },
    btn('⇧ Case', () => { lower = !lower; for (const k of keys) if (/[A-Z]/i.test(k.dataset.ch)) k.textContent = lower ? k.dataset.ch.toLowerCase() : k.dataset.ch; }, { class: 'osk-key wide' }),
    btn('⌫ Delete', () => set(v.slice(0, -1)), { class: 'osk-key wide' }),
    suggestions.length ? btn('🎲 Random', () => set(suggestions[Math.floor(Math.random() * suggestions.length)]), { class: 'osk-key wide' }) : null,
    btn('✔ Done', () => onDone?.(v), { class: 'osk-key wide primary' }));
  grid.append(ctl);
  const el = h('div', { class: 'osk' }, display, grid);
  // physical keyboard typing support
  el._keyHandler = (e) => {
    if (e.key.length === 1 && /[\w '.-]/.test(e.key)) { set(v + e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { set(v.slice(0, -1)); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onDone?.(v); }
  };
  return el;
}

export function rarityChip(rarity) {
  const R = RARITY_INDEX[rarity] || RARITY_INDEX.common;
  return h('span', { class: 'chip rarity', style: { color: R.color, borderColor: R.color } }, R.name);
}

export function condChip(item) {
  const c = conditionOf(item);
  const b = conditionBand(c);
  return h('span', { class: 'chip cond cond-' + b.id }, `${b.name} ${Math.round(item.durability)}/${item.maxDurability}`);
}

export function itemCard(item, opts = {}) {
  const base = baseOf(item);
  const R = RARITY_INDEX[item.rarity] || RARITY_INDEX.common;
  const m = masteryOf(item.xp || 0);
  const traits = [...(item.traits || []), ...(item.special ? [item.special] : [])];
  const set = item.set ? SET_INDEX[item.set] : null;
  const el = h('div', { class: `item-card r-${item.rarity} ` + (opts.class || ''), style: { '--rarity': R.color } },
    h('div', { class: 'item-head' },
      h('span', { class: 'swatch', style: { background: item.visual?.color || base?.color || '#888' } }),
      h('div', { class: 'item-title' }, h('div', { class: 'item-name' }, itemName(item), item.favourite ? ' ★' : '', item.locked ? ' 🔒' : ''),
        h('div', { class: 'item-sub' }, `${SLOT_NAMES[item.slot] || item.slot} · Lv ${item.level}`)),
      rarityChip(item.rarity)),
    h('div', { class: 'item-meta' }, condChip(item), h('span', { class: 'chip' }, `${m.name} · ${Math.round(item.xp || 0)} XP`), set ? h('span', { class: 'chip', style: { color: set.color, borderColor: set.color } }, set.name) : null, item.def?.generated ? h('span', { class: 'chip proto-chip' }, 'Prototype') : null),
    opts.compact ? null : h('div', { class: 'item-traits' }, traits.length ? traits.map((t) => h('div', { class: 'trait' + (TRAIT_INDEX[t.id]?.special ? ' special' : '') }, h('b', {}, TRAIT_INDEX[t.id]?.name || t.id), ': ', TRAIT_INDEX[t.id]?.desc(t.mag) || '')) : h('div', { class: 'muted' }, 'No traits')));
  return el;
}

export function statRow(label, value, opts = {}) {
  return h('div', { class: 'stat-row' + (opts.class ? ' ' + opts.class : '') }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value), opts.hint ? h('span', { class: 'stat-hint' }, opts.hint) : null);
}

export function diffRow(label, a, b, fmt = (x) => x.toFixed(2), higherBetter = true) {
  const d = b - a;
  const good = higherBetter ? d > 1e-9 : d < -1e-9;
  const bad = higherBetter ? d < -1e-9 : d > 1e-9;
  return h('div', { class: 'stat-row diff' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, fmt(a)), h('span', { class: 'stat-arrow' }, '→'),
    h('span', { class: 'stat-value ' + (good ? 'good' : bad ? 'bad' : '') }, fmt(b)));
}

export function tabBar(tabs, active, onPick) {
  return h('div', { class: 'tabbar' }, tabs.map((t) => h('div', { class: 'tab' + (t.id === active ? ' active' : ''), onclick: () => onPick(t.id) }, t.label)));
}

export function fmtTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtRpm(w) { return `${Math.round((Math.abs(w) * 60) / (2 * Math.PI)).toLocaleString()} RPM`; }

// ------------------------------------------------------------ resources

export const RESOURCE_NAMES = { credits: 'CR', research: 'Research', scrap: 'Scrap', polymer: 'Polymer', alloy: 'Alloy', coreShard: 'Core shard', spiritDust: 'Spirit dust', relicFragment: 'Relic frag.' };
const haveOf = (profile, k) => (k === 'credits' ? profile.currency.credits : k === 'research' ? profile.currency.research : profile.materials[k] || 0);

// Compact wallet for screen headers: CR first, then the chosen resources.
export function resourceBar(profile, keys = ['credits', 'research', 'scrap', 'polymer', 'alloy', 'coreShard', 'spiritDust', 'relicFragment']) {
  return h('div', { class: 'res-bar' }, keys.map((k) => h('span', { class: 'res res-' + k, title: RESOURCE_NAMES[k] },
    h('i', {}, RESOURCE_NAMES[k]), h('b', {}, haveOf(profile, k).toLocaleString()))));
}

// A cost as chips, each green when you have enough and red when not.
export function costChips(profile, cost) {
  const parts = Object.entries(cost).filter(([, v]) => v > 0);
  if (!parts.length) return h('span', { class: 'cost-chip ok' }, 'Free');
  return h('span', { class: 'cost-chips' }, parts.map(([k, v]) => h('span', { class: 'cost-chip ' + (haveOf(profile, k) >= v ? 'ok' : 'short') }, `${v.toLocaleString()} ${RESOURCE_NAMES[k] || k}`)));
}
