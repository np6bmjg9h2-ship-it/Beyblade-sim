// Rift Run: does an offer fit the run's build? Pure checks used by the
// viable-offer guarantee (riftLoot.js) and the fit chips on reward cards.
// A part fits when it upgrades a role the build plays without hurting
// another, carries a strong trait for such a role, completes a synergy, or
// fills an empty slot. A charm fits when its family serves a build role,
// moves a held family toward Resonance, or feeds the ring's element.

import { CHARM_INDEX, FAMILIES, RESONANCE_COUNT } from '../data/riftCharms.js';
import { TRAIT_INDEX } from '../data/traits.js';
import { SLOT_NAMES } from '../data/parts.js';
import { STATUSES } from '../data/rift.js';
import { resolvePart } from './assembly.js';
import { compareBuildSwap, ROLES } from './compare.js';
import { synergyContext, evaluateSynergies } from './synergy.js';
import { familyCounts } from './riftBattle.js';
import { fitsBuild } from './riftLoot.js';
import { runLauncherOf } from '../data/launchers.js';

const RING_ROLES = { attack: ['atk'], burst: ['atk'], upper: ['atk'], defense: ['def'], stamina: ['sta'], balance: ['atk', 'sta'] };
export const FAMILY_ROLES = { ember: 'atk', storm: 'atk', iron: 'def', tide: 'sta', gale: 'mob', void: null };
const TRAIT_ROLES = { offense: 'atk', defense: 'def', endurance: 'sta', mobility: 'mob' };
const EPS = 0.015;
const STRONG_TRAIT = 0.45;

// The play roles of the run's top, from its ring.
export function buildRoles(run) {
  const ring = run.equipped.ring;
  if (!ring) return [];
  let role = null;
  try { role = resolvePart(ring).role; } catch { /* unknown base */ }
  return RING_ROLES[role] || [];
}

// Charm families whose role the build plays.
export const roleFamilies = (run) => Object.keys(FAMILY_ROLES).filter((f) => buildRoles(run).includes(FAMILY_ROLES[f]));

function activeSynergies(profile, run, parts) {
  const ctx = synergyContext({ parts, launcher: runLauncherOf(profile.inventory, run), cable: profile.inventory[run.cable], beast: run.beast, spin: run.spin, run });
  return evaluateSynergies(ctx).active.map((a) => a.rule);
}

// Why a part fits the build (a short line), or null.
export function partFit(profile, run, item) {
  if (!item || !fitsBuild(profile, run, item)) return null;
  const cur = run.equipped[item.slot];
  if (cur?.uid === item.uid) return null;
  let cmp;
  try {
    cmp = compareBuildSwap({ parts: run.equipped, launcher: runLauncherOf(profile.inventory, run), cable: profile.inventory[run.cable], spin: run.spin }, item.slot, item);
  } catch { return null; }
  if (!cmp.valid?.ok) return null;
  if (!cur) return `Fills the empty ${SLOT_NAMES[item.slot]} slot`;
  const roles = buildRoles(run);
  const score = cmp.verdict.score || {};
  const noWorse = roles.every((r) => (score[r] || 0) >= -EPS);
  if (noWorse) {
    const up = roles.filter((r) => (score[r] || 0) > EPS).sort((a, b) => score[b] - score[a]);
    if (up.length) return `Upgrades ${ROLES[up[0]]}`;
    for (const t of [...(item.traits || []), ...(item.special ? [item.special] : [])]) {
      const def = TRAIT_INDEX[t.id];
      const r = TRAIT_ROLES[def?.family];
      if (r && roles.includes(r) && (t.mag ?? 1) >= STRONG_TRAIT) return `${def.name} suits your ${ROLES[r]} top`;
    }
  }
  const before = new Set(activeSynergies(profile, run, run.equipped).map((r) => r.id));
  const fresh = activeSynergies(profile, run, { ...run.equipped, [item.slot]: item }).find((r) => !before.has(r.id));
  if (fresh) return `Completes ${fresh.hidden && !profile.discovery?.synergies?.[fresh.id] ? 'a hidden synergy' : fresh.name}`;
  return null;
}

// Why a charm fits the build, or null. Cursed charms never count.
export function charmFit(run, held) {
  const c = CHARM_INDEX[held?.id];
  if (!c || c.rarity === 'cursed') return null;
  const n = familyCounts(run)[c.family] || 0;
  const fam = FAMILIES[c.family].name;
  if (n >= 1 && n < RESONANCE_COUNT && !run.charms.some((h) => h.id === c.id)) return `Feeds ${fam} ${n + 1}/${RESONANCE_COUNT}`;
  const r = FAMILY_ROLES[c.family];
  if (r && buildRoles(run).includes(r)) return `${fam} suits your ${ROLES[r]} top`;
  const el = run.equipped.ring?.element;
  if (el && c.fx(1).status?.[el]) return `Feeds your ${STATUSES[el].name} ring`;
  return null;
}

export function optionFit(profile, run, o) {
  if (o.type === 'part') return partFit(profile, run, o.item);
  if (o.type === 'charm') return charmFit(run, o.charm);
  return null;
}

export const offerViable = (profile, run, options) => options.some((o) => optionFit(profile, run, o));
