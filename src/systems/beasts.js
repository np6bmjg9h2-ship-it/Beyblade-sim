// Spirit Chip collection logic: recruitment through Spirit Trials, bond-gated
// unlocks, awakening eligibility and the battle sessions for trials.

import { BEASTS, BEAST_INDEX, bondLevel, BOND_LEVELS } from '../data/beasts.js';
import { SPIRIT_TRIALS, BEAST_LORE } from '../data/beastLore.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../data/opponents.js';

export function bondInfo(state) {
  const xp = state?.bondXp || 0;
  const lv = bondLevel(xp);
  const cur = BOND_LEVELS[lv - 1] ?? 0;
  const next = BOND_LEVELS[lv] ?? null;
  return { level: lv, xp, cur, next, frac: next ? (xp - cur) / (next - cur) : 1 };
}

export function unlockedLore(id, state) {
  const lv = bondLevel(state?.bondXp || 0);
  const lore = BEAST_LORE[id] || [];
  return lore.map((text, i) => ({ text, level: [2, 6, 10][i], unlocked: lv >= [2, 6, 10][i] }));
}

export function trialStatus(profile, id) {
  const t = SPIRIT_TRIALS[id];
  if (!t) return { available: false, reason: 'Obtained through the story.' };
  if (profile.beasts[id]) return { available: false, owned: true };
  if (profile.player.level < t.level) return { available: false, reason: `Reach player level ${t.level}. ${t.hint}` };
  if (t.story && !profile.story.flags[t.story]) return { available: false, reason: `Story: progress further. ${t.hint}` };
  return { available: true, hint: t.hint };
}

export function recruitBeast(profile, id) {
  if (profile.beasts[id]) return false;
  profile.beasts[id] = { id, bondXp: 0, awakened: false, unlockedAt: Date.now(), stats: {} };
  profile.discovery.beasts[id] = true;
  return true;
}

export function awakeningStatus(profile, id) {
  const def = BEAST_INDEX[id];
  const st = profile.beasts[id];
  if (!def || !st) return { eligible: false, reason: 'Not owned' };
  if (st.awakened) return { eligible: false, done: true };
  const aw = def.awakening;
  const bond = bondLevel(st.bondXp);
  const bondOk = bond >= aw.bond;
  let reqOk = false, progress = '';
  if (aw.requirement.type === 'stat') {
    const v = st.stats[aw.requirement.stat] || 0;
    reqOk = v >= aw.requirement.value;
    progress = `${Math.floor(v)}/${aw.requirement.value}`;
  } else if (aw.requirement.type === 'story') {
    reqOk = !!profile.story.flags[aw.requirement.id];
    progress = reqOk ? 'complete' : 'story';
  }
  return { eligible: bondOk && reqOk, bondOk, reqOk, progress, bond, needBond: aw.bond, desc: aw.desc, name: aw.name };
}

export function awakenBeast(profile, id) {
  const st = profile.beasts[id];
  if (!st) return false;
  st.awakened = true;
  st.awakenedAt = Date.now();
  return true;
}

// Battle participants for trials. The trial champion carries the beast in question.
export function trialOpponent(id, kind = 'spirit') {
  const t = SPIRIT_TRIALS[id];
  const def = BEAST_INDEX[id];
  const champ = t?.champion || { name: `Echo of ${def.name}`, archetype: 'champion', difficulty: 1.15 };
  const arch = ARCHETYPE_INDEX[champ.archetype] || ARCHETYPE_INDEX.all;
  const diff = kind === 'awakening' ? Math.max(1.1, champ.difficulty + 0.15) : champ.difficulty;
  return participantFromDef({ ...arch, beast: id }, {
    id: 'trial-' + id, name: kind === 'awakening' ? `Echo of ${def.name}` : champ.name, difficulty: diff,
    bondLevel: kind === 'awakening' ? 9 : 5, awakened: kind === 'awakening',
  });
}

export { BEASTS };
