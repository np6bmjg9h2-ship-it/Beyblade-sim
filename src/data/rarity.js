// Rarity tiers. Rarity changes how many traits an item rolls and how strong
// they can be, special-trait eligibility, set eligibility and presentation.
// It never changes base physical stats directly, so a well-built common top
// stays competitive against a poorly assembled relic.

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#b9c1cc', traits: [0, 1], mag: [0.15, 0.5], special: 0, setChance: 0, weight: 520, dismantle: 1 },
  { id: 'uncommon', name: 'Uncommon', color: '#5fd27a', traits: [1, 1], mag: [0.25, 0.6], special: 0, setChance: 0.05, weight: 260, dismantle: 2 },
  { id: 'rare', name: 'Rare', color: '#4aa8ff', traits: [1, 2], mag: [0.35, 0.72], special: 0, setChance: 0.25, weight: 130, dismantle: 4 },
  { id: 'epic', name: 'Epic', color: '#b46bff', traits: [2, 2], mag: [0.45, 0.82], special: 0.08, setChance: 0.4, weight: 20, dismantle: 8 },
  { id: 'legendary', name: 'Legendary', color: '#ffa53c', traits: [2, 3], mag: [0.55, 0.92], special: 0.5, setChance: 0.55, weight: 8, dismantle: 16 },
  { id: 'mythic', name: 'Mythic', color: '#ff4f7b', traits: [3, 3], mag: [0.65, 0.97], special: 0.85, setChance: 0.7, weight: 2.5, dismantle: 30 },
  { id: 'relic', name: 'Relic', color: '#3df5e1', traits: [3, 3], mag: [0.75, 1.0], special: 1, setChance: 1, weight: 2, dismantle: 60 },
];

export const RARITY_INDEX = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, rank: i }]));
export const rarityRank = (id) => RARITY_INDEX[id]?.rank ?? 0;
