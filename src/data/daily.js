// The Daily Seed: one challenge per day, the same for everyone (the day's
// date in UTC seeds it). A fixed starting top, five opponents of rising
// skill with a rival at the end, a stadium with a twist, and after each
// battle a pick of one of three parts. Three hearts; a loss costs one.

export const DAILY = {
  battles: 5,
  hearts: 3,
  format: 'single',
  roundTime: 60,
  difficulty: [0.8, 0.9, 1.0, 1.1, 1.2],
  offerRarity: ['rare', 'rare', 'epic', 'epic'], // the picks after battles 1-4
  offerSlots: ['ring', 'disc', 'tip', 'lock'],
  level: 20,
  beastBond: 3,
};

// Score for one battle; the run adds a bonus for every heart left.
export const SCORE = {
  win: 1000, // x the opponent's skill
  finish: { out: 300, burst: 400, spin: 200, decision: 100 },
  fast: 300, // up to this much for winning quickly (full at 10 s, none at 50 s)
  perfectLaunch: 100,
  heart: 250,
};

// Stadium twists: always-on channel changes for both tops.
export const TWISTS = [
  { id: 'ice', name: 'Ice floor', desc: 'Tips slide: 25% less grip for both tops.', deltas: [['tipFriction', -0.25]] },
  { id: 'thickAir', name: 'Thick air', desc: 'Air drag is 30% higher: stamina drains faster.', deltas: [['aeroDrag', 0.3]] },
  { id: 'springWalls', name: 'Spring walls', desc: 'The walls throw tops back 25% harder.', deltas: [['wallRestitution', 0.25]] },
  { id: 'spiritStorm', name: 'Spirit storm', desc: 'Bit-Beast abilities charge 60% faster.', deltas: [['abilityCharge', 0.6]] },
  { id: 'brittle', name: 'Brittle locks', desc: 'Locks are 20% weaker: shatters come sooner.', deltas: [['burstThreshold', -0.2]] },
  { id: 'heavyHitters', name: 'Heavy hitters', desc: 'Collisions are 15% bouncier.', deltas: [['restitution', 0.15]] },
  { id: 'gripFloor', name: 'Grip floor', desc: 'Tips bite 25% harder but lose spin 10% faster.', deltas: [['tipFriction', 0.25], ['tipSpinDrag', 0.1]] },
  { id: 'calm', name: 'Calm day', desc: 'Tops settle quickly: extra wobble damping.', deltas: [['nutationDamping', 3]] },
];
export const TWIST_INDEX = Object.fromEntries(TWISTS.map((t) => [t.id, t]));
