// Story chapter 3. Node format: see ../story.js.

import { L } from './lines.js';

export default {
  id: 'ch3', n: 3, title: 'Crater Heat', location: 'Crater Road', tier: 3, color: '#ffd84d',
  summary: 'Kaela\'s crater circuit, a burning stadium, and the night Orrery remembers what it is.',
  nodes: [
    { id: 'ch3_intro', type: 'scene', location: 'Magma Crater',
      lines: [
        L('kaela', 'HA! The harbor kid made it to the crater! Welcome, welcome! Mind your soles — the stadium\'s warm today.'),
        L('kaela', 'Up here we battle on a slope. Lifters rule the crater. You ever been flipped off your own tip, kid?'),
      ] },
    { id: 'ch3_kaela', type: 'battle', opponent: { rival: 'kaela', tier: 3 }, arena: 'magma', format: 'bo3', onLose: 'retry', title: 'Crater Queen',
      pre: [L('kaela', 'Magmarion, ROAR!')],
      win: [L('kaela', 'Now THAT was a battle! You\'ve got fire, kid!'), L('kaela', 'Take this — crater-forged. You\'ll need it where you\'re going.')],
      lose: [L('kaela', 'Up and OUT! Come back when your tip stays planted!'), L('orrery', 'Stay upright. A wide, stable tip resists her flares.')],
      reward: { items: [{ base: 'core_solar', rarity: 'rare' }], flags: ['ch3_crater'], arenas: ['magma'] } },
    { id: 'ch3_resonance', type: 'scene', location: 'Magma Crater — night',
      lines: [
        L('narrator', 'Long after the crowds leave, you launch one more time, alone, into the cooling crater.'),
        L('narrator', 'The top doesn\'t slow down. The chip flares white. For a moment the whole stadium seems to turn with it.'),
        L('orrery', 'I remember now. The first rotation. Everything that spins is a splinter of it.'),
        L('orrery', 'I can give you more, {player}. Not speed — never speed. Time. When your spin is nearly gone, I can return what the battle took.'),
        L('orrery', 'Prove your bond with me, and I will awaken.'),
      ],
      reward: { flags: ['ch3_awakening'], materials: { spiritDust: 4 } },
      tutorial: 'Orrery\'s Awakening Trial unlocks once your bond reaches level 6. Bond grows by battling with Orrery equipped — especially with perfect launches and comebacks.' },
    { id: 'ch3_theo', type: 'battle', opponent: { rival: 'theo', tier: 3 }, arena: 'crystal', format: 'bo3', onLose: 'retry', title: 'The Analyst',
      pre: [L('theo', 'I\'ve logged every match you\'ve played since the qualifier. Ready to be predicted?')],
      win: [L('theo', 'Interesting! You did something that isn\'t in my data.'), L('theo', 'I\'m adding a new column just for you.')],
      lose: [L('theo', 'Hypothesis confirmed.'), L('orrery', 'He reads your last battle. So change something.')],
      reward: { credits: 400, materials: { coreShard: 2 } } },
    { id: 'ch3_cup', type: 'tournament', tournament: 'story_crater_cup', need: 1, title: 'Crater Invitational',
      pre: [L('vox', 'LIVE from the crater rim! Sixteen battlers, one blazing trophy!')],
      win: [L('vox', 'THE CRATER INVITATIONAL GOES TO {player}!'), L('kaela', 'Hah! The kid did it! Somebody get this kid a cold drink!')],
      lose: [L('kaela', 'Heat got to you, huh? Cool off and come back.')] },
    { id: 'ch3_end', type: 'scene', location: 'Crater Road',
      lines: [
        L('valen', 'Rotational output up forty percent since the harbor. Your Spirit Chip is... learning.'),
        L('valen', 'The Syndicate believes spirit is noise in the data. Remove the noise and battles become clean. Fair.'),
        L('player', 'Battles aren\'t supposed to be clean.'),
        L('valen', 'We will see. Skyfall Plateau, {player}. The national qualifiers. I\'ll be there.'),
      ],
      reward: { flags: ['ch3_done'], xp: 600, credits: 600, techniques: ['spiral'] },
      tutorial: 'Hollis taught you the Spiral Launch: a curved release that sends your top in a wide arc. Select it during launch setup.' },
  ],
};
