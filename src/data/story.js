// Story mode: six chapters of an original anime-style story. Each chapter is
// a list of nodes:
//   scene       dialogue lines [speaker, text, cond?]; optional choice
//   create      battler creation (style, colour, pronouns)
//   training    a guided battle with objectives checked from battle events
//   battle      a story battle (rival or archetype opponent), win/lose lines
//   tournament  a story bracket run on the tournament engine
// Rewards on any node are granted once. Lines may carry a condition:
//   { flag: 'x' } | { notFlag: 'x' } | { choice: ['key', 'value'] }
// Placeholders: {player} {beast} (your bonded Spirit Chip's name)

// Chapters live in story/chNN.js, one file per chapter (add new ones to
// the list below in order). Nodes may carry `when` (a condition as above)
// to play only on one branch; battles set flags `<node>:won` / `<node>:lost`.

import ch1 from './story/ch1.js';
import ch2 from './story/ch2.js';
import ch3 from './story/ch3.js';
import ch4 from './story/ch4.js';
import ch5 from './story/ch5.js';
import ch6 from './story/ch6.js';

// Speakers that are not on the rival roster (rivals come from characters.js).
export const STORY_CAST = {
  narrator: { name: '', color: '#9fb0cc' },
  hollis: { name: 'Gran Hollis', color: '#e0b070', initials: 'GH' },
  vox: { name: 'DJ Vox', color: '#ff6ad5', initials: 'VX' },
  orrery: { name: 'Orrery', color: '#3df5e1', beast: 'orrery' },
  agent: { name: 'Null Agent', color: '#7a2bd9', initials: 'NA' },
  kid: { name: 'Harbor Kid', color: '#7fe3a8', initials: 'HK' },
};

export const STORY_STYLES = [
  { id: 'striker', name: 'Striker', from: 'L1', desc: 'Hit first, hit hard. Starts with a Rare Rift Talon ring and a Rubber Flat tip.', items: [{ base: 'ring_rifttalon', rarity: 'rare' }, { base: 'tip_rubberflat', rarity: 'uncommon' }] },
  { id: 'guardian', name: 'Guardian', from: 'L3', desc: 'Hold the centre and outlast every charge. Starts with a Rare Iron Wall ring and a Wide Ball tip with a matching wide-socket lock.', items: [{ base: 'ring_ironwall', rarity: 'rare' }, { base: 'tip_wideball', rarity: 'uncommon' }, { base: 'lock_widesocket', rarity: 'uncommon' }] },
  { id: 'drifter', name: 'Drifter', from: 'L2', desc: 'Win the spin race. Starts with a Rare Wide Disc, a Bearing tip and a Stabilizer Lock.', items: [{ base: 'disc_wide', rarity: 'rare' }, { base: 'tip_bearing', rarity: 'uncommon' }, { base: 'lock_stabilizer', rarity: 'uncommon' }] },
];

export const CHAPTERS = [ch1, ch2, ch3, ch4, ch5, ch6];

export const CHAPTER_INDEX = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));
export const NODE_INDEX = Object.fromEntries(CHAPTERS.flatMap((c) => c.nodes.map((n, i) => [n.id, { ...n, chapter: c.id, index: i }])));
