// Story chapter 4. Node format: see ../story.js.

import { L } from './lines.js';

export default {
  id: 'ch4', n: 4, title: 'Skyfall', location: 'Skyfall Plateau', tier: 4, color: '#ff9f43',
  summary: 'A stadium with almost no walls, a battler who remembers every hesitation, and the national qualifiers.',
  nodes: [
    { id: 'ch4_intro', type: 'scene', location: 'Skyfall Plateau',
      lines: [
        L('narrator', 'Skyfall Plateau: a stadium cut into a mountain top. The wall is barely a lip. Beyond it, clouds.'),
        L('juno', 'It\'s beautiful, isn\'t it? Just don\'t look down when you launch.'),
        L('juno', 'There\'s someone here you should be careful of. Nyx. They battle alone, at night, in the empty stadium.'),
      ] },
    { id: 'ch4_nyx', type: 'battle', opponent: { rival: 'nyx', tier: 4 }, arena: 'skyfall', format: 'bo3', onLose: 'retry', title: 'The Hollow Echo',
      pre: [L('nyx', '...You came to the empty stadium. Most people don\'t.'), L('nyx', 'Let\'s see if you hesitate.')],
      win: [L('nyx', 'Good. You didn\'t hesitate.'), L('nyx', 'Noctivane says your name is worth remembering.')],
      lose: [L('nyx', '...Remembered.'), L('orrery', 'They wait for your dash. Make them guess.')],
      reward: { flags: ['ch4_skyfall'], arenas: ['skyfall'], items: [{ base: 'tip_hybrid', rarity: 'rare' }] } },
    { id: 'ch4_juno', type: 'battle', opponent: { rival: 'juno', tier: 4 }, arena: 'skyfall', format: 'bo3', onLose: 'continue', title: 'The Long Breath',
      pre: [L('juno', 'A friendly match before the qualifiers? Let\'s make it last.')],
      win: [L('juno', 'That was lovely. You\'ve grown so much since Kite Hill.')],
      lose: [L('juno', 'Still spinning... see? Don\'t worry. You\'ll get me next time.')],
      reward: { credits: 300, materials: { polymer: 6 } } },
    { id: 'ch4_qual', type: 'tournament', tournament: 'story_national_qualifier', need: 3, title: 'National Qualifier',
      pre: [L('vox', 'THE NATIONAL QUALIFIER! Swiss format — four rounds, and only the top three go to Arena Zero!')],
      win: [L('vox', '{player} IS GOING TO ARENA ZERO!'), L('sora', 'YES! YES! I\'m — okay I didn\'t qualify, but YOU did! That counts! That totally counts!')],
      lose: [L('hollis', 'Top three, kid. You know what to fix. Go again.')] },
    { id: 'ch4_end', type: 'scene', location: 'Skyfall — cable car',
      lines: [
        L('sora', 'Hey, {player}. Can I tell you something? When we were kids, I always went first because I was scared you\'d be better than me.'),
        L('sora', 'You are better than me. And it\'s fine. It\'s actually really fine.'),
        L('sora', 'So go win the whole thing, okay?'),
      ],
      reward: { flags: ['ch4_done'], xp: 900, credits: 900 } },
  ],
};
