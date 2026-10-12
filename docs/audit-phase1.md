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

## Phase 5 results (balance pass 1)

Changes (physics-honest; each measured on all 7 stadiums):

- `PHYSICS` object in `physics/simulation.js` gathers the model coefficients (identical results before tuning: 12 seeded matches matched to the tick).
- Blade-face coupling 0.4 -> 0.6: hits convert more blade speed into knockback. This was the dominant lever (attack 30% -> 55% alone).
- Lock stress threshold 0.30 -> 0.45 of the lock rating: light grinding no longer slips notches.
- Rift Talon catch 0.95 -> 0.70 (still the strongest shatter ring); Semi-Flat flat radius 1.3 -> 0.9 mm.
- AI: new `pressWhenBehind` personality setting (a top losing the spin race presses for a knock-out instead of retreating); Balanced Rival uses it, with steering economy 0.6 -> 0.75.

| Build | Before (unseen seeds) | After (unseen seeds) | Official `balance -- 8 all` after |
|---|---|---|---|
| Attack | 33% | 48% | ~53% |
| Defense | 71% | 61% | ~60% |
| Stamina | 78% | 59% | ~59% |
| Balance | 26% | 29% | ~30% |
| Burst | 42% | 52% | ~49% |

Triangle restored: attack beats stamina 46:10, defense beats attack 37:19, stamina beats defense 56:0 (unseen seeds). Remaining: Balance ~30% (loses spin races to defense and stamina; rim-weighting its ring and a calmer AI did not help). Regression guard: `npm run balance:check` (25-70% band) PASS. Unit tests 72/72 (two tests re-based: the repeated-collision scenario now uses the closed Vortex bowl; the XP farming test compares the same result against a fresh opponent instead of across a win and a loss). Browser suite 11/11.

## Phase 5 results (balance pass 2, career loop, final QA)

### Balance pass 2

Pass 1 left the Balance reference build (All-Rounder: Comet Arc ring,
Semi-Flat tip, Balanced Rival AI) near 30%: its AI could not tell a spin race
it would win from one it would lose, so it traded hits with Defense and
Stamina builds until it ran out of spin. Defense won by out-spinning
everything rather than by defending.

- AI `readRace` (Balanced Rival and the defensive personality): projects the
  spin race from both tops' spin fraction times their build's estimated spin
  time (`assembly.summary.estSpinTime`). A top that will outlast its opponent
  stops attacking and holds the centre; one that will lose presses for a
  knock-out (`pressWhenBehind`), easing off when its last exchanges went badly.
- The defensive personality now leaves its centre to press a top that would
  outlast it, instead of waiting to lose on spin.
- Pivot Ball (Defense tip): friction 0.20 -> 0.19, contact patch 1.0 -> 0.8 mm.
- Comet Arc (Balance ring): 15 -> 16 g, friction 0.22 -> 0.17, drag 0.014 ->
  0.011, mass toward the rim (0.4).
- Semi-Flat: friction 0.19 -> 0.17, contact patch 0.32 -> 0.28 mm.
- Quad Spike (classic attack ring): face angle 14 -> 17 deg, catch 0.5 -> 0.6,
  drag 0.022 -> 0.016. The AI changes left the Clutch Charger opponent (Quad
  Spike + Hit Clutch) at 29% against the eight original opponents on all
  stadiums; now 47% (45% and 48% on unseen seeds). Magna Guard: 58%.

Match win rates over all seven stadiums (`npm run balance -- 8 all`, 224
matches per build; pass 1 re-measured at d9801eb):

| Build | Phase 1 baseline | Pass 1 | Final |
|---|---|---|---|
| Attack | 31% | 53% | 50% |
| Defense | 72% | 60% | 46% |
| Stamina | 77% | 59% | 58% |
| Balance | 26% | 30% | 46% |
| Burst | 45% | 49% | 51% |

Per stadium (32 matches per build each, so about +/-17 points):

| Stadium | Attack | Defense | Stamina | Balance | Burst |
|---|---|---|---|---|---|
| standard | 72% | 38% | 66% | 38% | 38% |
| vortex | 34% | 50% | 56% | 63% | 47% |
| edgebreaker | 63% | 47% | 56% | 34% | 50% |
| crystal | 59% | 28% | 47% | 28% | 88% |
| magma | 38% | 50% | 69% | 63% | 31% |
| skyfall | 34% | 59% | 50% | 56% | 50% |
| zero | 47% | 47% | 59% | 44% | 53% |

Stadiums still favour types (Burst on Crystal, Attack on Standard), which
gives the stadium choice meaning; the overall numbers are what the plan's
40-60% target is about.

Every type is inside the plan's 40-60% band (Phase 1 acceptance). On unseen
seeds (`tools/balance-tune.js 6 all`, `SEED_OFFSET` 500 / 900): Attack 54 / 54%,
Defense 42 / 41%, Stamina 56 / 55%, Balance 55 / 47%, Burst 44 / 53%.
`npm run balance:check` (25-70% guard) PASS: 50 / 46 / 57 / 46 / 51%.

### Career loop

New browser scenario `career` plays the loop with a virtual gamepad: new
game -> Workshop ring swap -> Inspect in 3D -> enter the Rookie Cup -> three
matches to the title -> ceremony and prizes (CR, items, XP) -> Store
materials crate -> upgrade the equipped ring -> equip the cup's launcher or
cord prize -> spend a skill point -> save -> reload the page -> identical
profile (credits, inventory, loadout, upgrades, history, skill points) ->
a quick battle with the new top. PASS, no page errors. One full-suite run
timed out starting that last battle; the cause was not captured (most likely
a left-spin prize launcher, see below), so the scenario now reports why a
loadout cannot battle. The six runs since all passed.

Gaps found on the way and fixed:

- Material upgrades and trait rerolls were greyed out when unaffordable, so
  pressing them did nothing (the same complaint as the old crafting tab). They
  now show cost chips (green covered, red short) and say what is missing.
- Content in long scrolling panels was squashed instead of scrolling.
- A cup prize can be a launcher for the other spin direction (Reverse Clip);
  equipping it made the loadout unable to battle. Equipping one now offers to
  switch the loadout's spin with it (Workshop quick-equip and the picker).
- #9: saves from a newer game version (below).

### Findings register: final status

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Outcome depends on frame rate | FIXED (Phase 2) | 12/12 seeds identical at 30/60/144 fps; unit test |
| 2 | Debug overlay GPU leak | FIXED (Phase 3) | Geometries flat at 100 with the overlay on |
| 3 | Trail materials not disposed | FIXED (Phase 3) | Disposed with their geometry |
| 4 | Particle pools ignore quality changes | FIXED (Phase 3) | Pools resize on quality change |
| 5 | Per-tick allocations | FIXED (Phase 4 audio, Phase 5 physics) | Energy scratch arrays reused, the per-tick safety snapshot refilled in place, the scrape contact search no longer clones vectors. 16 seeded matches hash bit-identical before and after; 0.18 ms per tick in that run. Remaining garbage comes from events and the battle layer and is collected in short minor GCs |
| 6 | Clamp losses booked as numerical | FIXED (Phase 2) | `clamp` ledger key; unit test |
| 7 | Non-standard controllers | FIXED (Phase 4) | Synthetic pads; real hardware not available |
| 8 | Ink outlines double draw calls | MEASURED (Phase 3/4) | ~200 vs 144 calls at High; frame time within noise on an Intel UHD 620; outlines stay a Settings toggle |
| 9 | Newer-version saves accepted silently | FIXED (Phase 5) | Loading one warns that unknown data may be lost when it saves; importing one asks first; unit test |
| 10 | Windows paths in the browser harness | FIXED (Phase 2) | Browser suite runs on Windows |
| 11 | "Bit-Beast" is a franchise term | OPEN (naming) | Rename before any commercial release |

### Against the Phase 1 baseline

| Test | Phase 1 | Final |
|---|---|---|
| Unit tests | 54/54 | 114/114 |
| Production build | PASS, 1.4 MB | PASS, 1.5 MB |
| Browser tests | BLOCKED | 15/15 PASS on the GPU in 4 min 12 s |
| Same seed at 30 / 60 / 144 fps | FAIL (10 of 12 differ) | PASS (12 of 12 identical) |
| Simulation cost (20 seeded matches, the 8 original builds) | 0.29 ms per tick | 0.20 ms per tick |
| Console errors | NOT TESTED | None: any page error fails a browser scenario |
| GPU frame time | NOT TESTED | 60-65 fps High with outlines, ~80 fps Low (UHD 620, 1080p) |
