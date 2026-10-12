// The Journal: what a save has found (parts, traits, synergies, relics,
// sets), where each part can be found, bad-luck protection progress, and
// milestone rewards for filling the pages in.

import { PARTS } from '../data/parts.js';
import { LAUNCHERS, CABLES } from '../data/launchers.js';
import { TRAITS } from '../data/traits.js';
import { SYNERGIES } from '../data/synergies.js';
import { SETS } from '../data/sets.js';
import { RELICS } from '../data/relics.js';
import { ARCHETYPES } from '../data/opponents.js';
import { CHARACTERS } from '../data/characters.js';
import { OFFERS } from '../data/store.js';
import { PITY } from './loot.js';

export const ALL_BASES = [...PARTS, ...LAUNCHERS, ...CABLES];
export const JOURNAL_TRAITS = TRAITS.filter((t) => !t.relic);

export function journalCounts(profile) {
  const d = profile.discovery || {};
  return {
    parts: { have: ALL_BASES.filter((b) => d.parts?.[b.id]).length, of: ALL_BASES.length },
    traits: { have: JOURNAL_TRAITS.filter((t) => d.traits?.[t.id]).length, of: JOURNAL_TRAITS.length },
    synergies: { have: SYNERGIES.filter((s) => d.synergies?.[s.id]).length, of: SYNERGIES.length },
    relics: { have: RELICS.filter((r) => profile.relics?.earned?.[r.id]).length, of: RELICS.length },
    sets: { have: SETS.filter((s) => d.sets?.[s.id]).length, of: SETS.length },
  };
}

// ------------------------------------------------------------ where to find a part

const ownsPart = (o, id) => o && (Object.values(o.parts || {}).includes(id) || o.launcher === id || o.cable === id);

// Readable places a part turns up: opponents that use it (their parts are
// favoured when you beat them), Store bundles that can contain it, and the
// blueprint once discovered.
export function partSources(baseId, profile = null) {
  const out = [];
  const arch = ARCHETYPES.filter((a) => ownsPart(a, baseId)).map((a) => a.name);
  if (arch.length) out.push(`Beat ${arch.join(', ')}`);
  const rivals = CHARACTERS.filter((c) => (c.builds || []).some((b) => ownsPart(b, baseId))).map((c) => c.name);
  if (rivals.length) out.push(`Rival${rivals.length > 1 ? 's' : ''} ${rivals.join(', ')}`);
  const offers = OFFERS.filter((o) => (o.items || []).some((x) => (x.pool || []).includes(baseId))).map((o) => o.name);
  if (offers.length) out.push(`Store: ${offers.join(', ')}`);
  const base = ALL_BASES.find((b) => b.id === baseId);
  if (base) out.push(`Random drops from tier ${Math.max(0, (base.tier || 1) - 2)} battles and up`);
  if (profile?.discovery?.parts?.[baseId]) out.push('Workshop blueprint');
  return out;
}

// ------------------------------------------------------------ bad-luck protection

export function pityStatus(profile) {
  const P = profile.seeds?.pity || { epic: 0, legendary: 0 };
  return { epicIn: Math.max(1, PITY.epic - (P.epic || 0)), legendaryIn: Math.max(1, PITY.legendary - (P.legendary || 0)) };
}

// ------------------------------------------------------------ milestones

// need: { share } of the page or a { count }
const M = (id, kind, need, reward, name) => ({ id, kind, need, reward, name });
export const MILESTONES = [
  M('parts25', 'parts', { share: 0.25 }, { credits: 400, coreShard: 2 }, 'Collector I: a quarter of all parts'),
  M('parts50', 'parts', { share: 0.5 }, { credits: 800, coreShard: 4 }, 'Collector II: half of all parts'),
  M('parts75', 'parts', { share: 0.75 }, { credits: 1500, relicFragment: 2 }, 'Collector III: three quarters of all parts'),
  M('parts100', 'parts', { share: 1 }, { credits: 3000, relicFragment: 5 }, 'Collector IV: every part'),
  M('traits15', 'traits', { count: 15 }, { credits: 300, research: 10 }, 'Scholar I: 15 traits'),
  M('traits30', 'traits', { count: 30 }, { credits: 600, research: 20 }, 'Scholar II: 30 traits'),
  M('traits45', 'traits', { count: 45 }, { credits: 1000, coreShard: 2 }, 'Scholar III: 45 traits'),
  M('traits60', 'traits', { count: 60 }, { credits: 1500, relicFragment: 2 }, 'Scholar IV: 60 traits'),
  M('traits80', 'traits', { count: 80 }, { credits: 2500, relicFragment: 4 }, 'Scholar V: 80 traits'),
  M('syn3', 'synergies', { count: 3 }, { credits: 400, spiritDust: 4 }, 'Harmonist I: 3 synergies'),
  M('syn7', 'synergies', { count: 7 }, { credits: 800, coreShard: 3 }, 'Harmonist II: 7 synergies'),
  M('syn12', 'synergies', { count: 12 }, { credits: 1500, relicFragment: 2 }, 'Harmonist III: 12 synergies'),
  M('synAll', 'synergies', { share: 1 }, { credits: 3000, relicFragment: 5 }, 'Harmonist IV: every synergy'),
  M('relic1', 'relics', { count: 1 }, { credits: 500 }, 'Relic Keeper I: your first relic'),
  M('relic4', 'relics', { count: 4 }, { credits: 1500, relicFragment: 3 }, 'Relic Keeper II: 4 relics'),
  M('relic8', 'relics', { count: 8 }, { credits: 3000, relicFragment: 5 }, 'Relic Keeper III: 8 relics'),
  M('relicAll', 'relics', { share: 1 }, { credits: 6000, relicFragment: 10 }, 'Relic Keeper IV: every relic'),
];
const needOf = (m, of) => (m.need.share != null ? Math.ceil(m.need.share * of) : Math.min(m.need.count, of));

export function milestoneStatus(profile) {
  const c = journalCounts(profile);
  const claimed = profile.journal?.claimed || {};
  return MILESTONES.map((m) => {
    const { have, of } = c[m.kind];
    const need = needOf(m, of);
    return { def: m, have: Math.min(have, need), need, done: have >= need, claimed: !!claimed[m.id] };
  });
}

export function claimMilestone(profile, id) {
  const st = milestoneStatus(profile).find((s) => s.def.id === id);
  if (!st) return { ok: false, reason: 'Unknown milestone' };
  if (st.claimed) return { ok: false, reason: 'Already collected' };
  if (!st.done) return { ok: false, reason: `Not yet: ${st.have}/${st.need}` };
  const J = profile.journal || (profile.journal = { claimed: {} });
  J.claimed = J.claimed || {};
  J.claimed[id] = Date.now();
  for (const [k, v] of Object.entries(st.def.reward)) {
    if (k === 'credits') profile.currency.credits += v;
    else if (k === 'research') profile.currency.research += v;
    else profile.materials[k] = (profile.materials[k] || 0) + v;
  }
  return { ok: true, reward: st.def.reward };
}

export function unclaimedMilestones(profile) { return milestoneStatus(profile).filter((s) => s.done && !s.claimed).length; }
