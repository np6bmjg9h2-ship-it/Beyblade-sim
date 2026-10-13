// "Why it won": a 2-5 word tag for how a round was decided, plus a short hint
// for the loser. Read-only over the battle's round data; never changes the
// battle. Spec: section 4 of .claude/research/reviews/contact-feel-spec.md.

export const HEAVY_HIT = 0.1; // N·s

// Counters and lock slips with their times, fed every battle event by the
// battle screen (the battle keeps only totals of these).
export function makeTagTracker() {
  const t = { counters: [], lockClicks: [] };
  t.onEvent = (type, e, time) => {
    if (type === 'counter') t.counters.push({ fighter: e.fighter, time });
    else if (type === 'lockClick') t.lockClicks.push({ fighter: e.fighter, time });
    else if (type === 'roundStart') { t.counters.length = 0; t.lockClicks.length = 0; }
  };
  return t;
}

const recent = (list, f, now, within) => list.some((x) => x.fighter === f && now - x.time <= within);

// The top's biggest loss in its energy ledger.
function biggestLoss(top) {
  let key = null, most = 0;
  for (const [k, v] of Object.entries(top?.ledger || {})) {
    if (k !== 'numerical' && -v > most) { most = -v; key = k; }
  }
  return key;
}

// res: { winner, loser, how, rawHow } (the battle's round result, with
// fighters). Returns { tag, advice } or null for a draw.
export function whyTag(battle, res, tracker = null) {
  const { winner, loser, how } = res || {};
  if (!winner || !loser) return null;
  const now = battle.battleTime;
  const hits = (battle.roundNotable || []).filter((n) => n.A === loser || n.B === loser);
  const last = hits.reduce((a, n) => (!a || n.time > a.time ? n : a), null);
  const lastAgo = last ? now - last.time : Infinity;
  const countered = tracker ? recent(tracker.counters, winner, now, 1.5) : false;
  switch (how) {
    case 'burst':
      if (countered) return { tag: 'Counter broke the lock', advice: 'Vary your attack timing' };
      if (last && lastAgo <= 1.5 && last.impulse >= HEAVY_HIT) return { tag: 'Heavy hit shattered it', advice: 'Use Spirit Guard (LB) before big clashes' };
      return { tag: 'Lock worn down', advice: 'Use Spirit Guard (LB) to hold the lock' };
    case 'out':
      if (!last || lastAgo > 1.5) return { tag: 'Drifted out', advice: 'Stay away from the edge' };
      if (countered) return { tag: 'Counter timing', advice: 'Vary your attack timing' };
      if (last.impulse >= HEAVY_HIT) return { tag: 'Heavy hit', advice: 'Brace or dodge the big hits' };
      if ((last.glance || 0) > 0.6) return { tag: 'Glancing flick', advice: 'Meet attacks head-on' };
      if (loser.top && loser.top.spinFraction() < 0.3) return { tag: 'Worn down first', advice: 'Avoid trading hits when low on spin' };
      return { tag: 'Edge push', advice: 'Stay near the centre' };
    case 'spin': {
      const k = biggestLoss(loser.top);
      if (k === 'collision') return { tag: 'Drained by clashes', advice: 'Avoid long clashes or brace' };
      if (k === 'tipFriction' || k === 'drag') return { tag: 'Outlasted on stamina', advice: 'Try a lower-friction tip' };
      return { tag: 'More stamina', advice: 'Launch closer to Perfect' };
    }
    case 'decision': return { tag: 'Steadier at the bell', advice: 'Press the attack before time runs out' };
    default: return null;
  }
}
