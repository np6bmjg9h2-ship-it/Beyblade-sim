// Hit-stop: a short near-freeze of the battle display on heavy hits, so a
// big clash reads as one. Display only: the battle screen passes
// `dt * scale()` to Battle.update, which only changes how many fixed ticks run
// per frame, never what a tick does, so replays and outcomes are unchanged.
// Times are real seconds. Spec: .claude/research/reviews/contact-feel-spec.md.

export const HIT_STOP = {
  light: 0.06, // impulse (N·s) below which contact stays continuous
  heavy: 0.1,
  baseMs: 35,
  maxMs: 80,
  phoneMaxMs: 60,
  skillMs: 50, // counters, sweet spots, clutches: the skill moments
  cooldown: 0.35, // no new freeze this soon after the last one
  budget: 0.2, // at most this much freeze ...
  window: 2, // ... in any window this long
  slow: 0.04, // the display still creeps forward, so nothing waits forever
};

// Freeze length in ms for an impact of impulse J (0 = none).
export function hitStopMs(J, skill = false) {
  if (skill) return HIT_STOP.skillMs;
  if (!(J >= HIT_STOP.light)) return 0;
  if (J < HIT_STOP.heavy) return HIT_STOP.baseMs;
  return Math.min(HIT_STOP.maxMs, HIT_STOP.baseMs + Math.min(45, (J - HIT_STOP.heavy) * 600));
}

export class HitStop {
  // phone: shorter freezes (low frame rates make long ones read as lag)
  constructor({ phone = false } = {}) {
    this.phone = phone;
    this.t = 0; // real time, advanced by step()
    this.left = 0; // freeze left (s)
    this.last = -Infinity; // when the last freeze started
    this.spent = []; // [start, length] of recent freezes, for the budget
    this.suppressed = false; // a finish is playing
  }

  get active() { return this.left > 0; }

  // Ask for a freeze; returns the length granted in ms (0 = refused).
  request(J, { skill = false } = {}) {
    if (this.suppressed) return 0;
    let ms = hitStopMs(J, skill);
    if (!ms) return 0;
    if (this.phone) ms = Math.min(ms, HIT_STOP.phoneMaxMs);
    if (this.t - this.last < HIT_STOP.cooldown) return 0;
    const from = this.t - HIT_STOP.window;
    this.spent = this.spent.filter(([s]) => s > from);
    const used = this.spent.reduce((a, [, d]) => a + d, 0);
    const room = HIT_STOP.budget - used;
    if (room <= 0.005) return 0;
    const sec = Math.min(ms / 1000, room);
    this.left = sec;
    this.last = this.t;
    this.spent.push([this.t, sec]);
    return Math.round(sec * 1000);
  }

  // A finish (burst, ring-out, spin finish) ends any freeze and blocks new
  // ones until reset(): the finish slow-motion takes over.
  finish() { this.left = 0; this.suppressed = true; }

  reset() { this.left = 0; this.suppressed = false; }

  // Advance real time by dt; returns the factor for the battle's dt. The
  // last frame of a freeze is only partly frozen, so a freeze lasts exactly
  // its length instead of rounding up to whole frames.
  step(dt) {
    this.t += dt;
    if (this.left <= 0 || !(dt > 0)) return 1;
    const f = this.left >= dt ? 1 : this.left / dt;
    this.left -= dt;
    return f === 1 ? HIT_STOP.slow : 1 - f * (1 - HIT_STOP.slow);
  }
}
