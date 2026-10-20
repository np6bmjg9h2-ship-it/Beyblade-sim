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
