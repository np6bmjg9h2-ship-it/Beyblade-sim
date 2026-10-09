// Battle objectives for story training: progress is measured from the same
// battle events and state the HUD shows (launch quality, impacts, dashes,
// counters, abilities, spin time, position).

const LAUNCH_RANK = { 'False Start': 0, Misfire: 0, Weak: 1, Overcharge: 1, Good: 2, Perfect: 3 };

export class ObjectiveTracker {
  constructor(defs = []) {
    this.list = defs.map((d) => ({ ...d, progress: 0, done: false }));
    this.changed = true;
  }

  get complete() { return this.list.length > 0 && this.list.every((o) => o.done); }

  mark(o, inc = 1, target = 1) {
    if (o.done) return;
    o.progress = Math.min(target, o.progress + inc);
    if (o.progress >= target - 1e-9) o.done = true;
    this.changed = true;
  }

  onEvent(type, e, battle, hi) {
    const me = battle.fighters[hi];
    for (const o of this.list) {
      if (o.done) continue;
      switch (o.type) {
        case 'launch':
          if (type === 'launch' && e.fighter === me && (LAUNCH_RANK[e.result.quality.label] ?? 0) >= (LAUNCH_RANK[o.min || 'Good'] ?? 2)) this.mark(o);
          break;
        case 'hits':
          if (type === 'impact' && (e.A === me || e.B === me) && e.impulse > 0.008) this.mark(o, 1, o.n || 1);
          break;
        case 'dash': if (type === 'technique' && e.fighter === me && e.name === 'dash') this.mark(o); break;
        case 'counter': if (type === 'counter' && e.fighter === me) this.mark(o); break;
        case 'ability': if (type === 'ability' && e.fighter === me) this.mark(o); break;
        case 'roundWin': if (type === 'roundEnd' && e.winner === hi) this.mark(o, 1, o.n || 1); break;
        default:
      }
    }
  }

  // per-frame checks for time-based objectives
  tick(battle, hi, dt) {
    if (battle.phase !== 'battle') return;
    const t = battle.fighters[hi].top;
    if (!t?.active) return;
    for (const o of this.list) {
      if (o.done) continue;
      if (o.type === 'survive') this.mark(o, dt, o.seconds);
      else if (o.type === 'center' && Math.hypot(t.p.x, t.p.z) < 0.3 * battle.arena.radius) this.mark(o, dt, o.seconds || 3);
    }
  }

  text(o) {
    if (o.type === 'hits' && (o.n || 1) > 1) return `${o.text} (${Math.floor(o.progress)}/${o.n})`;
    if (o.type === 'survive' || o.type === 'center') return `${o.text} (${Math.floor(o.progress)}/${o.seconds || 3} s)`;
    return o.text;
  }
}
