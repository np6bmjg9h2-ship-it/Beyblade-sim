// The Four Founders: four legendary tops recovered through Archive research.
// Before the League and before Arena Zero, four kids from four corners of
// the world won the first world championship as one team. Their tops were
// lost when the old crater stadium fell. The Archive holds what is left.
//
// Each legend is a complete, fixed top: part definitions built one-to-one on
// the classic-series parts its founder used (an attack ring, weight disc,
// spin gear and blade base of the first plastic generation), its own
// launcher, cable and Spirit Chip (data/legendBeasts.js). Legends are not
// inventory items: the Legend loadout slot (systems/legends.js) assembles
// them from these definitions, so they never wear, level or get dismantled.
// Like relics they carry handcrafted traits (`traits`, per slot).
//
// Research: three projects per legend, paid in research and gated by player
// level and story chapters. Each finished project opens one Archive page.

import { PART_INDEX } from './parts.js';

const P = (id, over) => ({ ...structuredClone(PART_INDEX[id]), series: 'legend', tier: 5, ...over });

export const LEGENDS = [
  {
    id: 'azure', name: 'Azure Tempest', color: '#2f8bff', accent: '#e6f3ff', beast: 'seiryuga', spin: 'L', technique: 'bank', role: 'Attack',
    founder: { name: 'Ren Kazama', home: 'a kendo dojo by the harbour', nod: 'loud, always hungry, never backs down' },
    blurb: 'A left-spin attacker on a rubber grip base: it tears round the stadium and hits like a gale.',
    build: {
      // Reverse Dragon style ring: four left-spin attack edges
      ring: P('ring_quadspike', { id: 'leg_ring_azure', name: 'Reverse Drake Ring', spin: 'L', mass: 15.5, faceAngle: 17, restitution: 0.58, friction: 0.24, catch: 0.55, aero: 0.016, massDist: 0.28, role: 'attack', color: '#2f8bff' }),
      core: P('core_storm', { id: 'leg_core_azure', name: 'Gale Spin Gear', mass: 5.5, color: '#e6f3ff' }),
      // Eight Wide style disc: light, weight out at the rim
      disc: P('disc_octawide', { id: 'leg_disc_azure', name: 'Octa Wide Disc', mass: 18, color: '#b9c4d2' }),
      lock: P('lock_click3', { id: 'leg_lock_azure', name: 'Tempest Lock', threshold: 2.04, color: '#2f8bff' }),
      // Storm Grip style base: a low rubber flat
      tip: P('tip_rubberflat', { id: 'leg_tip_azure', name: 'Storm Grip Base', mu: 0.44, flatRadius: 2.7, mass: 3.6, color: '#1c2a44' }),
    },
    launcher: 'launcher_clipreverse', cable: 'cable_carbon',
    traits: { ring: [['deepHooks', 0.85], ['springSteel', 0.8]], disc: [['shockBrace', 0.7]], lock: [['tightTeeth', 0.9], ['quickSeat', 0.8]], tip: [['hardenedTip', 0.8]] },
    projects: [
      { id: 'azure1', name: 'The Torn Banner', cost: 40, req: { level: 3 }, page: 'A team banner in the Archive basement, torn in four. The blue quarter shows a dragon riding a storm, and the name REN stitched underneath in a child\'s hand.' },
      { id: 'azure2', name: 'Left-Spin Schematics', cost: 80, req: { level: 5, chapter: 'ch1' }, page: 'Ren\'s top spun left when nobody else\'s did. His grandfather, a kendo teacher, said a blade cuts best against the grain. The schematics show four edges cut the wrong way round, on purpose.' },
      { id: 'azure3', name: 'Awaken the Azure Tempest', cost: 150, req: { level: 7, chapter: 'ch2' }, page: 'The rubber base is cracked and the ring is chipped, but the chip still hums like wind in a doorway. When you rebuild it, the hum becomes a roar. Seiryuga remembers Ren. It decides it likes you too.' },
    ],
  },
  {
    id: 'vermilion', name: 'Vermilion Wing', color: '#ff4a2a', accent: '#ffe1b8', beast: 'suzakuen', spin: 'R', technique: 'normal', role: 'Balance',
    founder: { name: 'Ashen Kuroba', home: 'a cold manor nobody visited', nod: 'proud, aloof, the first to stand up for the team' },
    blurb: 'A balance top with two smash wings and a flat base that refuses to fall over.',
    build: {
      // Double Wing style ring: two wings for smash attack
      ring: P('ring_twinwing', { id: 'leg_ring_vermilion', name: 'Vermilion Wing Ring', mass: 15, faceAngle: 10, restitution: 0.5, friction: 0.22, catch: 0.4, aero: 0.018, massDist: 0.32, role: 'balance', color: '#ff4a2a' }),
      core: P('core_solar', { id: 'leg_core_vermilion', name: 'Ember Spin Gear', mass: 6.5, color: '#ffe1b8' }),
      // Eight Balance style disc
      disc: P('disc_starlobe', { id: 'leg_disc_vermilion', name: 'Octa Balance Disc', mass: 21, massDist: 0.62, color: '#b9c4d2' }),
      lock: P('lock_click3', { id: 'leg_lock_vermilion', name: 'Wing Lock', threshold: 2.04, color: '#ff4a2a' }),
      // Spiral Change style base in its flat mode: great life after death
      tip: P('tip_semiflat', { id: 'leg_tip_vermilion', name: 'Spiral Change Base', mu: 0.19, flatRadius: 1.5, ballRadius: 1.0, patchRadius: 0.3, mass: 4, color: '#3a1410' }),
    },
    launcher: 'launcher_digital', cable: 'cable_steel',
    traits: { ring: [['polished', 0.7]], core: [['afterburn', 0.8]], disc: [['rimWeighted', 0.8]], lock: [['tightTeeth', 0.9], ['quickSeat', 0.8]], tip: [['secondBreath', 0.9]] },
    projects: [
      { id: 'vermilion1', name: 'A Scorched Photograph', cost: 40, req: { level: 6 }, page: 'Four kids on a podium, one of them looking away from the camera. A fifth figure at the edge of the frame has been scratched out. On the back: "Ashen. Do not ask him to smile."' },
      { id: 'vermilion2', name: 'The Flat-Mode Base', cost: 80, req: { level: 8, chapter: 'ch2' }, page: 'Ashen\'s base had a switch: a metal point for speed, a plastic flat for staying power. Every final, he chose the flat. The notes say he hated losing more than he loved winning.' },
      { id: 'vermilion3', name: 'Awaken the Vermilion Wing', cost: 150, req: { level: 10, chapter: 'ch3' }, page: 'The chip is warm to the touch. When the top spins, the air above it shimmers and a red bird unfolds out of the heat. Suzakuen does not look at you. It does not leave either.' },
    ],
  },
  {
    id: 'white', name: 'White Fang', color: '#f4f1e6', accent: '#3ad86b', beast: 'byakkorai', spin: 'R', technique: 'controlled', role: 'Balance',
    founder: { name: 'Lin Baihu', home: 'a village high in the western mountains', nod: 'calm, quick, never forgot where he came from' },
    blurb: 'A round, clawed ring on a heavy disc and a metal base that is sharp in the middle and flat around it.',
    build: {
      // Tiger Defenser style ring: round, small claws and upper slopes
      ring: P('ring_cometarc', { id: 'leg_ring_white', name: 'Tiger Guard Ring', spin: 'R', mass: 17, faceAngle: 7, slope: 0, restitution: 0.46, friction: 0.16, catch: 0.32, aero: 0.01, massDist: 0.56, role: 'balance', color: '#f4f1e6' }),
      core: P('core_storm', { id: 'leg_core_white', name: 'Thunder Spin Gear', mass: 6, color: '#3ad86b' }),
      // Eight Heavy style disc: weight packed close in
      disc: P('disc_hexheavy', { id: 'leg_disc_white', name: 'Octa Heavy Disc', mass: 26, color: '#9aa1aa' }),
      lock: P('lock_click3', { id: 'leg_lock_white', name: 'Claw Lock', notches: 4, threshold: 2.2, recovery: 0.2, color: '#3ad86b' }),
      // Metal Change style base: sharp at the centre, flat around it
      tip: P('tip_hybrid', { id: 'leg_tip_white', name: 'Metal Change Base', mu: 0.13, ballRadius: 0.45, flatRadius: 1.8, patchRadius: 0.3, mass: 4.5, color: '#c9d1dc' }),
    },
    launcher: 'launcher_slide', cable: 'cable_silk',
    traits: { ring: [['softEdge', 0.8], ['deepHooks', 0.6]], core: [['notchGuard', 0.7]], disc: [['shockBrace', 0.85]], lock: [['tightTeeth', 0.95], ['quickSeat', 0.8]], tip: [['lowFrictionCoat', 0.8]] },
    projects: [
      { id: 'white1', name: 'Claw Marks', cost: 40, req: { level: 9 }, page: 'Every top Lin ever built has three scratches on the underside, the same three his village carves over its doors. The Archive keeps one such scratched base, too worn to spin.' },
      { id: 'white2', name: 'The Sliding Shoot', cost: 80, req: { level: 11, chapter: 'ch3' }, page: 'Lin launched at a slant on purpose. His base landed on its flat edge and swept the stadium, then stood up on its point and simply waited. Attack and stamina in one top, decided by the angle of a wrist.' },
      { id: 'white3', name: 'Awaken the White Fang', cost: 150, req: { level: 13, chapter: 'ch4' }, page: 'Static jumps from the chip to your fingers. Something white and striped pads round the stadium rim once, twice, and lies down beside your launcher. Byakkorai has chosen to come home.' },
    ],
  },
  {
    id: 'black', name: 'Black Bulwark', color: '#1f4f7a', accent: '#8fe0ff', beast: 'genbukai', spin: 'R', technique: 'controlled', role: 'Defense',
    founder: { name: 'Milo Grant', home: 'a lab town across the ocean', nod: 'cheerful, patient, laughed off every hit' },
    blurb: 'A heavy square-shelled defender on a steel ball base, packed with extra weights.',
    build: {
      // Cross Spike style ring: a square shell with four heads
      ring: P('ring_bastion', { id: 'leg_ring_black', name: 'Turtle Shell Ring', mass: 22, restitution: 0.3, friction: 0.1, catch: 0.14, aero: 0.009, massDist: 0.5, role: 'defense', color: '#1f4f7a' }),
      core: P('core_gravity', { id: 'leg_core_black', name: 'Tide Spin Gear', mass: 9, color: '#8fe0ff' }),
      // Eight Balance style disc
      disc: P('disc_starlobe', { id: 'leg_disc_black', name: 'Octa Balance Disc', mass: 21, massDist: 0.62, color: '#b9c4d2' }),
      lock: P('lock_stabilizer', { id: 'leg_lock_black', name: 'Shell Lock', notches: 6, threshold: 2.8, recovery: 0.4, color: '#1f4f7a' }),
      // SG Metal Ball style base
      tip: P('tip_steelball', { id: 'leg_tip_black', name: 'Metal Ball Base', mass: 5.5, mu: 0.22, patchRadius: 1.3, color: '#c9d1dc' }),
      // the extra metal balls in the base
      aux: P('aux_ballast', { id: 'leg_aux_black', name: 'Metal Ball Weights', mass: 6.5, color: '#9aa6b8' }),
    },
    launcher: 'launcher_windup', cable: 'cable_steel',
    traits: { ring: [['softEdge', 0.95], ['polished', 0.8]], core: [['notchGuard', 0.8]], disc: [['shockBrace', 0.9]], lock: [['tightTeeth', 0.95], ['extraNotch', 0.9]], tip: [['lowProfile', 0.9]], aux: [['shockBrace', 0.9]] },
    projects: [
      { id: 'black1', name: 'A Box of Sweets', cost: 40, req: { level: 12 }, page: 'A tin that once held toffee, now full of steel balls the size of peas. A note in the lid: "Mom says more weight = more patience. Milo."' },
      { id: 'black2', name: 'The Shell Design', cost: 80, req: { level: 14, chapter: 'ch4' }, page: 'Milo\'s mother engineered the shell: a square ring that turns hits aside instead of meeting them, on a ball base that rolls back to the centre every time. He named it after the tortoise from his bedtime stories.' },
      { id: 'black3', name: 'Awaken the Black Bulwark', cost: 150, req: { level: 16, chapter: 'ch5' }, page: 'The top settles in the middle of the stadium and does not move. A great shell rises out of the floor around it, a serpent curled about its back. Genbukai yawns. It has been waiting a very long time, and it is not in a hurry.' },
    ],
  },
];

export const LEGEND_INDEX = Object.fromEntries(LEGENDS.map((l) => [l.id, l]));
export const LEGEND_PROJECTS = LEGENDS.flatMap((l) => l.projects.map((p, i) => ({ ...p, legend: l.id, step: i })));
export const PROJECT_INDEX = Object.fromEntries(LEGEND_PROJECTS.map((p) => [p.id, p]));
