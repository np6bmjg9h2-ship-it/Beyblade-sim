// Story mode: six chapters of an original anime-style story. Each chapter is
// a list of nodes:
//   scene       dialogue lines [speaker, text, cond?]; optional choice
//   create      battler creation (style, colour, pronouns)
//   training    a guided battle with objectives checked from battle events
//   battle      a story battle (rival or archetype opponent), win/lose lines
//   tournament  a story bracket run on the tournament engine
// Rewards on any node are granted once. Lines may carry a condition:
//   { flag: 'x' } | { notFlag: 'x' } | { choice: ['key', 'value'] }
// Placeholders: {player} {beast} (your bonded Bit-Beast's name)

const L = (speaker, text, cond) => (cond ? [speaker, text, cond] : [speaker, text]);

// Speakers that are not on the rival roster (rivals come from characters.js).
export const STORY_CAST = {
  narrator: { name: '', color: '#9fb0cc' },
  hollis: { name: 'Gran Hollis', color: '#e0b070', initials: 'GH' },
  vox: { name: 'DJ Vox', color: '#ff6ad5', initials: 'VX' },
  orrery: { name: 'Orrery', color: '#3df5e1', beast: 'orrery' },
  agent: { name: 'Null Agent', color: '#7a2bd9', initials: 'NA' },
  kid: { name: 'Harbor Kid', color: '#7fe3a8', initials: 'HK' },
};

export const STORY_STYLES = [
  { id: 'striker', name: 'Striker', from: 'L1', desc: 'Hit first, hit hard. Starts with a Rare Rift Talon ring and a Rubber Flat tip.', items: [{ base: 'ring_rifttalon', rarity: 'rare' }, { base: 'tip_rubberflat', rarity: 'uncommon' }] },
  { id: 'guardian', name: 'Guardian', from: 'L3', desc: 'Hold the centre and outlast every charge. Starts with a Rare Iron Wall ring and a Wide Ball tip with a matching wide-socket lock.', items: [{ base: 'ring_ironwall', rarity: 'rare' }, { base: 'tip_wideball', rarity: 'uncommon' }, { base: 'lock_widesocket', rarity: 'uncommon' }] },
  { id: 'drifter', name: 'Drifter', from: 'L2', desc: 'Win the spin race. Starts with a Rare Wide Disc, a Bearing tip and a Stabilizer Lock.', items: [{ base: 'disc_wide', rarity: 'rare' }, { base: 'tip_bearing', rarity: 'uncommon' }, { base: 'lock_stabilizer', rarity: 'uncommon' }] },
];

export const CHAPTERS = [
  // ================================================================== 1
  {
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
          L('hollis', '...So it wasn\'t a story after all. A Bit-Beast.'),
          L('hollis', 'Listen to me, {player}. A spirit doesn\'t make a top spin faster. It gives you choices — abilities, timing, a meter you fill by battling well. Use them wisely.'),
        ],
        reward: { flags: ['ch1_orrery'] },
        tutorial: 'Bit-Beasts fill a Spirit meter from collisions and perfect launches. Spend it on abilities (RT / LT, or Q / E). Open Bit-Beasts in the main menu to read bond, lore and abilities.' },
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
          L('valen', 'An unregistered Bit-Beast. Unknown origin. Rotational signature... unusual.'),
          L('valen', 'Congratulations, {player}. Enjoy the city circuit. The Syndicate will be watching your numbers.'),
          L('orrery', '...That one. His spirit is very quiet. Too quiet.'),
          L('hollis', 'Never mind him. You\'ve earned a stadium pass — the Vortex Bowl is open to you now. Chapter one of a long story, kid.'),
        ],
        reward: { flags: ['ch1_qualifier'], arenas: ['vortex'], credits: 300, xp: 250 } },
    ],
  },

  // ================================================================== 2
  {
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
          { type: 'counter', text: 'Land a successful Counter (X / F) as the attacker hits you' },
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
          L('agent', 'Battler {player}. The Null Syndicate is recruiting promising data points. Your Bit-Beast would be... optimised.'),
          L('orrery', 'No.'),
          L('agent', 'Interesting. It speaks. Mr. Crowe will want to hear about that.'),
          L('sora', 'Hey! Get lost, creep!'),
          L('narrator', 'The agent leaves without hurrying. On the floor where they stood, a card: a black circle with nothing inside it.'),
        ],
        reward: { flags: ['ch2_done'], xp: 400, credits: 400, materials: { alloy: 3, coreShard: 1 } } },
    ],
  },

  // ================================================================== 3
  {
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
          L('valen', 'Rotational output up forty percent since the harbor. Your Bit-Beast is... learning.'),
          L('valen', 'The Syndicate believes spirit is noise in the data. Remove the noise and battles become clean. Fair.'),
          L('player', 'Battles aren\'t supposed to be clean.'),
          L('valen', 'We will see. Skyfall Plateau, {player}. The national qualifiers. I\'ll be there.'),
        ],
        reward: { flags: ['ch3_done'], xp: 600, credits: 600, techniques: ['spiral'] },
        tutorial: 'Hollis taught you the Spiral Launch: a curved release that sends your top in a wide arc. Select it during launch setup.' },
    ],
  },

  // ================================================================== 4
  {
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
  },

  // ================================================================== 5
  {
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
        tutorial: 'A cold silence answers challenges now: Vexscor\'s Spirit Trial can appear in Bit-Beasts once you reach player level 14.' },
    ],
  },

  // ================================================================== 6
  {
    id: 'ch6', n: 6, title: 'Arena Zero', location: 'Arena Zero', tier: 5, color: '#ff6ad5',
    summary: 'The Championship. Everyone you\'ve battled, one bracket, and the phoenix at the top.',
    nodes: [
      { id: 'ch6_intro', type: 'scene', location: 'Arena Zero — opening ceremony',
        lines: [
          L('vox', 'LAAADIES AND GENTLEMEN, BATTLERS OF EVERY AGE — WELCOME TO ARENA ZEROOOO!'),
          L('aurelia', 'You\'re {player}? I\'ve watched every one of your matches. I\'ve been hoping we\'d meet in this stadium.'),
          L('aurelia', 'Give me everything. I mean it.'),
          L('daichi', '...Good luck. The gate is open.'),
          L('kaela', 'Go get \'em, kid! Show that phoenix some crater fire!'),
        ] },
      { id: 'ch6_sora', type: 'battle', opponent: { rival: 'sora', tier: 5 }, arena: 'standard', format: 'bo3', onLose: 'continue', title: 'Like the rooftop',
        pre: [
          L('sora', 'Hey. Before the bracket starts... one more? Just us. Like the rooftop.'),
          L('sora', 'Zephyrax and I trained every single day since Skyfall. Don\'t hold back.'),
        ],
        win: [L('sora', 'Ha... yeah. That\'s my best friend. Now go win the real thing.')],
        lose: [L('sora', 'I WON?! Okay — okay, this one doesn\'t count, you were saving yourself. Go win the real thing.')],
        reward: { items: [{ base: 'cable_carbon', rarity: 'epic' }] } },
      { id: 'ch6_eve', type: 'scene', location: 'Arena Zero — the night before the final',
        lines: [
          L('narrator', 'The stadium is empty. Work lights hum. Somewhere above, the giant screen is being tested with your name on it.'),
          L('orrery', 'You are nervous. Your launch arm has been shaking since dinner.'),
          L('hollis', 'Everyone shakes the night before. Your grandmother shook so badly she dropped her launcher in the tunnel. Then she won.'),
          L('sora', '{player}! There you are. Can I sit in your corner tomorrow? I promise I won\'t yell. Much.'),
        ],
        choice: {
          key: 'ch6_corner',
          options: [
            { value: 'together', label: '"Sit with me. We\'ll launch this one together."', reply: [L('sora', 'Together. Like always. ...I\'m going to yell, though.')] },
            { value: 'watch', label: '"Just watch me. This one\'s mine."', reply: [L('sora', 'Ha! Okay, champ. Front row. Loudest one there.')] },
          ],
        } },
      { id: 'ch6_final', type: 'tournament', tournament: 'story_zero_championship', need: 1, title: 'Arena Zero Championship',
        pre: [L('orrery', 'Whatever happens, {player} — it has been an honour to turn with you.')],
        win: [
          L('vox', 'IT\'S OVER! FOR THE FIRST TIME IN THREE YEARS — WE HAVE A NEW CHAMPION! {player}!!!'),
          L('aurelia', '...Wow. WOW. Congratulations, champion. That\'s the best I\'ve ever been beaten.'),
        ],
        lose: [L('aurelia', 'You made me sweat. Come back — I\'ll be waiting right here.'), L('hollis', 'Tune up, kid. The bracket isn\'t going anywhere.')] },
      { id: 'ch6_end', type: 'scene', location: 'Arena Zero — after the final',
        lines: [
          L('valen', 'A promise is a promise. The Syndicate is dissolved. ...Vexscor would like to stay with me. I think I would like that too.'),
          L('sora', 'CHAMPION! My best friend is the CHAMPION! I\'m going to cry. I\'m crying. Don\'t look.'),
          L('sora', 'We launched that one together, didn\'t we? I felt it. Every round.', { choice: ['ch6_corner', 'together'] }),
          L('sora', 'You said it was yours, and it WAS. I\'ve never been so loud in my life.', { choice: ['ch6_corner', 'watch'] }),
          L('hollis', 'Your grandmother would be insufferable about this. I mean that as a compliment.'),
          L('orrery', 'The first rotation never stopped, {player}. It just needed someone to keep it company.'),
          L('narrator', 'The giant screen over the harbor shows a new name this year. Somewhere on a rooftop, a kid with a battered top is watching.'),
          L('narrator', 'THE END — but the circuit is always open.'),
        ],
        reward: { flags: ['ch6_zero', 'story_complete'], arenas: ['zero'], xp: 2000, credits: 3000, titles: ['Story Champion'] } },
    ],
  },
];

export const CHAPTER_INDEX = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));
export const NODE_INDEX = Object.fromEntries(CHAPTERS.flatMap((c) => c.nodes.map((n, i) => [n.id, { ...n, chapter: c.id, index: i }])));
