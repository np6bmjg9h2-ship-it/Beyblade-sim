// Declarative effect specs. Traits (and later synergies and relics) are plain
// data; compileTrait() turns a spec into the functions the game runs and a
// description generated from the same numbers, so a description can never
// promise an effect that isn't implemented. A spec may combine blocks:
//
//   ops      physical changes to the part at assembly:
//            [{ f: 'mass' | 'layer.friction', op: 'add'|'mul'|'set', v, min?, max?,
//               def? (value when the field is missing), when?: 'defined'|'truthy' }]
//   cond + deltas   modifier channels while a battle condition holds:
//            cond { type, value? } (data/channels.js), deltas [[channel, v]]
//            (faceAngle in degrees)
//   launch   launch-model keys { power, window, consistency, ... }
//   item     item keys { maxDurability, wear }
//   react    a battle trigger (game/itemEffects.js):
//            { on, min?, value?, chance?, cooldown?, limit?, effect:
//              { deltas?, duration?, stacks?, spirit?, stress?, spin? } }
//   status   hit statuses { scorch|static|rust: chance } (game/riftEffects.js)
//   grow     { by: 'mastery', from }: strength grows with the item's mastery
//   requires [{ slot, wear?|role?|base? }]: only with matching equipped parts
//   note     qualitative text appended to the generated numbers
//
// v is a number or a [low, high] range read at the item's magnitude m (0..1).

import { CHANNEL_LIMITS, CONDITIONS } from '../data/channels.js';
import { STATUSES } from '../data/rift.js';
import { PART_INDEX } from '../data/parts.js';
import { LAUNCHER_INDEX, CABLE_INDEX } from '../data/launchers.js';

const D2R = Math.PI / 180;
export const lerp = (v, m) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * m : v);

const MINUS = '−';
const sign = (x) => (x >= 0 ? '+' : MINUS);
const pct = (x) => `${sign(x)}${Math.round(Math.abs(x) * 100)}%`;
const num = (x, dec) => `${sign(x)}${Math.abs(x).toFixed(dec)}`;
const plain = (x, dec = 0) => Math.abs(x).toFixed(dec);

// ------------------------------------------------------------ physical ops

export const FIELD_INFO = {
  mass: { label: 'Mass', unit: ' g', dec: 1 },
  massDist: { label: 'Rim weighting', unit: '', dec: 2 },
  faceAngle: { label: 'Blade face', unit: '°', dec: 1 },
  rOut: { label: 'Reach', unit: ' mm', dec: 2 },
  catch: { label: 'Hook catch', unit: '', dec: 2 },
  aero: { label: 'Air drag', unit: '', dec: 3 },
  slope: { label: 'Upward slope', unit: '°', dec: 1 },
  friction: { label: 'Contact friction', unit: '', dec: 2 },
  contactFriction: { label: 'Disc contact friction', unit: '', dec: 2 },
  'layer.friction': { label: 'Skirt contact friction', unit: '', dec: 2 },
  restitution: { label: 'Restitution', unit: '', dec: 2 },
  contactRestitution: { label: 'Disc restitution', unit: '', dec: 2 },
  patchRadius: { label: 'Tip contact patch', unit: ' mm', dec: 2 },
  mu: { label: 'Tip friction', unit: '', dec: 2 },
  threshold: { label: 'Lock strength', unit: '', dec: 2 },
  recovery: { label: 'Lock reseat', unit: ' notches/s', dec: 2 },
  notches: { label: 'Lock notches', unit: '', dec: 0 },
  length: { label: 'Tip height', unit: ' mm', dec: 1 },
  height: { label: 'Lock height', unit: ' mm', dec: 1 },
  ecc: { label: 'Off-centre mass', unit: ' mm', dec: 2 },
};

function applyOp(p, o, m) {
  const path = o.f.split('.');
  let obj = p;
  for (let i = 0; i < path.length - 1; i++) { obj = obj?.[path[i]]; if (!obj) return; }
  const k = path[path.length - 1];
  const cur = obj[k];
  if (o.when === 'defined' && cur == null) return;
  if (o.when === 'truthy' && !cur) return;
  const v = lerp(o.v, m);
  const base = cur ?? o.def;
  let nv = o.op === 'add' ? base + v : o.op === 'mul' ? base * v : v;
  if (o.min != null) nv = Math.max(o.min, nv);
  if (o.max != null) nv = Math.min(o.max, nv);
  obj[k] = nv;
}

// Does op `o` do anything on this base part? (null base: unknown, assume yes)
function opApplies(o, base) {
  if (!base) return true;
  const path = o.f.split('.');
  let obj = base;
  for (let i = 0; i < path.length - 1; i++) { obj = obj?.[path[i]]; if (!obj) return false; }
  const cur = obj[path[path.length - 1]];
  if (o.when === 'defined') return cur != null;
  if (o.when === 'truthy') return !!cur;
  return true;
}

function opText(o, m, known) {
  const info = FIELD_INFO[o.f] || { label: o.f, unit: '', dec: 2 };
  const v = lerp(o.v, m);
  let t;
  if (o.op === 'mul') t = `${info.label} ${pct(v - 1)}`;
  else if (o.op === 'set') t = `${info.label} ${plain(v, info.dec)}${info.unit}`;
  else t = `${info.label} ${num(v, info.dec)}${info.unit}`;
  if (o.f === 'rOut' && o.max != null) t += ` (up to the ${o.max} mm limit)`;
  if (o.when && !known) t += ' (if the part has one)';
  return t;
}

// ------------------------------------------------------------ channels

export function channelValue(ch, v, m) {
  const x = lerp(v, m);
  return CHANNEL_LIMITS[ch]?.unit === 'deg' ? x * D2R : x;
}

function deltaText([ch, v], m) {
  const lim = CHANNEL_LIMITS[ch];
  const x = lerp(v, m);
  if (!lim) return `${ch} ${num(x, 2)}`;
  if (lim.type === 'mul') return `${lim.label} ${pct(x)}`;
  if (lim.unit === 'deg') return `${lim.label.replace(' angle', '')} ${num(x, 1)}°`;
  if (lim.unit === '/s') return `${lim.label} ${num(x, 1)}/s`;
  return `${lim.label} ${num(x, 2)}`;
}

const low = (x) => x.charAt(0).toLowerCase() + x.slice(1);
// "Mass +1.8 g, rim weighting -0.10": one clause, later labels in lower case
const clause = (texts) => texts.map((x, i) => (i ? low(x) : x)).join(', ');
export const deltasText = (deltas, m) => clause(deltas.map((d) => deltaText(d, m)));

export function condText(cond) {
  if (!cond || cond.type === 'always') return '';
  const c = CONDITIONS[cond.type];
  return c ? c.label(cond.value) : cond.type;
}

// ------------------------------------------------------------ launch / item keys

const LAUNCH_INFO = {
  power: ['Launch energy', 1], window: ['Perfect window', 1], consistency: ['Launch angle error', -1], chargeRate: ['Charge speed', 1],
  perfectBonus: ['Perfect-launch energy', 1], missPenalty: ['Mistimed-launch error', 1], techniqueVar: ['Technique variance', 1],
  controlledConsistency: ['Controlled-launch angle error', -1], overcharge: ['Misfire point', 1], wear: ['Launcher wear', 1], overchargeWear: ['Overcharge wear', 1],
};
const ITEM_INFO = { maxDurability: ['Maximum durability', 1], wear: ['Wear taken', 1] };

const keysText = (obj, info, m) => Object.entries(obj).map(([k, v]) => {
  const [label, s] = info[k] || [k, 1];
  const x = lerp(v, m) * s;
  return k === 'overcharge' ? `${label} ${sign(x)}${Math.round(Math.abs(x) * 100)}% charge` : `${label} ${pct(x)}`;
});

// ------------------------------------------------------------ reactive

export const TRIGGERS = {
  hit: { label: () => 'On a hit' },
  heavyHit: { label: () => 'On a heavy hit' },
  struck: { label: () => 'When you take a heavy hit' },
  wall: { label: () => 'On a wall bounce' },
  lockSlip: { label: () => 'When your lock slips a notch' },
  ability: { label: () => 'When you use a Bit-Beast ability' },
  dash: { label: () => 'When you dash' },
  counter: { label: () => 'When you counter' },
  lowSpin: { label: (v) => `When your spin first drops below ${Math.round(v * 100)}%` },
  edgeEscape: { label: () => 'When you pull back from the edge' },
};
export const HEAVY_HIT = 0.05; // N·s, matches the "heavy hit" the HUD calls out

function reactText(r, m) {
  const t = TRIGGERS[r.on]?.label(r.value) || r.on;
  const e = r.effect || {};
  const parts = [];
  if (e.deltas) parts.push(deltasText(e.deltas, m) + (e.duration ? ` for ${plain(lerp(e.duration, m), 1).replace(/\.0$/, '')} s` : ''));
  if (e.stacks > 1) parts.push(`stacks up to ${e.stacks}×`);
  if (e.spirit) parts.push(`+${plain(lerp(e.spirit, m), 0)} spirit`);
  if (e.stress) parts.push(`your next hit deals ×${plain(lerp(e.stress, m), 2)} lock stress`);
  if (e.spin) parts.push(`restores ${Math.round(lerp(e.spin, m) * 100)}% of your launch spin`);
  let tail = '';
  if (r.chance != null && r.chance < 1) tail += ` (${Math.round(lerp(r.chance, m) * 100)}% chance)`;
  if (r.limit === 1) tail += ' (once per round)';
  else if (r.cooldown) tail += ` (at most every ${plain(r.cooldown, 1).replace(/\.0$/, '')} s)`;
  return `${t}${tail}: ${low(parts.join(', '))}`;
}

// ------------------------------------------------------------ requirements

const WEAR_NAMES = { ball: 'a ball tip', flat: 'a flat tip', sharp: 'a sharp tip', rubber: 'a rubber tip' };
function requireText(req) {
  const an = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  return req.map((q) => (q.wear ? `with ${q.wear.map((w) => WEAR_NAMES[w] || w).join(' or ')}`
    : q.role ? `with ${an(q.role[0])} ${q.role.join(' or ')} ${q.slot === 'ring' ? 'ring' : q.slot}`
      : q.base ? `with ${PART_INDEX[q.base]?.name || q.base}` : '')).filter(Boolean).join(', ');
}

// Do the equipped parts satisfy `requires`? parts: { slot: resolved part or base def }
export function requirementsMet(requires, parts) {
  if (!requires?.length) return true;
  return requires.every((q) => {
    const p = parts?.[q.slot];
    if (!p) return false;
    if (q.wear && !q.wear.includes(p.wear)) return false;
    if (q.role && !q.role.includes(p.role)) return false;
    if (q.base && p.id !== q.base) return false;
    return true;
  });
}

// ------------------------------------------------------------ mastery growth

export const MASTERY_FULL = 5000; // Masterwork
export function growFactor(spec, item) {
  if (spec.grow?.by !== 'mastery') return 1;
  const k = Math.max(0, Math.min(1, (item?.xp || 0) / MASTERY_FULL));
  return spec.grow.from + (1 - spec.grow.from) * k;
}
// Effective magnitude of a rolled trait on an item.
export const effMag = (spec, t, item) => (t.mag ?? 1) * growFactor(spec, item);

// ------------------------------------------------------------ compile

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function compileTrait(spec) {
  const kind = spec.ops ? 'physical' : spec.deltas ? 'conditional' : spec.launch ? 'launch' : spec.item ? 'item' : spec.react ? 'reactive' : spec.status ? 'status' : 'none';
  const t = {
    id: spec.id, name: spec.name, family: spec.family, slots: spec.slots, kind,
    rarityMin: spec.rarityMin || 'common', special: !!spec.special, group: spec.group || null,
    cost: spec.cost ?? (spec.special ? 2 : spec.curse ? -1 : 1), curse: !!spec.curse, adj: spec.adj || null,
    grow: spec.grow || null, requires: spec.requires || null, spec,
  };
  if (spec.cond) t.cond = spec.cond;
  if (spec.ops) t.physical = (p, m) => { for (const o of spec.ops) applyOp(p, o, m); };
  if (spec.deltas) t.fx = (m) => spec.deltas.map(([ch, v]) => [ch, channelValue(ch, v, m)]);
  if (spec.launch) t.launch = (m) => Object.fromEntries(Object.entries(spec.launch).map(([k, v]) => [k, lerp(v, m)]));
  if (spec.item) t.item = (m) => Object.fromEntries(Object.entries(spec.item).map(([k, v]) => [k, lerp(v, m)]));
  if (spec.status) t.status = (m) => Object.fromEntries(Object.entries(spec.status).map(([k, v]) => [k, lerp(v, m)]));
  if (spec.react) {
    const r = spec.react;
    t.react = (m) => ({
      on: r.on, min: r.min ?? 0, value: r.value ?? null, chance: r.chance != null ? lerp(r.chance, m) : 1,
      cooldown: r.cooldown ?? 0, limit: r.limit ?? Infinity,
      effect: {
        deltas: r.effect.deltas ? r.effect.deltas.map(([ch, v]) => [ch, channelValue(ch, v, m)]) : null,
        duration: r.effect.duration != null ? lerp(r.effect.duration, m) : 0,
        stacks: r.effect.stacks || 1,
        spirit: r.effect.spirit != null ? lerp(r.effect.spirit, m) : 0,
        stress: r.effect.stress != null ? lerp(r.effect.stress, m) : 0,
        spin: r.effect.spin != null ? lerp(r.effect.spin, m) : 0,
      },
    });
  }
  t.desc = (m = 1, item = null) => describe(spec, item ? m * growFactor(spec, item) : m, item);
  return t;
}

const baseOfItem = (item) => (item ? item.def || PART_INDEX[item.base] || LAUNCHER_INDEX[item.base] || CABLE_INDEX[item.base] || null : null);

// Text for a spec at magnitude m, generated from its numbers. With an item,
// only the physical changes that apply to its part are listed.
export function describe(spec, m = 1, item = null) {
  const out = [];
  const req = spec.requires ? requireText(spec.requires) : '';
  if (spec.ops) {
    const base = baseOfItem(item);
    const ops = spec.ops.filter((o) => opApplies(o, base));
    out.push(clause((ops.length ? ops : spec.ops).map((o) => opText(o, m, !!base))));
  }
  if (spec.deltas) {
    const c = condText(spec.cond);
    out.push(c ? `${c}: ${low(deltasText(spec.deltas, m))}` : deltasText(spec.deltas, m));
  }
  if (spec.launch) out.push(clause(keysText(spec.launch, LAUNCH_INFO, m)));
  if (spec.item) out.push(clause(keysText(spec.item, ITEM_INFO, m)));
  if (spec.react) out.push(reactText(spec.react, m));
  if (spec.status) {
    for (const [id, v] of Object.entries(spec.status)) {
      const st = STATUSES[id];
      out.push(`Your hits inflict ${st.name} ${Math.round(lerp(v, m) * 100)}% of the time (${st.desc.replace(/\.$/, '')})`);
    }
  }
  let text = out.join('. ');
  if (req) text = cap(req) + ': ' + text.charAt(0).toLowerCase() + text.slice(1);
  text += '.';
  if (spec.grow?.by === 'mastery') {
    text += item ? ` Grows with this part's mastery: ${Math.round(growFactor(spec, item) * 100)}% strength now, full at Masterwork.` : ` Shown at full strength: starts at ${Math.round(spec.grow.from * 100)}% and grows with the part's mastery, full at Masterwork.`;
  }
  if (spec.note) text += ' ' + cap(spec.note) + (spec.note.endsWith('.') ? '' : '.');
  return text;
}
