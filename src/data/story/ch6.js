// Story chapter 6. Node format: see ../story.js.

import { L } from './lines.js';

export default {
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
};
