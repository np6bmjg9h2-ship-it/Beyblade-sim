// The Archive and the Legend loadout slot. Research projects (data/legends.js)
// are bought with research in order; the last one of a legend awakens it:
// its Spirit Chip joins you and the Legend slot can field it. The slot is a
// loadout flagged `legend` whose parts are not inventory items but the
// legend's fixed kit, built here from the definitions (so it never wears,
// levels, or leaves the slot).

import { LEGENDS, LEGEND_INDEX, PROJECT_INDEX } from '../data/legends.js';
import { mixSeeds } from '../core/rng.js';
import { createItem } from './items.js';
import { recruitBeast } from './beasts.js';

export const LEGEND_LOADOUT_ID = 'LEGEND';

export function archiveOf(profile) {
  const A = profile.archive || (profile.archive = { done: {}, legends: {} });
  A.done = A.done || {};
  A.legends = A.legends || {};
  return A;
}

export const legendUnlocked = (profile, id) => !!archiveOf(profile).legends[id];
export const unlockedLegends = (profile) => LEGENDS.filter((l) => legendUnlocked(profile, l.id));

// { done, available, reason } for one project.
export function projectStatus(profile, id) {
  const pr = PROJECT_INDEX[id];
  if (!pr) return { done: false, available: false, reason: 'Unknown project' };
  const A = archiveOf(profile);
  if (A.done[id]) return { done: true, available: false };
  const prev = LEGEND_INDEX[pr.legend].projects[pr.step - 1];
  if (prev && !A.done[prev.id]) return { done: false, available: false, reason: `Finish "${prev.name}" first.` };
  if (pr.req.level && profile.player.level < pr.req.level) return { done: false, available: false, reason: `Reach player level ${pr.req.level}.` };
  if (pr.req.chapter && !(profile.story?.completed || []).includes(pr.req.chapter)) return { done: false, available: false, reason: `Finish Story Chapter ${pr.req.chapter.replace('ch', '')}.` };
  if ((profile.currency.research || 0) < pr.cost) return { done: false, available: false, reason: `Needs ${pr.cost} research (you have ${profile.currency.research || 0}).`, short: true };
  return { done: false, available: true };
}

// Spend research on a project. The last project of a legend awakens it.
export function completeProject(profile, id) {
  const st = projectStatus(profile, id);
  if (!st.available) return { ok: false, reason: st.reason || 'Already finished' };
  const pr = PROJECT_INDEX[id];
  profile.currency.research -= pr.cost;
  archiveOf(profile).done[id] = { at: Date.now() };
  const L = LEGEND_INDEX[pr.legend];
  const awakened = pr.step === L.projects.length - 1;
  if (awakened) unlockLegend(profile, L.id);
  return { ok: true, project: pr, legend: L, awakened };
}

export function unlockLegend(profile, id) {
  const L = LEGEND_INDEX[id];
  if (!L) return false;
  archiveOf(profile).legends[id] = { at: Date.now() };
  recruitBeast(profile, L.beast);
  ensureLegendLoadout(profile, id);
  return true;
}

// The Legend slot: created with the first legend, then switched between them.
export function legendLoadout(profile) { return profile.loadouts.find((l) => l.legend) || null; }

export function ensureLegendLoadout(profile, preferId = null) {
  const owned = unlockedLegends(profile);
  let slot = legendLoadout(profile);
  if (!owned.length) {
    if (slot) removeLegendLoadout(profile);
    return null;
  }
  const id = preferId && legendUnlocked(profile, preferId) ? preferId : slot && legendUnlocked(profile, slot.legend) ? slot.legend : owned[0].id;
  if (!slot) {
    slot = { id: LEGEND_LOADOUT_ID, parts: {}, launcher: null, cable: null };
    profile.loadouts.push(slot);
  }
  return setLegend(profile, slot, id);
}

export function setLegend(profile, slot, id) {
  const L = LEGEND_INDEX[id];
  if (!L || !legendUnlocked(profile, id)) return slot;
  Object.assign(slot, { legend: id, name: L.name, role: L.role, beast: L.beast, spin: L.spin, technique: L.technique, parts: {}, launcher: null, cable: null });
  return slot;
}

function removeLegendLoadout(profile) {
  const i = profile.loadouts.findIndex((l) => l.legend);
  if (i < 0) return;
  profile.loadouts.splice(i, 1);
  if (profile.activeLoadout >= i) profile.activeLoadout = Math.max(0, profile.activeLoadout - 1);
}

// The legend's fixed kit as item-shaped objects (built once, shared).
const KITS = new Map();
export function legendKit(id) {
  if (KITS.has(id)) return KITS.get(id);
  const L = LEGEND_INDEX[id];
  if (!L) return null;
  const mk = (opts, slot) => {
    const traits = (L.traits?.[slot] || []).map(([tid, mag]) => ({ id: tid, mag }));
    const it = createItem({ ...opts, rarity: 'relic', level: 30, perfect: true, traits, special: null, set: null, seed: mixSeeds(7, 'legend', id, slot), source: 'Archive', uid: `legend_${id}_${slot}` });
    it.legend = id;
    it.locked = true;
    it.visual = { color: slot === 'ring' || slot === 'lock' ? L.color : it.visual?.color || null, accent: L.accent, finish: 'prism' };
    return it;
  };
  const parts = {};
  for (const [slot, def] of Object.entries(L.build)) parts[slot] = mk({ def }, slot);
  const kit = { parts, launcher: mk({ base: L.launcher }, 'launcher'), cable: mk({ base: L.cable }, 'cable') };
  KITS.set(id, kit);
  return kit;
}
