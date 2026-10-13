// Challenges: hand-made battles with a build constraint and a specific goal.
// Goals are checked from the real battle result (finish types, round
// times, launch quality, lock slips, comebacks). First completion pays the
// listed reward; repeats pay a small credit bonus.

export const CHALLENGES = [
  { id: 'over_the_edge', name: 'Over the Edge', desc: 'Beat the Iron Wall on Edgebreaker Arena — every round you win must be a Ring Out.',
    opponent: { archetype: 'wall', difficulty: 0.8 }, arena: 'edgebreaker', format: 'bo3',
    goal: { finishAll: ['out'] }, reward: { credits: 350, xp: 200, loot: { tier: 1, minRarity: 'uncommon', slots: ['ring'] } } },
  { id: 'lock_breaker', name: 'Lock Breaker', desc: 'Land at least one Shatter Finish against the Long Drifter.',
    opponent: { archetype: 'drifter', difficulty: 0.8 }, arena: 'standard', format: 'bo3',
    goal: { finishAny: 'burst' }, reward: { credits: 350, xp: 200, loot: { tier: 1, minRarity: 'rare', slots: ['lock'] } } },
  { id: 'outlast', name: 'Outlast', desc: 'With a Stamina build, beat the Street Striker by Spin Finish or decision only.',
    opponent: { archetype: 'striker', difficulty: 0.85 }, arena: 'standard', format: 'bo3', constraint: { roles: ['stamina'] },
    goal: { finishAll: ['spin', 'decision'] }, reward: { credits: 400, xp: 220, loot: { tier: 1, minRarity: 'rare', slots: ['tip'] } } },
  { id: 'pure_physics', name: 'Pure Physics', desc: 'No Spirit Chip abilities for anyone. Beat the All-Rounder at Veteran skill.',
    opponent: { archetype: 'all', difficulty: 1.0 }, arena: 'vortex', format: 'bo3', rules: { abilities: false },
    goal: {}, reward: { credits: 450, xp: 260, loot: { tier: 2, minRarity: 'rare' } } },
  { id: 'blitz', name: 'Blitz', desc: 'Beat the Sky Lifter with every round you win lasting under 15 seconds.',
    opponent: { archetype: 'upper', difficulty: 0.9 }, arena: 'standard', format: 'bo3',
    goal: { maxRoundTime: 15 }, reward: { credits: 450, xp: 250, loot: { tier: 2, minRarity: 'rare', slots: ['ring', 'disc'] } } },
  { id: 'perfect_form', name: 'Perfect Form', desc: 'Win against the Counter Spinner with at least two Perfect launches.',
    opponent: { archetype: 'counter', difficulty: 0.95 }, arena: 'crystal', format: 'bo3',
    goal: { perfect: 2 }, reward: { credits: 450, xp: 260, loot: { tier: 2, minRarity: 'rare', slots: ['launcher', 'cable'] } } },
  { id: 'iron_lock', name: 'Iron Lock', desc: 'Beat the Lock Breaker without a single lock slip.',
    opponent: { archetype: 'breaker', difficulty: 0.95 }, arena: 'standard', format: 'bo3',
    goal: { noLockSlip: true }, reward: { credits: 500, xp: 280, loot: { tier: 2, minRarity: 'epic', slots: ['lock'] } } },
  { id: 'featherweight', name: 'Featherweight', desc: 'With a top under 42 g, beat the Iron Wall.',
    opponent: { archetype: 'wall', difficulty: 0.9 }, arena: 'standard', format: 'bo3', constraint: { maxMassG: 42 },
    goal: {}, reward: { credits: 500, xp: 280, loot: { tier: 2, minRarity: 'rare', slots: ['disc'] } } },
  { id: 'mirror_spin', name: 'Mirror Spin', desc: 'Beat the left-spinning Counter Spinner while launching left spin yourself. You will need a left-spin or dual launcher.',
    opponent: { archetype: 'counter', difficulty: 1.0 }, arena: 'standard', format: 'bo3', constraint: { spin: 'L' },
    goal: {}, reward: { credits: 600, xp: 320, loot: { tier: 3, minRarity: 'epic' } } },
  { id: 'last_breath', name: 'Last Breath', desc: 'Against the Circuit Champion, win a round after dropping below 20% spin — and win the match.',
    opponent: { archetype: 'champion', difficulty: 1.1 }, arena: 'standard', format: 'bo3', req: { level: 8 },
    goal: { comeback: true }, reward: { credits: 800, xp: 420, loot: { tier: 3, minRarity: 'epic' } } },
  { id: 'crater_king', name: 'Crater King', desc: 'Beat Kaela Thorn on her home slope, the Magma Crater.',
    opponent: { rival: 'kaela', tier: 3 }, arena: 'magma', format: 'bo3', req: { level: 10 },
    goal: {}, reward: { credits: 900, xp: 450, loot: { tier: 3, minRarity: 'epic', favourSets: ['solar'] } } },
  { id: 'beat_the_champion', name: 'Beat the Champion', desc: 'Defeat Aurelia Kade in a best-of-5 in Arena Zero.',
    opponent: { rival: 'aurelia', tier: 5 }, arena: 'zero', format: 'bo5', req: { level: 16 },
    goal: {}, reward: { credits: 2000, xp: 900, loot: { tier: 4, minRarity: 'legendary' }, title: 'Champion Slayer' } },
];

export const CHALLENGE_INDEX = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));
