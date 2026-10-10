# Phase 1 audit — baseline

Baseline commit: `b53ed73`. Environment: Windows 11, Intel i5-8365U, Node 24.21.
No code was changed during the audit.

## Test results

| Test | Result | Evidence |
|---|---|---|
| Unit tests | PASS 54/54 | `npm test`, 14.5 s |
| Production build | PASS | `dist/chaos-spin.js` 1.4 MB; a rebuild differs only in line endings |
| Browser tests (11 scenarios) | BLOCKED | Playwright not installed on the test machine |
| Same seed at 30 / 60 / 144 fps (AI vs AI) | FAIL | 10 of 12 matches differ; 2 change winner (seeds 1010, 1011) |
| Simulation cost | measured | 0.29 ms per tick (~34 ms CPU per simulated second), 20 matches / 44k ticks |
| Console errors, GPU frame time, draw calls | NOT TESTED | needs browser tooling |

## Findings

| # | Severity | Status | Finding |
|---|---|---|---|
| 1 | High | VERIFIED | Battle outcome depends on frame rate: IGNITE and top spawns are resolved per rendered frame (`src/game/battle.js` `updateCountdown` → `spawnTop`), not per physics tick. Replays are unaffected (they record spawn ticks). |
| 2 | Medium | VERIFIED (code) | Physics debug overlay allocates arrows, spheres and materials every frame and never disposes them (`src/render/renderer.js` `drawDebug`). |
| 3 | Low | VERIFIED (code) | Trail materials are not disposed, only geometry (`src/render/effects.js` `clearTransient`). |
| 4 | Low | VERIFIED (code) | Particle pools are sized at construction; changing quality later does not resize them (`effects.js` `setQuality`). |
| 5 | Low | VERIFIED (code) | Per-substep / per-tick allocations in `src/physics/simulation.js` (`E0`, `tops.map`, snapshots, clones, grind events) and a new AudioBuffer per percussion hit (`src/audio/audio.js`). |
| 6 | Low | VERIFIED (code) | Energy removed by the speed/spin safety clamps is not booked to a ledger key and appears as "numerical". |
| 7 | Medium | SUSPECTED | Gamepad buttons assume the `standard` mapping (`p.mapping` never checked); every connected pad drives player 1. |
| 8 | Medium | SUSPECTED | Ink outlines duplicate every mesh, roughly doubling draw calls. Not measured. |
| 9 | Low | SUSPECTED | Imported saves from a newer schema version are accepted silently (`src/systems/save.js` `migrate`). |
| 10 | Low | SUSPECTED | Browser harness builds its root from `URL.pathname`, likely wrong on Windows. |
| 11 | Risk | — | "Bit-Beast" is a franchise term; everything else is original and should stay so. |

## Assessment summary

- Physics: genuine axisymmetric rigid-body model (inertia tensor, angular momentum, analytic torque-free rotation, sequential-impulse contacts at 16 substeps, energy ledger). Missing scenarios: head-on vs off-centre collisions, wall rebound energy, repeated collisions, frame-rate independence.
- Graphics: cel shading, ink outlines, 49 modelled parts, render interpolation. Largest gap: Bit-Beast manifestation is a 2D emblem sprite; no bloom.
- Controllers: detection, disconnect pause, remapping, dead zones, curves, rumble, glyphs present.
- Progression: loot, traits, sets, durability, Bit-Beasts, skills, story, tournaments, versioned saves with backup recovery, replays.

## Plan

1. Physics: tick-aligned ignite/spawn; missing scenario tests; ledger clamp losses. Accept: identical results at 30/60/144 fps in a unit test.
2. Visuals: fix #2–4, measure draw calls and frame time, per-beast manifestations. Accept: flat GPU memory over 20 battles with the overlay on.
3. Input: non-standard gamepad mappings, multi-pad assignment.
4. Progression: type balance. Accept: every archetype 40–60 % in `npm run balance`.
5. QA: full browser suite against this baseline.

## Phase 2 results

| Item | Result | Evidence |
|---|---|---|
| #1 frame-rate dependence | FIXED | Countdown, charge, IGNITE and spawns run in fixed ticks; 12/12 seeds identical at 30/60/144 fps; unit test `a live AI match ends identically at 30, 60 and 144 fps` |
| #6 clamp losses | FIXED | New `clamp` ledger key ("Safety limits"); unit test checks the ledger closes with no numerical residual |
| #10 Windows paths | FIXED | Browser harness, preview and balance tools; browser suite 11/11 on Windows (beasts scenario hardened against a fast natural finish) |
| Head-on vs glancing | PASS | Glancing hits deflect the struck top ~51-55° to the side opposite the contact, head-on ~2°; glancing impulse lower |
| Off-centre destabilisation | PASS | Struck-top peak tilt 0.9° / 1.8° / 3.7° / 5.4° at 0.5 / 1 / 2 / 3 m/s |
| Wall rebounds | PASS | Rebound slower than approach, wall ledger negative, restitution 0.8 rebounds >2x faster than 0.2 |
| Repeated collisions | PASS | 9 impacts in a stadium; no tick's collisions add energy; no instability recoveries |
| Simulation cost after changes | measured | 0.28 ms per tick (unchanged) |

Unit tests: 60/60.
