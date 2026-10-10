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
| #10 Windows paths | FIXED | Browser harness, preview and balance tools; full browser run 10/11 on Windows; beasts failed once on a timing flake, was hardened against a fast natural finish and then passed twice on its own |
| Head-on vs glancing | PASS | Glancing hits deflect the struck top ~51-55° to the side opposite the contact, head-on ~2°; glancing impulse lower |
| Off-centre destabilisation | PASS | Struck-top peak tilt 0.9° / 1.8° / 3.7° / 5.4° at 0.5 / 1 / 2 / 3 m/s |
| Wall rebounds | PASS | Rebound slower than approach, wall ledger negative, restitution 0.8 rebounds >2x faster than 0.2 |
| Repeated collisions | PASS | 9 impacts in a stadium; no tick's collisions add energy; no instability recoveries |
| Simulation cost after changes | measured | 0.28 ms per tick (unchanged) |

Unit tests: 60/60.

## Phase 3 results

| Item | Result | Evidence |
|---|---|---|
| #2 debug overlay GPU leak | FIXED | Pooled arrows/markers; GPU geometries flat at 100 with the overlay on (before: 99 -> 214 in 24 s) |
| #3 trail materials | FIXED | Disposed with their geometry |
| #4 particle pools vs quality | FIXED | High -> Low resizes pools 900/320/600/240 -> 160/80/120/48 |
| Bit-Beast manifestations | DONE | 3D spirit per beast (11 forms), pillar, sigil on the bowl slope; faces the opponent; lower body fades so the top stays visible; unit tests for every form |
| First-summon hitch | FIXED | Spirits of both battlers are built and drawn once at round start: first-summon frame 5.6 ms vs 5.1 ms baseline (1357 ms without, software rendering) |
| Ring-out / destabilisation effects | DONE | Outward flash + speed lines + camera kick on ring out; warning pulse at the HUD's CRITICAL line |
| Camera ring-out framing | DONE | Tracking/player cameras pull back and re-centre near the wall; unit test fails without the change |
| Draw calls per battle frame | MEASURED | High+ink 201 calls / 150k tris; High 144 / 107k; Medium+ink 197 / 140k; Low+ink 135 / 86k; Low 82 / 49k (1280x720) |
| Frame time | MEASURED (Phase 4 follow-up) | Intel UHD Graphics 620 (D3D11), 1920x1080, frame cap off, identical frozen battle frame: High+ink 65 fps (15.3 ms avg, 19.1 ms p95), High 63, Medium+ink 57, Low+ink 69, Low 80 fps (12.5 ms avg). Differences of a few fps are noise. Software rendering (SwiftShader) manages ~2-7 fps |
| Bloom / post-processing | DEFERRED | Cannot measure its GPU cost on this machine |
| Browser regression (11 scenarios) | 10/11 PASS | Full run 44.5 min at commit 0bad165; tournament failed (player rung out before the test's forced finish); see Phase 4 |

## Phase 4 results

| Item | Result | Evidence |
|---|---|---|
| #7 non-standard controllers | FIXED | `src/input/padLayouts.js`: DirectInput PlayStation layout and a generic layout presented as standard, hat-switch d-pads decoded (rest at 0 or > 1 reads neutral), untouched trigger axes at 0 not read as half pressed; one warning toast; calibration screen names the translation. Tested with synthetic pads (hardware not available) |
| Simultaneous devices | PASS | Keyboard + pad pressing confirm together counts once; menu auto-repeat waits for its delay |
| Disconnect mid-hold | PASS | No stuck buttons or stick; release still reported |
| Audio failures | FIXED | A refused AudioContext no longer throws (all cues become no-ops, no retry storm); percussion noise buffers reused instead of rebuilt per hit |
| Spin depletion feedback | DONE | Warning beeps + rumble when the player's top crosses the HUD's CRITICAL line (rate-limited) |
| Head-on vs glancing feedback | DONE | Impact events carry `glance` (0 head-on .. 1 graze): 0.05 / 0.33 / 0.51 / 0.70 for hit offsets 0 / 20 / 35 / 46 mm; grazes spray sparks along the sliding direction with a scrape sound |
| FPS readout | FIXED | Was floored at 10 by the 0.1 s step cap; now averages real frame time |
| Ring-out explanation | FIXED (VERIFIED) | The round summary judged "through an exit" vs "over the wall" from where the top was when the round ended (1.4 s later, 87 cm away) instead of where it left; now records the exit angle at the finish |
| Tournament browser flake | FIXED | At 3x test speed a frame advances up to 0.3 s of battle, enough for a natural ring-out to beat the forced finish (1 of 3 runs passed). The helper runs 1x until the finish lands: 3/3 passed. Failures now report how the round actually ended |
| Early finish bug | FIXED (VERIFIED) | A top finishing after IGNITE but before the opponent spawned left the round running and later awarded the win to the eliminated top (seed 1: rung out at 0.04 s, "won" by Spin Finish at 48.5 s). Now resolved immediately; regression test fails without the fix |

### Input for Phase 5: launch clashes in the Rookie Cup

A fresh profile's starter (attack build, Perfect "bank" launch, no steering) vs
each Rookie Cup opponent, 24 battles each on the Standard Stadium:
striker 13/24 player wins, wall 17/24, drifter 3/24, all-rounder 18/24,
breaker 12/24. About one round in six against striker/wall/all-rounder ends
in a ring-out ~0.2 s after IGNITE. Traced (seed 28757 vs wall): the default
launch aims straight at the stadium centre where the AI lands; the tops meet
at 0.10 s with a 4.0 m/s contact approach (blade faces at 732 rad/s), the
attack starter rebounds at 2.1 m/s and rides over the 2 mm lip of the 210°
exit. The physics behaves as designed; the issue is the new-player default
launch, to be reviewed with type balance.

### Browser tests on the GPU

The test harness now uses the machine's GPU (ANGLE D3D11 on Windows) and
falls back to SwiftShader without one; `BROWSER_SOFTWARE=1` forces software.
The run prints the WebGL renderer it got. Full suite: 11/11 PASS in 2 min 52 s
on an Intel UHD 620 (software rendering: 44.5 min).
