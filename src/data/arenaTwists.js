// Arena twists: Rift nodes can twist a stadium for one fight. A twist is a
// pure function on a stadium def (only + - * /, so derived arenas are the
// same on every engine) and needs no new physics: it adds a friction band or
// changes the surface numbers the physics already reads. A twisted arena's id
// is "<base>+<twist>" (resolveArena in arenas.js), which is also what replays
// and saves store.

const pct = (x) => `${Math.round(x * 100)}%`;
const cm = (m) => `${+(m * 100).toFixed(1)}`;

const SLICK_BAND = { r0: 0.07, r1: 0.115, friction: 0.55, tag: 'slick' };
const GLASS = { friction: 0.6, spinDrag: 0.85, restitution: 0.05 };
const STEEP = { mul: 1.5, maxSlope: 0.45 };
const DOME = { height: 0.006, r: 0.1 };
const THIN = { wall: 0.55, minWall: 0.014, widen: 8 };

// Steepest straight run between two profile knots.
const maxSecant = (profile) => profile.reduce((m, k, i) => (i ? Math.max(m, (k[1] - profile[i - 1][1]) / (k[0] - profile[i - 1][0])) : m), 0);

export const TWISTS = [
  {
    id: 'slickring', name: 'Slick Ring', minDepth: 1, not: ['edgebreaker', 'zero', 'crystal'], color: '#bfe9ff',
    text: () => `A slick band (r ${cm(SLICK_BAND.r0)}–${cm(SLICK_BAND.r1)} cm, grip ×${SLICK_BAND.friction}) rings the centre: tops crossing it lose traction.`,
    apply: (def) => ({ ...def, bands: [...(def.bands || []), { ...SLICK_BAND }] }),
  },
  {
    id: 'glass', name: 'Glass Floor', minDepth: 1, not: ['crystal'], color: '#a8e8ff',
    text: () => `The floor is polished glass: grip ×${GLASS.friction}, spin drag -${pct(1 - GLASS.spinDrag)}, bounce +${GLASS.restitution}.`,
    apply: (def) => ({
      ...def,
      surface: {
        ...def.surface,
        friction: def.surface.friction * GLASS.friction,
        spinDrag: (def.surface.spinDrag ?? 1) * GLASS.spinDrag,
        restitution: (def.surface.restitution ?? 0.2) + GLASS.restitution,
        tag: 'ice',
      },
    }),
  },
  {
    // heights x1.5, less where that would pass the slope cap
    id: 'steep', name: 'Steep Bowl', minDepth: 2, not: ['vortex', 'magma'], color: '#c9a8ff',
    text: () => `The bowl is up to ×${STEEP.mul} steeper (slope capped at ${STEEP.maxSlope}): tops are pulled hard to the centre.`,
    apply: (def) => {
      const k = Math.min(STEEP.mul, STEEP.maxSlope / maxSecant(def.profile));
      return { ...def, profile: def.profile.map(([r, y]) => [r, y * k]) };
    },
  },
  {
    // a low hump at the centre, as Magma Crater has: tops slide off it
    id: 'dome', name: 'Dome', minDepth: 2, not: ['magma', 'zero', 'vortex'], color: '#ffc38a',
    text: () => `A ${cm(DOME.height)} cm dome rises in the centre (to r ${cm(DOME.r)} cm): tops slide off it towards the rim.`,
    apply: (def) => ({ ...def, profile: def.profile.map(([r, y]) => [r, r < DOME.r ? y + DOME.height * (1 - r / DOME.r) : y]) }),
  },
  {
    id: 'thinrim', name: 'Thin Rim', minDepth: 3, not: ['vortex', 'crystal', 'skyfall'], color: '#ff9a9a',
    text: () => `The wall is ${pct(1 - THIN.wall)} lower and every exit ${THIN.widen}° wider: ring-outs come easily.`,
    apply: (def) => ({
      ...def,
      wall: {
        ...def.wall,
        height: Math.max(THIN.minWall, def.wall.height * THIN.wall),
        openings: (def.wall.openings || []).map((o) => ({ ...o, width: o.width + THIN.widen })),
      },
    }),
  },
];
export const TWIST_INDEX = Object.fromEntries(TWISTS.map((t) => [t.id, t]));

// A new def with the twist applied (ARENAS is never mutated).
export function applyTwist(def, twistId) {
  const t = TWIST_INDEX[twistId];
  if (!t) return def;
  return { ...t.apply(def), id: `${def.id}+${t.id}`, baseId: def.id, twist: t.id, name: `${def.name} · ${t.name}` };
}

export const twistText = (twistId) => TWIST_INDEX[twistId]?.text() || '';

// Twists allowed on a stadium at a Rift depth.
export const legalTwists = (arenaId, depth) => TWISTS.filter((t) => depth >= t.minDepth && !t.not.includes(arenaId));
