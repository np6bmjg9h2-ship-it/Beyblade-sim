// Workshop: loadout assembly, inventory, repair, upgrades, crafting and the
// collection log. Fully controller-navigable: LB/RB switch tabs, X marks
// favourites, Y compares/locks, A selects, B backs out.

import { h, btn, selector, toggle } from '../ui.js';
import { itemCard, rarityChip, condChip, beastImg, statRow, textEntry, resourceBar, costChips, RESOURCE_NAMES } from '../widgets.js';
import { SLOTS, SLOT_NAMES, PARTS } from '../../data/parts.js';
import { LAUNCHERS, CABLES, TECHNIQUE_INDEX } from '../../data/launchers.js';
import { RARITIES, RARITY_INDEX, rarityRank } from '../../data/rarity.js';
import { SETS, SET_INDEX, activeSetBonuses } from '../../data/sets.js';
import { TRAIT_INDEX, TRAITS } from '../../data/traits.js';
import { BEASTS, BEAST_INDEX, bondLevel } from '../../data/beasts.js';
import { upgradesForSlot, UPGRADE_INDEX } from '../../data/upgrades.js';
import { tuningsForSlot, TUNING_INDEX } from '../../data/tuning.js';
import { baseOf, itemName, masteryOf, tuningSlots, createItem } from '../../systems/items.js';
import { assembleTop, validateBuild, conditionOf } from '../../systems/assembly.js';
import { validateLoadout, loadoutSummary, loadoutItems } from '../../systems/loadout.js';
import { resolveLaunchGear } from '../../game/launch.js';
import * as WS from '../../systems/workshop.js';
import { rollLoot } from '../../systems/loot.js';
import { InspectScreen } from './inspect.js';
import { compareSwap, verdictLine } from '../../systems/compare.js';
import { compareBlock } from '../compare.js';
import { synergySummary, buildBreakdown, synergyJournal } from '../synergyPanel.js';

const TABS = [
  { id: 'loadouts', label: 'Loadouts' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'repair', label: 'Repair' },
  { id: 'upgrade', label: 'Upgrade' },
  { id: 'craft', label: 'Craft' },
  { id: 'collection', label: 'Collection' },
  { id: 'synergies', label: 'Synergies' },
];
const ALL_SLOTS = [...SLOTS, 'launcher', 'cable'];
const ROLES = ['Attack', 'Defense', 'Stamina', 'Balance', 'Burst', 'Counter', 'Experimental'];

export class WorkshopScreen {
  static screenName = 'WorkshopScreen';
  constructor(opts = {}) {
    this.tab = opts.tab || 'loadouts';
    this.loadoutIndex = null;
    this.filter = { slot: 'all', rarity: 'common', set: 'all', sort: 'rarity', favOnly: false, compatible: false };
    this.selected = null; // focused item uid
    this.upgradeUid = null;
  }

  get p() { return this.app.profile; }

  render() {
    if (this.loadoutIndex == null) this.loadoutIndex = this.p.activeLoadout || 0;
    const body = {
      loadouts: () => this.renderLoadouts(),
      inventory: () => this.renderInventory(),
      repair: () => this.renderRepair(),
      upgrade: () => this.renderUpgrade(),
      craft: () => this.renderCraft(),
      collection: () => this.renderCollection(),
      synergies: () => this.renderSynergies(),
    }[this.tab]();
    const P = this.p;
    const mats = resourceBar(P);
    return h('div', { class: 'std-screen workshop' },
      h('div', { class: 'screen-head' }, h('h1', {}, 'Workshop'),
        h('div', { class: 'tabbar' }, h('kbd', {}, this.app.input.glyph('tab_prev')), TABS.map((t) => h('div', { class: 'tab' + (t.id === this.tab ? ' active' : ''), onclick: () => this.setTab(t.id) }, t.label)), h('kbd', {}, this.app.input.glyph('tab_next'))),
        mats),
      body);
  }

  setTab(t) { this.tab = t; this.ui.refresh(this); }
  onTab(d) { const i = TABS.findIndex((t) => t.id === this.tab); this.setTab(TABS[(i + d + TABS.length) % TABS.length].id); return true; }
  onBack() { this.app.save('silent'); this.ui.pop(); return true; }

  prompts() {
    const base = [['confirm', 'Select'], ['tab_prev', 'Tabs'], ['back', 'Back']];
    if (this.tab === 'inventory') return [['confirm', 'Actions'], ['alt', 'Favourite'], ['alt2', 'Lock'], ['tab_prev', 'Tabs'], ['back', 'Back']];
    return base;
  }

  // ================================================================ loadouts

  renderLoadouts() {
    const P = this.p;
    const L = P.loadouts[this.loadoutIndex];
    const list = h('div', { class: 'col gap loadout-list', 'data-wrap': '' });
    P.loadouts.forEach((x, i) => {
      const v = validateLoadout(P, x);
      const b = btn(h('div', {}, h('b', {}, x.name), h('div', { class: 'small muted' }, `${x.role || ''}${i === P.activeLoadout ? ' · ACTIVE' : ''}${v.ok ? '' : ' · ⚠ invalid'}`)), () => { this.loadoutIndex = i; this.ui.refresh(this); }, { class: 'loadout-btn' + (i === this.loadoutIndex ? ' sel' : '') });
      b.dataset.id = 'lo-' + i;
      list.append(b);
    });
    if (P.loadouts.length < 8) list.append(btn('+ New loadout (copy)', () => this.newLoadout(), { desc: 'Duplicate the selected loadout into a new slot (up to 8).' }));
    if (!L) return h('div', { class: 'ws-cols' }, h('div', { class: 'panel' }, list));
    const { parts, launcher, cable } = loadoutItems(P, L);
    const slotRow = (slot, item, label) => {
      const b = btn(h('div', { class: 'slot-row' }, h('span', { class: 'slot-name' }, label || SLOT_NAMES[slot]),
        item ? h('span', { class: 'slot-item' }, h('span', { class: 'swatch', style: { background: item.visual?.color || baseOf(item)?.color } }), itemName(item), ' ', rarityChip(item.rarity), ' ', condChip(item)) : h('span', { class: 'muted' }, slot === 'aux' ? '— none (optional) —' : '— empty —')),
      () => this.ui.push(new ItemPicker(this, slot)), { class: 'slot-btn' });
      b.dataset.id = 'slot-' + slot;
      b.dataset.desc = item ? baseOf(item).desc : `Choose a ${SLOT_NAMES[slot]}.`;
      return b;
    };
    const beast = L.beast ? BEAST_INDEX[L.beast] : null;
    const owned = Object.keys(P.beasts);
    const rows = h('div', { class: 'col gap', 'data-wrap': '', 'data-scroll': 'slots' },
      ...SLOTS.map((s) => slotRow(s, parts[s])),
      slotRow('launcher', launcher), slotRow('cable', cable),
      selector('Bit-Beast', [{ value: null, label: 'None' }, ...owned.map((id) => ({ value: id, label: `${BEAST_INDEX[id].name} (Bond ${bondLevel(P.beasts[id].bondXp)})`, desc: BEAST_INDEX[id].lore }))], L.beast, (v) => { L.beast = v; this.ui.refresh(this); }, { id: 'beast' }),
      selector('Spin direction', [{ value: 'R', label: 'Right ⟳' }, { value: 'L', label: 'Left ⟲' }], L.spin, (v) => { L.spin = v; this.ui.refresh(this); }, { id: 'spin', desc: 'Must be supported by the launcher. Rings designed for one direction lose their blade faces in the other.' }),
      selector('Default technique', P.techniques.map((t) => ({ value: t, label: TECHNIQUE_INDEX[t].name, desc: TECHNIQUE_INDEX[t].desc })), L.technique, (v) => { L.technique = v; }, { id: 'tech' }),
      selector('Intended role', ROLES.map((r) => ({ value: r, label: r })), L.role || 'Balance', (v) => { L.role = v; }, { id: 'role' }),
      h('div', { class: 'row gap' },
        btn('Inspect 3D', () => this.inspectLoadout(L), { id: 'inspect3d', disabled: !loadoutSummary(P, L).assembly, desc: 'Turn the assembled top around in 3D, explode it into its parts and look at each one.' }),
        btn('Rename', () => this.renameLoadout(), { desc: 'Give this loadout a custom name.' }),
        btn(this.loadoutIndex === P.activeLoadout ? 'Active ✓' : 'Set active', () => { P.activeLoadout = this.loadoutIndex; this.ui.refresh(this); this.ui.toast(`${L.name} is now your active loadout.`, 'good'); }, { class: 'primary', desc: 'The active loadout is used in Quick Battle, tournaments and story battles.' }),
        P.loadouts.length > 1 ? btn('Delete', () => this.deleteLoadout(), { class: 'danger' }) : null));
    return h('div', { class: 'ws-cols three' },
      h('div', { class: 'panel' }, h('h3', {}, 'Loadouts'), list),
      h('div', { class: 'panel' }, h('h3', {}, L.name), rows),
      h('div', { class: 'panel scroll', 'data-scroll': 'summary' }, this.summaryPanel(L)));
  }

  summaryPanel(L) {
    const P = this.p;
    const S = loadoutSummary(P, L);
    const out = h('div', { class: 'col' });
    const v = S.validation;
    if (!v.ok) out.append(h('div', { class: 'warn-box' }, h('b', {}, 'Cannot battle: '), v.errors.join(' ')));
    if (v.warnings.length) out.append(h('div', { class: 'note-box' }, v.warnings.join(' ')));
    if (S.assembly) {
      const s = S.assembly.summary;
      const gear = v.launcher ? resolveLaunchGear(v.launcher, v.cable) : null;
      const w0 = gear ? Math.sqrt((2 * gear.energyMax * 0.95) / S.assembly.spec.I3) : s.refLaunchSpin;
      out.append(h('h3', {}, 'Physical profile'),
        statRow('Mass', `${s.massG.toFixed(1)} g`), statRow('Spin inertia I₃', `${s.I3gcm2.toFixed(1)} g·cm²`, { hint: 'resists spin loss; heavier = slower launch' }),
        statRow('Tilt inertia I₁', `${(s.I1 * 1e7).toFixed(1)} g·cm²`), statRow('Centre of mass', `${s.comMm.toFixed(1)} mm above tip`, { hint: 'lower = steadier' }),
        statRow('Balance offset', `${s.eccMm.toFixed(3)} mm`, { hint: s.eccMm > 0.15 ? 'erratic walking path' : 'balanced' }),
        statRow('Reach', `${s.reachMm.toFixed(1)} mm`), statRow('Blade face', `${s.faceDeg.toFixed(1)}° × ${s.blades} blades`), statRow('Contact slope', `${s.slopeDeg.toFixed(0)}°`),
        statRow('Restitution / friction', `${s.restitution.toFixed(2)} / ${s.contactFriction.toFixed(2)}`), statRow('Tip', `μ ${s.tipMu.toFixed(2)} · flat ${s.tipFlatMm.toFixed(1)} mm · ball ${s.tipBallMm.toFixed(1)} mm`),
        statRow('Lock', `${s.lockNotches} notches × ${(s.lockThreshold * 1e4).toFixed(2)}`, { hint: `reseat ${s.lockRecovery.toFixed(2)}/s` }),
        statRow('Stability threshold', `${s.critSpin.toFixed(0)} rad/s`, { hint: 'below this spin the top starts to fall' }),
        statRow('Launch spin (full charge)', `${w0.toFixed(0)} rad/s · ${Math.round(w0 * 9.549)} RPM`),
        statRow('Est. free spin time', `${s.estSpinTime.toFixed(0)} s`, { hint: 'upright, no contacts, flat floor' }));
      if (gear) out.append(h('h3', {}, 'Launch gear'), statRow('Max launch energy', `${gear.energyMax.toFixed(2)} J`), statRow('Perfect window', `±${(gear.window * 100).toFixed(1)}% charge`), statRow('Angle error (1σ)', `${(gear.sigma * 57.3).toFixed(1)}°`), statRow('Charge time', `${(1 / gear.chargeRate).toFixed(2)} s`), statRow('Spin mechanism', gear.spinMech === 'dual' ? 'Both directions' : gear.spinMech === 'R' ? 'Right only' : 'Left only'));
    }
    const sets = S.sets.active;
    out.append(h('h3', {}, 'Set bonuses'), sets.length ? h('div', { class: 'col' }, sets.map((a) => h('div', { class: 'small' }, h('b', { style: { color: a.set.color } }, `${a.set.name} (${a.tier})`), ' ', a.bonus.desc))) : h('div', { class: 'small muted' }, 'None active. Equip 2+ pieces of a set.'));
    out.append(synergySummary(P, L));
    const items = Object.values(v.parts).filter(Boolean).concat([v.launcher, v.cable].filter(Boolean));
    const traits = [];
    for (const it of items) for (const t of [...it.traits, ...(it.special ? [it.special] : [])]) traits.push([it, t]);
    out.append(h('h3', {}, 'Traits in play'), traits.length ? h('div', { class: 'col' }, traits.map(([it, t]) => h('div', { class: 'small' }, h('b', {}, TRAIT_INDEX[t.id].name), ` (${itemName(it)}): `, TRAIT_INDEX[t.id].desc(t.mag, it)))) : h('div', { class: 'small muted' }, 'No traits.'));
    if (S.beast) {
      const coreAff = S.validation.parts.core ? baseOf(S.validation.parts.core)?.affinity : null;
      const res = S.beast.resonance;
      const setRes = res.set && items.some((it) => it.set === res.set);
      const affRes = coreAff && res.affinity.includes(coreAff);
      out.append(h('h3', {}, 'Bit-Beast'), h('div', { class: 'row gap' }, beastImg(S.beast.id, 48), h('div', { class: 'small' }, h('b', {}, `${S.beast.name}, ${S.beast.title}`), h('div', {}, `Passive — ${S.beast.passive.name}: ${S.beast.passive.desc}`),
        h('div', { class: setRes || affRes ? 'good' : 'muted' }, setRes || affRes ? `Resonating: ${res.desc}` : `No resonance. ${res.desc}`))));
    }
    return out;
  }

  newLoadout() {
    const P = this.p;
    const src = P.loadouts[this.loadoutIndex];
    const copy = structuredClone(src);
    copy.id = 'L' + Date.now().toString(36);
    copy.name = src.name + ' II';
    P.loadouts.push(copy);
    this.loadoutIndex = P.loadouts.length - 1;
    this.ui.refresh(this);
  }

  async deleteLoadout() {
    const P = this.p;
    const L = P.loadouts[this.loadoutIndex];
    if (!(await this.ui.confirm('Delete loadout?', `"${L.name}" will be removed. Items stay in your inventory.`, { danger: true, yes: 'Delete' }))) return;
    P.loadouts.splice(this.loadoutIndex, 1);
    P.activeLoadout = Math.min(P.activeLoadout, P.loadouts.length - 1);
    this.loadoutIndex = Math.min(this.loadoutIndex, P.loadouts.length - 1);
    this.ui.refresh(this);
  }

  renameLoadout() {
    const L = this.p.loadouts[this.loadoutIndex];
    this.ui.push(new TextPrompt('Rename loadout', L.name, 22, (v) => { if (v) L.name = v; this.ui.refresh(this); }));
  }

  // ================================================================ inventory

  inventoryItems() {
    const P = this.p;
    const f = this.filter;
    let items = Object.values(P.inventory);
    if (f.slot !== 'all') items = items.filter((i) => i.slot === f.slot);
    items = items.filter((i) => rarityRank(i.rarity) >= rarityRank(f.rarity));
    if (f.set !== 'all') items = items.filter((i) => (f.set === 'none' ? !i.set : i.set === f.set));
    if (f.favOnly) items = items.filter((i) => i.favourite);
    if (f.trait && f.trait !== 'all') items = items.filter((i) => [...i.traits, ...(i.special ? [i.special] : [])].some((t) => t.id === f.trait));
    if (f.compatible) {
      const L = P.loadouts[P.activeLoadout];
      items = items.filter((i) => {
        if (i.slot === 'launcher' || i.slot === 'cable') return true;
        const { parts } = loadoutItems(P, L);
        return validateBuild({ ...parts, [i.slot]: i }, { spin: L.spin }).ok;
      });
    }
    const sorters = {
      rarity: (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level,
      level: (a, b) => b.level - a.level,
      xp: (a, b) => (b.xp || 0) - (a.xp || 0),
      durability: (a, b) => conditionOf(a) - conditionOf(b),
      newest: (a, b) => (b.history?.acquiredAt || 0) - (a.history?.acquiredAt || 0),
      name: (a, b) => itemName(a).localeCompare(itemName(b)),
      slot: (a, b) => ALL_SLOTS.indexOf(a.slot) - ALL_SLOTS.indexOf(b.slot) || rarityRank(b.rarity) - rarityRank(a.rarity),
    };
    return items.sort(sorters[f.sort] || sorters.rarity);
  }

  renderInventory() {
    const P = this.p;
    const f = this.filter;
    const items = this.inventoryItems();
    const discoveredTraits = TRAITS.filter((t) => P.discovery.traits[t.id]);
    const filters = h('div', { class: 'col gap filters' },
      selector('Slot', [{ value: 'all', label: 'All' }, ...ALL_SLOTS.map((s) => ({ value: s, label: SLOT_NAMES[s] }))], f.slot, (v) => { f.slot = v; this.ui.refresh(this); }, { id: 'f-slot' }),
      selector('Min rarity', RARITIES.map((r) => ({ value: r.id, label: r.name })), f.rarity, (v) => { f.rarity = v; this.ui.refresh(this); }, { id: 'f-rar' }),
      selector('Set', [{ value: 'all', label: 'Any' }, { value: 'none', label: 'No set' }, ...SETS.map((s) => ({ value: s.id, label: s.name }))], f.set, (v) => { f.set = v; this.ui.refresh(this); }, { id: 'f-set' }),
      selector('Trait', [{ value: 'all', label: 'Any' }, ...discoveredTraits.map((t) => ({ value: t.id, label: t.name }))], f.trait || 'all', (v) => { f.trait = v; this.ui.refresh(this); }, { id: 'f-trait' }),
      selector('Sort by', [{ value: 'rarity', label: 'Rarity' }, { value: 'level', label: 'Item level' }, { value: 'xp', label: 'XP' }, { value: 'durability', label: 'Condition (worst first)' }, { value: 'newest', label: 'Newest' }, { value: 'slot', label: 'Slot' }, { value: 'name', label: 'Name' }], f.sort, (v) => { f.sort = v; this.ui.refresh(this); }, { id: 'f-sort' }),
      toggle('Favourites only', f.favOnly, (v) => { f.favOnly = v; this.ui.refresh(this); }, { id: 'f-fav' }),
      toggle('Fits active loadout', f.compatible, (v) => { f.compatible = v; this.ui.refresh(this); }, { id: 'f-comp' }),
      btn('Bulk dismantle…', () => this.bulkDismantle(), { desc: 'Dismantle all unlocked, unequipped, non-favourite Common/Uncommon items below Skilled mastery.' }),
      btn('Undo last action', () => this.undo(), { disabled: !(P.undo || []).length, desc: (P.undo || []).length ? `Undo: ${P.undo[P.undo.length - 1].label}` : 'Nothing to undo.' }));
    const list = h('div', { class: 'item-list', 'data-wrap': '', 'data-scroll': 'inv' });
    for (const it of items) {
      const row = h('div', { class: 'item-row', 'data-focus': '', 'data-id': it.uid, style: { '--rarity': RARITY_INDEX[it.rarity].color } },
        h('span', { class: 'swatch', style: { background: it.visual?.color || baseOf(it)?.color } }),
        h('span', { class: 'ir-name' }, itemName(it), it.favourite ? ' ★' : '', it.locked ? ' 🔒' : '', WS.isEquipped(P, it.uid) ? ' ⚙' : ''),
        h('span', { class: 'ir-slot' }, SLOT_NAMES[it.slot]), rarityChip(it.rarity), h('span', { class: 'ir-lv' }, 'Lv ' + it.level), condChip(it));
      row.addEventListener('click', () => this.itemActions(it));
      list.append(row);
    }
    if (!items.length) list.append(h('div', { class: 'muted' }, 'No items match these filters.'));
    const sel = this.selected && P.inventory[this.selected] ? P.inventory[this.selected] : items[0];
    this.detail = h('div', { class: 'panel scroll item-detail', 'data-scroll': 'detail' }, sel ? this.itemDetail(sel) : null);
    return h('div', { class: 'ws-cols three inv' }, h('div', { class: 'panel scroll' }, h('h3', {}, 'Filters'), filters), h('div', { class: 'panel' }, h('h3', {}, `Items (${items.length}/${Object.keys(P.inventory).length})`), list), this.detail);
  }

  onFocus(el) {
    if (this.tab !== 'inventory' && this.tab !== 'upgrade') return;
    const uid = el?.dataset?.id;
    if (uid && this.p.inventory[uid] && this.detail) {
      this.selected = uid;
      this.detail.innerHTML = '';
      this.detail.append(this.itemDetail(this.p.inventory[uid]));
    }
  }

  // opts.loadout: loadout index to compare against (default: active);
  // opts.compare === false leaves the comparison out
  itemDetail(it, opts = {}) {
    const P = this.p;
    const base = baseOf(it);
    const m = masteryOf(it.xp || 0);
    const H = it.history || {};
    const out = h('div', { class: 'col' });
    const L = P.loadouts[opts.loadout ?? P.activeLoadout];
    if (opts.compare !== false && L && [...SLOTS, 'launcher', 'cable'].includes(it.slot)) {
      try { out.append(compareBlock(compareSwap(P, L, it.slot, it), { loadoutName: L.name })); } catch { /* incomplete loadout */ }
    }
    out.append(itemCard(it));
    out.append(h('div', { class: 'small muted', style: { margin: '6px 0' } }, base.desc));
    out.append(h('h3', {}, 'Mastery'), h('div', { class: 'small' }, `${m.name} — ${Math.round(it.xp || 0)} XP${m.next ? ` (next: ${m.next.name} at ${m.next.xp})` : ' (max)'} · tuning slots ${it.tuning.length}/${tuningSlots(it.xp || 0)}`));
    if (it.tuning.length) out.append(h('div', { class: 'small' }, 'Tuning: ' + it.tuning.map((t) => TUNING_INDEX[t]?.name).join(', ')));
    if (it.upgrades.length) out.append(h('div', { class: 'small' }, 'Upgrades: ' + it.upgrades.map((u) => UPGRADE_INDEX[u]?.name).join(', ')));
    if (it.slot === 'launcher' && it.parts) out.append(h('div', { class: 'small' }, `Components — drive ${it.parts.drive.toFixed(0)}% · trigger ${it.parts.trigger.toFixed(0)}% · grip ${it.parts.grip.toFixed(0)}%`));
    out.append(h('h3', {}, 'History'), h('div', { class: 'small' }, `Battles ${H.battles || 0} · wins ${H.wins || 0} · knockouts ${H.knockouts || 0} · shatters ${H.bursts || 0} · shatters survived ${H.burstsSurvived || 0}`),
      h('div', { class: 'small' }, `Highest impact ${(H.highestImpact || 0).toFixed(3)} N·s · longest spin ${(H.longestSpin || 0).toFixed(1)} s · tournament wins ${H.tournamentWins || 0}`),
      h('div', { class: 'small muted' }, `Acquired: ${H.acquired || '?'}${it.gen ? ` (seed ${it.seed})` : ''} · repairs ${it.repairs || 0}${it.fatigue ? ` · fatigue ${(it.fatigue * 100).toFixed(0)}%` : ''}`));
    for (const mo of H.moments || []) out.append(h('div', { class: 'small gold' }, '★ ' + mo));
    return out;
  }

  onAlt(focused) {
    if (this.tab !== 'inventory') return;
    const uid = focused?.dataset?.id;
    if (!this.p.inventory[uid]) return;
    const r = WS.toggleFlag(this.p, uid, 'favourite');
    this.ui.toast(r.value ? 'Marked as favourite ★' : 'Removed from favourites');
    this.ui.refresh(this);
  }

  onAlt2(focused) {
    if (this.tab !== 'inventory') return;
    const uid = focused?.dataset?.id;
    if (!this.p.inventory[uid]) return;
    const r = WS.toggleFlag(this.p, uid, 'locked');
    this.ui.toast(r.value ? 'Locked 🔒 (protected from dismantling)' : 'Unlocked');
    this.ui.refresh(this);
  }

  inspectLoadout(L) {
    const P = this.p;
    const S = loadoutSummary(P, L);
    if (!S.assembly) { this.ui.toast('This loadout cannot be assembled yet.', 'warn'); return; }
    this.ui.push(new InspectScreen({ assembly: S.assembly, color: P.player.color, beast: L.beast, title: L.name, items: loadoutItems(P, L).parts }));
  }

  // Inspect one part, fitted into the active loadout's top.
  inspectItem(it) {
    const P = this.p;
    const L = P.loadouts[P.activeLoadout];
    const items = { ...loadoutItems(P, L).parts, [it.slot]: it };
    let asm = null;
    try { asm = assembleTop(Object.fromEntries(Object.entries(items).filter(([, v]) => v)), { force: true, spin: L.spin }); } catch { asm = null; }
    if (!asm) { this.ui.toast('This part cannot be shown on your active loadout.', 'warn'); return; }
    this.ui.push(new InspectScreen({ assembly: asm, color: P.player.color, beast: L.beast, title: `${itemName(it)} on ${L.name}`, items, focus: it.slot }));
  }

  async itemActions(it) {
    const P = this.p;
    const equipped = WS.isEquipped(P, it.uid);
    const L = P.loadouts[P.activeLoadout];
    const isPart = SLOTS.includes(it.slot);
    const choice = await this.ui.choose(itemName(it), [
      { label: `Equip to ${L.name}`, value: 'equip', disabled: equipped, desc: 'Quick-equip into the active loadout.' },
      ...(isPart ? [{ label: 'Inspect in 3D', value: 'inspect', desc: 'See this part on its own and fitted into your active top.' }] : []),
      ...(baseOf(it)?.magnet ? [{ label: `Flip magnet (${it.pole === 'S' ? 'S' : 'N'} face up → ${it.pole === 'S' ? 'N' : 'S'})`, value: 'flip', desc: 'Turn the disc over to swap its pole. Opposite poles attract, matching poles repel; plain tops are always pulled a little.' }] : []),
      { label: it.favourite ? 'Unfavourite' : 'Favourite ★', value: 'fav' },
      { label: it.locked ? 'Unlock' : 'Lock 🔒', value: 'lock' },
      { label: 'Nickname…', value: 'nick' },
      { label: 'Upgrade / traits…', value: 'upgrade' },
      { label: 'Repair…', value: 'repair' },
      { label: 'Dismantle', value: 'dismantle', disabled: it.locked || equipped, desc: Object.entries(WS.dismantleYield(it)).map(([k, v]) => `${k} +${v}`).join(', ') },
    ]);
    if (choice === 'equip') {
      const mech = it.slot === 'launcher' ? resolveLaunchGear(it, null).spinMech : 'dual';
      if (mech !== 'dual' && mech !== L.spin) {
        const how = await this.spinChoice(L, it, mech);
        if (!how) return;
        if (how === 'switch') L.spin = mech;
      }
      WS.equip(P, P.activeLoadout, it.slot, it.uid);
      const v = validateLoadout(P, L);
      this.ui.toast(v.ok ? `Equipped ${itemName(it)}.` : `Equipped, but the loadout is now invalid: ${v.errors[0]}`, v.ok ? 'good' : 'warn', 4000);
    }
    if (choice === 'inspect') { this.inspectItem(it); return; }
    if (choice === 'flip') { const r = WS.flipMagnet(P, it.uid); this.ui.toast(r.ok ? `${r.pole} face up.` : r.reason, r.ok ? 'good' : 'bad'); }
    if (choice === 'fav') WS.toggleFlag(P, it.uid, 'favourite');
    if (choice === 'lock') WS.toggleFlag(P, it.uid, 'locked');
    if (choice === 'nick') { this.ui.push(new TextPrompt('Nickname', it.nickname || '', 20, (v) => { WS.setNickname(P, it.uid, v); this.ui.refresh(this); })); return; }
    if (choice === 'upgrade') { this.upgradeUid = it.uid; this.setTab('upgrade'); return; }
    if (choice === 'repair') { this.setTab('repair'); return; }
    if (choice === 'dismantle') {
      if (WS.dismantleNeedsConfirm(it) && !(await this.ui.confirm('Dismantle?', `${itemName(it)} is ${RARITY_INDEX[it.rarity].name}${masteryOf(it.xp).index >= 2 ? ', mastered' : ''}${it.favourite ? ', a favourite' : ''}. It will be destroyed for materials. You can undo until you leave the Workshop.`, { danger: true, yes: 'Dismantle' }))) return;
      const r = WS.dismantle(P, it.uid);
      this.ui.toast(r.ok ? 'Dismantled: ' + Object.entries(r.yield).map(([k, v]) => `${k} +${v}`).join(', ') : r.reason, r.ok ? 'good' : 'bad');
    }
    this.ui.refresh(this);
  }

  // A launcher that only launches the other spin (a cup prize can be one): offer to
  // switch the loadout's spin with it rather than leave the loadout unable to battle.
  spinChoice(L, it, mech) {
    const dir = mech === 'R' ? 'right' : 'left';
    const warn = validateBuild(loadoutItems(this.p, L).parts, { spin: mech }).warnings.find((w) => w.includes('designed for'));
    return this.ui.choose(`${itemName(it)} launches ${dir} spin only`, [
      { label: `Equip and switch ${L.name} to ${dir} spin`, value: 'switch', desc: warn || `${L.name} will launch ${dir} spin.` },
      { label: 'Equip anyway', value: 'keep', desc: `${L.name} cannot battle until its spin direction matches the launcher.` },
    ]);
  }

  async bulkDismantle() {
    const P = this.p;
    const c = WS.bulkDismantleCandidates(P, 'uncommon');
    if (!c.length) { this.ui.toast('Nothing eligible for bulk dismantling.'); return; }
    if (!(await this.ui.confirm('Bulk dismantle', `Dismantle ${c.length} Common/Uncommon items (unlocked, unequipped, not favourites, below Skilled mastery)?`, { danger: true, yes: `Dismantle ${c.length}` }))) return;
    let n = 0;
    for (const it of c) if (WS.dismantle(P, it.uid).ok) n++;
    this.ui.toast(`Dismantled ${n} items.`, 'good');
    this.ui.refresh(this);
  }

  undo() {
    const r = WS.undo(this.p);
    this.ui.toast(r.ok ? `Undone: ${r.label}` : r.reason, r.ok ? 'good' : 'bad');
    this.ui.refresh(this);
  }

  // ================================================================ repair

  renderRepair() {
    const P = this.p;
    const items = Object.values(P.inventory).filter((i) => i.durability < i.maxDurability - 0.01 || i.fatigue > 0).sort((a, b) => conditionOf(a) - conditionOf(b));
    const L = P.loadouts[P.activeLoadout];
    const eq = new Set([...Object.values(L.parts), L.launcher, L.cable].filter(Boolean));
    const rows = h('div', { class: 'col gap', 'data-wrap': '', 'data-scroll': 'repair' });
    for (const it of items) {
      const cost = WS.repairCost(P, it, 1);
      const rc = WS.restoreCost(P, it);
      rows.append(h('div', { class: 'repair-row' },
        h('div', { class: 'rr-name' }, itemName(it), eq.has(it.uid) ? ' ⚙' : '', ' ', rarityChip(it.rarity), ' ', condChip(it), it.fatigue ? h('span', { class: 'chip' }, `fatigue ${(it.fatigue * 100).toFixed(0)}%`) : null),
        btn(`Repair (${WS.costText(cost)})`, () => this.doRepair(() => WS.repair(P, it.uid)), { disabled: !WS.canAfford(P, cost) || cost.credits === 0, desc: 'Full repair. Each full repair adds 1% material fatigue (lower max durability).' }),
        btn('Basic Service (free)', () => this.doRepair(() => WS.basicService(P, it.uid)), { disabled: it.durability >= it.maxDurability * 0.5, desc: 'Always free: restores a part to 50% condition so you are never stuck.' }),
        it.fatigue > 0 ? btn(`Restore (${WS.costText(rc)})`, () => this.doRepair(() => WS.restore(P, it.uid)), { disabled: !WS.canAfford(P, rc), desc: 'Advanced restoration: removes fatigue and fully repairs.' }) : null));
    }
    if (!items.length) rows.append(h('div', { class: 'muted' }, 'Everything is in full condition.'));
    const eqItems = [...eq].map((u) => P.inventory[u]).filter((i) => i && i.durability < i.maxDurability - 0.01);
    const totalEq = eqItems.reduce((acc, it) => { for (const [k, v] of Object.entries(WS.repairCost(P, it, 1))) acc[k] = (acc[k] || 0) + v; return acc; }, {});
    return h('div', { class: 'ws-cols' }, h('div', { class: 'panel scroll' }, h('div', { class: 'row gap' }, h('h3', {}, 'Repair bench'),
      btn(`Repair all equipped (${WS.costText(totalEq)})`, () => this.doRepair(() => { let ok = 0; for (const it of eqItems) if (WS.repair(P, it.uid).ok) ok++; return ok ? { ok: true } : { ok: false, reason: 'Could not afford any repairs' }; }), { disabled: !eqItems.length, class: 'primary' })),
    h('p', { class: 'small muted' }, 'Repairs restore function without erasing an item\'s identity, XP or history. Worn parts lose physical performance: chipped blades, blunted tips, slipping locks, unbalanced discs.'), rows));
  }

  doRepair(fn) {
    const r = fn();
    this.ui.toast(r.ok ? 'Done.' : r.reason, r.ok ? 'good' : 'bad');
    this.ui.refresh(this);
  }

  // ================================================================ upgrade

  renderUpgrade() {
    const P = this.p;
    const items = Object.values(P.inventory).sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || ALL_SLOTS.indexOf(a.slot) - ALL_SLOTS.indexOf(b.slot));
    if (!this.upgradeUid || !P.inventory[this.upgradeUid]) this.upgradeUid = items[0]?.uid;
    const it = P.inventory[this.upgradeUid];
    const list = h('div', { class: 'item-list', 'data-wrap': '', 'data-scroll': 'uplist' });
    for (const x of items) {
      const row = h('div', { class: 'item-row' + (x.uid === this.upgradeUid ? ' sel' : ''), 'data-focus': '', 'data-id': 'up-' + x.uid, style: { '--rarity': RARITY_INDEX[x.rarity].color } },
        h('span', { class: 'ir-name' }, itemName(x)), h('span', { class: 'ir-slot' }, SLOT_NAMES[x.slot]), rarityChip(x.rarity));
      row.addEventListener('click', () => { this.upgradeUid = x.uid; this.ui.refresh(this); });
      list.append(row);
    }
    const panel = h('div', { class: 'col gap', 'data-wrap': '' });
    if (it) {
      panel.append(itemCard(it));
      // upgrades
      panel.append(h('h3', {}, `Material upgrades (${it.upgrades.length}/${WS.maxUpgrades(it)})`));
      const full = it.upgrades.length >= WS.maxUpgrades(it);
      for (const up of upgradesForSlot(it.slot)) {
        const applied = it.upgrades.includes(up.id);
        const cost = WS.upgradeCost(P, up, it);
        const ok = !applied && !full && WS.canAfford(P, cost);
        panel.append(btn(h('div', { class: 'col' }, h('b', {}, up.name + (applied ? ' ✓' : '')), h('div', { class: 'small muted' }, up.desc), applied ? null : costChips(P, cost)),
          () => (applied ? this.ui.toast('Already applied.', 'info') : full ? this.ui.toast(`This item has all ${WS.maxUpgrades(it)} upgrades it can take.`, 'bad') : this.craft(() => WS.applyUpgrade(P, it.uid, up.id), cost, () => `${up.name} applied.`)),
          { class: 'craft-btn' + (ok ? '' : ' cant'), id: 'upg-' + up.id, desc: applied ? 'Applied.' : full ? 'No upgrade slots left.' : WS.canAfford(P, cost) ? up.desc : `Missing ${this.missingText(cost)}.` }));
      }
      // traits
      panel.append(h('h3', {}, 'Traits'));
      const rc = WS.rerollCost(P, it);
      it.traits.forEach((t, i) => panel.append(btn(h('div', { class: 'col' }, h('b', {}, `Reroll ${TRAIT_INDEX[t.id].name}`), h('div', { class: 'small muted' }, TRAIT_INDEX[t.id].desc(t.mag)), costChips(P, rc)), async () => {
        if (!WS.canAfford(P, rc)) { this.ui.toast(`Not enough: you still need ${this.missingText(rc)}.`, 'bad', 3600); this.app.audio.ui('error'); return; }
        if (await this.ui.confirm('Reroll trait?', `${TRAIT_INDEX[t.id].name} will be replaced by a random eligible trait. Other traits are kept.`, { yes: 'Reroll' })) this.act(() => WS.rerollTrait(P, it.uid, i));
      }, { class: 'craft-btn' + (WS.canAfford(P, rc) ? '' : ' cant'), id: 'reroll-' + i })));
      if (!it.traits.length) panel.append(h('div', { class: 'small muted' }, 'This item has no traits to reroll.'));
      const donors = Object.values(P.inventory).filter((d) => d.uid !== it.uid && d.slot === it.slot && d.traits.length && !d.locked && !WS.isEquipped(P, d.uid));
      if (donors.length) panel.append(btn(`Transfer a trait from another ${SLOT_NAMES[it.slot]}… (donor is consumed)`, () => this.transferFlow(it, donors), { desc: `Capacity ${it.traits.length}/${WS.traitCapacity(it)}. Transferred traits keep 85% of their strength.` }));
      // tuning
      const slots = tuningSlots(it.xp || 0);
      panel.append(h('h3', {}, `Mastery tuning (${it.tuning.length}/${slots} slots)`));
      for (const tu of tuningsForSlot(it.slot)) {
        const has = it.tuning.includes(tu.id);
        panel.append(btn(h('div', {}, h('b', {}, tu.name + (has ? ' ✓' : '')), h('div', { class: 'small muted' }, tu.desc)), () => this.act(() => WS.applyTuning(P, it.uid, tu.id)), { disabled: has || it.tuning.length >= slots }));
      }
      if (!slots) panel.append(h('div', { class: 'small muted' }, 'Reach Skilled mastery to unlock tuning slots.'));
    }
    return h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel' }, h('h3', {}, 'Choose item'), list), h('div', { class: 'panel scroll', 'data-scroll': 'uppanel' }, panel));
  }

  act(fn) {
    const r = fn();
    if (r.ok) this.app.audio.ui('confirm');
    this.ui.toast(r.ok ? (r.trait ? `New trait: ${TRAIT_INDEX[r.trait.id].name}` : 'Done.') : r.reason, r.ok ? 'good' : 'bad', 3200);
    this.ui.refresh(this);
  }

  async transferFlow(target, donors) {
    const donorUid = await this.ui.choose('Choose donor (it will be consumed)', donors.map((d) => ({ value: d.uid, label: `${itemName(d)} (${RARITY_INDEX[d.rarity].name})`, desc: d.traits.map((t) => TRAIT_INDEX[t.id].name).join(', ') })));
    if (!donorUid) return;
    const donor = this.p.inventory[donorUid];
    const idx = await this.ui.choose('Which trait?', donor.traits.map((t, i) => ({ value: String(i), label: TRAIT_INDEX[t.id].name, desc: TRAIT_INDEX[t.id].desc(t.mag * 0.85) })));
    if (idx == null) return;
    let replace = null;
    if (target.traits.length >= WS.traitCapacity(target)) {
      const r = await this.ui.choose('Target is full — replace which trait?', target.traits.map((t, i) => ({ value: String(i), label: TRAIT_INDEX[t.id].name })));
      if (r == null) return;
      replace = +r;
    }
    const cost = WS.transferCost(this.p, donor);
    if (!(await this.ui.confirm('Transfer trait?', `${itemName(donor)} will be destroyed. Cost: ${WS.costText(cost)}.`, { danger: true, yes: 'Transfer' }))) return;
    this.act(() => WS.transferTrait(this.p, donorUid, +idx, target.uid, replace));
  }

  // ================================================================ craft

  renderCraft() {
    const P = this.p;
    const bases = [...PARTS, ...LAUNCHERS, ...CABLES];
    const rows = h('div', { class: 'col gap', 'data-wrap': '' });
    const known = bases.filter((b) => P.discovery.parts[b.id]);
    rows.append(h('p', { class: 'small muted' }, `Every part you have discovered (${known.length}/${bases.length}) has a blueprint. Crafting makes a fresh Uncommon copy: the sure way to get a specific part without waiting for a drop.`));
    for (const b of known) {
      const cost = WS.blueprintCost(P, b);
      const ok = WS.canAfford(P, cost);
      rows.append(btn(h('div', { class: 'craft-row' }, h('span', { class: 'swatch', style: { background: b.color } }), h('div', { class: 'craft-name' }, h('b', {}, b.name), h('span', { class: 'small muted' }, SLOT_NAMES[b.slot])), costChips(P, cost)),
        () => this.craft(() => WS.craftBlueprint(P, b.id), cost, (r) => `Crafted ${itemName(r.item)}.`), { class: 'craft-btn' + (ok ? '' : ' cant'), id: 'bp-' + b.id, desc: ok ? `Craft ${b.name}. ${b.desc}` : `Missing ${this.missingText(cost)}. ${b.desc}` }));
    }
    const fok = WS.canAfford(P, WS.FORGE_COST);
    const forge = h('div', { class: 'col gap', 'data-wrap': '' },
      h('p', { class: 'small muted' }, 'The Forge turns materials into a random Epic-or-better part for the slot you choose.'),
      h('div', { class: 'row gap' }, h('span', { class: 'small' }, 'Cost per forge:'), costChips(P, WS.FORGE_COST)),
      ...ALL_SLOTS.map((s) => btn(`Forge ${SLOT_NAMES[s]}`, () => this.craft(() => WS.forge(P, s, rollLoot), WS.FORGE_COST, (r) => `Forged ${itemName(r.item)} (${RARITY_INDEX[r.item.rarity].name}).`), { class: 'craft-btn' + (fok ? '' : ' cant'), id: 'forge-' + s, desc: fok ? `Forge a random Epic-or-better ${SLOT_NAMES[s]}.` : `Missing ${this.missingText(WS.FORGE_COST)}.` })));
    return h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel scroll', 'data-scroll': 'craft' }, h('h3', {}, 'Blueprints'), rows), h('div', { class: 'panel scroll', 'data-scroll': 'forge' }, h('h3', {}, 'Forge'), forge));
  }

  missingText(cost) {
    return Object.entries(WS.missingFor(this.p, cost)).map(([k, v]) => `${v.toLocaleString()} ${RESOURCE_NAMES[k] || k}`).join(', ');
  }

  // Craft or forge with clear feedback: what is missing, or what you got.
  craft(fn, cost, okText) {
    if (!WS.canAfford(this.p, cost)) { this.ui.toast(`Not enough: you still need ${this.missingText(cost)}.`, 'bad', 3600); this.app.audio.ui('error'); return; }
    const r = fn();
    if (!r.ok) { this.ui.toast(r.reason, 'bad', 3600); this.app.audio.ui('error'); return; }
    this.app.audio.ui('levelup');
    this.ui.toast(okText(r), 'good', 3600);
    this.app.save('silent');
    this.ui.refresh(this);
  }

  // ================================================================ synergies

  renderSynergies() {
    const P = this.p;
    const L = P.loadouts[this.loadoutIndex] || P.loadouts[P.activeLoadout];
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel scroll', 'data-scroll': 'syn-build' }, h('h3', {}, L.name), synergySummary(P, L), buildBreakdown(P, L)),
      h('div', { class: 'panel scroll', 'data-scroll': 'syn-journal' }, synergyJournal(P, L)));
  }

  // ================================================================ collection

  renderCollection() {
    const P = this.p;
    const bases = [...PARTS, ...LAUNCHERS, ...CABLES];
    const found = bases.filter((b) => P.discovery.parts[b.id]).length;
    const bySlot = h('div', { class: 'col' });
    for (const s of ALL_SLOTS) {
      const all = bases.filter((b) => b.slot === s);
      bySlot.append(h('div', { class: 'coll-row' }, h('b', {}, `${SLOT_NAMES[s]} ${all.filter((b) => P.discovery.parts[b.id]).length}/${all.length}`),
        h('div', { class: 'coll-items' }, all.map((b) => h('span', { class: 'coll-item' + (P.discovery.parts[b.id] ? '' : ' unknown'), title: P.discovery.parts[b.id] ? b.desc : 'Undiscovered' }, P.discovery.parts[b.id] ? b.name : '???')))));
    }
    const sets = h('div', { class: 'col gap' });
    const owned = Object.values(P.inventory);
    for (const s of SETS) {
      const n = owned.filter((i) => i.set === s.id).length;
      sets.append(h('div', { class: 'set-block', style: { borderColor: s.color } }, h('b', { style: { color: s.color } }, s.name), ` — ${s.theme} (${n} owned${P.discovery.sets[s.id] ? '' : ', undiscovered'})`,
        h('div', { class: 'small' }, Object.entries(s.bonuses).map(([k, v]) => h('div', {}, `${k} pieces: ${v.desc}`))),
        h('div', { class: 'small muted' }, 'Slots: ' + s.slots.map((x) => SLOT_NAMES[x]).join(', '))));
    }
    const traitsFound = TRAITS.filter((t) => P.discovery.traits[t.id]).length;
    return h('div', { class: 'ws-cols two-wide' },
      h('div', { class: 'panel scroll', 'data-scroll': 'coll' }, h('h3', {}, `Parts discovered ${found}/${bases.length} · traits ${traitsFound}/${TRAITS.length}`), bySlot, btn('Close', () => this.onBack())),
      h('div', { class: 'panel scroll' }, h('h3', {}, 'Equipment sets'), sets));
  }
}

// ------------------------------------------------------------------ item picker

class ItemPicker {
  static screenName = 'ItemPicker';
  constructor(ws, slot) { this.ws = ws; this.slot = slot; }
  render() {
    const P = this.app.profile;
    const L = P.loadouts[this.ws.loadoutIndex];
    const { parts, launcher, cable } = loadoutItems(P, L);
    const current = this.slot === 'launcher' ? launcher : this.slot === 'cable' ? cable : parts[this.slot];
    const cands = Object.values(P.inventory).filter((i) => i.slot === this.slot).sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
    const list = h('div', { class: 'item-list', 'data-wrap': '', 'data-scroll': 'pick' });
    if (this.slot === 'aux') list.append(this.row(null, L, parts, current));
    for (const it of cands) list.append(this.row(it, L, parts, current));
    this.detail = h('div', { class: 'panel scroll item-detail', 'data-scroll': 'pick-detail' }, current ? this.ws.itemDetail(current, { loadout: this.ws.loadoutIndex }) : h('div', { class: 'muted' }, 'Nothing equipped.'));
    return h('div', { class: 'std-screen' }, h('div', { class: 'screen-head' }, h('h1', {}, `Choose ${SLOT_NAMES[this.slot]}`), h('span', { class: 'muted' }, `for ${L.name}`)),
      h('div', { class: 'ws-cols two-wide' }, h('div', { class: 'panel' }, list), this.detail));
  }
  row(it, L, parts, current) {
    const P = this.app.profile;
    let status = 'ok', msg = '';
    if (it && SLOTS.includes(this.slot)) {
      const v = validateBuild({ ...parts, [this.slot]: it }, { spin: L.spin });
      if (!v.ok) { status = 'bad'; msg = v.errors[0]; } else if (v.warnings.length) { status = 'warn'; msg = v.warnings[0]; }
    }
    if (it && this.slot === 'launcher') {
      const mech = resolveLaunchGear(it, null).spinMech;
      if (mech !== 'dual' && mech !== L.spin) { status = 'bad'; msg = `Launches ${mech === 'R' ? 'right' : 'left'} spin only; loadout uses ${L.spin === 'R' ? 'right' : 'left'}.`; }
    }
    const el = h('div', { class: 'item-row pick-' + status + (current?.uid === it?.uid ? ' sel' : ''), 'data-focus': '', 'data-id': it ? it.uid : 'none', style: { '--rarity': it ? RARITY_INDEX[it.rarity].color : '#666' } },
      it ? h('span', { class: 'swatch', style: { background: it.visual?.color || baseOf(it)?.color } }) : null,
      h('span', { class: 'ir-name' }, it ? itemName(it) : '— None —', it && WS.isEquipped(P, it.uid) ? ' ⚙' : '', this.verdict(it, L)),
      it ? rarityChip(it.rarity) : null, it ? condChip(it) : null,
      h('span', { class: 'pick-status' }, status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✖'));
    el.dataset.desc = msg || (it ? baseOf(it).desc : 'Leave the auxiliary slot empty.');
    el.addEventListener('click', () => this.pick(it, status, msg));
    return el;
  }
  // ▲/▼ roles under each candidate: how it would change the finished top
  verdict(it, L) {
    let cmp;
    try { cmp = compareSwap(this.app.profile, L, this.slot, it); } catch { return null; }
    if (cmp.same) return h('span', { class: 'ir-verdict' }, 'Equipped');
    const v = cmp.verdict;
    return h('span', { class: 'ir-verdict' }, v.better.slice(0, 2).map((x) => h('i', { class: 'good' }, '▲' + x)), v.worse.slice(0, 2).map((x) => h('i', { class: 'bad' }, '▼' + x)), !v.better.length && !v.worse.length ? verdictLine(cmp) : null);
  }
  onFocus(el) {
    if (!el?.closest('.item-list')) return; // keep the detail while a dialog is open
    const uid = el.dataset.id;
    const it = this.app.profile.inventory[uid];
    const L = this.app.profile.loadouts[this.ws.loadoutIndex];
    if (!this.detail) return;
    this.detail.innerHTML = '';
    if (it) this.detail.append(this.ws.itemDetail(it, { loadout: this.ws.loadoutIndex }));
    else if (uid === 'none') { try { this.detail.append(compareBlock(compareSwap(this.app.profile, L, this.slot, null))); } catch { /* nothing to compare */ } }
  }
  async pick(it, status, msg) {
    const L = this.app.profile.loadouts[this.ws.loadoutIndex];
    const mech = it && this.slot === 'launcher' ? resolveLaunchGear(it, null).spinMech : 'dual';
    if (mech !== 'dual' && mech !== L.spin) {
      const how = await this.ws.spinChoice(L, it, mech);
      if (!how) return;
      if (how === 'switch') L.spin = mech;
    } else if (status === 'bad' && !(await this.ui.confirm('Incompatible part', `${msg} Equip anyway? The loadout will be invalid until fixed.`, { yes: 'Equip anyway' }))) return;
    WS.equip(this.app.profile, this.ws.loadoutIndex, this.slot, it ? it.uid : null);
    this.app.audio.ui('confirm');
    this.ui.pop();
  }
  prompts() { return [['confirm', 'Equip'], ['back', 'Cancel']]; }
}

// ------------------------------------------------------------------ text prompt

export class TextPrompt {
  static screenName = 'TextPrompt';
  constructor(title, value, max, onDone) { this.title = title; this.value = value; this.max = max; this.onDone = onDone; }
  render() {
    this.osk = textEntry({ value: this.value, max: this.max, onChange: (v) => { this.value = v; }, onDone: (v) => { this.ui.pop(); this.onDone(v.trim()); } });
    return h('div', { class: 'center-screen' }, h('div', { class: 'panel name-panel' }, h('h2', {}, this.title), this.osk));
  }
  onEnter() {
    this.handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); this.ui.pop(); return; } this.osk._keyHandler(e); };
    window.addEventListener('keydown', this.handler, true);
    this.app.input.textEntry = true;
  }
  onExit() { window.removeEventListener('keydown', this.handler, true); this.app.input.textEntry = false; }
  prompts() { return [['confirm', 'Press key'], ['back', 'Cancel']]; }
}
