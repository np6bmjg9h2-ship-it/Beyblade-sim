// Synergy and build-breakdown panels for the Workshop: what is active in a
// loadout and which items feed it, what is one requirement away, every
// effect source the loadout brings into battle, and the synergy journal.

import { h } from './ui.js';
import { SYNERGIES } from '../data/synergies.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { activeSetBonuses } from '../data/sets.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { computeSkillEffects } from '../data/skills.js';
import { loadoutItems } from '../systems/loadout.js';
import { synergyContext, evaluateSynergies, synergyEffectText, checkRequirement } from '../systems/synergy.js';
import { itemName } from '../systems/items.js';
import { deltasText, condText } from '../systems/effectSpec.js';
import { SLOT_NAMES } from '../data/parts.js';

export function loadoutSynergies(profile, L) {
  const { parts, launcher, cable } = loadoutItems(profile, L);
  const beast = L.beast ? { id: L.beast } : null;
  const ctx = synergyContext({ parts, launcher, cable, beast, spin: L.spin });
  return { ctx, ...evaluateSynergies(ctx, profile.discovery?.synergies || {}) };
}

const names = (items) => items.map((it) => itemName(it)).join(', ');

function activeRow(a, discovered) {
  const fresh = !discovered[a.rule.id];
  return h('div', { class: 'syn-row active' + (fresh && a.rule.hidden ? ' undiscovered' : '') },
    h('div', { class: 'syn-name' }, '◆ ', fresh && a.rule.hidden ? '??? (battle to discover)' : a.rule.name),
    h('div', { class: 'small' }, synergyEffectText(a.rule)),
    h('div', { class: 'syn-edges small muted' }, a.checks.map((c) => h('div', {}, `✓ ${c.text}${c.items.length ? ` — ${names(c.items)}` : ''}`))));
}

function nearRow(n) {
  return h('div', { class: 'syn-row near' },
    h('div', { class: 'syn-name' }, '◇ ', n.hidden ? '???' : n.rule.name),
    h('div', { class: 'small muted' }, n.hidden ? n.rule.hint : synergyEffectText(n.rule)),
    h('div', { class: 'syn-edges small' }, n.missing.map((c) => h('div', { class: 'bad' }, `✗ needs ${c.text}${c.need > 1 ? ` (${c.have}/${c.need})` : ''}`))));
}

// Compact block for the Loadouts summary.
export function synergySummary(profile, L) {
  const R = loadoutSynergies(profile, L);
  const disc = profile.discovery?.synergies || {};
  const out = h('div', { class: 'col' }, h('h3', {}, 'Synergies'));
  if (R.active.length) out.append(...R.active.map((a) => activeRow(a, disc)));
  else out.append(h('div', { class: 'small muted' }, 'None active. Traits, set pieces, mastery and curses can combine into synergies.'));
  const near = R.near.slice(0, 3);
  if (near.length) out.append(h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'One step away:'), ...near.map(nearRow));
  return out;
}

// Every effect the loadout brings into battle, grouped by where it comes from.
export function buildBreakdown(profile, L) {
  const { parts, launcher, cable } = loadoutItems(profile, L);
  const R = loadoutSynergies(profile, L);
  const out = h('div', { class: 'col' }, h('h3', {}, 'Build breakdown'));
  const group = (title, rows) => { if (rows.length) out.append(h('div', { class: 'bd-group' }, h('div', { class: 'cmp-sec-title' }, title), ...rows)); };
  const traitRows = (pred) => {
    const rows = [];
    for (const [slot, it] of [...Object.entries(parts), ['launcher', launcher], ['cable', cable]]) {
      if (!it) continue;
      for (const t of [...(it.traits || []), ...(it.special ? [it.special] : [])]) {
        const d = TRAIT_INDEX[t.id];
        if (!d || !pred(d)) continue;
        rows.push(h('div', { class: 'small bd-row' + (d.curse ? ' curse' : '') }, h('b', {}, d.name), h('span', { class: 'muted' }, ` · ${SLOT_NAMES[slot] || slot}`), ': ', d.desc(t.mag, it)));
      }
    }
    return rows;
  };
  group('Changes the parts themselves', traitRows((d) => d.kind === 'physical'));
  group('In battle, while conditions hold', traitRows((d) => d.kind === 'conditional' && !d.curse));
  group('Triggered by battle events', traitRows((d) => d.kind === 'reactive'));
  group('Hit statuses', traitRows((d) => d.kind === 'status'));
  group('Launch', traitRows((d) => d.kind === 'launch'));
  group('Durability', traitRows((d) => d.kind === 'item'));
  group('Curses', traitRows((d) => d.curse));
  const items = [...Object.values(parts), launcher, cable].filter(Boolean);
  group('Set bonuses', activeSetBonuses(items).active.map((a) => h('div', { class: 'small bd-row' }, h('b', { style: { color: a.set.color } }, `${a.set.name} (${a.tier})`), ': ', a.bonus.desc)));
  group('Synergies', R.active.map((a) => h('div', { class: 'small bd-row' }, h('b', {}, a.rule.name), ': ', synergyEffectText(a.rule))));
  const sk = computeSkillEffects(profile.player.skills);
  group('Skills', sk.sources.map((s) => h('div', { class: 'small bd-row' }, h('b', {}, s.name), ': ', (condText(s.cond) ? condText(s.cond) + ': ' : '') + deltasText(s.deltas.map(([c, v]) => [c, c === 'faceAngle' ? v * 180 / Math.PI : v]), 1))));
  const b = L.beast ? BEAST_INDEX[L.beast] : null;
  if (b) group('Bit-Beast', [h('div', { class: 'small bd-row' }, h('b', {}, b.passive.name), ': ', b.passive.desc)]);
  if (out.childElementCount === 1) out.append(h('div', { class: 'small muted' }, 'This loadout brings no extra effects: bare parts fight on their physics alone.'));
  return out;
}

// All synergies: discovered ones in full, hidden ones as hints.
export function synergyJournal(profile, L = null) {
  const disc = profile.discovery?.synergies || {};
  const ctx = L ? loadoutSynergies(profile, L).ctx : synergyContext({ parts: {} });
  const found = SYNERGIES.filter((s) => disc[s.id]).length;
  const out = h('div', { class: 'col' }, h('h3', {}, `Synergy journal ${found}/${SYNERGIES.length}`));
  for (const s of SYNERGIES) {
    const known = !!disc[s.id];
    if (s.hidden && !known) { out.append(h('div', { class: 'syn-row hidden' }, h('div', { class: 'syn-name' }, '??? '), h('div', { class: 'small muted' }, s.hint))); continue; }
    out.append(h('div', { class: 'syn-row' + (known ? ' known' : '') },
      h('div', { class: 'syn-name' }, known ? '★ ' : '', s.name),
      h('div', { class: 'small' }, synergyEffectText(s)),
      h('div', { class: 'small muted' }, 'Needs: ' + s.requires.map((q) => checkRequirement(q, ctx).text).join(' + ')),
      s.lore ? h('div', { class: 'small lore' }, s.lore) : null));
  }
  return out;
}
