// Player skill trees. Each node changes a defined mechanic: technique
// timings, launch model, modifier channels or economy. Bonuses are modest by
// design — the player still has to aim, launch and time everything.

const D2R = Math.PI / 180;

export const SKILL_PATHS = [
  { id: 'aggressor', name: 'Aggressor', color: '#ff6a3d', desc: 'Offensive timing, controlled impact techniques and attack resource efficiency.' },
  { id: 'guardian', name: 'Guardian', color: '#9ad0ff', desc: 'Defensive timing, recovery, stability and mitigation.' },
  { id: 'endurance', name: 'Endurance Specialist', color: '#7fe3a8', desc: 'Spin management and energy efficiency.' },
  { id: 'technician', name: 'Technician', color: '#ffd84d', desc: 'Launch consistency, equipment care, crafting and build flexibility.' },
  { id: 'channeler', name: 'Bit-Beast Channeler', color: '#c6b8ff', desc: 'Ability timing, spirit flow, resonance and bond growth.' },
];

export const SKILLS = [
  // aggressor
  { id: 'agg_dash', path: 'aggressor', name: 'Dash Mastery', max: 3, req: null, desc: (r) => `Dash cooldown -${8 * r}%, dash speed +${5 * r}%.`, skill: (r) => ({ dashCooldown: 0.08 * r, dashPower: 0.05 * r }) },
  { id: 'agg_impact', path: 'aggressor', name: 'Impact Timing', max: 3, req: 'agg_dash', desc: (r) => `Blade face +${(0.5 * r).toFixed(1)}° while the opponent closes in.`, source: (r) => ({ cond: { type: 'opponentApproaching' }, deltas: [['faceAngle', 0.5 * r * D2R]] }) },
  { id: 'agg_hunter', path: 'aggressor', name: 'Edge Hunter', max: 2, req: 'agg_impact', desc: (r) => `Steering +${6 * r}% while the opponent is near the edge.`, source: (r) => ({ cond: { type: 'opponentNearEdge' }, deltas: [['steerForce', 0.06 * r]] }) },
  { id: 'agg_economy', path: 'aggressor', name: 'Attack Economy', max: 2, req: 'agg_dash', desc: (r) => `All ability costs -${5 * r}%.`, skill: (r) => ({ abilityCost: 0.05 * r }) },
  // guardian
  { id: 'grd_counter', path: 'guardian', name: 'Counter Window', max: 3, req: null, desc: (r) => `Counter Stance window +${(0.05 * r).toFixed(2)} s.`, skill: (r) => ({ counterWindow: 0.05 * r }) },
  { id: 'grd_brace', path: 'guardian', name: 'Brace Strength', max: 2, req: 'grd_counter', desc: (r) => `Grip Brace tip grip +${10 * r}%.`, skill: (r) => ({ bracePower: 0.1 * r }) },
  { id: 'grd_recover', path: 'guardian', name: 'Recovery', max: 3, req: 'grd_counter', desc: (r) => `Wobble damping +${(1.5 * r).toFixed(1)}/s for 1 s after collisions.`, source: (r) => ({ cond: { type: 'afterCollision' }, deltas: [['nutationDamping', 1.5 * r]] }) },
  { id: 'grd_lock', path: 'guardian', name: 'Lock Discipline', max: 2, req: 'grd_recover', desc: (r) => `Lock strength +${5 * r}%.`, source: (r) => ({ cond: { type: 'always' }, deltas: [['burstThreshold', 0.05 * r]] }) },
  // endurance
  { id: 'end_economy', path: 'endurance', name: 'Steering Economy', max: 3, req: null, desc: (r) => `Steering efficiency +${6 * r}%.`, source: (r) => ({ cond: { type: 'always' }, deltas: [['steerEfficiency', 0.06 * r]] }) },
  { id: 'end_glide', path: 'endurance', name: 'Smooth Glide', max: 3, req: 'end_economy', desc: (r) => `Tip spin drag -${3 * r}%.`, source: (r) => ({ cond: { type: 'always' }, deltas: [['tipSpinDrag', -0.03 * r]] }) },
  { id: 'end_late', path: 'endurance', name: 'Late Game', max: 2, req: 'end_glide', desc: (r) => `Below 30% spin: wobble damping +${2 * r}/s.`, source: (r) => ({ cond: { type: 'spinBelow', value: 0.3 }, deltas: [['nutationDamping', 2 * r]] }) },
  { id: 'end_aero', path: 'endurance', name: 'Clean Air', max: 2, req: 'end_economy', desc: (r) => `Air drag -${3 * r}%.`, source: (r) => ({ cond: { type: 'always' }, deltas: [['aeroDrag', -0.03 * r]] }) },
  // technician
  { id: 'tec_launch', path: 'technician', name: 'Launch Consistency', max: 3, req: null, desc: (r) => `Launch angle error -${6 * r}%.`, skill: (r) => ({ launchConsistency: 0.06 * r }) },
  { id: 'tec_window', path: 'technician', name: 'Release Timing', max: 3, req: 'tec_launch', desc: (r) => `Perfect window +${8 * r}%.`, launch: (r) => ({ window: 0.08 * r }) },
  { id: 'tec_power', path: 'technician', name: 'Power Draw', max: 2, req: 'tec_window', desc: (r) => `Launch energy +${2 * r}%.`, skill: (r) => ({ launchPower: 0.02 * r }) },
  { id: 'tec_wear', path: 'technician', name: 'Maintenance', max: 3, req: 'tec_launch', desc: (r) => `Equipment wear -${6 * r}%, repair costs -${5 * r}%.`, economy: (r) => ({ wear: -0.06 * r, repairCost: -0.05 * r }) },
  { id: 'tec_craft', path: 'technician', name: 'Craftsmanship', max: 2, req: 'tec_wear', desc: (r) => `Upgrade, reroll and crafting costs -${8 * r}%.`, economy: (r) => ({ craftCost: -0.08 * r }) },
  // channeler
  { id: 'chn_flow', path: 'channeler', name: 'Spirit Flow', max: 3, req: null, desc: (r) => `Spirit gain +${6 * r}%.`, skill: (r) => ({ spiritGain: 0.06 * r }) },
  { id: 'chn_power', path: 'channeler', name: 'Spirit Power', max: 3, req: 'chn_flow', desc: (r) => `Ability power +${4 * r}%.`, skill: (r) => ({ abilityPower: 0.04 * r }) },
  { id: 'chn_sustain', path: 'channeler', name: 'Sustain', max: 2, req: 'chn_power', desc: (r) => `Ability duration +${6 * r}%.`, skill: (r) => ({ abilityDuration: 0.06 * r }) },
  { id: 'chn_kinship', path: 'channeler', name: 'Kinship', max: 3, req: 'chn_flow', desc: (r) => `Bond XP +${10 * r}%.`, economy: (r) => ({ bondXp: 0.1 * r }) },
  { id: 'chn_resonance', path: 'channeler', name: 'Deep Resonance', max: 1, req: 'chn_kinship', desc: () => 'Resonance bonuses +50%.', economy: () => ({ resonance: 0.5 }) },
];

export const SKILL_INDEX = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function computeSkillEffects(ranks = {}) {
  const skillMods = {};
  const sources = [];
  const launch = {};
  const economy = {};
  const add = (o, x) => { for (const [k, v] of Object.entries(x || {})) o[k] = (o[k] || 0) + v; };
  for (const [id, r] of Object.entries(ranks)) {
    const s = SKILL_INDEX[id];
    if (!s || r <= 0) continue;
    if (s.skill) add(skillMods, s.skill(r));
    if (s.launch) add(launch, s.launch(r));
    if (s.economy) add(economy, s.economy(r));
    if (s.source) { const src = s.source(r); sources.push({ id: 'skill:' + id, name: s.name, origin: 'skill', cond: src.cond, deltas: src.deltas }); }
  }
  return { skillMods, sources, launch, economy };
}

export function canLearn(ranks, id, points) {
  const s = SKILL_INDEX[id];
  if (!s) return { ok: false, reason: 'Unknown skill' };
  const r = ranks[id] || 0;
  if (r >= s.max) return { ok: false, reason: 'Maxed' };
  if (points < 1) return { ok: false, reason: 'No skill points' };
  if (s.req && !(ranks[s.req] > 0)) return { ok: false, reason: `Requires ${SKILL_INDEX[s.req].name}` };
  return { ok: true };
}

export const respecCost = (level) => 150 + level * 60;
