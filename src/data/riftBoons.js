// Rift boons: upgrades offered after elites and bosses (pick one of three).
// They grow with the Spirit Chip you bring: picking a boon again raises it a
// level (max 3). Some boons take their name and effect from the beast itself
// (its signature ability, its element). Same fx schema as charms
// (data/riftCharms.js).

import { BEAST_INDEX } from './beasts.js';
import { ELEMENT_STATUS, STATUSES } from './rift.js';

const D2R = Math.PI / 180;
const pct = (x) => `${Math.round(x * 100)}%`;

const sigName = (beast) => BEAST_INDEX[beast?.id]?.abilities?.signature?.name || 'Signature';
const touchStatus = (beast) => ELEMENT_STATUS[BEAST_INDEX[beast?.id]?.element] || 'scorch';

export const BOONS = [
  { id: 'flow', max: 3, name: () => 'Spirit Flow', desc: (l) => `Spirit gain +${pct(0.15 * l)}.`, fx: (l) => ({ skill: { spiritGain: 0.15 * l } }) },
  { id: 'economy', max: 3, name: () => 'Ability Economy', desc: (l) => `Ability costs -${pct(0.08 * l)}.`, fx: (l) => ({ skill: { abilityCost: 0.08 * l } }) },
  { id: 'might', max: 3, name: () => 'Spirit Might', desc: (l) => `Ability power +${pct(0.08 * l)}.`, fx: (l) => ({ skill: { abilityPower: 0.08 * l } }) },
  { id: 'linger', max: 3, name: () => 'Lingering Spirit', desc: (l) => `Ability duration +${pct(0.12 * l)}.`, fx: (l) => ({ skill: { abilityDuration: 0.12 * l } }) },
  { id: 'signature', max: 3, name: (b) => `${sigName(b)} Mastery`, desc: (l, b) => `${sigName(b)} cooldown -${pct(0.15 * l)}.`, fx: (l) => ({ skill: { signatureCooldown: 0.15 * l } }) },
  { id: 'galestep', max: 3, name: () => 'Gale Step', desc: (l) => `Dash cooldown -${pct(0.15 * l)}, dash speed +${pct(0.08 * l)}.`, fx: (l) => ({ skill: { dashCooldown: 0.15 * l, dashPower: 0.08 * l } }) },
  { id: 'riposte', max: 3, name: () => 'Riposte', desc: (l) => `Counter window +${(0.06 * l).toFixed(2)} s, counter knockback +${pct(0.08 * l)}.`, fx: (l) => ({ skill: { counterWindow: 0.06 * l, counterPower: 0.08 * l } }) },
  { id: 'irongrip', max: 3, name: () => 'Iron Grip', desc: (l) => `Grip Brace tip grip +${pct(0.1 * l)}.`, fx: (l) => ({ skill: { bracePower: 0.1 * l } }) },
  { id: 'perfectdraw', max: 3, name: () => 'Perfect Draw', desc: (l) => `Perfect launch window +${pct(0.12 * l)}, launch energy +${2 * l}%.`, fx: (l) => ({ launch: { window: 0.12 * l }, skill: { launchPower: 0.02 * l } }) },
  { id: 'keenedge', max: 3, name: () => 'Keen Edge', desc: (l) => `Blade face +${l}° while the opponent closes in.`, fx: (l) => ({ mods: [{ cond: { type: 'opponentApproaching' }, deltas: [['faceAngle', l * D2R]] }] }) },
  { id: 'bulwark', max: 3, name: () => 'Bulwark', desc: (l) => `Lock strength +${pct(0.08 * l)}.`, fx: (l) => ({ mods: [{ deltas: [['burstThreshold', 0.08 * l]] }] }) },
  { id: 'glide', max: 3, name: () => 'Glide', desc: (l) => `Tip spin drag -${pct(0.05 * l)}.`, fx: (l) => ({ mods: [{ deltas: [['tipSpinDrag', -0.05 * l]] }] }) },
  { id: 'touch', max: 3, name: (b) => `${STATUSES[touchStatus(b)].name} Touch`, desc: (l, b) => `Your hits inflict ${STATUSES[touchStatus(b)].name} ${pct(0.1 + 0.08 * (l - 1))} of the time (your Spirit Chip's element).`, fx: (l, b) => ({ status: { [touchStatus(b)]: 0.1 + 0.08 * (l - 1) } }) },
  { id: 'fortune', max: 3, name: () => 'Fortune', desc: (l) => `Sweet-spot chance +${pct(0.04 * l)}.`, fx: (l) => ({ sweet: 0.04 * l }) },
  { id: 'secondwind', max: 3, name: () => 'Second Wind', desc: (l) => `Once per round, dropping below 20% spin restores ${12 + 8 * (l - 1)}% of your launch spin.`, fx: (l) => ({ secondWind: 0.12 + 0.08 * (l - 1) }) },
  { id: 'awakened', max: 1, name: () => 'Awakened Spirit', desc: (l, b) => `${BEAST_INDEX[b?.id]?.abilities?.ultimate?.name || 'The ultimate'} is unlocked for this run.`, fx: () => ({ awaken: true }),
    available: (b) => !!b && !b.awakened && !!BEAST_INDEX[b.id]?.abilities?.ultimate },
];

export const BOON_INDEX = Object.fromEntries(BOONS.map((b) => [b.id, b]));
