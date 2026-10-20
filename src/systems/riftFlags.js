// Rift Run: lasting event consequences (run.flags) that reach a battle.
// Pure: reads the run and the node, never rolls run.counter, so the scout
// sheet, the battle and a replay all see the same thing. Old saves have no
// run.flags (read with ?.). Flags:
//   echo            gift id from The Echo: player modSources in the next boss fight
//   nextEliteAffix  extra elite traits on the next elite (Quiet Library)

import { Rng, mixSeeds } from '../core/rng.js';
import { ELITE_AFFIXES, AFFIX_INDEX, EVENT_INDEX } from '../data/rift.js';

export const ECHO_GIFTS = Object.fromEntries((EVENT_INDEX.echo?.gifts || []).map((g) => [g.id, g]));

function currentNode(run) {
  if (!run?.current) return null;
  for (const A of run.map || []) {
    for (const fl of A.floors) { const n = fl.find((x) => x.id === run.current); if (n) return n; }
    if (A.boss.id === run.current) return A.boss;
  }
  return null;
}

// Extra affix ids a flag puts on this node, seeded on the node itself.
export function flagAffixes(run, node) {
  const n = node?.type === 'elite' ? run.flags?.nextEliteAffix || 0 : 0;
  if (!n) return [];
  const pool = ELITE_AFFIXES.filter((a) => !(node.affixes || []).includes(a.id));
  return new Rng(mixSeeds(node.seed >>> 0, 'flag-affix')).shuffle(pool.slice()).slice(0, n).map((a) => a.id);
}

// What the flags add to one side of a battle: { mods: modSources, affixes: ids }.
export function flagSources(run, node = null, side = 'player') {
  node = node || currentNode(run);
  const out = { mods: [], affixes: [] };
  if (!node || !run?.flags) return out;
  if (side === 'player') {
    const g = node.type === 'boss' ? ECHO_GIFTS[run.flags.echo] : null;
    if (g) out.mods.push({ id: 'flag:echo:' + g.id, name: g.name, origin: 'rift', cond: { type: 'always' }, deltas: g.mods });
  } else out.affixes = flagAffixes(run, node);
  return out;
}

// nodeOpponent hook: add flagged affixes to the opponent, return their names.
export function addFlagAffixes(p, run, node) {
  const names = [];
  for (const id of flagSources(run, node, 'opp').affixes) {
    const a = AFFIX_INDEX[id];
    names.push(a.name);
    if (a.mods) p.modSources.push({ id: 'affix:flag:' + id, name: a.name, origin: 'rift', cond: a.cond || { type: 'always' }, deltas: a.mods });
    if (a.status) { p.rift = p.rift || { status: {} }; p.rift.status = p.rift.status || {}; for (const [k, v] of Object.entries(a.status)) p.rift.status[k] = (p.rift.status[k] || 0) + v; }
  }
  return names;
}

// After a battle node (won or lost): spend the flags it used. Returns their names.
export function consumeFlags(run, node) {
  const F = run.flags, used = [];
  if (!F || !node) return used;
  if (node.type === 'boss' && F.echo) { used.push(ECHO_GIFTS[F.echo]?.name || F.echo); delete F.echo; }
  if (node.type === 'elite' && F.nextEliteAffix) { used.push('Library rumour'); delete F.nextEliteAffix; }
  return used;
}

// Short lines for the hub: what is waiting further on.
export function flagNotes(run) {
  const F = run?.flags || {}, out = [];
  if (ECHO_GIFTS[F.echo]) out.push(`${ECHO_GIFTS[F.echo].name} waits for the next boss fight: ${ECHO_GIFTS[F.echo].desc}`);
  if (F.nextEliteAffix) out.push(`The next elite has heard of you: +${F.nextEliteAffix} elite trait${F.nextEliteAffix > 1 ? 's' : ''}.`);
  return out;
}
