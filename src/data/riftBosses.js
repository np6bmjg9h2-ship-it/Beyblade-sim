// Rift Run bosses (rift-m6-spec.md section 4): four rivals carry a kit, a
// single visible weakness, whenever they guard a Rift (each act's pool keeps
// its three rivals; `act` is the kit's home act). A weakness is ONE conditional modifier
// source on the boss, on existing channels and conditions (data/channels.js,
// evaluateCondition in systems/modifiers.js): no new AI, no new physics. Its
// text is generated from the numbers, so it cannot drift from them.

import { describe } from '../systems/effectSpec.js';
import { ARENA_INDEX } from './arenas.js';

export const BOSS_KITS = {
  sora: { id: 'sora', act: 0, weakness: { id: 'counters', name: 'Weak to counters', hint: 'Brace and hit back right after contact.',
    cond: { type: 'afterCollision' }, deltas: [['restitutionWhenHit', 0.25], ['burstThreshold', -0.15]] } },
  daichi: { id: 'daichi', act: 1, weakness: { id: 'longfight', name: 'Weak to long fights', hint: 'Outlast him: his ball tip tires late.',
    cond: { type: 'lateBattle' }, deltas: [['tipSpinDrag', 0.35]] } },
  // The Undertow: left spin, which a right-spin attacker cannot KO (opposite-
  // spin hits tighten her lock and carry little recoil). Same-spin hits crack
  // it. Her Rift launcher turns both ways, and after a lost round she reads
  // the spin that beat her (spinRead) and launches against it next round.
  // Her Rift top runs on a bearing spike (parts): defense and stamina tops
  // must earn the spin race instead of winning it by default.
  mirelle: { id: 'mirelle', act: 2, weakness: { id: 'samespin', name: 'Cracks against her own spin', hint: 'Match her spin. She switches after a lost round, so be ready to switch back.',
    cond: { type: 'sameSpin' }, deltas: [['burstThreshold', -0.2]] }, launcher: 'launcher_twin', spinRead: 0.4, parts: { tip: 'tip_bearing' } },
  nyx: { id: 'nyx', act: 3, weakness: { id: 'tired', name: 'Brittle when tired', hint: 'Wear her down, then go for the shatter.',
    cond: { type: 'spinBelow', value: 0.4 }, deltas: [['burstThreshold', -0.25]] } },
};

export const bossKit = (id) => BOSS_KITS[id] || null;

// "For 1 s after a collision: restitution when struck +25%, lock strength -15%."
export function weaknessText(kit) {
  const w = kit?.weakness;
  return w ? describe({ cond: w.cond, deltas: w.deltas }).replace(/\.?$/, '.') : '';
}

// The boss's modifier source (origin 'weakness'; the HUD reads its id).
export const weaknessSource = (kit) => ({
  id: 'weakness:' + kit.weakness.id, name: kit.weakness.name, origin: 'weakness', cond: kit.weakness.cond, deltas: kit.weakness.deltas,
});

const groundTags = (def) => [def?.surface?.tag, ...(def?.bands || []).map((b) => b.tag)];

// The arena a node is fought in. A surface-weakness boss is moved to ground
// that has the surface (spec: "the boss node forces a slick surface"); this
// reads the node only, so map generation draws nothing extra.
export function nodeArena(node) {
  const kit = node?.type === 'boss' ? bossKit(node.rival) : null;
  const c = kit?.weakness.cond;
  if (c?.type !== 'surface' || !kit.arena) return node?.arena;
  return groundTags(ARENA_INDEX[node.arena]).some((t) => c.value.includes(t)) ? node.arena : kit.arena;
}
