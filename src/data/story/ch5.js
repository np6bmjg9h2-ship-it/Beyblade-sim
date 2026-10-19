// Story chapter 5. Node format: see ../story.js.

import { L } from './lines.js';

export default {
  id: 'ch5', n: 5, title: 'Null Signal', location: 'Null Syndicate Tower', tier: 4, color: '#c04bff',
  summary: 'The Null Syndicate makes its move. A gauntlet of agents, a stolen chip, and Valen Crowe.',
  nodes: [
    { id: 'ch5_intro', type: 'scene', location: 'Hollis Workshop — broken door',
      lines: [
        L('hollis', '{player}... they came last night. Grey coats. They took the schematics — your grandmother\'s notes on the Orrery core.'),
        L('orrery', 'They want to build a spirit with nothing inside. A rotation that does not care.'),
        L('mirelle', 'I traced the agents. Null Tower, east docks. I\'m coming with you — and before you say anything, it\'s for academic reasons.'),
      ] },
    { id: 'ch5_agent1', type: 'battle', opponent: { archetype: 'breaker', tier: 4, difficulty: 1.05, name: 'Null Agent Six' }, arena: 'standard', format: 'single', onLose: 'retry', title: 'Tower lobby',
      pre: [L('agent', 'Battler {player}. You are not on the guest list.')],
      win: [L('mirelle', 'Next floor. Keep moving.')],
      lose: [L('agent', 'Ejected.'), L('mirelle', 'They overcharge every launch. Let them misfire.')] },
    { id: 'ch5_agent2', type: 'battle', opponent: { archetype: 'counter', tier: 4, difficulty: 1.1, name: 'Null Agent Two' }, arena: 'crystal', format: 'single', onLose: 'retry', title: 'Tower archive',
      pre: [L('agent', 'Your counter timing is 0.04 seconds early on average. We know everything.')],
      win: [L('mirelle', 'They know your averages. Averages don\'t battle.')],
      lose: [L('orrery', 'Do not attack into their stance. Wait.')] },
    { id: 'ch5_valen', type: 'battle', opponent: { rival: 'valen', tier: 4 }, arena: 'zero', format: 'bo3', onLose: 'retry', title: 'The Null Signal',
      pre: [
        L('valen', 'You came for the schematics. They\'re on the desk. Take them — if you can beat a perfectly optimised opponent.'),
        L('valen', 'Vexscor. Silence them.'),
      ],
      win: [
        L('valen', '...Impossible. Recalculate.'),
        L('valen', 'Your spirit adapted faster than my model. That should not be possible.'),
        L('orrery', 'Because I am not a number, Valen Crowe. Neither is your partner. Listen to it.'),
        L('narrator', 'For the first time, Vexscor\'s chip flickers — a cold, uncertain light.'),
      ],
      lose: [L('valen', 'Optimal.'), L('mirelle', 'He reads your most-used style. So don\'t use it.')],
      reward: { flags: ['ch5_null'], items: [{ base: 'ring_voidmaw', rarity: 'epic' }] } },
    { id: 'ch5_end', type: 'scene', location: 'Null Tower — roof',
      lines: [
        L('valen', 'The Championship begins in a week. Aurelia Kade defends her title. I have entered.'),
        L('valen', 'If you beat me there — with everyone watching — I will dissolve the Syndicate myself.'),
        L('mirelle', 'He means it. Look at him. He actually means it.'),
        L('orrery', 'A strange spirit is listening to us from the dark, {player}. It sounds lonely. Perhaps one day it will battle beside you.'),
      ],
      reward: { flags: ['ch5_done'], xp: 1100, credits: 1200, materials: { relicFragment: 1, spiritDust: 6 } },
      tutorial: 'A cold silence answers challenges now: Vexscor\'s Spirit Trial can appear in Spirit Chips once you reach player level 14.' },
  ],
};
