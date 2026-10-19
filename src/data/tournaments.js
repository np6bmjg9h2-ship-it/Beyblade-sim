// The competitive circuit. Tournaments climb from local cups to the Arena
// Zero Championship. Each definition sets the bracket format, size, match
// formats, stadium rotation, rules (durability, repairs, loadout lock, build
// restrictions), entry requirements, the rival cast who enters, and prizes.
// All tournaments can be replayed; first wins pay a bonus and grant unlocks.

export const CIRCUIT_TIERS = [
  { tier: 1, name: 'Local', color: '#9fd7ff' },
  { tier: 2, name: 'City', color: '#7fe3a8' },
  { tier: 3, name: 'Regional', color: '#ffd84d' },
  { tier: 4, name: 'National', color: '#ff9f43' },
  { tier: 5, name: 'Championship', color: '#ff6ad5' },
  // story-only tiers (chapters 7-20)
  { tier: 6, name: 'Continental', color: '#5ad1ff' },
  { tier: 7, name: 'World', color: '#ffd166' },
  { tier: 8, name: 'Legend', color: '#ff4d6d' },
];

export const FORMAT_NAMES = {
  single: 'Single Elimination', double: 'Double Elimination', roundrobin: 'Round Robin', league: 'League + Playoffs', swiss: 'Swiss',
};

export const FORMAT_DESC = {
  single: 'Lose once and you are out. Seeds are placed so the strongest entrants meet late.',
  double: 'You must lose twice to be eliminated. Losers drop to a second bracket; its winner meets the winners\' champion in the Grand Final (a bracket reset is played if the lower-bracket finalist wins the first final).',
  roundrobin: 'Everyone battles everyone once. Standings: match wins, then round difference, then finish points.',
  league: 'A season where everyone meets once (3 points per win, 1 per draw), then the top four play elimination playoffs.',
  swiss: 'A fixed number of rounds; each round pairs entrants with the same record who have not met yet. Ranked by wins, then opponents\' wins (Buchholz), then round difference.',
};

// Difficulty of AI entrants by tier (rivals add a small bonus).
export const TIER_DIFFICULTY = { 1: 0.62, 2: 0.82, 3: 0.98, 4: 1.1, 5: 1.22, 6: 1.28, 7: 1.32, 8: 1.35 };

export const RANK_TITLES = [
  { points: 0, title: 'Newcomer' },
  { points: 80, title: 'Local Contender' },
  { points: 250, title: 'City Contender' },
  { points: 600, title: 'Regional Contender' },
  { points: 1200, title: 'National Contender' },
  { points: 2200, title: 'Circuit Elite' },
];

export function rankTitle(points) {
  let t = RANK_TITLES[0].title;
  for (const r of RANK_TITLES) if (points >= r.points) t = r.title;
  return t;
}

const place = (credits, xp, ranking, extra = {}) => ({ credits, xp, ranking, ...extra });

export const TOURNAMENTS = [
  {
    id: 'rookie_cup', name: 'Harbor Rookie Cup', tier: 1, format: 'single', size: 8, color: '#9fd7ff',
    desc: 'The harbor\'s Saturday cup for new battlers. Single-round matches until the best-of-3 final.',
    matchFormat: { default: 'single', final: 'bo3' }, arenas: ['standard'],
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: {}, fee: 0, rivals: ['sora'], fillers: ['striker', 'wall', 'drifter', 'all', 'breaker', 'striker', 'drifter'],
    prizes: {
      1: place(420, 220, 60, { loot: [{ tier: 1, minRarity: 'uncommon' }, { tier: 1, minRarity: 'rare', slots: ['launcher', 'cable'] }], materials: { scrap: 10, polymer: 4 } }),
      2: place(220, 140, 30, { loot: [{ tier: 1 }], materials: { scrap: 6 } }),
      4: place(120, 90, 15, { materials: { scrap: 4 } }),
      8: place(50, 50, 5),
    },
    firstWin: { unlocks: ['arena:vortex'], note: 'Vortex Bowl unlocked for all modes.' },
  },
  {
    id: 'garage_league', name: 'Garage League', tier: 1, format: 'league', size: 6, color: '#9fd7ff',
    desc: 'A friendly season in the back of Hollis\'s workshop. Everyone plays everyone, then the top four play off.',
    matchFormat: { default: 'single', playoff: 'bo3', final: 'bo3' }, arenas: ['standard'], playoffs: 4,
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: { level: 2 }, fee: 40, rivals: ['sora', 'juno'], fillers: ['wall', 'all', 'striker'],
    prizes: {
      1: place(480, 260, 70, { loot: [{ tier: 1, minRarity: 'rare' }], materials: { scrap: 12, polymer: 6, alloy: 2 } }),
      2: place(260, 160, 35, { loot: [{ tier: 1, minRarity: 'uncommon' }] }),
      4: place(140, 100, 18),
      6: place(60, 60, 6),
    },
    firstWin: { unlocks: ['title:Garage Legend'], note: 'Title "Garage Legend" earned.' },
  },
  {
    id: 'foundry_open', name: 'Foundry Open', tier: 2, format: 'double', size: 8, color: '#7fe3a8',
    desc: 'The old foundry\'s open bracket. Lose once and you drop to the lower bracket — lose twice and you\'re out.',
    matchFormat: { default: 'bo3', lower: 'single', final: 'bo3' }, arenas: ['standard', 'vortex'],
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: { level: 3, placed: [['rookie_cup', 4]] }, fee: 80, rivals: ['daichi', 'rook', 'sora'], fillers: ['wall', 'upper', 'all', 'drifter'],
    prizes: {
      1: place(700, 360, 110, { loot: [{ tier: 2, minRarity: 'rare' }, { tier: 2, favourSets: ['bastion'] }], materials: { scrap: 14, alloy: 4, coreShard: 1 } }),
      2: place(380, 220, 55, { loot: [{ tier: 2 }], materials: { alloy: 2 } }),
      3: place(240, 160, 30),
      4: place(180, 130, 22),
      8: place(80, 70, 8),
    },
    firstWin: { unlocks: ['technique:lance', 'arena:edgebreaker'], note: 'Lance Launch technique learned. Edgebreaker Arena unlocked.' },
  },
  {
    id: 'long_spin_classic', name: 'Long Spin Classic', tier: 2, format: 'roundrobin', size: 5, color: '#7fe3a8',
    desc: 'A stamina round robin on Kite Hill. Attack, burst and upper builds are not permitted.',
    matchFormat: { default: 'bo3' }, arenas: ['standard', 'vortex'],
    rules: { durability: true, repairs: true, lockLoadout: false, restrict: { roles: ['stamina', 'defense', 'balance'] } },
    req: { level: 4 }, fee: 60, rivals: ['juno', 'daichi'], fillers: ['drifter', 'wall'],
    prizes: {
      1: place(620, 320, 90, { loot: [{ tier: 2, minRarity: 'rare', favourSets: ['astral'] }], materials: { polymer: 8, alloy: 3 } }),
      2: place(320, 200, 45, { loot: [{ tier: 2 }] }),
      3: place(180, 130, 20),
      5: place(70, 70, 6),
    },
    firstWin: { unlocks: ['technique:phantom', 'arena:crystal'], note: 'Phantom Release technique learned. Crystal Rink unlocked.' },
  },
  {
    id: 'saltwind_regional', name: 'Saltwind Regional', tier: 3, format: 'swiss', size: 16, rounds: 4, color: '#ffd84d',
    desc: 'Sixteen battlers, four Swiss rounds. Every round pairs you with someone on the same record.',
    matchFormat: { default: 'bo3' }, arenas: ['vortex', 'crystal', 'standard', 'edgebreaker'],
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: { level: 7, ranking: 150 }, fee: 150, rivals: ['mirelle', 'theo', 'kaela', 'rook', 'juno', 'daichi', 'sora'],
    fillers: ['striker', 'wall', 'drifter', 'all', 'breaker', 'counter', 'upper', 'all'],
    prizes: {
      1: place(1100, 520, 180, { loot: [{ tier: 3, minRarity: 'epic' }, { tier: 3, minRarity: 'rare' }], materials: { alloy: 6, coreShard: 3, spiritDust: 2 } }),
      2: place(650, 340, 100, { loot: [{ tier: 3, minRarity: 'rare' }] }),
      4: place(400, 240, 60, { loot: [{ tier: 3 }] }),
      8: place(220, 160, 30),
      16: place(90, 90, 10),
    },
    firstWin: { unlocks: ['technique:spiral'], note: 'Spiral Launch technique learned.' },
  },
  {
    id: 'crater_cup', name: 'Crater Cup', tier: 3, format: 'single', size: 16, color: '#ffd84d',
    desc: 'Kaela\'s home bracket in the Magma Crater. Iron Endurance rule: no repairs until you are knocked out or win.',
    matchFormat: { default: 'bo3', final: 'bo3' }, arenas: ['magma'],
    rules: { durability: true, repairs: false, lockLoadout: true },
    req: { level: 8 }, fee: 160, rivals: ['kaela', 'rook', 'sora', 'theo'],
    fillers: ['upper', 'striker', 'breaker', 'wall', 'all', 'striker', 'upper', 'drifter', 'counter', 'all', 'wall'],
    prizes: {
      1: place(1250, 560, 190, { loot: [{ tier: 3, minRarity: 'epic', favourSets: ['solar'] }, { tier: 3, minRarity: 'rare' }], materials: { alloy: 6, coreShard: 3 } }),
      2: place(700, 360, 105, { loot: [{ tier: 3, minRarity: 'rare' }] }),
      4: place(420, 250, 60),
      8: place(240, 170, 30),
      16: place(100, 90, 10),
    },
    firstWin: { unlocks: ['arena:magma'], note: 'Magma Crater unlocked for all modes.' },
  },
  {
    id: 'national_league', name: 'National League', tier: 4, format: 'league', size: 8, playoffs: 4, color: '#ff9f43',
    desc: 'A seven-week season against the country\'s best, followed by top-four playoffs. Best-of-5 final.',
    matchFormat: { default: 'bo3', playoff: 'bo3', final: 'bo5' }, arenas: ['vortex', 'crystal', 'edgebreaker', 'magma', 'standard'],
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: { level: 12, ranking: 450 }, fee: 300, rivals: ['mirelle', 'theo', 'kaela', 'nyx', 'daichi', 'juno', 'sora'], fillers: [],
    prizes: {
      1: place(2200, 900, 320, { loot: [{ tier: 4, minRarity: 'epic' }, { tier: 4, minRarity: 'epic' }], materials: { alloy: 10, coreShard: 5, spiritDust: 4, relicFragment: 1 } }),
      2: place(1200, 600, 180, { loot: [{ tier: 4, minRarity: 'rare' }] }),
      4: place(700, 400, 100, { loot: [{ tier: 4 }] }),
      8: place(300, 220, 30),
    },
    firstWin: { unlocks: ['arena:skyfall'], note: 'Skyfall Plateau unlocked for all modes.' },
  },
  {
    id: 'skyfall_invitational', name: 'Skyfall Invitational', tier: 4, format: 'double', size: 8, color: '#ff9f43',
    desc: 'Invitation-only double elimination on the plateau. The Null Syndicate has sent an entrant.',
    matchFormat: { default: 'bo3', lower: 'bo3', final: 'bo3' }, arenas: ['skyfall', 'crystal'],
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: { level: 14, placed: [['national_league', 4]] }, fee: 350, rivals: ['nyx', 'valen', 'mirelle', 'kaela', 'theo', 'sora', 'daichi'], fillers: [],
    prizes: {
      1: place(2600, 1000, 360, { loot: [{ tier: 4, minRarity: 'legendary' }, { tier: 4, minRarity: 'epic' }], materials: { coreShard: 6, spiritDust: 5, relicFragment: 2 } }),
      2: place(1400, 650, 200, { loot: [{ tier: 4, minRarity: 'epic' }] }),
      3: place(900, 450, 120),
      4: place(700, 380, 90),
      8: place(320, 240, 30),
    },
    firstWin: { unlocks: ['title:Skyfall Victor'], note: 'Title "Skyfall Victor" earned.' },
  },
  {
    id: 'zero_championship', name: 'Arena Zero Championship', tier: 5, format: 'single', size: 16, color: '#ff6ad5',
    desc: 'The circuit\'s crown. Sixteen of the best, best-of-3 throughout and a best-of-5 final in Arena Zero.',
    matchFormat: { default: 'bo3', final: 'bo5' }, arenas: ['skyfall', 'crystal', 'magma', 'zero'], finalArena: 'zero',
    rules: { durability: true, repairs: true, lockLoadout: false },
    req: { level: 18, wonAny: ['skyfall_invitational', 'national_league'] }, fee: 500,
    rivals: ['aurelia', 'valen', 'nyx', 'mirelle', 'theo', 'kaela', 'juno', 'daichi', 'sora', 'rook'],
    fillers: ['champion', 'counter', 'upper', 'breaker', 'all'],
    prizes: {
      1: place(5000, 2000, 700, { loot: [{ tier: 4, minRarity: 'mythic' }, { tier: 4, minRarity: 'legendary' }], materials: { relicFragment: 4, coreShard: 8, spiritDust: 8 } }),
      2: place(2600, 1100, 380, { loot: [{ tier: 4, minRarity: 'legendary' }] }),
      4: place(1500, 700, 220, { loot: [{ tier: 4, minRarity: 'epic' }] }),
      8: place(800, 420, 110),
      16: place(400, 260, 40),
    },
    firstWin: { unlocks: ['arena:zero', 'title:Champion of Arena Zero'], note: 'Arena Zero unlocked. You are the Champion of Arena Zero.' },
  },
];

// Story brackets (not listed on the circuit board; entered from Story mode).
const storyPrize = (credits, xp, ranking) => ({ 1: place(credits, xp, ranking, { loot: [{ tier: 1, minRarity: 'rare' }] }), 2: place(Math.round(credits * 0.6), Math.round(xp * 0.7), Math.round(ranking * 0.5)), 4: place(Math.round(credits * 0.35), Math.round(xp * 0.5), Math.round(ranking * 0.25)), 16: place(80, 80, 5) });
export const STORY_TOURNAMENTS = [
  { id: 'story_harbor_qualifier', name: 'Harbor Rookie Qualifier', tier: 1, format: 'single', size: 8, hidden: true, story: true, color: '#9fd7ff',
    desc: 'Eight rookies, one ticket to the city circuit.', matchFormat: { default: 'single', final: 'bo3' }, arenas: ['standard'],
    rules: { durability: true, repairs: true, lockLoadout: false }, req: {}, fee: 0, rivals: ['sora', 'juno'], fillers: ['striker', 'wall', 'drifter', 'all', 'striker'],
    prizes: storyPrize(300, 200, 40) },
  { id: 'story_city_open', name: 'City Open', tier: 2, format: 'double', size: 8, hidden: true, story: true, color: '#7fe3a8',
    desc: 'The city\'s double-elimination open.', matchFormat: { default: 'bo3', lower: 'single', final: 'bo3' }, arenas: ['standard', 'vortex', 'edgebreaker'],
    rules: { durability: true, repairs: true, lockLoadout: false }, req: {}, fee: 0, rivals: ['sora', 'rook', 'mirelle', 'daichi'], fillers: ['upper', 'all', 'drifter'],
    prizes: storyPrize(500, 320, 70) },
  { id: 'story_crater_cup', name: 'Crater Invitational', tier: 3, format: 'single', size: 16, hidden: true, story: true, color: '#ffd84d',
    desc: 'Sixteen battlers on the crater rim.', matchFormat: { default: 'bo3', final: 'bo3' }, arenas: ['magma', 'standard'],
    rules: { durability: true, repairs: true, lockLoadout: false }, req: {}, fee: 0, rivals: ['kaela', 'theo', 'rook', 'sora', 'mirelle', 'juno'], fillers: ['upper', 'striker', 'breaker', 'wall', 'all', 'drifter', 'counter', 'all', 'striker'],
    prizes: storyPrize(800, 500, 110) },
  { id: 'story_national_qualifier', name: 'National Qualifier', tier: 4, format: 'swiss', size: 16, rounds: 4, hidden: true, story: true, color: '#ff9f43',
    desc: 'Four Swiss rounds on the plateau; the top three qualify for Arena Zero.', matchFormat: { default: 'bo3' }, arenas: ['skyfall', 'crystal', 'vortex', 'magma'],
    rules: { durability: true, repairs: true, lockLoadout: false }, req: {}, fee: 0, rivals: ['nyx', 'juno', 'theo', 'mirelle', 'kaela', 'daichi', 'sora'], fillers: ['champion', 'counter', 'upper', 'breaker', 'all', 'wall', 'drifter', 'striker'],
    prizes: storyPrize(1200, 700, 160) },
  { id: 'story_zero_championship', name: 'Arena Zero Championship', tier: 5, format: 'single', size: 16, hidden: true, story: true, color: '#ff6ad5',
    desc: 'The Championship.', matchFormat: { default: 'bo3', final: 'bo5' }, arenas: ['skyfall', 'crystal', 'magma', 'zero'], finalArena: 'zero',
    rules: { durability: true, repairs: true, lockLoadout: false }, req: {}, fee: 0,
    // Valen and Aurelia are kept for the scripted semi-final and final (ch6)
    rivals: ['nyx', 'mirelle', 'theo', 'kaela', 'juno', 'daichi', 'sora', 'rook'], fillers: ['champion', 'counter', 'upper', 'breaker', 'all', 'clutch', 'magna'],
    prizes: storyPrize(3000, 1500, 400) },
];

// League divisions: an eight-battler round-robin season. Top two are
// promoted, bottom two relegated (see systems/modes.js).
const leaguePrize = (c, x, r) => ({ 1: place(c, x, r, { loot: [{ tier: 1, minRarity: 'rare' }] }), 2: place(Math.round(c * 0.65), Math.round(x * 0.7), Math.round(r * 0.6), { loot: [{ tier: 1 }] }), 4: place(Math.round(c * 0.4), Math.round(x * 0.5), Math.round(r * 0.3)), 8: place(Math.round(c * 0.15), Math.round(x * 0.3), 4) });
const leagueDef = (n, tier, name, rivals, fillers, arenas, prizes) => ({
  id: `league_d${n}`, name, tier, format: 'roundrobin', size: 8, hidden: true, league: true, color: CIRCUIT_TIERS[tier - 1].color,
  desc: 'A league season: everyone meets once. Top two are promoted, bottom two relegated.', matchFormat: { default: 'bo3' }, arenas,
  rules: { durability: true, repairs: true, lockLoadout: false }, req: {}, fee: 0, rivals, fillers, prizes,
});
export const LEAGUE_DIVISIONS = [
  leagueDef(5, 1, 'Rookie Division', ['sora', 'juno'], ['striker', 'wall', 'drifter', 'all', 'breaker'], ['standard', 'vortex'], leaguePrize(400, 260, 40)),
  leagueDef(4, 2, 'Amateur Division', ['daichi', 'rook', 'sora'], ['upper', 'all', 'counter', 'drifter'], ['standard', 'vortex', 'edgebreaker'], leaguePrize(700, 420, 70)),
  leagueDef(3, 3, 'Pro Division', ['mirelle', 'theo', 'kaela'], ['champion', 'breaker', 'upper', 'wall'], ['crystal', 'magma', 'vortex', 'edgebreaker'], leaguePrize(1100, 620, 110)),
  leagueDef(2, 4, 'Master Division', ['nyx', 'kaela', 'theo', 'mirelle', 'juno'], ['champion', 'counter'], ['skyfall', 'crystal', 'magma'], leaguePrize(1700, 900, 170)),
  leagueDef(1, 5, 'Elite Division', ['aurelia', 'valen', 'nyx', 'mirelle', 'theo', 'kaela'], ['champion'], ['zero', 'skyfall', 'crystal'], leaguePrize(2600, 1300, 260)),
];

export const TOURNAMENT_INDEX = Object.fromEntries([...TOURNAMENTS, ...STORY_TOURNAMENTS, ...LEAGUE_DIVISIONS].map((t) => [t.id, t]));
