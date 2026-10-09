// Story progress: which node you are on, flags and choices, once-only
// rewards, chapter unlocks, dialogue resolution and story opponents.
// Everything lives in profile.story and is saved after every node.

import { CHAPTERS, CHAPTER_INDEX, NODE_INDEX, STORY_CAST, STORY_STYLES } from '../data/story.js';
import { CHARACTER_INDEX } from '../data/characters.js';
import { BEAST_INDEX } from '../data/beasts.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../data/opponents.js';
import { TIER_DIFFICULTY } from '../data/tournaments.js';
import { setSources } from '../data/sets.js';
import { rollLoot, addItem } from './loot.js';
import { addPlayerXp } from './profile.js';
import { grantUnlock } from './tournament.js';
import { itemName } from './items.js';
import { validateLoadout } from './loadout.js';
import { rivalPlan, rivalParticipant, rivalItems, markSeen } from './rivals.js';

export const STORY_DIFFICULTY = {
  story: { name: 'Story', mul: 0.75, desc: 'Opponents launch and react less precisely. For enjoying the story.' },
  normal: { name: 'Normal', mul: 1, desc: 'The intended challenge.' },
  hard: { name: 'Hard', mul: 1.12, desc: 'Sharper launches, faster reactions and better counters. Physics never changes.' },
};

export function storyState(profile) {
  const S = profile.story;
  S.flags = S.flags || {}; S.choices = S.choices || {}; S.completed = S.completed || []; S.seen = S.seen || [];
  S.rewarded = S.rewarded || {}; S.results = S.results || {}; S.attempts = S.attempts || {};
  return S;
}

export function chapterUnlocked(profile, ch) {
  if (ch.n === 1) return true;
  return storyState(profile).completed.includes(CHAPTERS[ch.n - 2].id);
}

export function chapterProgress(profile, ch) {
  const S = storyState(profile);
  const total = ch.nodes.length;
  if (S.node && NODE_INDEX[S.node]?.chapter === ch.id) return { done: NODE_INDEX[S.node].index, total, complete: S.completed.includes(ch.id), active: true };
  if (S.completed.includes(ch.id)) return { done: total, total, complete: true };
  return { done: 0, total, complete: false };
}

export function currentNode(profile) {
  const S = storyState(profile);
  return S.node ? NODE_INDEX[S.node] || null : null;
}

// The chapter a "Continue" button should open.
export function nextChapter(profile) {
  const S = storyState(profile);
  const cur = currentNode(profile);
  if (cur) return CHAPTER_INDEX[cur.chapter];
  return CHAPTERS.find((c) => !S.completed.includes(c.id) && chapterUnlocked(profile, c)) || null;
}

export function startChapter(profile, chId) {
  const S = storyState(profile);
  const ch = CHAPTER_INDEX[chId];
  S.node = ch.nodes[0].id;
  S.chapter = ch.n;
  return currentNode(profile);
}

// Move past the current node. Returns { chapterComplete, chapter }.
export function advance(profile) {
  const S = storyState(profile);
  const node = currentNode(profile);
  if (!node) return { chapterComplete: false };
  if (!S.seen.includes(node.id)) S.seen.push(node.id);
  const ch = CHAPTER_INDEX[node.chapter];
  if (node.index < ch.nodes.length - 1) {
    S.node = ch.nodes[node.index + 1].id;
    return { chapterComplete: false, chapter: ch };
  }
  const first = !S.completed.includes(ch.id);
  if (first) S.completed.push(ch.id);
  S.node = null;
  S.chapter = Math.min(CHAPTERS.length, ch.n + 1);
  return { chapterComplete: true, firstTime: first, chapter: ch };
}

// Grant a reward once (keyed); flags are always applied.
export function grantStoryReward(profile, key, reward) {
  const S = storyState(profile);
  const out = { credits: 0, xp: 0, items: [], unlocks: [], materials: {}, flags: [], notes: [] };
  if (!reward) return out;
  for (const f of reward.flags || []) { S.flags[f] = true; out.flags.push(f); }
  for (const a of reward.arenas || []) if (grantUnlock(profile, 'arena:' + a)) out.unlocks.push('arena:' + a);
  if (S.rewarded[key]) { out.repeat = true; return out; }
  S.rewarded[key] = true;
  if (reward.credits) { profile.currency.credits += reward.credits; out.credits = reward.credits; }
  if (reward.xp) { out.xp = reward.xp; out.levelUps = addPlayerXp(profile, reward.xp); }
  for (const [k, v] of Object.entries(reward.materials || {})) { profile.materials[k] = (profile.materials[k] || 0) + v; out.materials[k] = v; }
  for (const src of reward.items || []) {
    const item = rollLoot(profile, { label: `Story: ${key}`, base: src.base, rarity: src.rarity, tier: 1 });
    item.source = 'story';
    addItem(profile, item);
    out.items.push(item);
  }
  for (const t of reward.techniques || []) if (grantUnlock(profile, 'technique:' + t)) out.unlocks.push('technique:' + t);
  for (const t of reward.titles || []) if (grantUnlock(profile, 'title:' + t)) out.unlocks.push('title:' + t);
  return out;
}

export function rewardLines(r) {
  const out = [];
  if (r.credits) out.push(`+${r.credits} credits`);
  if (r.xp) out.push(`+${r.xp} player XP${r.levelUps ? ` (level up!)` : ''}`);
  for (const it of r.items) out.push(`Received: ${itemName(it)}`);
  for (const [k, v] of Object.entries(r.materials)) out.push(`+${v} ${k}`);
  if (r.loadout) out.push(`New loadout “${r.loadout}” equipped`);
  for (const u of r.unlocks) {
    const [kind, val] = u.split(':');
    out.push(kind === 'arena' ? `Stadium unlocked: ${val}` : kind === 'technique' ? `Technique learned: ${val}` : `Title earned: ${val}`);
  }
  return out;
}

// ------------------------------------------------------------ dialogue

function speakerOf(profile, id) {
  if (id === 'player') {
    const L = profile.loadouts[profile.activeLoadout];
    return { name: profile.player.name, color: profile.player.color, beast: L?.beast || 'orrery' };
  }
  if (STORY_CAST[id]) return STORY_CAST[id];
  const c = CHARACTER_INDEX[id];
  if (c) return { name: c.name, color: c.color, beast: c.beast };
  return { name: id, color: '#ccc' };
}

export function lineVisible(profile, cond) {
  if (!cond) return true;
  const S = storyState(profile);
  if (cond.flag && !S.flags[cond.flag]) return false;
  if (cond.notFlag && S.flags[cond.notFlag]) return false;
  if (cond.choice && S.choices[cond.choice[0]] !== cond.choice[1]) return false;
  return true;
}

export function fillText(profile, text) {
  const L = profile.loadouts[profile.activeLoadout];
  const beast = BEAST_INDEX[L?.beast || 'orrery']?.name || 'Orrery';
  return text.replace(/\{player\}/g, profile.player.name).replace(/\{beast\}/g, beast);
}

// Lines ready for the dialogue overlay; rivals who speak become "seen".
export function resolveLines(profile, lines = []) {
  const out = [];
  for (const [speaker, text, cond] of lines) {
    if (!lineVisible(profile, cond)) continue;
    const sp = speakerOf(profile, speaker);
    if (CHARACTER_INDEX[speaker]) markSeen(profile, speaker);
    out.push({ speaker: sp.name, text: fillText(profile, text), color: sp.color, beast: sp.beast, side: speaker === 'player' ? 'right' : 'left', narrator: speaker === 'narrator' });
  }
  return out;
}

export function applyChoice(profile, node, value) {
  const S = storyState(profile);
  const opt = node.choice.options.find((o) => o.value === value) || node.choice.options[0];
  S.choices[node.choice.key] = opt.value;
  const r = grantStoryReward(profile, `${node.id}:choice`, opt.reward);
  return { option: opt, reward: r };
}

// ------------------------------------------------------------ battler creation

export function applyCreation(profile, { name, color, style, pronouns }) {
  const P = profile.player;
  if (name) P.name = name;
  if (color) P.color = color;
  if (pronouns) P.pronoun = pronouns;
  const st = STORY_STYLES.find((s) => s.id === style) || STORY_STYLES[0];
  P.archetype = st.id;
  P.created = true;
  const r = grantStoryReward(profile, 'create:style', { items: st.items });
  // a ready-to-use loadout built from the style's parts on top of a starter build
  if (r.items.length && !profile.loadouts.some((l) => l.id === 'STYLE')) {
    const base = profile.loadouts.find((l) => l.id === st.from) || profile.loadouts[0];
    const L = structuredClone(base);
    L.id = 'STYLE'; L.name = `${st.name} Start`; L.role = { striker: 'Attack', guardian: 'Defense', drifter: 'Stamina' }[st.id];
    for (const it of r.items) {
      if (it.slot === 'launcher') L.launcher = it.uid;
      else if (it.slot === 'cable') L.cable = it.uid;
      else L.parts[it.slot] = it.uid;
    }
    if (validateLoadout(profile, L).ok) {
      profile.loadouts.push(L);
      profile.activeLoadout = profile.loadouts.length - 1;
      r.loadout = L.name;
    }
  }
  return r;
}

// ------------------------------------------------------------ opponents

export function storyDifficulty(app) {
  return STORY_DIFFICULTY[app?.settings?.gameplay?.storyDifficulty || 'normal'] || STORY_DIFFICULTY.normal;
}

export function storyOpponent(profile, node, mul = 1) {
  const o = node.opponent || { training: true };
  const tier = o.tier || CHAPTER_INDEX[node.chapter]?.tier || 1;
  const baseDiff = o.difficulty ?? (TIER_DIFFICULTY[tier] + 0.04);
  const difficulty = Math.max(0.4, Math.min(1.35, baseDiff * mul));
  if (o.rival) {
    const plan = rivalPlan(profile, o.rival, tier, { seed: node.id.length * 7919 + (storyState(profile).attempts[node.id] || 0) });
    return { participant: rivalParticipant(profile, o.rival, tier, { difficulty, plan, pid: 'story-' + o.rival }), rivalId: o.rival, difficulty };
  }
  if (o.archetype) {
    const arch = ARCHETYPE_INDEX[o.archetype];
    const build = { id: 'story', parts: arch.parts, launcher: arch.launcher, cable: arch.cable };
    const items = rivalItems(`story:${node.id}`, build, tier);
    const sets = setSources([...Object.values(items.parts), items.launcher, items.cable]);
    const beast = arch.beast === 'vexscor' ? 'kerauno' : arch.beast;
    return {
      participant: {
        id: 'story-' + node.id, name: o.name || arch.name, human: false, ai: arch.ai, difficulty,
        build: items.parts, launcher: items.launcher, cable: items.cable,
        beast: node.type === 'training' ? null : { id: beast, bondLevel: Math.min(8, tier * 2), awakened: false },
        spin: arch.spin || 'R', technique: arch.technique || 'normal', color: arch.color,
        knownTechniques: ['normal', 'power', 'controlled', 'bank', 'spiral', 'phantom', 'lance'],
        modSources: sets.sources, launchMods: sets.launch,
      },
      difficulty,
    };
  }
  // training dummy: a steady stamina top that does not steer
  const dummy = participantFromDef({ ...ARCHETYPE_INDEX.drifter, beast: null }, { id: 'dummy', name: 'Training Top', ai: 'dummy', difficulty: 1 });
  return { participant: dummy, difficulty: 1 };
}

export function storySummary(profile) {
  const S = storyState(profile);
  return { completed: S.completed.length, total: CHAPTERS.length, current: currentNode(profile)?.chapter || null };
}

export { CHAPTERS, CHAPTER_INDEX, NODE_INDEX, STORY_STYLES };
