# Chaos Spin: Arena Zero: codebase guide for reviewers

A complete map of the code for a human or AI reviewer: what each part does,
how the parts connect, the rules the code must keep, where the risks are,
and a review checklist. Branch: `claude/chaos-spin-arena-zero-ynh785`.

---

## 1. What the project is

A single-player, browser-based 3D spinning-top battle RPG. Battles run on a
custom rigid-body spinning-top simulation, and the game is built around
it: modular parts with loot and traits, Bit-Beasts (spirit creatures with
abilities), skills, a six-chapter story, tournaments, several modes,
replays and saves. All characters, parts, names and art are original and
generated in code (no image or model files).

- **Language and stack:** plain JavaScript ES modules, Three.js r170, esbuild. No
  framework, no TypeScript, no runtime dependencies besides Three.js.
- **Runs from disk:** `index.html` loads `dist/chaos-spin.js` (one bundled
  classic script), so it works over `file://` in Chrome without a server.
- **Size:** about 22,000 lines of JavaScript in `src/`, plus about 600 lines of CSS.

### Commands

```sh
npm install              # esbuild + three
npm run build            # bundle src/ -> dist/chaos-spin.js (embeds the sim worker)
npm test                 # 70 Node unit tests (node --test tests/*.test.js)
npm run test:browser     # build, then 11 end-to-end scenarios in headless Chromium
npm run balance -- 8 all # AI-vs-AI round robin of reference builds on every stadium
node tools/preview/shoot.js slot ring --audit   # render part models + geometry audit
```

`dist/chaos-spin.js` is generated and committed (so the game runs without a
build step). Do not review or hand-edit it; rebuild it after source changes.

---

## 2. Repository layout

```
index.html            entry page (canvas#scene + div#ui, loads dist bundle)
styles.css            whole UI theme (anime style); @imports fonts.css
fonts.css             Bangers + Chakra Petch embedded as base64 woff2 (OFL, licences in assets/fonts/)
dist/chaos-spin.js    GENERATED bundle (do not edit)
src/
  main.js             boot: creates App
  app.js              application shell: input, audio, renderer, UI, saves, showcase scene, main loop
  core/               math (vectors/quaternions), seedable RNG, event emitter: no DOM, no Three.js
  physics/            spinning-top simulation: pure math, deterministic, no DOM/Three.js
  game/               battle controller, launch model, AI, abilities, objectives, background sims
  systems/            persistent game logic on plain data: assembly, items, loot, saves, story, tournaments…
  data/               all content as data: parts, traits, beasts, arenas, story, tournaments, characters…
  render/             Three.js presentation: renderer, cel shading, part models, stadium, effects, camera
  render/parts/       one builder per part slot (ring, core, disc, lock, tip, auxModule) + shared contract
  ui/                 DOM UI framework (screen stack, focus nav), widgets, charts
  ui/screens/         every screen (title, menu, battle HUD, workshop, story, tournaments, …)
  input/              action-based input (keyboard, mouse, gamepad), bindings and presets
  audio/              procedural Web Audio music and sound effects
  workers/            Web Worker entry for background AI-vs-AI matches
tests/                Node unit tests + tests/browser (Playwright end-to-end)
tools/                build, static server, balance simulators, headless part/stadium preview
docs/                 this file; audit-phase1.md (audit baseline and per-phase results)
```

---

## 3. Architecture and data flow

### Layering (dependency direction: top may import from below, never the reverse)

```
ui/screens  ─┐
render/      ├─>  game/  ─>  systems/  ─>  physics/  ─>  core/
input/, audio/┘                  └──────>  data/
```

- `physics/` and `core/` must not touch the DOM, Three.js or `Math.random`.
  They run in Node (tests, balance tools) and in a Web Worker.
- `game/` drives a battle with the physics. It runs headless (tests,
  background tournament matches) or with the renderer attached.
- `systems/` holds pure functions and plain serialisable data (profile,
  items, tournaments, story). The save file is just this data.
- `render/` only reads game state and listens to battle events. It must
  never change the simulation (rendering is interpolated between physics
  states).
- `ui/` owns screens and connects input, game, render and systems.

### From a loadout to a spinning top

```
profile (systems/profile.js)
  └─ loadout -> items (systems/items.js: unique instances with rolled stats, traits, durability)
       └─ systems/loadout.js  -> battle participant (build, launcher, cable, beast, skills, modifiers)
            └─ systems/assembly.js assembleTop() -> { spec, summary, parts }
                 spec = mass, inertia I1/I3, centre of mass, contact layers (ring/disc/aux),
                        tip geometry, burst lock, aero, stack heights (spec.geometry)
                 └─ physics/topBody.js + physics/simulation.js  (collision, friction, burst)
                 └─ render/topMesh.js TopVisual  (part models placed at spec.geometry heights)
```

### Battle lifecycle (`game/battle.js`)

Phases: `intro` → (per round) setup → `countdown` (charge, release at IGNITE)
→ `battle` → `finishing` → `roundOver` → … → `matchOver`.

Finishes: `spin` (stopped spinning), `out` (ring out), `burst`
(Shatter: the lock gave way), `decision` (time limit), `draw`.

The battle emits events that the renderer, audio and HUD listen to:
`roundStart, countdownStart, countdown, ignite, release, launch, battleStart,
impact, grind, wall, lockClick, shockwaveHit, topFinished, roundEnd, matchEnd,
aiAdapt, physicsRecovered`.

### Main loop (`app.js`)

`requestAnimationFrame` → input poll → active screen `update(dt)` (the battle
screen advances the fixed-step simulation) → renderer interpolates and draws.
In menus a background AI-vs-AI "showcase" battle runs behind the UI. The
Inspect screen switches the renderer to its own turntable scene.

---

## 4. Module reference

### physics/ (simulation core)
| File | Lines | Purpose |
|---|---|---|
| `simulation.js` | 893 | Fixed-timestep simulation: TICK = 1/120 s, 16 substeps; contacts (tip–floor, top–top, wall, lips at exits, body scrape), sequential impulses, Coulomb friction, burst damage from counter-rotation, energy ledger, sanity recovery. |
| `topBody.js` | 246 | Rigid body of an assembled top: position, velocity, orientation, angular momentum; torque-free update plus contact torques; precession and nutation emerge naturally. |
| `arena.js` | 142 | Stadium surface of revolution: height profile, slope, friction bands, wall and openings (exits with lips). |
| `profile.js` | 55 | Radial blade profile of a contact layer. **Shared by collision and the ring/aux 3D models** (what you see is what collides). |

### game/
| File | Lines | Purpose |
|---|---|---|
| `battle.js` | 795 | Match controller: formats (single, bo3, bo5, points, endless), phases, launches, finishes, scoring, stats, events, replay record and playback, debug finish. |
| `launch.js` | 207 | Launch model: charge meter, gold window, techniques, lean/aim → initial spin, velocity and tilt; launcher and cable gear. |
| `ai.js` | 334 | AI controller that produces the same control frame as a human; personalities, skill (reaction, accuracy), velocity-control steering, contact awareness, rival tweaks, adaptation between rounds. |
| `abilities.js` | 301 | Spirit meter, Bit-Beast abilities (signature, secondary, ultimate), tactical guard and surge, timed modifiers. |
| `humanController.js` | 163 | Turns input actions into the control frame. |
| `objectives.js` | 59 | Story training objectives measured from real battle events. |
| `matchJob.js`, `matchSim.js`, `tournamentRunner.js` | ~290 | Headless AI-vs-AI matches for tournaments: Web Worker from an embedded Blob URL, with an inline time-sliced fallback. |

### systems/ (persistent logic, plain data)
| File | Lines | Purpose |
|---|---|---|
| `assembly.js` | 348 | Validates a build (architecture, socket, mass limits) and computes the physical spec plus a summary for the UI. **Stack heights live here** (`spec.geometry`). |
| `items.js` | 175 | Item instances: seeded stats, rarity, traits, set membership, durability, XP and mastery. |
| `modifiers.js` | 102 | Folds traits, sets, skills and beast passives into bounded modifier channels that the physics reads. |
| `loot.js`, `progression.js` | ~290 | Deterministic loot; post-match XP, rewards, durability wear, stats. |
| `workshop.js` | 373 | Equip, repair, upgrade, reroll and transfer traits, craft, dismantle (all validated). |
| `save.js` | 235 | IndexedDB with localStorage fallback, 3 slots, export and import, **schema migration** (SCHEMA_VERSION = 3), replay storage (newest 12 plus pinned). |
| `profile.js` | 137 | New profile, normalisation, default settings. |
| `tournament.js` | 704 | Pure tournament engine: single and double elimination (bracket reset), round robin, league with playoffs, Swiss; standings, placements, prizes. |
| `story.js`, `rivals.js`, `modes.js`, `beasts.js`, `loadout.js` | ~900 | Story progress and flags; habit tracking and rival counter-builds; Challenge, Survival and League; beast bond and trials; loadout to participant. |

### data/ (content)
Parts (49 across 6 slots), traits (72), sets (6), rarity (7), launchers (6) and
cables (5), techniques, arenas (7), beasts (11) plus lore, AI profiles,
opponents (8 archetypes), characters (10), story (6 chapters: ch1 11 nodes,
ch2–6 5–7 nodes), tournaments (9 plus story events plus 5 league divisions),
challenges (12), skills (5 paths), upgrades and tuning. Part numbers are
physical (mm, g) and consumed by `assembly.js`.

### render/
| File | Lines | Purpose |
|---|---|---|
| `renderer.js` | 368 | Owns the WebGLRenderer, lights, camera rig, arena, top visuals, launchers, the battle-event → effects mapping, pooled physics debug overlay, ink-layer toggle, the inspect stage switch. Preloads both battlers' spirits at round start. |
| `toon.js` | 292 | Cel-shading kit: `toonMaterial()` (MeshToonMaterial + stepped ramps + specular band + rim, shader patch), ink outlines as inverted-hull child meshes on `INK_LAYER` (shared materials marked `userData.shared`), `disposeTree()`. |
| `lighting.js` | 28 | Shared lights and tone mapping (also used by the preview tool). |
| `topMesh.js` | 205 | `TopVisual`: builds the six part models, stacks them at physics heights, interpolates pose, display spin, speed ring, explode, assemble animation, ghosting for Inspect, dispose. `meshes[slot]` = part groups (a Shatter detaches them). |
| `parts/common.js` | 170 | **Part-builder contract** (read this first) and geometry helpers. |
| `parts/index.js` | 72 | Builder registry, build context (`ctx`), stack placement, aux mount kinds. |
| `parts/ring.js` · `core.js` · `disc.js` · `lock.js` · `tip.js` · `auxModule.js` | 620–1100 each | One individually designed model per part id plus a parametric fallback for unknown ids. Must stay inside the physics envelope (see §5). `auxModule.js` is named so because `aux` is a reserved file name on Windows. |
| `arenaMesh.js` | 1168 | Cel-shaded stadiums built from the same arena definition as the physics (floor lathe of the height profile, walls, exits, crowd, backdrop). |
| `effects.js` | 483 | Pooled effects: sparkle particles, speed-line streaks, star hit flashes, shockwave rings, cel dust, trails, Shatter debris (detached part groups), ring-out bursts, wobble warnings, head-on vs graze impact sprays (`glance` from the impact event). Pools are rebuilt when quality changes their size. Hosts the `SpiritSystem`. |
| `spirits.js` | 261 | Bit-Beast manifestations: spirit shader (cel rim, scan stripes, lower-body fade), light pillar, sigil laid on the bowl slope, rise/fade timeline, pooling, shader warm-up and per-battle preload (no first-summon stall). Visual only. |
| `spiritForms.js` | 333 | One procedural 3D form per beast emblem (coil dragon/serpent, phoenix, raven, manta, wolf, lion, stag, tortoise, scorpion, orrery) built from merged primitives; `aU` per vertex drives the body wave. |
| `inspect.js` | 154 | Inspect turntable stage (own scene and camera): explode, focus and ghost, assembly replay. |
| `camera.js`, `emblems.js` | ~300 | Camera modes (broadcast, tracking, player, overhead, launch, victory; tracking and player pull back near the wall during ring-out threats); procedural beast emblems. |

### ui/
`ui.js` (screen stack, spatial focus navigation for controller and keyboard,
prompts with device glyphs, toasts, modals), `widgets.js`, `charts.js`, and
`screens/` (title, main menu, quick battle, battle HUD 630 lines, results and
replays, workshop 590, inspect, beasts, skills, stats, settings, story 408,
dialogue, tournament 580, modes and lab). Screens are classes with `render()`
returning DOM, optional `onEnter`, `onExit`, `update`, `handleInput`,
`onNav`, `onTab`, `onAlt`, `onFocus`, `prompts()`.

### input/, audio/, workers/
Action contexts (`menu`, `launch`, `battle`) with remappable bindings and
presets (Classic, Competitive, Advanced), dead zones, curves and calibration;
`padLayouts.js` presents non-standard (DirectInput) controllers in the
standard layout, including hat-switch d-pads, and the player is told once.
Procedural Web Audio that degrades to silence if the browser refuses a
context; the simulation worker entry.

---

## 5. Invariants the code must keep (review against these)

1. **Determinism.** Given a seed and the recorded inputs, a battle
   re-simulates identically: replays are verified against the original
   result. No `Math.random`, `Date.now` or frame-rate-dependent logic in
   `physics/`, `core/`, or the simulation path of `game/`. All randomness
   comes from `core/rng.js`. `Math.random` appears only to pick a default
   seed (`battle.js`, `items.js`) and in visual effects.
2. **Fixed timestep.** Simulation results must not depend on render frame
   rate (TICK 1/120 s, 16 substeps). This includes the countdown: charge,
   IGNITE and spawns advance in ticks (`Battle.step`), tested at 30/60/144 fps.
3. **Render never feeds back** into the simulation.
4. **Physics/visual coupling.** The ring and aux 3D outlines come from
   `physics/profile.js`. Part models must stay inside their physical
   envelope: ring geometry no more than 0.3 mm outside the contact profile,
   ring hole ≥ core radius + 0.3 mm; core below the ring top inside
   ring.rIn − 0.3 mm; lock boss ≤ disc.rIn − 0.3 mm; tip contact end exactly
   matches ballRadius/flatRadius; disc within rOut + 0.2 mm. Check with
   `node tools/preview/shoot.js slot <slot> --audit`.
5. **Part-builder contract** (`render/parts/common.js`): origin at the part's
   base on the spin axis, metres, no scaling, returns `{ group, height,
   spinners?, glows? }`, materials per build (disposed with the top), never
   `userData.shared` on per-build resources.
6. **Resource ownership.** Shared ink materials and cached textures carry
   `userData.shared` and are never disposed. Everything else is disposed
   by `disposeTree` / `TopVisual.dispose()` / arena swap.
7. **Saves.** Any change to persisted data needs a `SCHEMA_VERSION` bump and
   a migration step in `save.js`, and `normalizeProfile` must accept old saves.
8. **Runs from `file://`.** No runtime network requests; fonts are embedded
   as base64; the worker is a Blob URL; one bundled script.
9. **Input parity.** Every screen is fully usable with controller only and
   keyboard only (focus must always be visible; nothing mouse-only).
10. **Windows-safe file names.** No `con, prn, aux, nul, com1–9, lpt1–9` as file
    names, and no `: * ? " < > |`. (A file named `aux.js` once broke cloning
    on Windows.)
11. **Original content only.** No copyrighted characters, logos, names or
    designs from existing franchises.

---

## 6. Tests and tools

| Command or file | Covers |
|---|---|
| `tests/physics.test.js` | Conservation, gyroscopic dynamics against theory, friction, collisions (head-on vs glancing, impact tilt, repeated contacts), wall rebounds, ring-out, determinism, clamp ledger. |
| `tests/progression.test.js` | Items, loot, traits, sets, durability, XP, workshop, saves and migration. |
| `tests/beasts.test.js` | Every ability has a measurable effect in the real simulation. |
| `tests/ai.test.js` | Personalities are distinguishable, fairness (same controls), rival adaptation. |
| `tests/tournament.test.js`, `story.test.js`, `modes.test.js` | Formats and standings; story integrity and once-only rewards; challenge, survival and league rules. |
| `tests/replay.test.js` | Recorded match replays identically under different frame timing; a live AI match ends identically at 30/60/144 fps; replay storage. |
| `tests/render.test.js` | Spirit forms for every beast (finite, stadium-sized, animate safely); camera wall framing. |
| `tests/controls.test.js` | Keyboard + gamepad press counted once, menu auto-repeat, hat d-pads, non-standard layouts, disconnects, audio without Web Audio, head-on vs graze feedback. |
| `tests/browser/run.js` | 11 end-to-end scenarios driving the built game with keyboard and a virtual gamepad: keyboard, gamepad, workshop, beasts, tournament, story, screens, lab, modes, replay, inspect. It uses the GPU when there is one (about 3 min on an Intel UHD 620) and SwiftShader otherwise (about 45 min; force it with `BROWSER_SOFTWARE=1`); run scenarios one at a time with `node tests/browser/run.js <name>`. |
| `tools/balance-par.js` | Win rates with 95% intervals per reference build per stadium. |
| `tools/preview/shoot.js` | Headless renders of part grids, assembled or exploded tops, stadiums with effects, the spirit gallery (`spirits`); `--audit` prints envelope numbers per part. |

---

## 7. Known issues, risks and technical debt

- **Balance:** after the Phase 5 pass (all stadiums): Attack ~53%, Defense
  ~60%, Stamina ~59%, Burst ~49%, Balance ~30%. Model coefficients live in
  `PHYSICS` (`physics/simulation.js`); `tools/balance-tune.js` tests changes,
  `npm run balance:check` guards the 25-70% band.
- **Story:** chapter 1 is complete (11 scenes); chapters 2–6 are thin (5–7
  scenes). Characters have no portrait art (the dialogue shows initials).
- **Visual review gaps** in the new cel-shaded part models: `glows` are
  collected but never pulsed; ring key-slots don't align with core tabs;
  higher-rarity trims only partly checked; no automatic quality downgrade on
  software rendering. Measured battle frame: 201 draw calls / 150k triangles
  at High with ink, 82 / 49k at Low without (see docs/audit-phase1.md).
- **Large files** that are candidates for splitting: `physics/simulation.js`
  (893), `game/battle.js` (795), `systems/tournament.js` (704),
  `render/arenaMesh.js` (1168), `render/parts/ring.js` (1102).
- **Browser tests are timing-sensitive** under software rendering (a few
  waits were hardened; others may still be marginal). At 3x test speed a fast
  natural ring-out can beat the debug finish the scenarios use to force wins.
- **No touch controls, no multiplayer** (local or online).

---

## 8. Review checklist

Report each finding with file:line, severity (blocker / major / minor / nit),
a concrete failure scenario (input → wrong result), and a suggested fix.

**Correctness**
- [ ] Simulation path free of non-determinism (see §5.1); replays still verify.
- [ ] Battle phase transitions: no stuck phase, double finish or score error; round and match end conditions.
- [ ] Save migration handles old saves; no crash on missing fields (`normalizeProfile`).
- [ ] Tournament engine: byes, ties, Swiss pairing repeats, double-elimination reset, standings tiebreaks.
- [ ] Workshop operations: costs, validation, no item duplication or loss on edge cases.
- [ ] Input: focus never lost; every screen reachable and escapable with controller and with keyboard.

**Physics and game feel**
- [ ] Contact handling at extreme speeds/tilts; tunnelling through walls; exits and lips.
- [ ] Energy ledger residual stays small.
- [ ] AI uses only legal controls; difficulty scaling sensible.

**Rendering**
- [ ] Part models within envelope (`--audit`), correct normals, no z-fighting, ink not swamping small parts.
- [ ] Disposal: no GPU leaks across rounds, arena swaps, Inspect open/close, Shatter debris.
- [ ] Pooled effects: no per-frame allocations; budgets respect quality and reduced effects.
- [ ] Performance: draw calls and triangles per quality level; ink-outline cost.

**UI and CSS**
- [ ] Readability and contrast; no clipping at 1280×720 and 1600×900; reduced-motion respected.
- [ ] Every class used by `src/ui` exists in `styles.css`.

**Project hygiene**
- [ ] No hand edits to `dist/`; bundle rebuilt after source changes.
- [ ] Windows-safe file names; no new runtime network requests; original content only.
- [ ] Tests: `npm test` passes; new logic has a test.

---

## 9. Ready-to-paste prompt for a reviewing agent

```
You are reviewing "Chaos Spin: Arena Zero", a browser 3D spinning-top battle
RPG (plain JavaScript ES modules + Three.js, bundled with esbuild). Work on
branch claude/chaos-spin-arena-zero-ynh785.

1. Read docs/CODEBASE.md fully. It maps every module, the invariants the code
   must keep (section 5), known issues (section 7) and a checklist (section 8).
2. Run `npm install` and `npm test` (70 tests must pass). Do not edit
   dist/chaos-spin.js; it is generated by `npm run build`.
3. Review the code against the invariants and the checklist. Prioritise:
   determinism of the simulation path, save migration, battle and tournament
   state machines, resource disposal in src/render, and input parity.
4. For each finding give: file:line, severity (blocker/major/minor/nit),
   a concrete failure scenario (inputs -> wrong result), and a suggested fix.
   Verify each finding by reading the surrounding code or running a test
   before reporting it; drop anything you cannot substantiate.
5. Do not change code during the review. End with a short prioritised list
   of the top 10 fixes.
```
