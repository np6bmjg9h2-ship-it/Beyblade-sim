// Story chapter 1. Node format: see ../story.js.

import { L } from './lines.js';

export default {
  id: 'ch1', n: 1, title: 'First Spin', location: 'Harbor District', tier: 1, color: '#9fd7ff',
  summary: 'An old top, a strange chip and a loud best friend. Your first steps from the harbor rooftops to the Rookie Qualifier.',
  nodes: [
    { id: 'ch1_intro', type: 'scene', location: 'Harbor District — rooftop, evening',
      lines: [
        L('narrator', 'Every spring, the giant screen over the harbor shows the Arena Zero Championship. Every spring, half the city stops to watch.'),
        L('vox', '...AND AURELIA KADE TAKES IT AGAIN! Three years undefeated, folks! Who out there is going to stop that phoenix?!'),
        L('sora', '{player}! There you are! Did you see that final? Did you SEE it?!'),
        L('sora', 'Hold on. What\'s that in your hand?'),
        L('narrator', 'A battered top from your grandmother\'s workbench. Scratched ring, cracked paint — and set into the core, a chip that is faintly, impossibly warm.'),
        L('sora', 'A real top! Okay. That settles it. You and me. Battle. Tomorrow. Old Hollis\'s workshop. No take-backs!'),
        L('narrator', 'Before you can answer, Sora is already running down the fire escape, shouting about launch angles.'),
      ] },
    { id: 'ch1_create', type: 'create' },
    { id: 'ch1_workshop', type: 'scene', location: 'Hollis Workshop — morning',
      lines: [
        L('hollis', 'So you\'re the one Sora won\'t shut up about. Let me see that top.'),
        L('hollis', '...Well. I haven\'t seen this core since your grandmother last walked through that door.'),
        L('hollis', 'Tops aren\'t magic, {player}. They\'re mass, inertia and friction. Learn that first. The magic comes later — if it comes at all.'),
        L('hollis', 'Into the practice stadium. I\'ll put a training top in there. Show me a clean launch, then show me you can hit something.'),
      ] },
    { id: 'ch1_training', type: 'training', title: 'Launch basics', coach: 'hollis', arena: 'standard',
      objectives: [
        { type: 'launch', min: 'Good', text: 'Launch with Good or Perfect timing (release in the gold band)' },
        { type: 'hits', n: 2, text: 'Steer into the training top twice' },
        { type: 'dash', text: 'Use Dash to close distance quickly' },
      ],
      tips: ['Hold the launch button to charge; release when the meter is in the gold band.', 'Steer with the left stick or WASD. Steering costs a little spin.', 'Dash (A / Space) is a burst of speed with a short cooldown.'],
      post: [
        L('hollis', 'Not bad. Your release was early — you flinch before the gold band. Everyone does at first.'),
        L('hollis', 'Remember: every time you steer, you\'re spending spin. Spin is your life. Don\'t waste it chasing.'),
      ] },
    { id: 'ch1_sora1', type: 'battle', opponent: { rival: 'sora', tier: 1, difficulty: 0.55 }, arena: 'standard', format: 'bo3', onLose: 'continue',
      title: 'Rooftop rivals',
      pre: [
        L('sora', 'Finally! Zephyrax has been rattling in my pocket all morning. Ready, {player}?'),
        L('hollis', 'Best of three. No dashes into my windows.'),
      ],
      win: [
        L('sora', 'WHAT? You\'ve had that top for one DAY!'),
        L('sora', '...Okay, that was actually amazing. Rematch later. Definitely rematch later.'),
      ],
      lose: [
        L('sora', 'HA! Zephyrax and I are unstoppable!'),
        L('sora', 'But — hey. You almost had me in that last round. Don\'t look so down.'),
      ] },
    { id: 'ch1_orrery', type: 'scene', location: 'Hollis Workshop — late night',
      lines: [
        L('narrator', 'That night the workshop is silent except for the hum of the fridge — and something else. A tone, just under hearing.'),
        L('narrator', 'The chip in your top is glowing.'),
        L('orrery', '...Rotation. Yes. You are the one who launched me.'),
        L('orrery', 'I am Orrery. I was counting before your stadiums were built. I have been counting inside this chip for a very long time.'),
        L('orrery', 'Your grandmother called me a partner. I would like to learn what that word means.'),
        L('hollis', '...So it wasn\'t a story after all. A Spirit Chip.'),
        L('hollis', 'Listen to me, {player}. A spirit doesn\'t make a top spin faster. It gives you choices — abilities, timing, a meter you fill by battling well. Use them wisely.'),
      ],
      reward: { flags: ['ch1_orrery'] },
      tutorial: 'Spirit Chips fill a Spirit meter from collisions and perfect launches. Spend it on abilities (RT / LT on a controller, F / G on the keyboard). Open Spirit Chips in the main menu to read bond, lore and abilities.' },
    { id: 'ch1_gift', type: 'scene', location: 'Hollis Workshop',
      lines: [
        L('hollis', 'If you\'re going to battle, you need parts that suit how you battle. I\'ve got three things in the back. Pick one.'),
      ],
      choice: {
        key: 'ch1_gift',
        options: [
          { value: 'blade', label: 'The Cyclone Saw ring — "for hitting things."', reward: { items: [{ base: 'ring_cyclonesaw', rarity: 'uncommon' }] }, reply: [L('hollis', 'A brawler\'s ring. Mind your spin — those teeth bite both ways.')] },
          { value: 'weight', label: 'The Heavy Ring disc — "for standing your ground."', reward: { items: [{ base: 'disc_heavyring', rarity: 'rare' }] }, reply: [L('hollis', 'Mass on the rim. Hard to push, harder to stop. Good choice.')] },
          { value: 'cord', label: 'The Long-Pull Cord — "for better launches."', reward: { items: [{ base: 'cable_long', rarity: 'rare' }] }, reply: [L('hollis', 'A longer pull stores more energy. It also takes longer to charge. Practise.')] },
        ],
      },
      tutorial: 'New parts go to your inventory. Equip them in the Workshop (Loadouts tab) — you can do that before any story battle.' },
    { id: 'ch1_daichi', type: 'battle', opponent: { rival: 'daichi', tier: 1, difficulty: 0.62 }, arena: 'standard', format: 'bo3', onLose: 'retry',
      title: 'The Iron Gate',
      pre: [
        L('narrator', 'The old foundry district. Rusted cranes, a cracked practice stadium — and a boy sitting in its centre as if he owns it.'),
        L('daichi', '...Hollis sent you. To the Rookie Qualifier, you need a sponsor\'s stamp. Mine.'),
        L('daichi', 'Move me out of the centre and I\'ll sign.'),
      ],
      win: [
        L('daichi', '...The gate opened.'),
        L('daichi', 'Here. My stamp. Don\'t make me regret it.'),
      ],
      lose: [
        L('daichi', 'Still standing.'),
        L('hollis', 'He won\'t chase you, {player}. So don\'t charge straight into him. Make him spend spin, or bring something heavier.'),
      ],
      reward: { credits: 150, items: [{ base: 'lock_ironclasp', rarity: 'uncommon' }] } },
    { id: 'ch1_juno', type: 'scene', location: 'Kite Hill',
      lines: [
        L('juno', 'Oh! You\'re the new battler with the humming chip. Everyone on Kite Hill is talking about you.'),
        L('juno', 'I\'m entering the Qualifier too. Want a tip? Watch the edges of the stadium. Everyone forgets the edges.'),
        L('narrator', 'She smiles and launches a top so smoothly it doesn\'t make a sound.'),
      ] },
    { id: 'ch1_qualifier', type: 'tournament', tournament: 'story_harbor_qualifier', need: 1, title: 'Harbor Rookie Qualifier',
      pre: [
        L('vox', 'GOOOOD AFTERNOON, HARBOR! Welcome to the Rookie Qualifier! Eight battlers, one ticket to the city circuit!'),
        L('sora', 'See you in the final, {player}. Don\'t you dare lose before then!'),
      ],
      win: [
        L('vox', 'AND THAT\'S IT! {player} WINS THE HARBOR ROOKIE QUALIFIER!'),
        L('sora', 'Okay, fine, you\'re good. You\'re REALLY good. I\'m going to train so hard you won\'t even recognise me.'),
      ],
      lose: [
        L('hollis', 'You\'ll get another shot. Tune your top, think about what beat you, and enter again.'),
      ] },
    { id: 'ch1_end', type: 'scene', location: 'Harbor Stadium — after the final',
      lines: [
        L('narrator', 'As the crowd thins out, a man in a grey coat stays in the top row, perfectly still.'),
        L('valen', 'An unregistered Spirit Chip. Unknown origin. Rotational signature... unusual.'),
        L('valen', 'Congratulations, {player}. Enjoy the city circuit. The Syndicate will be watching your numbers.'),
        L('orrery', '...That one. His spirit is very quiet. Too quiet.'),
        L('hollis', 'Never mind him. You\'ve earned a stadium pass — the Vortex Bowl is open to you now. Chapter one of a long story, kid.'),
      ],
      reward: { flags: ['ch1_qualifier'], arenas: ['vortex'], credits: 300, xp: 250 } },
  ],
};
