// Skill rules shared by the battle, the AI and the HUD. Nothing here changes
// the physics: a low-spin or tilted top already takes hits harder in the
// simulation; these rules only recognise and reward reading it.

import { clamp } from '../core/math.js';

// A top is open when it wobbles (the HUD's WOBBLING/CRITICAL thresholds: spin
// margin over its critical spin below 2.5, or tilt over 9 degrees) or is in
// the air. degree is 0..1, how open.
export function openness(top, critSpin) {
  if (!top?.active) return { open: false, degree: 0 };
  const margin = top.spinAbs / Math.max(1, critSpin || 0);
  const tiltDeg = top.tilt * 57.3;
  const air = top.airTime > 0.05;
  const open = margin < 2.5 || tiltDeg > 9 || air;
  const degree = open ? Math.max(clamp((2.5 - margin) / 1.1, 0, 1), clamp((tiltDeg - 9) / 13, 0, 1), air ? 1 : 0) : 0;
  return { open, degree };
}

// Spirit bonuses for skill moments (on top of the hit's own spirit).
// (10 -> 15 on 2026-10-19: rules reward active play, physics unchanged)
export const SKILL_SPIRIT = { openingStrike: 15, punish: 15, interrupt: 15 };

// Judges' card for a round that reaches the time limit (user decision
// 2026-10-19: real physics, rules that reward active play, as boxing judges
// score punches). Points per scored action; the top that is more stable on
// time (spin over its stability threshold) adds `stability`.
export const JUDGE = { strike: 1, heavyStrike: 2, openingStrike: 2, punish: 2, interrupt: 2, counter: 2, stability: 2 };
export const JUDGE_STRIKE_J = 0.015; // N*s: a clean strike, not a brush
export const JUDGE_HEAVY_J = 0.06; // as a heavy hit
// A punish is a strike within this long after the opponent whiffed a counter
// or had its dash broken.
export const PUNISH_WINDOW = 1.0;
