// Bond-gated memories (unlocked at bond levels 2, 6 and 10) and Spirit Trial
// conditions for recruiting each Bit-Beast.

export const BEAST_LORE = {
  orrery: [
    'The chip warms in your palm whenever two tops collide nearby. Sometimes, at the edge of hearing, it hums a tone no stadium speaker plays.',
    'In a dream you stand in a stadium made of rings of light, one inside another, all turning at different speeds. Something at the centre is counting. It has been counting for a very long time.',
    'Orrery remembers the first rotation: before stars, before stadiums, a single spark that refused to stop. Every spirit that spins is a splinter of that refusal. It is not one of them. It is where they came from.',
  ],
  zephyrax: [
    'Zephyrax loves crosswinds. It drags your top toward open air the way a kite tugs at its string.',
    'It once raced a lightning storm across three valleys and lost by a hair. It has been looking for a rematch ever since.',
    'Its true name is a sound — the crack of a sail filling all at once. When you launch perfectly, you hear it.',
  ],
  ferrowulf: [
    'Ferrowulf circles your workbench at night, inspecting every scratch on your discs like a guard on patrol.',
    'The foundry it guarded fell silent decades ago. It stayed anyway. Loyalty, for Ferrowulf, does not expire.',
    'It does not believe in winning. It believes in still standing when the other one isn\'t.',
  ],
  pyrrhex: [
    'Pyrrhex hums a little tune whenever your spin meter dips. It is trying to encourage you.',
    'It has burned out eleven times that it remembers. Each time it came back brighter, and a little more stubborn.',
    'Its secret: it is afraid of endings. It fights them so hard because it knows exactly what they feel like.',
  ],
  abyssion: [
    'Abyssion watches your opponents more than it watches you. It is counting their habits.',
    'In the deep, it learned that the strongest current is the one that turns an attacker\'s strength back on itself.',
    'It once let an entire tournament underestimate it. It enjoyed every second.',
  ],
  kerauno: [
    'Kerauno cannot sit still. Your top vibrates faintly on the shelf when it is bored.',
    'Every bolt in its antlers is a memory of a storm it outran. It is running out of room.',
    'It chose you because you hesitate before every dash. It thinks it can cure you of that.',
  ],
  geodrome: [
    'Geodrome measures time in layers of crystal. To it, a battle is a single breath.',
    'Inside its shell, a rotation began before the mountains did, and has never stopped.',
    'It is patient because it has already seen how almost everything ends. It is still curious about you.',
  ],
  noctivane: [
    'Noctivane steals small things: a stray screw, the last word of an argument, your opponent\'s confidence.',
    'It keeps the names of forgotten battlers in its feathers. It whispers them to you before big matches.',
    'Once, it was a battler\'s shadow. The battler stopped spinning. The shadow did not.',
  ],
  magmarion: [
    'Magmarion roars at the start of every match. The crowd thinks it is a sound effect.',
    'Its mane is warm enough to fix a cracked ring if you hold the pieces close and ask nicely.',
    'It respects only one thing more than strength: an opponent who keeps standing after it roars.',
  ],
  caelumanta: [
    'Caelumanta sleeps on the updraft from your spinning top, rising a little with every rotation.',
    'It drifted across an ocean once, carried by nothing but the spin of a child\'s toy.',
    'It does not understand why battlers want to win. It only wants the spin to last.',
  ],
  vexscor: [
    'Vexscor does not hum. It listens for the click of a lock slipping.',
    'It believes every rotation is a lie told to postpone stillness. It wants to be honest with you.',
    'Its partner before you stopped battling. Vexscor still does not know whether that was a victory.',
  ],
};

// Spirit Trial recruitment conditions and champions.
export const SPIRIT_TRIALS = {
  ferrowulf: { level: 2, champion: { name: 'Foundry Echo', archetype: 'wall', difficulty: 0.8 }, hint: 'A rhythmic clanging from the old foundry district.' },
  zephyrax: { level: 3, champion: { name: 'Gale Shrine Keeper', archetype: 'striker', difficulty: 0.85 }, hint: 'The weather-vanes on the cliffs all point the same way.' },
  kerauno: { level: 4, champion: { name: 'Midnight Trader', archetype: 'upper', difficulty: 0.9 }, hint: 'Static crackles over the midnight market.' },
  geodrome: { level: 5, champion: { name: 'Quiet Miner', archetype: 'drifter', difficulty: 0.9 }, hint: 'A geode hums in the quarry.' },
  caelumanta: { level: 5, champion: { name: 'Kite Festival Champion', archetype: 'drifter', difficulty: 0.95 }, hint: 'A shape drifts above the festival kites.' },
  pyrrhex: { level: 6, champion: { name: 'Ash Stadium Ghost', archetype: 'all', difficulty: 1.0 }, hint: 'Embers glow in a burnt-out stadium at dawn.' },
  magmarion: { level: 7, champion: { name: 'Fumarole Hermit', archetype: 'upper', difficulty: 1.05 }, hint: 'The ground is warm near the crater road.' },
  abyssion: { level: 8, champion: { name: 'Trawler Captain', archetype: 'counter', difficulty: 1.1 }, hint: 'A net hauls up something that hums.' },
  noctivane: { level: 9, champion: { name: 'Empty-Stadium Voice', archetype: 'counter', difficulty: 1.15 }, hint: 'Someone answers challenges in an empty stadium.' },
  vexscor: { level: 14, story: 'ch5_null', champion: { name: 'Null Echo', archetype: 'breaker', difficulty: 1.25 }, hint: 'A cold silence where a lock just clicked.' },
};
