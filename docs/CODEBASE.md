# Chaos Spin: Arena Zero: codebase guide for reviewers

A complete map of the code for a human or AI reviewer: what each part does,
how the parts connect, the rules the code must keep, where the risks are,
and a review checklist. Branch: `claude/chaos-spin-arena-zero-ynh785`.

---

## 1. What the project is

A single-player, browser-based 3D spinning-top battle RPG. Battles run on a
custom rigid-body spinning-top simulation, and the game is built around
it: modular parts with loot and traits, Spirit Chips (spirit creatures with
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
npm test                 # 246 Node unit tests (node --test tests/*.test.js)
npm run test:browser     # build, then 15 end-to-end scenarios in headless Chromium
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
  core/               math (vectors/quaternions), deterministic maths (dmath), seedable RNG, event emitter: no DOM, no Three.js
  physics/            spinning-top simulation: pure math, deterministic, no DOM/Three.js
  game/               battle controller, launch model, AI, abilities, objectives, background sims
  systems/            persistent game logic on plain data: assembly, items, loot, saves, story, tournaments…
  data/               all content as data: parts, traits, beasts, arenas, story, tournaments, characters…
  render/             Three.js presentation: renderer, cel shading, part models, stadium, effects, camera
  render/parts/       one builder per part slot (ring, core, disc, lock, tip, auxModule) + shared contract
  ui/                 DOM UI framework (screen stack, focus nav), widgets, charts
  ui/screens/         every screen (title, menu, battle HUD, workshop, story, tournaments, …)
  input/              action-based input (keyboard, mouse, gamepad, touch), bindings and presets
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
| `battle.js` | 1047 | Match controller: formats (single, bo3, bo5, points, endless), phases, launches, finishes, scoring, stats, events, replay record and playback, debug finish. |
| `launch.js` | 207 | Launch model: charge meter, gold window, techniques, lean/aim → initial spin, velocity and tilt; launcher and cable gear. |
| `ai.js` | 556 | AI controller that produces the same control frame as a human; personalities, skill (reaction, accuracy), velocity-control steering, contact awareness, rival tweaks, adaptation between rounds. `pressWhenBehind` presses for a knock-out when losing the spin race; `readRace` projects that race from both builds' estimated spin time (`assembly.summary.estSpinTime`) and holds the centre when it would outlast the opponent. |
| `abilities.js` | 301 | Spirit meter, Spirit Chip abilities (signature, secondary, ultimate), tactical guard and surge, timed modifiers. |
| `humanController.js` | 152 | Turns input actions into the control frame; the D-pad sends playbook triggers (`c.pattern = 'id:variant'`, double-tap = variant). |
| `playbook.js` | 178 | Playbook (D-pad patterns: Anchor, Orbit, Sidestep, Slingshot, Feint, Herd): `PATTERNS`, `patternSteer(state, ctx)` as a pure function of the battle state and integer ticks. `Battle.runPattern` runs it for any fighter each tick (stick 0.2-0.5 nudges, 0.5+ for 0.12 s breaks; `dashAim` foe/path); only the trigger is recorded, playback recomputes the steer. Design: `.claude/research/reviews/playbook-design.md`. |
| `skillRules.js` | 33 | Openings (`openness`), punish window, spirit for skill moments, and the judges' card (`JUDGE` points) that decides a time-out (`Battle.decision`). |
| `objectives.js` | 59 | Story training objectives measured from real battle events. |
| `../physics/mechanisms.js` | 140 | Classic-series moving parts inside the simulation (spec.mech from assembly): magnet forces between tops (substep), spring tips (absorb when struck, hop), clutches (energy stored at launch, released on a hit or at low spin, tip change), automatic tip shifts. Booked to the `mechanism` ledger; emits `mechanism` events. TopBody keeps a live `tip` copy that these change. |
| `itemEffects.js` | 125 | Reactive item effects: triggers from traits and synergies (hit, heavy hit, struck, wall, lock slip, ability, dash, counter, low spin, edge escape) with cooldowns, stacks and per-round limits, acting through timed modifiers, spirit, the next-hit lock-stress multiplier and `sim.restoreSpin` (ledger). Seeded RNG; created per round only when someone carries reactive effects. Order in one impact: abilities, Rift, items. Reports trigger counts for the results breakdown. |
| `riftEffects.js` | 122 | Rift Run in-battle effects, only when a participant carries a `rift` block: sweet-spot hits, Scorch/Static/Rust statuses as timed modifiers, status fusions (meltdown, flashover, brittle), Second Wind. Emits `riftStatus`, `riftFusion`, `sweetSpot`, `meltdownHit`, `secondWind`. |
| `matchJob.js`, `matchSim.js`, `tournamentRunner.js` | ~290 | Headless AI-vs-AI matches for tournaments: Web Worker from an embedded Blob URL, with an inline time-sliced fallback. |

### systems/ (persistent logic, plain data)
| File | Lines | Purpose |
|---|---|---|
| `assembly.js` | 348 | Validates a build (architecture, socket, mass limits) and computes the physical spec plus a summary for the UI. **Stack heights live here** (`spec.geometry`). |
| `items.js` | 180 | Item instances: seeded stats, rarity, traits, set membership, durability, XP and mastery; `itemName` (nickname, generated title, base name). |
| `effectSpec.js` | 230 | Declarative effect specs → runtime functions (`physical`, `fx`, `launch`, `item`, `react`, `status`) and descriptions generated from the same numbers; mastery growth (`effMag`), part requirements (`requirementsMet`), trigger names. |
| `itemGen.js` | 150 | Generation v2: seeded, versioned pipeline (traits within a power budget, exclusions, cursed rolls, special, set, tolerances, validation, title, visual variant, provenance in `item.gen`); `regenerate(item)` rebuilds an item from its record. |
| `itemValidate.js` | 85 | `validateItem`: ids, slots, rarity, magnitudes, counts, durability, finite stats, and the resolved part's physical bounds. Used by `addItem` (refuses) and `normalizeProfile` (quarantines). |
| `synergy.js` | 230 | Synergy engine: build context (traits, families, statuses, sets, mastery, curses, part types, mass, beast, launcher, Rift charms), requirement checks with contributing items, active rules and near misses (hidden ones stay hidden), effects for battle (`buildBattleFx`: sources, reactive, launch/skill keys, status block), discovery. |
| `compare.js` | 200 | Measured swap comparison for any build: part rows, finished-top rows, launch rows, traits and sets gained/lost, legality, role verdict. |
| `modifiers.js` | 115 | Folds traits, sets, skills, synergies and beast passives into bounded modifier channels that the physics reads; per-source uptime for the results breakdown. |
| `loot.js`, `progression.js` | ~310 | Seeded loot through `itemGen` with bad-luck protection (`PITY`); post-match XP, rewards, durability wear, stats, synergy discovery. |
| `workshop.js` | 470 | Equip, repair, upgrade, reroll and transfer traits, craft, dismantle (all validated); imprints kept on dismantle and engraved onto other parts; spare copies train mastery; relics protected; undo. |
| `legends.js` | 115 | The Archive and the Legend slot: project status and purchase (research, in order, level/chapter gates), awakening (recruits the legend's chip, creates or switches the one loadout flagged `legend`), `legendKit(id)`: the fixed kit as item-shaped objects built from `data/legends.js`, never stored in the inventory (`loadoutItems` returns it, so the slot gets no wear, XP or equipping). |
| `relics.js`, `journal.js` | ~200 | Handcrafted relics (`data/relics.js`): earned from the save's own records (checked on every save and load), the relic item, recasting. The Journal: counts, where each part is found, bad-luck protection counters, milestone rewards. |
| `save.js` | 239 | IndexedDB with localStorage fallback, 3 slots, export and import, **schema migration** (SCHEMA_VERSION = 4: v4 adds discovered synergies, pity counters, the item quarantine), replay storage (newest 12 plus pinned). A save from a newer version is flagged (`newer` on load, `importedFromNewer` on import) so the title screen can warn. |
| `profile.js` | 137 | New profile, normalisation, default settings. |
| `tournament.js` | 704 | Pure tournament engine: single and double elimination (bracket reset), round robin, league with playoffs, Swiss; standings, placements, prizes. |
| `story.js`, `rivals.js`, `modes.js`, `beasts.js`, `loadout.js` | ~900 | Story progress and flags; habit tracking and rival counter-builds; Challenge, Survival and League; beast bond and trials; loadout to participant. |
| `partGen.js` | 190 | Daily Store prototypes: seeded generator for rings, discs, tips, locks and launchers inside catalogue ranges (role archetypes, power/window trade-off for launchers), with generated names and descriptions. Definitions travel inside items (`item.def`), so `baseOf`, assembly, launch gear, renderer and workers need no registry. |
| `store.js` | 150 | Shop: odds per offer from the loot rarity weights, packs/capsules/bundles via `rollLoot` (deterministic per profile, guaranteed first item), crates, daily deals (exact items from a day-seeded stream, bought once per day). Catalogue in `data/store.js`, screens in `ui/screens/store.js`. |
| `rift.js` | 386 | Rift Run state on `profile.rift`: seeded act maps, start, node flow, battle results, hearts, reward queue and picking, bag, end of run (Essence, Locker, career rewards), talents. |
| `riftFit.js` | 90 | Pure fit checks: does a part or charm serve the run's build (roles from the ring, strong traits, synergy completion, empty slots, charm families toward Resonance, element). Drives the viable-first-offer guarantee and dry-streak pity in `riftLoot.js` and the fit chips on reward cards. |
| `riftFlags.js` | 69 | Lasting event consequences (`run.flags`) that reach a battle (`echo`: a gift as player modSources in the next boss fight; `nextEliteAffix`: extra traits on the next elite). Pure: never rolls `run.counter`, so scout sheet, battle and replay agree; old saves have no flags (read with `?.`). |
| `riftBattle.js`, `riftLoot.js`, `riftNodes.js` | ~560 | Run effects (charms, resonance, boons) → battle participants and opponents (elite affixes, vault rules); counter-seeded loot, prices, forge jobs, shrine and event rolls; trader, forge, shrine, camp and event actions. Everything rolls from `runRng(run, label…)`, so a run replays from its seed. |

### data/ (content)
Parts (63 across 6 slots, 14 of them the classic series), traits (99, declarative specs in `traits.js`, channels and conditions in `channels.js`), synergies (19, `synergies.js`), sets (6), rarity (7), launchers (12) and
cables (5), techniques, arenas (7), beasts (15: 11 plus the four legend chips in `legendBeasts.js`) plus lore, legends (`legends.js`: the Four Founders' builds, traits, founders and Archive projects; legend part defs carry `model`, the catalogue part whose 3D model they reuse), relics (`relics.js`, with `forge`: numbers over the base part, geometry untouched), AI profiles,
opponents (8 archetypes), characters (10), story (6 chapters, 93 nodes, one
file per chapter in `data/story/chN.js`, registered in `data/story.js`;
nodes may carry `when` conditions, battles set `<node>:won/lost` flags and
may carry `roundLines`; rewards can teach `patterns`), tournaments (9 plus story events plus 5 league divisions),
challenges (12), skills (5 paths), upgrades and tuning; Rift Run content
(`rift.js` acts, nodes, depths, statuses, affixes, vaults, events, economy,
talents; `riftCharms.js` 38 charms in 6 families; `riftBoons.js` 16 boons; `riftBosses.js` boss kits for Sora, Daichi, Mirelle
and Nyx, each ONE visible weakness as a conditional modifier source on existing
channels, its text generated from the numbers (a kit may also set `launcher`,
`spinRead` and `parts` swaps, applied in `riftBattle.js` `nodeOpponent` only
where the build still validates); `arenaTwists.js` Slick Ring, Glass Floor
(depth 1+), Steep Bowl, Dome (2+) and Thin Rim (3+), pure `+ - * /` functions on a stadium def, resolved by
`resolveArena("<base>+<twist>")` in `arenas.js`, which is also the id replays
and saves store). Part numbers are
physical (mm, g) and consumed by `assembly.js`.

### render/
Art styles: `toon.js` builds cel materials (Anime ink) or physically based
ones (Realistic, `setRenderStyle`); `environment.js` (procedural hall or the
Blender panorama → PMREM environment, crowd sprite loader), `post.js`
(bloom/FXAA/MSAA composer for Realistic), `assets/` (generated data-URI
modules from `tools/blender/`: never hand-edit; regenerate with Blender and
`tools/blender/pano-to-module.mjs` or `mesh-to-module.mjs`).
`meshAsset.js` (45 lines) decodes the compact Blender meshes (int16 positions
over bounds, int8 normals, uint16 indices, groups by palette slot) once per
mesh and caches crease-line edges; used by launchers and the Blender part
models. `tools/blender/parts-dump.mjs` writes `.tools/parts.json` from
`data/parts.js`, so Blender builds from the physics numbers.
**Blender part models:** `parts/ringModel.js`, `discModel.js`, `tipModel.js`
draw `assets/rings.js`, `discs.js`, `tips.js` (from `tools/blender/rings.py`,
`discs.py`, `tips.py`) in the anime look; each returns null unless the part's
numbers match the bake, and the slot builder then uses its procedural model.
Changing a part's numbers therefore needs a re-bake (parts-dump, Blender,
mesh-to-module) or the part quietly draws procedural. Cores, locks and aux
modules are procedural only.
| File | Lines | Purpose |
|---|---|---|
| `renderer.js` | 368 | Owns the WebGLRenderer, lights, camera rig, arena, top visuals, launchers, the battle-event → effects mapping, pooled physics debug overlay, ink-layer toggle, the inspect stage switch. Preloads both battlers' spirits at round start. |
| `toon.js` | 292 | Cel-shading kit: `toonMaterial()` (MeshToonMaterial + stepped ramps + specular band + rim, shader patch), ink outlines as inverted-hull child meshes on `INK_LAYER` (shared materials marked `userData.shared`), `disposeTree()`. |
| `lighting.js` | 28 | Shared lights and tone mapping (also used by the preview tool). |
| `topMesh.js` | 205 | `TopVisual`: builds the six part models, stacks them at physics heights, interpolates pose, display spin, speed ring, explode, assemble animation, ghosting for Inspect, dispose. `meshes[slot]` = part groups (a Shatter detaches them). |
| `parts/common.js` | 170 | **Part-builder contract** (read this first) and geometry helpers. |
| `parts/index.js` | 72 | Builder registry, build context (`ctx`), stack placement, aux mount kinds. |
| `parts/discClassic.js` · `ringClassic.js` · `tipClassic.js` · `lockClassic.js` | 120–330 each | Classic-series models: die-cast disc plates (dog-bone hole, spokes, lobes, N/S magnet print), stickered rings built from the physics outline (hoop, rollers as spinners, gem spikes, raked wings), tips (steel ball, coil spring, engine-gear clutches, auto shift) via the tip.js kit, and the roller lock (wheels on radial axles). Routed from the slot builders by part id. |
| `parts/ringLegend.js` | 180 | The four legend rings (Reverse Dragon, Double Wing, Tiger Defenser and Cross Spike style) on the classic-ring kit, each with a fixed palette. Other legend parts render their catalogue model through `part.model`. |
| `parts/ring.js` · `core.js` · `disc.js` · `lock.js` · `tip.js` · `auxModule.js` | 620–1100 each | One individually designed model per part id plus a parametric fallback for unknown ids (ring, disc and tip try the Blender model first). Must stay inside the physics envelope (see §5). `auxModule.js` is named so because `aux` is a reserved file name on Windows. |
| `arenaMesh.js` | 1168 | Cel-shaded stadiums built from the same arena definition as the physics (floor lathe of the height profile, walls, exits, crowd, backdrop). |
| `effects.js` | 483 | Pooled effects: sparkle particles, speed-line streaks, star hit flashes, shockwave rings, cel dust, trails, Shatter debris (detached part groups), ring-out bursts, wobble warnings, head-on vs graze impact sprays (`glance` from the impact event). Pools are rebuilt when quality changes their size. Hosts the `SpiritSystem`. |
| `spirits.js` | 261 | Spirit Chip manifestations: spirit shader (cel rim, scan stripes, lower-body fade), light pillar, sigil laid on the bowl slope, rise/fade timeline, pooling, shader warm-up and per-battle preload (no first-summon stall). Visual only. |
| `spiritForms.js` | 333 | One procedural 3D form per beast emblem (coil dragon/serpent, phoenix, raven, manta, wolf, lion, stag, tortoise, scorpion, orrery) built from merged primitives; `aU` per vertex drives the body wave. |
| `inspect.js` | 154 | Inspect turntable stage (own scene and camera): explode, focus and ghost, assembly replay. |
| `camera.js`, `emblems.js` | ~300 | Camera modes (broadcast, tracking, player, overhead, launch, victory; tracking and player pull back near the wall during ring-out threats); procedural beast emblems. |

### ui/
`ui.js` (screen stack, spatial focus navigation for controller and keyboard,
prompts with device glyphs, toasts, modals), `widgets.js`, `charts.js`,
`compare.js` (swap comparison panels), `synergyPanel.js` (synergies, build
breakdown, journal), and
`screens/` (title, main menu, quick battle, battle HUD 630 lines, results and
replays, workshop 590, inspect, beasts, skills, stats, settings, story 408,
dialogue, tournament 580, modes and lab, Rift Run hub/map, loot and node
screens). Style objects passed to `h()` support CSS custom properties
(`'--rc': color`). Screens are classes with `render()`
returning DOM, optional `onEnter`, `onExit`, `update`, `handleInput`,
`onNav`, `onTab`, `onAlt`, `onFocus`, `prompts()`.

### input/, audio/, workers/
Action contexts (`menu`, `launch`, `battle`) with remappable bindings and
presets (Classic, Competitive, Advanced), dead zones, curves and calibration;
`padLayouts.js` presents non-standard (DirectInput) controllers in the
standard layout, including hat-switch d-pads, and the player is told once.
`touch.js` is the phone and tablet layer: on-screen floating sticks and
buttons that join the input manager as a virtual standard gamepad (so every
binding preset works by touch), shown per battle phase (launch, battle,
continue, watching); menus are tapped directly, prompts become buttons
(`InputManager.inject`), and pressing and holding an item does its
secondary action. Small screens zoom the menu UI (`--ui-zoom`).
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
   **Same bits on every device:** code that decides an outcome (physics,
   launches, AI, abilities, item effects, assembly, loot, rivals,
   tournaments) uses `core/dmath.js` (`dm.sin`, `dm.atan2`, `dm.pow`,
   `dm.hypot`, ...) instead of `Math.sin` and friends, whose last bits
   differ between engines, and never `**` with a non-integer result. Only
   `+ - * /`, `Math.sqrt` and rounding are allowed raw. Rendering, audio and
   UI may use `Math.*`. Checked by `npm run test:determinism` (Node,
   Chromium, Firefox and WebKit must match exactly).
   Replays (format v2) record only the human's inputs, including aim,
   technique and spin changes during the countdown at their tick; the AI's
   launches, false starts and spawns are recomputed on playback. v1
   recordings (saved before 2026-10-13) still play back.
   Playbook patterns run inside the step from the recorded trigger (a control
   row's 7th field); never mutate the human's control object (a frame may run
   several ticks with the same input). `RULES_REV` (battle.js) goes up with
   every rules change; older replays warn that they may play differently.
   **Rift map streams:** a new kind of node roll gets its own seeded stream
   (`mixSeeds(run.seed, '<label>', ...)`), never a draw from the map RNG.
   Arena twists roll this way (`systems/rift.js`), so every existing seed's
   map is unchanged; never on the run's first battle.
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
   (A new field with a default in `newProfile` is filled in by
   `normalizeProfile` without a bump, e.g. `profile.playbook`.)
   Story node ids and chapter ids are save keys: never rename or delete one.
8. **Runs from `file://`.** No runtime network requests; fonts are embedded
   as base64; the worker is a Blob URL; one bundled script.
9. **Input parity.** Every screen is fully usable with controller only and
   keyboard only (focus must always be visible; nothing mouse-only).
10. **Windows-safe file names.** No `con, prn, aux, nul, com1–9, lpt1–9` as file
    names, and no `: * ? " < > |`. (A file named `aux.js` once broke cloning
    on Windows.)
11. **Original content only.** No copyrighted characters, logos, names or
    designs from existing franchises.
12. **No code in item data.** Items store ids, magnitudes, seeds and
    provenance only; behaviour lives in registered declarative specs
    (`data/traits.js`, `data/synergies.js`) compiled by `systems/effectSpec.js`.
    Descriptions are generated from the specs; never hand-write numbers.
13. **Synergies need loot.** Every synergy rule has a loot requirement
    (trait, set, mastery, curse, charm…), so bare reference builds never get
    one and `npm run balance` keeps measuring the base game.
14. **Validated items.** `addItem` refuses invalid items; loading quarantines
    them. New item sources must pass `validateItem` (tests/itemGen.test.js).

---

## 6. Tests and tools

| Command or file | Covers |
|---|---|
| `tests/physics.test.js` | Conservation, gyroscopic dynamics against theory, friction, collisions (head-on vs glancing, impact tilt, repeated contacts), wall rebounds, ring-out, determinism, clamp ledger. |
| `tests/progression.test.js` | Items, loot, traits, sets, durability, XP, workshop, saves and migration. |
| `tests/beasts.test.js` | Every ability has a measurable effect in the real simulation. |
| `tests/ai.test.js` | Personalities are distinguishable, fairness (same controls), rival adaptation. |
| `tests/legends.test.js`, `relics.test.js` | Legends validate with their chip and three projects; projects run in order and awaken; the Legend slot refuses equipping and the Rift; save repair keeps one slot. Relic forge applies and never touches geometry. |
| `tests/tournament.test.js`, `story.test.js`, `modes.test.js` | Formats and standings; story integrity and once-only rewards; challenge, survival and league rules. |
| `tests/replay.test.js` | Recorded match replays identically under different frame timing; a live AI match ends identically at 30/60/144 fps; replay storage. |
| `tests/render.test.js` | Spirit forms for every beast (finite, stadium-sized, animate safely); camera wall framing. |
| `tests/classic.test.js` | Classic series: every part assembles; magnets attract/repel/pull plain metal with momentum and energy books intact; spring tips absorb and hop; clutches store and release (hit, timed fallback, low spin); auto shift; rollers on locks and rings; classic launchers; magnet flip; a deterministic battle. |
| `tests/store.test.js` | Shop: odds add up and respect guarantees, prices and guarantees, pools (classic, launch gear, bundles), crates, capsule minimums, determinism, daily deals (exact item, once a day, next day new), old-save defaults. |
| `tests/skillRules.test.js`, `dash.test.js`, `strike.test.js` | Openings and punishes, the judges' card, dash windup and counter reads, strike attribution. |
| `tests/playbook.test.js` | Every pattern starts, steers and ends; Orbit holds its circle; Slingshot loads and dives; stick nudge/break; a match with patterns replays identically; the AI reads a Feint and telegraphs its plans. |
| `tests/rift.test.js` | Rift Run: seeded maps and constraints, rewards and skips, hearts and Second Wind, charms/resonance/boons into participants, forge, trader, shrine, camp, events, Locker, talents, statuses, fusions, sweet spots, a headless two-act run. |
| `tests/riftFit.test.js`, `arenaTwists.test.js`, `riftKeystones.test.js`, `riftBosses.test.js`, `riftEvents.test.js` | Rift Depth M1: fit checks and the viable first offer; twists resolve, are pure and leave seeds' maps unchanged; keystones; boss weaknesses; events and `run.flags`. |
| `tests/controls.test.js` | Keyboard + gamepad press counted once, menu auto-repeat, hat d-pads, non-standard layouts, disconnects, audio without Web Audio, head-on vs graze feedback. |
| `tests/browser/run.js` | 18 end-to-end scenarios (incl. `touch`, `relics`, `playbook`) driving the built game with keyboard and a virtual gamepad: keyboard, gamepad, workshop (incl. crafting, the Forge and a left-spin launcher's spin switch), beasts, tournament, story, screens, lab, modes, replay, inspect, rift (lobby → battle → spoils → trader → reload → camp/forge → boss → Locker → bank), classic (every classic part in Inspect, a clutch battle with the digital launcher readout), store (buy a pack, reveal, buy a daily deal, Daily Store, right-stick scrolling), career (new game → build → Inspect → Rookie Cup title → prizes → Store crate → upgrade → equip a prize → skill point → save → reload → battle). It uses the GPU when there is one (about 4 min on an Intel UHD 620) and SwiftShader otherwise (about 45 min; force it with `BROWSER_SOFTWARE=1`); run scenarios one at a time with `node tests/browser/run.js <name>`. |
| `tools/balance-par.js` | Win rates with 95% intervals per reference build per stadium. `npm run balance:check` gates the 25-70% band. |
| `tools/probes/` | Diagnosis probes (run from the repo root, override JSON like `balance-tune.js`): `defprobe.mjs` (defense vs each build, finishes by winner, AI plan time), `legprobe.mjs` (a legend kit vs a full relic build), `energy.mjs` (launch energy per legend). |
| `tools/fairness.js` | Fairness gates (`npm run fairness`): no-input bots on equal parts (gate 1, realistic targets: average launch < 70% at Elite, < 50% at Legend), gear curve, difficulty steps (>= +10 points; use n >= 150), luck. |
| `tools/preview/shoot.js` | Headless renders of part grids, assembled or exploded tops, the four legend tops (`legends`), stadiums with effects, the spirit gallery (`spirits`); `--audit` prints envelope numbers per part. |

---

## 7. Known issues, risks and technical debt

- **Balance:** `npm run balance:check` 2026-10-24: attack 62%, defense 26%,
  stamina 45%, balance 52%, burst 64% (band 25-70%). Defense is near the
  floor; the Black Bulwark legend (defense) wins only 38% vs a full relic
  build.
- **Fairness gate 1 fails** (2026-10-20): a no-input bot with an average
  launch beats the AI on equal parts 77% at Elite and 59% at Legend (targets
  < 70% / < 50%). On equal parts the better launch wins the spin race; see
  `docs/HANDOFF.md`. Model coefficients live in
  `PHYSICS` (`physics/simulation.js`); `tools/balance-tune.js` tests changes,
  `npm run balance:check` guards the 25-70% band.
- **Story:** chapters 1-6 rewritten (93 nodes); chapters 7-20 are planned
  (`.claude/research/reviews/story-expansion-plan.md`), not written. Characters have no portrait art (the dialogue shows initials).
- **Visual review gaps** in the new cel-shaded part models: `glows` are
  collected but never pulsed; ring key-slots don't align with core tabs;
  higher-rarity trims only partly checked; no automatic quality downgrade on
  software rendering. Measured battle frame: 201 draw calls / 150k triangles
  at High with ink, 82 / 49k at Low without (see docs/audit-phase1.md).
- **Large files** that are candidates for splitting: `physics/simulation.js`
  (936), `game/battle.js` (1047), `systems/tournament.js` (704),
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
