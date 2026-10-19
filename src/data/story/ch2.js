// Story chapter 2. Node format: see ../story.js.

import { L } from './lines.js';

export default {
  id: 'ch2', n: 2, title: 'Edge of the City', location: 'City Circuit', tier: 2, color: '#7fe3a8',
  summary: 'The city circuit is bigger, louder and full of battlers who\'ve studied you. Rook cracks locks, Mirelle cracks opponents.',
  nodes: [
    { id: 'ch2_intro', type: 'scene', location: 'Midnight Market',
      lines: [
        L('narrator', 'The city circuit runs on two things: stadium passes and rumours. Lately, the rumours are about you.'),
        L('rook', 'So THIS is the kid with the glowing chip. Nice lock. Click Lock III? Cute.'),
        L('rook', 'Tell you what. Beat me and I\'ll give you a real lock. Lose, and yours goes in my jar.'),
      ] },
    { id: 'ch2_rook', type: 'battle', opponent: { rival: 'rook', tier: 2 }, arena: 'edgebreaker', format: 'bo3', onLose: 'retry', title: 'The Lock Cracker',
      pre: [L('rook', 'Edgebreaker Arena. Wide exits, slick edges. Try not to fly off, sweetheart.')],
      win: [L('rook', 'Okay, okay! A deal\'s a deal.'), L('rook', 'Spring Lock. Five notches. Try not to need them.')],
      lose: [L('rook', 'CRACK! Into the jar it goes!'), L('hollis', '(over the phone) A heavier disc and a lock with more notches, {player}. Survive his first rush.')],
      reward: { items: [{ base: 'lock_spring', rarity: 'rare' }], flags: ['ch2_edge'], arenas: ['edgebreaker'] } },
    { id: 'ch2_mirelle_meet', type: 'scene', location: 'Saltwind Academy — practice hall',
      lines: [
        L('mirelle', 'You\'re the qualifier winner? I watched your final. Twice. You telegraph your dashes.'),
        L('mirelle', 'Left spin, by the way. Opposite spins trade spin on contact. If you\'re a stamina player, I will simply take yours.'),
        L('orrery', 'She is not wrong. But she is not as calm as she pretends.'),
      ] },
    { id: 'ch2_training', type: 'training', title: 'Counter timing', coach: 'hollis', arena: 'standard',
      opponent: { archetype: 'striker', difficulty: 0.55 },
      objectives: [
        { type: 'counter', text: 'Land a successful Counter (X on a controller, L on the keyboard) as the attacker hits you' },
        { type: 'survive', seconds: 20, text: 'Keep spinning for 20 seconds' },
      ],
      tips: ['Counter Stance opens a short window: if you are struck inside it, the attacker takes the recoil.', 'Press it just before the attacker reaches you — too early and the window closes.'],
      post: [L('hollis', 'That\'s the window. Too early and you waste it, too late and you eat the hit. Mirelle lives in that window.')] },
    { id: 'ch2_mirelle', type: 'battle', opponent: { rival: 'mirelle', tier: 2 }, arena: 'crystal', format: 'bo3', onLose: 'retry', title: 'The Undertow',
      pre: [L('mirelle', 'Crystal Rink. Low friction. You\'ll slide right into my counters.')],
      win: [L('mirelle', '...That was not in my notes.'), L('mirelle', 'Fine. You\'re worth a chapter. Don\'t let it go to your head.')],
      lose: [L('mirelle', 'As calculated.'), L('orrery', 'She waits for you to come to her. Do not.')],
      reward: { flags: ['ch2_crystal'], arenas: ['crystal'], credits: 250 } },
    { id: 'ch2_open', type: 'tournament', tournament: 'story_city_open', need: 2, title: 'City Open',
      pre: [L('vox', 'The CITY OPEN! Double elimination, folks — you have to lose TWICE to go home!'), L('sora', 'I told you I\'d train. Wait till you see Zephyrax now!')],
      win: [L('vox', 'A PODIUM FINISH FOR THE HARBOR ROOKIE!'), L('mirelle', 'Top two. Hm. I suppose that counts as respectable.')],
      lose: [L('hollis', 'Top two gets you to the regional. Go again.')] },
    { id: 'ch2_end', type: 'scene', location: 'City Open — locker room',
      lines: [
        L('agent', 'Battler {player}. The Null Syndicate is recruiting promising data points. Your Spirit Chip would be... optimised.'),
        L('orrery', 'No.'),
        L('agent', 'Interesting. It speaks. Mr. Crowe will want to hear about that.'),
        L('sora', 'Hey! Get lost, creep!'),
        L('narrator', 'The agent leaves without hurrying. On the floor where they stood, a card: a black circle with nothing inside it.'),
      ],
      reward: { flags: ['ch2_done'], xp: 400, credits: 400, materials: { alloy: 3, coreShard: 1 } } },
  ],
};
