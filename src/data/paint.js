// Paint: the player's own colour and finish for a part. Cosmetic only: it
// changes the model's look (systems/assembly.js copies it onto the resolved
// part the same way the item's rolled visual variant is), never the physics.
// Finishes unlock with the item's rarity, so a prism finish still shows a
// Mythic or a relic.

import { rarityRank } from './rarity.js';

export const PAINT_COLORS = [
  { id: 'white', name: 'Arena White', hex: '#e9edf2' },
  { id: 'silver', name: 'Silver', hex: '#a9b3bf' },
  { id: 'graphite', name: 'Graphite', hex: '#3a414b' },
  { id: 'black', name: 'Night Black', hex: '#1b1e24' },
  { id: 'red', name: 'Blaze Red', hex: '#e2363c' },
  { id: 'crimson', name: 'Crimson', hex: '#9e1f33' },
  { id: 'orange', name: 'Solar Orange', hex: '#ff7a1f' },
  { id: 'gold', name: 'Gold', hex: '#f0c040' },
  { id: 'lime', name: 'Volt Lime', hex: '#a6e22e' },
  { id: 'green', name: 'Forest Green', hex: '#2f9e57' },
  { id: 'teal', name: 'Teal', hex: '#1fb5a6' },
  { id: 'cyan', name: 'Sky Cyan', hex: '#3fc8ff' },
  { id: 'blue', name: 'Storm Blue', hex: '#2d62e0' },
  { id: 'navy', name: 'Navy', hex: '#1d2f6b' },
  { id: 'violet', name: 'Violet', hex: '#8a4dff' },
  { id: 'pink', name: 'Neon Pink', hex: '#ff4fb0' },
];
export const PAINT_COLOR_INDEX = Object.fromEntries(PAINT_COLORS.map((c) => [c.id, c]));

// Finish -> the lowest rarity that may wear it.
export const PAINT_FINISHES = [
  { id: 'matte', name: 'Matte', from: 'common' },
  { id: 'satin', name: 'Satin', from: 'common' },
  { id: 'gloss', name: 'Gloss', from: 'uncommon' },
  { id: 'metallic', name: 'Metallic', from: 'epic' },
  { id: 'pearl', name: 'Pearl', from: 'legendary' },
  { id: 'prism', name: 'Prism', from: 'mythic' },
];
export const PAINT_FINISH_INDEX = Object.fromEntries(PAINT_FINISHES.map((f) => [f.id, f]));

export const finishAllowed = (finishId, rarity) => {
  const f = PAINT_FINISH_INDEX[finishId];
  return !!f && rarityRank(rarity) >= rarityRank(f.from);
};
export const finishesFor = (rarity) => PAINT_FINISHES.filter((f) => finishAllowed(f.id, rarity));

// A clean copy of an item's paint: a known colour and an allowed finish,
// either may be absent (keeps the rolled look for that half).
export function cleanPaint(paint, rarity) {
  const out = {};
  if (!paint || typeof paint !== 'object') return out;
  if (PAINT_COLOR_INDEX[paint.color]) out.color = paint.color;
  if (finishAllowed(paint.finish, rarity)) out.finish = paint.finish;
  return out;
}
