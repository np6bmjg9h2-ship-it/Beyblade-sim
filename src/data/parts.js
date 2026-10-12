// Base part catalogue. Dimensions in millimetres and grams for readability;
// systems/assembly.js converts to SI and computes mass, centre of mass,
// inertia, contact layers and tip geometry from these numbers.
//
// Every number here has a physical meaning consumed by the simulation:
//   ring/disc/aux contact layers -> collision reach, blade face, slope, restitution, friction
//   mass + radii + massDist      -> moment of inertia (gyroscopic stability, launch spin)
//   heights                      -> centre-of-mass height, contact heights, tilt torque
//   tip geometry                 -> contact point, friction, spin drag, movement pattern
//   lock                         -> burst notches/threshold
//
// Spin naming: 'R' = clockwise seen from above (simulation spin sign -1),
// 'L' = counter-clockwise (+1), 'dual' = symmetric blades.
//
// Classic series (series: 'classic'): parts in the style of the first
// generation of tops (die-cast weight disks, thin stickered rings, bases
// with moving parts). Their mechanisms are physical and run in the
// simulation (physics/mechanisms.js):
//   ring.freeSpin     : contact surface on free-spinning rollers (no grinding)
//   lock.hullFriction : rollers on the body: a leaning top rolls, not scrapes
//   disc.magnet       : { strength }, pole N/S per item (flip it in the Workshop)
//   tip.spring        : { absorb, hop, minImpulse } coil spring round the tip
//   tip.clutch        : { mode 'hit'|'low', store, below?, dash, minImpulse?, fallback?, tip? }
//   tip.shift         : { below, tip } automatic tip change at low spin

export const SLOTS = ['ring', 'core', 'disc', 'lock', 'tip', 'aux'];
export const SLOT_NAMES = {
  ring: 'Attack Ring', core: 'Core', disc: 'Weight Disc', lock: 'Lock Assembly', tip: 'Performance Tip',
  aux: 'Auxiliary Module', launcher: 'Launcher', cable: 'Launch Cable',
};

export const ARCHITECTURES = {
  helix: { name: 'Helix-3', desc: 'Three-tab standard frame. Balanced height and mass allowance.', maxMass: 64, heightMul: 1 },
  quad: { name: 'Quad-4', desc: 'Four-tab reinforced frame. Accepts heavier builds and stronger locks.', maxMass: 72, heightMul: 1.04 },
  apex: { name: 'Apex-Low', desc: 'Low-profile frame. Lower centre of mass but only slim discs and a lighter mass budget.', maxMass: 56, heightMul: 0.88, maxDiscThickness: 3.6 },
};

const ring = (o) => ({ slot: 'ring', aero: 0.015, catch: 0.5, bladeWidth: 0.55, slope: 0, massDist: 0.2, ...o });
const core = (o) => ({ slot: 'core', ecc: 0, ...o });
const disc = (o) => ({ slot: 'disc', massDist: 0, contact: false, auxPort: false, ...o });
const lock = (o) => ({ slot: 'lock', tipSocket: 'std', auxPort: false, recovery: 0.25, ...o });
const tip = (o) => ({ slot: 'tip', socket: 'std', restitution: 1, ...o });
const aux = (o) => ({ slot: 'aux', ...o });

export const PARTS = [
  // ------------------------------------------------------------------ rings
  ring({ id: 'ring_galefang', name: 'Gale Fang', arch: ['helix', 'quad'], spin: 'R', mass: 15, rIn: 11, rOut: 25.5, rBase: 21.5, blades: 3, bladeWidth: 0.5, faceAngle: 17, thickness: 6.5, restitution: 0.55, friction: 0.26, catch: 0.55, aero: 0.02, role: 'attack', tier: 1, color: '#3fa9ff', desc: 'Three swept fangs. Strong smash when the leading faces connect; costs spin on every strike.' }),
  ring({ id: 'ring_bastion', name: 'Bastion Crown', arch: ['quad', 'helix'], spin: 'dual', mass: 21, rIn: 10, rOut: 24, rBase: 24, blades: 0, faceAngle: 0, thickness: 7, restitution: 0.42, friction: 0.18, catch: 0.15, aero: 0.009, massDist: 0.45, role: 'defense', tier: 1, color: '#9aa4b5', desc: 'A smooth, heavy circular crown. Deflects strikes and absorbs energy.' }),
  ring({ id: 'ring_tidalhalo', name: 'Tidal Halo', arch: ['helix', 'apex', 'quad'], spin: 'dual', mass: 14, rIn: 11, rOut: 24, rBase: 23, blades: 6, bladeWidth: 0.7, faceAngle: 4, thickness: 6, restitution: 0.5, friction: 0.16, catch: 0.2, aero: 0.008, massDist: 0.5, role: 'stamina', tier: 1, color: '#5fe0d0', desc: 'Six gentle crests. Low air drag and soft contact for long spins.' }),
  ring({ id: 'ring_rifttalon', name: 'Rift Talon', arch: ['helix', 'quad'], spin: 'R', mass: 16, rIn: 11, rOut: 26, rBase: 21, blades: 2, bladeWidth: 0.42, faceAngle: 14, thickness: 6, restitution: 0.5, friction: 0.28, catch: 0.7, aero: 0.026, role: 'burst', tier: 2, color: '#c04bff', desc: 'Two hooked talons that catch the opponent\'s ring and wrench its lock.' }),
  ring({ id: 'ring_solarflare', name: 'Solar Flare', arch: ['helix', 'quad', 'apex'], spin: 'R', mass: 15, rIn: 11, rOut: 25, rBase: 22, blades: 4, bladeWidth: 0.5, faceAngle: 12, slope: 14, thickness: 6.5, restitution: 0.52, friction: 0.24, catch: 0.5, aero: 0.02, role: 'upper', tier: 2, color: '#ffb33c', desc: 'Four upward-raked flares. Contacts lift the opponent, loosening its grip and lock.' }),
  ring({ id: 'ring_phantomedge', name: 'Phantom Edge', arch: ['helix', 'apex'], spin: 'L', mass: 13, rIn: 11, rOut: 24.5, rBase: 22.5, blades: 5, bladeWidth: 0.4, faceAngle: 9, thickness: 5.5, restitution: 0.48, friction: 0.13, catch: 0.35, aero: 0.016, role: 'balance', tier: 2, color: '#8a7dff', desc: 'Left-spin ring with five slim edges. Low friction glancing contacts; steals spin from right-spin opponents.' }),
  ring({ id: 'ring_ironwall', name: 'Iron Wall', arch: ['quad'], spin: 'dual', mass: 23, rIn: 10, rOut: 24.5, rBase: 23.5, blades: 8, bladeWidth: 0.6, faceAngle: 5, thickness: 7.5, restitution: 0.4, friction: 0.21, catch: 0.25, aero: 0.014, massDist: 0.55, role: 'defense', tier: 2, color: '#7f8b99', desc: 'Octagonal heavy wall. Eight low studs spread impacts.' }),
  ring({ id: 'ring_cyclonesaw', name: 'Cyclone Saw', arch: ['helix', 'quad'], spin: 'R', mass: 16, rIn: 11, rOut: 25.5, rBase: 22, blades: 6, bladeWidth: 0.45, faceAngle: 15, thickness: 6, restitution: 0.56, friction: 0.27, catch: 0.6, aero: 0.03, role: 'attack', tier: 3, color: '#ff5a5a', desc: 'Six saw teeth: frequent smash contacts, heavy air drag.' }),
  ring({ id: 'ring_cometarc', name: 'Comet Arc', arch: ['helix', 'apex', 'quad'], spin: 'dual', mass: 16, rIn: 11, rOut: 25, rBase: 22.5, blades: 3, bladeWidth: 0.55, faceAngle: 13, thickness: 6, restitution: 0.52, friction: 0.17, catch: 0.5, aero: 0.011, massDist: 0.4, role: 'balance', tier: 2, color: '#ffd84d', desc: 'Symmetric arcs that strike in either spin direction.' }),
  ring({ id: 'ring_aegisprism', name: 'Aegis Prism', arch: ['quad', 'helix'], spin: 'dual', mass: 19, rIn: 10, rOut: 24.5, rBase: 23, blades: 3, bladeWidth: 0.8, faceAngle: 3, slope: -10, thickness: 7, restitution: 0.45, friction: 0.19, catch: 0.2, aero: 0.012, massDist: 0.4, role: 'defense', tier: 3, color: '#7fe3ff', desc: 'Three broad prisms with downward-raked faces that press attackers into the floor.' }),
  ring({ id: 'ring_voidmaw', name: 'Void Maw', arch: ['quad', 'helix'], spin: 'L', mass: 17, rIn: 11, rOut: 26, rBase: 21.5, blades: 3, bladeWidth: 0.45, faceAngle: 16, thickness: 6.5, restitution: 0.53, friction: 0.26, catch: 0.8, aero: 0.026, role: 'burst', tier: 4, color: '#3c2a5e', desc: 'Left-spin jaws with deep hooks for lock-wrenching counter-spin battles.' }),
  ring({ id: 'ring_hoophalo', name: 'Hoop Halo', series: 'classic', arch: ['helix', 'quad'], spin: 'dual', mass: 13, rIn: 11, rOut: 26.5, rBase: 26.5, blades: 0, faceAngle: 0, thickness: 5, restitution: 0.36, friction: 0.14, catch: 0.1, aero: 0.021, massDist: 0.85, role: 'stamina', tier: 2, color: '#ffd21f', desc: 'A wide, thin hoop on three spokes with nearly all its mass at the very edge: long spins and a round wall that turns attacks aside. The open hoop catches the air.' }),
  ring({ id: 'ring_rollerguard', name: 'Roller Guard', series: 'classic', arch: ['helix', 'quad'], spin: 'dual', mass: 18, rIn: 10, rOut: 25, rBase: 23, blades: 2, bladeWidth: 0.24, faceAngle: 0, thickness: 6.5, restitution: 0.4, friction: 0.2, catch: 0.1, aero: 0.012, massDist: 0.4, freeSpin: 0.7, role: 'defense', tier: 3, color: '#2a2f3a', desc: 'Two free-spinning rollers stand out from a round guard. Hits on the rollers roll off instead of grinding spin away.' }),
  ring({ id: 'ring_quadspike', name: 'Quad Spike', series: 'classic', arch: ['helix', 'quad', 'apex'], spin: 'dual', mass: 16, rIn: 11, rOut: 25.5, rBase: 22, blades: 4, bladeWidth: 0.3, faceAngle: 17, thickness: 6, restitution: 0.56, friction: 0.22, catch: 0.6, aero: 0.016, massDist: 0.25, role: 'attack', tier: 1, color: '#2fa84f', desc: 'Four diamond spikes that strike in either spin. Hard, springy hits: big knockback for both tops.' }),
  ring({ id: 'ring_twinwing', name: 'Twin Wing', series: 'classic', arch: ['helix', 'quad'], spin: 'R', mass: 15, rIn: 11, rOut: 26, rBase: 20, blades: 2, bladeWidth: 0.5, faceAngle: 9, slope: 18, thickness: 6, restitution: 0.5, friction: 0.24, catch: 0.55, aero: 0.024, massDist: 0.2, role: 'upper', tier: 2, color: '#e8402a', desc: 'Two broad swept wings with steep upward slopes. Hits lift the opponent off its tip.' }),
  ring({ id: 'ring_starlance', name: 'Star Lance', arch: ['helix', 'quad', 'apex'], spin: 'R', mass: 14, rIn: 11, rOut: 26.5, rBase: 21, blades: 5, bladeWidth: 0.35, faceAngle: 18, thickness: 5.5, restitution: 0.57, friction: 0.24, catch: 0.5, aero: 0.028, role: 'attack', tier: 4, color: '#e8f0ff', desc: 'Five lance points at the widest legal radius. Devastating reach, fragile spin economy.' }),

  // ------------------------------------------------------------------ cores
  core({ id: 'core_helix', name: 'Helix Core', arch: 'helix', mass: 5, radius: 9, height: 5, affinity: 'neutral', tier: 1, color: '#d9e2ec', desc: 'Standard three-tab core. Perfectly centred.' }),
  core({ id: 'core_quad', name: 'Quad Core', arch: 'quad', mass: 7, radius: 9.5, height: 5.5, affinity: 'neutral', tier: 1, color: '#bfc8d4', desc: 'Four-tab reinforced core for heavy builds.' }),
  core({ id: 'core_apex', name: 'Apex Core', arch: 'apex', mass: 4, radius: 8.5, height: 3.5, affinity: 'neutral', tier: 2, color: '#e9eef5', desc: 'Low-profile core. Lowers the whole stack.' }),
  core({ id: 'core_lunar', name: 'Lunar Offset Core', arch: 'helix', mass: 6, radius: 9, height: 5, ecc: 0.28, affinity: 'abyss', tier: 2, color: '#a0b4ff', desc: 'Deliberately off-centre mass. Produces a walking, unpredictable path and vibration.' }),
  core({ id: 'core_resonant', name: 'Resonant Core', arch: 'helix', mass: 5, radius: 9, height: 5.5, affinity: 'spirit', tier: 2, color: '#ffe08a', desc: 'Tuned crystal core that channels Bit-Beast energy more efficiently.' }),
  core({ id: 'core_gravity', name: 'Gravity Core', arch: 'quad', mass: 9, radius: 10, height: 4.5, affinity: 'iron', tier: 3, color: '#6d7480', desc: 'Dense tungsten-weighted core sitting low in the stack.' }),
  core({ id: 'core_storm', name: 'Storm Core', arch: 'helix', mass: 5, radius: 9, height: 5, affinity: 'storm', tier: 3, color: '#68c8ff', desc: 'Vented core with a storm-aligned resonance channel.' }),
  core({ id: 'core_solar', name: 'Solar Core', arch: 'quad', mass: 6, radius: 9.5, height: 5, affinity: 'solar', tier: 3, color: '#ffbe55', desc: 'Sun-glass core that stores ability charge.' }),

  // ------------------------------------------------------------------ discs
  disc({ id: 'disc_ten', name: 'Ten Disc', mass: 18, rIn: 6, rOut: 19.5, thickness: 4.5, massDist: 0.1, tier: 1, color: '#b8bec8', desc: 'A balanced general-purpose disc.' }),
  disc({ id: 'disc_heavyring', name: 'Heavy Ring Disc', mass: 25, rIn: 6, rOut: 20.5, thickness: 5, massDist: 0.75, tier: 2, color: '#8d939c', desc: 'Mass concentrated at the rim: high spin inertia and gyroscopic stability, slower to accelerate.' }),
  disc({ id: 'disc_feather', name: 'Feather Disc', mass: 11, rIn: 6, rOut: 18, thickness: 3, massDist: 0, tier: 1, color: '#e3e7ec', desc: 'Light and slim. Fast and nimble, easily pushed around.' }),
  disc({ id: 'disc_wide', name: 'Wide Disc', mass: 21, rIn: 6, rOut: 23, thickness: 4, massDist: 0.4, contact: true, contactRestitution: 0.4, contactFriction: 0.24, tier: 2, color: '#a1a8b3', desc: 'Extends past the ring\'s base radius and takes low hits as a secondary contact surface.' }),
  disc({ id: 'disc_counter', name: 'Counterweight Disc', mass: 20, rIn: 6, rOut: 19.5, thickness: 5, massDist: 0.3, ecc: 0.18, tier: 2, color: '#9c8f7a', desc: 'Asymmetric weighting that makes the top walk and vibrate.' }),
  disc({ id: 'disc_orbit', name: 'Orbit Disc', mass: 19, rIn: 6, rOut: 20, thickness: 4.5, massDist: 0.6, auxPort: true, tier: 2, color: '#a8b8c8', desc: 'Rim-weighted disc with a skirt mount for auxiliary modules.' }),
  disc({ id: 'disc_compact', name: 'Compact Disc', mass: 15, rIn: 6, rOut: 19, thickness: 3.2, massDist: 0.35, tier: 2, color: '#c9ced6', desc: 'Dense and slim. Fits the Apex frame.' }),
  disc({ id: 'disc_hexheavy', name: 'Hex Heavy', series: 'classic', mass: 24, rIn: 6, rOut: 18.5, thickness: 4.5, massDist: 0.15, tier: 1, color: '#9aa1aa', desc: 'A compact six-sided slab of die-cast metal: the most mass for its size. Keeps the top low, heavy and hard to shift.' }),
  disc({ id: 'disc_octawide', name: 'Octa Wide', series: 'classic', mass: 17, rIn: 6, rOut: 22.5, thickness: 3.6, massDist: 0.85, contact: true, contactRestitution: 0.42, contactFriction: 0.2, tier: 2, color: '#aab2bd', desc: 'A thin eight-sided rim on four spokes. Almost all its mass sits at the edge: big spin inertia for its weight, and the rim takes low hits.' }),
  disc({ id: 'disc_starlobe', name: 'Star Lobe', series: 'classic', mass: 20, rIn: 6, rOut: 21, thickness: 4, massDist: 0.6, tier: 2, color: '#a3a9b3', desc: 'Five lobes with a bolt hole at each point. The mass out in the lobes puts more swing behind every hit.' }),
  disc({ id: 'disc_magna', name: 'Magna Disc', series: 'classic', mass: 19, rIn: 6, rOut: 19.5, thickness: 4.5, massDist: 0.3, magnet: { strength: 1 }, tier: 3, color: '#24262c', desc: "A magnet sealed in black resin, N on one face and S on the other (flip it in the Workshop). It pulls on the other top's metal; opposite poles snap together and matching poles push apart." }),
  disc({ id: 'disc_titan', name: 'Titan Disc', mass: 29, rIn: 6, rOut: 21, thickness: 5.5, massDist: 0.6, tier: 4, color: '#6f7682', desc: 'The heaviest legal disc. Enormous inertia, punishing to launch.' }),

  // ------------------------------------------------------------------ locks
  lock({ id: 'lock_click3', name: 'Click Lock III', arch: ['helix', 'quad', 'apex'], mass: 4, radius: 10, height: 6, notches: 3, threshold: 1.92, tier: 1, color: '#d0d5dd', desc: 'Three-notch lock. Reliable middle ground.' }),
  lock({ id: 'lock_ironclasp', name: 'Iron Clasp', arch: ['quad'], mass: 6, radius: 10.5, height: 6.5, notches: 5, threshold: 2.16, recovery: 0.15, tier: 2, color: '#8e959f', desc: 'Five deep notches. Very hard to shatter.' }),
  lock({ id: 'lock_snap', name: 'Snap Lock', arch: ['helix', 'apex'], mass: 3, radius: 9.5, height: 5, notches: 2, threshold: 1.68, recovery: 0.4, tier: 1, color: '#eef1f5', desc: 'Light two-notch lock. Saves weight; shatters easily.' }),
  lock({ id: 'lock_spring', name: 'Spring Lock', arch: ['helix', 'quad'], mass: 4.5, radius: 10, height: 6, notches: 3, threshold: 1.80, recovery: 1.1, tier: 2, color: '#c7f0d8', desc: 'Spring-loaded teeth reseat partial slips quickly.' }),
  lock({ id: 'lock_stabilizer', name: 'Stabilizer Lock', arch: ['helix', 'quad'], mass: 5, radius: 10.5, height: 6, notches: 3, threshold: 1.98, auxPort: true, tier: 2, color: '#b9c9da', desc: 'Lock with a band mount for stabilising modules.' }),
  lock({ id: 'lock_roller', name: 'Twin Roller', series: 'classic', arch: ['helix', 'quad'], mass: 5, radius: 12, height: 6, notches: 3, threshold: 1.86, hullFriction: 0.08, tier: 2, color: '#5d7a3a', desc: 'Two free-spinning rollers on the sides. A leaning top rolls on them instead of scraping, so it lasts longer at low spin and recovers from hard hits.' }),
  lock({ id: 'lock_widesocket', name: 'Wide-Socket Lock', arch: ['helix', 'quad'], mass: 4.5, radius: 10.5, height: 6, notches: 3, threshold: 1.86, tipSocket: 'wide', tier: 2, color: '#d6cfc1', desc: 'Accepts wide-socket performance tips.' }),

  // ------------------------------------------------------------------ tips
  tip({ id: 'tip_needle', name: 'Needle', mass: 2.5, length: 10, bodyRadius: 6, ballRadius: 0.45, flatRadius: 0, mu: 0.2, patchRadius: 0.44, compliance: 0.12, wear: 'sharp', tier: 1, color: '#f0f0f0', desc: 'A hardened point. Minimal friction, minimal movement: built for endurance.' }),
  tip({ id: 'tip_pivotball', name: 'Pivot Ball', mass: 3, length: 10, bodyRadius: 6.5, ballRadius: 2.6, flatRadius: 0, mu: 0.19, patchRadius: 0.8, compliance: 0.12, wear: 'ball', tier: 1, color: '#e0e6ee', desc: 'A rounded ball: stable, resists toppling, drifts gently.' }),
  tip({ id: 'tip_flatstrike', name: 'Flat Strike', mass: 3, length: 9.5, bodyRadius: 7, ballRadius: 0.7, flatRadius: 2.4, mu: 0.28, patchRadius: 0.65, compliance: 0.12, wear: 'flat', tier: 1, color: '#ffffff', desc: 'Hard flat face. Rim contact drives fast, aggressive movement.' }),
  tip({ id: 'tip_rubberflat', name: 'Rubber Flat', mass: 3.5, length: 9.5, bodyRadius: 7, ballRadius: 0.9, flatRadius: 2.8, mu: 0.4, patchRadius: 1, compliance: 0.18, restitution: 0.6, wear: 'rubber', tier: 2, color: '#2b2b2b', desc: 'High-grip rubber. Explosive acceleration and spin drain.' }),
  tip({ id: 'tip_semiflat', name: 'Semi-Flat', mass: 3, length: 10, bodyRadius: 6.5, ballRadius: 1.1, flatRadius: 0.9, mu: 0.17, patchRadius: 0.28, compliance: 0.13, wear: 'flat', tier: 1, color: '#f4f4f4', desc: 'A small flat: controllable movement with moderate stamina.' }),
  tip({ id: 'tip_wideball', name: 'Wide Ball', mass: 3.5, length: 9, bodyRadius: 8, ballRadius: 4.2, flatRadius: 0, mu: 0.22, patchRadius: 1.4, compliance: 0.12, socket: 'wide', wear: 'ball', tier: 2, color: '#dfe6f0', desc: 'Broad ball (wide socket). Very hard to topple; slides under pressure.' }),
  tip({ id: 'tip_bearing', name: 'Bearing Spike', mass: 4, length: 11, bodyRadius: 6.5, ballRadius: 0.5, flatRadius: 0, mu: 0.12, patchRadius: 0.24, compliance: 0.12, wear: 'sharp', tier: 3, color: '#c9d4e2', desc: 'A free-rotating spike on a micro bearing. Spin drag nearly vanishes.' }),
  tip({ id: 'tip_griphold', name: 'Grip Hold', mass: 3.5, length: 9.5, bodyRadius: 7, ballRadius: 1.4, flatRadius: 1.2, mu: 0.45, patchRadius: 0.9, compliance: 0.16, restitution: 0.6, wear: 'rubber', tier: 2, color: '#3a3330', desc: 'Rubber semi-flat that bites the floor and resists being pushed.' }),
  tip({ id: 'tip_orbit', name: 'Orbit Flat', mass: 3.5, length: 9, bodyRadius: 8, ballRadius: 0.8, flatRadius: 3.6, mu: 0.24, patchRadius: 0.8, compliance: 0.12, socket: 'wide', wear: 'flat', tier: 3, color: '#f6f9ff', desc: 'Wide plastic flat (wide socket). Sweeping orbits around the stadium.' }),
  tip({ id: 'tip_steelball', name: 'Steel Ball', series: 'classic', mass: 5, length: 9.5, bodyRadius: 7, ballRadius: 2.4, flatRadius: 0, mu: 0.12, patchRadius: 0.9, compliance: 0.12, restitution: 0.85, wear: 'ball', tier: 2, color: '#c9d1dc', desc: 'A heavy steel ball in a wide cup. Very low friction and a low centre of mass: hard to push, slides around attacks.' }),
  tip({ id: 'tip_springjump', name: 'Spring Jump', series: 'classic', mass: 3.5, length: 10.5, bodyRadius: 6.5, ballRadius: 1.2, flatRadius: 0.6, mu: 0.2, patchRadius: 0.5, compliance: 0.14, wear: 'ball', spring: { absorb: 0.28, hop: 0.55, minImpulse: 0.012 }, tier: 2, color: '#3be05a', desc: 'A coil spring round the tip soaks up hard hits (less knockback) and kicks the top into a hop.' }),
  tip({ id: 'tip_clutchhit', name: 'Hit Clutch', series: 'classic', mass: 4.5, length: 10.5, bodyRadius: 7, ballRadius: 0.9, flatRadius: 1.6, mu: 0.22, patchRadius: 0.55, compliance: 0.12, wear: 'flat', clutch: { mode: 'hit', store: 0.12, dash: 1.1, minImpulse: 0.01, fallback: 8, tip: { mu: 0.27, flatRadius: 2.1, patchRadius: 0.65 } }, tier: 3, color: '#f4f6fb', desc: 'An engine gear wound at launch. The first hard hit trips the clutch: the stored spin comes back, the top lunges at its opponent and drops onto its wide attack flat.' }),
  tip({ id: 'tip_clutchfinal', name: 'Final Clutch', series: 'classic', mass: 4.5, length: 10.5, bodyRadius: 7, ballRadius: 0.5, flatRadius: 0, mu: 0.18, patchRadius: 0.38, compliance: 0.12, wear: 'sharp', clutch: { mode: 'low', store: 0.12, below: 0.32, dash: 0.5, tip: { mu: 0.3, flatRadius: 1.8, patchRadius: 0.7, ballRadius: 0.9 } }, tier: 3, color: '#2b6cff', desc: 'Holds part of the launch in a wound spring. When spin runs low the clutch lets go: a burst of spin and a flat tip for one last charge.' }),
  tip({ id: 'tip_autoshift', name: 'Auto Shift', series: 'classic', mass: 3.5, length: 10.5, bodyRadius: 6.5, ballRadius: 0.5, flatRadius: 0, mu: 0.19, patchRadius: 0.36, compliance: 0.12, wear: 'sharp', shift: { below: 0.5, tip: { ballRadius: 2.2, patchRadius: 1.0, mu: 0.2 } }, tier: 2, color: '#1f5fd6', desc: 'A sharp point for the opening. When spin falls below half, weights inside slide out and a wide ball drops into place to hold the top steady.' }),
  tip({ id: 'tip_hybrid', name: 'Hybrid Spike', mass: 3, length: 10.5, bodyRadius: 6.5, ballRadius: 0.9, flatRadius: 0.8, mu: 0.22, patchRadius: 0.6, compliance: 0.12, wear: 'sharp', tier: 3, color: '#eaeaea', desc: 'Sharp centre with a narrow flat collar: endurance until tilted, then movement.' }),

  // ------------------------------------------------------------------ aux
  aux({ id: 'aux_freespin', name: 'Free-Spin Band', mount: 'crown', mass: 4, layer: { radius: 24.5, thickness: 3, zOffset: 2.5, restitution: 0.45, friction: 0.3, freeSpin: 0.8 }, tier: 2, color: '#e9f6ff', desc: 'An outer ring on a bearing. Contacts no longer grind your spin away.' }),
  aux({ id: 'aux_gyro', name: 'Gyro Ring', mount: 'band', mass: 5, ringRadius: [16, 21], tier: 2, color: '#c0c6d0', desc: 'A rim weight around the lock: more spin inertia, more stability.' }),
  aux({ id: 'aux_wedge', name: 'Upper Wedge Skirt', mount: 'skirt', mass: 4, layer: { radius: 23.5, thickness: 3, zOffset: -1, restitution: 0.5, friction: 0.3, slope: 20, blades: 4, bladeWidth: 0.6, faceAngle: 6, catch: 0.4 }, tier: 3, color: '#ffcf70', desc: 'A low raked skirt that wedges under opponents and lifts them.' }),
  aux({ id: 'aux_damper', name: 'Impact Damper', mount: 'crown', mass: 3, damp: 0.78, tier: 2, color: '#b8a6ff', desc: 'Elastomer inserts in the ring: absorbs collisions (lower restitution) at a small stamina cost.' }),
  aux({ id: 'aux_ballast', name: 'Ballast Weights', mount: 'band', mass: 6, ringRadius: [9, 12], lowMount: true, tier: 1, color: '#7c838d', desc: 'Low-slung weights that drop the centre of mass.' }),
];

export const PART_INDEX = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export function partsForSlot(slot) {
  return PARTS.filter((p) => p.slot === slot);
}
