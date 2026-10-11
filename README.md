# Chaos Spin: Arena Zero

A browser-based 3D spinning-top battle RPG. Every battle runs on a custom
rigid-body spinning-top simulation; equipment, loot, Bit-Beasts, skills,
tournaments, a six-chapter story and several extra modes are built around it.
All characters, parts, creatures, places and names are original.

## Running it

**Just play:** open `index.html` in Chrome (or any Chromium browser). The
prebuilt bundle in `dist/` runs straight from disk — no server, no install.
WebGL is required.

**From source** (Node 18+):

```sh
npm install          # esbuild + three
npm run build        # bundles src/ into dist/chaos-spin.js (and the simulation worker)
npm start            # build + local static server, then open the printed URL
npm run watch        # rebuild on change
```

Progress is saved in the browser (IndexedDB, falling back to localStorage) in
three save slots. Saves can be exported to and imported from a .json file on the title
screen's save management.

## Controls

Everything — including every menu — works with a controller alone, with the
keyboard alone, or with mouse + keyboard. Prompts switch to the last device
used (Xbox, PlayStation, Nintendo or generic glyphs). Bindings can be remapped
per context (Settings → Controls), with presets **Classic** (hold the trigger,
let go to launch), **Competitive** (LT charges, RT releases) and **Advanced**,
plus dead-zone, response-curve, sensitivity, vibration and calibration
options. Unplugging a controller mid-battle pauses the game.

| Action | Controller (Xbox layout) | Keyboard |
|---|---|---|
| Menus: move / select / back | D-pad or left stick / A / B | Arrows or WASD / Enter / Esc |
| Menus: switch tabs | LB / RB | Q / E |
| Launch: aim position / lean | Left stick / right stick | WASD / arrows |
| Launch: charge / release | Hold RT (Classic) or LT then RT | Hold Space, release |
| Launch: technique / spin direction | X / Y | T / R |
| Battle: steer | Left stick | WASD |
| Dash / Grip Brace / Counter Stance | A / B (hold) / X | Space / Shift / L |
| Bit-Beast abilities: signature / secondary | RT / LT | F / G |
| Ultimate | LB + RB together | R or V |
| Spirit Guard / Spirit Surge | LB / RB | Q / E |
| Camera / telemetry / pause | Y / View / Menu | C / Tab / Esc |

## Modes

- **Story** — six chapters (Harbor District → Arena Zero). Battler creation
  (name, colour, pronouns, battle style with starter parts), guided training
  with objectives measured from real battle events, rival battles, choices
  that change later scenes, Bit-Beast discovery and story brackets. Losing
  never blocks progress: retry, change your loadout, or lower the story
  difficulty (which only changes AI skill, never physics).
- **Quick Battle** — any unlocked stadium, opponent archetype, difficulty and
  format (single round, best of 3/5, points race).
- **Tournaments** — a five-tier circuit of nine events: single elimination,
  double elimination (with a grand-final bracket reset), round robin, league +
  playoffs and Swiss. Requirements, entry fees, rule sets (Iron Endurance
  no-repair rule, loadout lock, build-role restrictions), scouting reports,
  prizes, first-win unlocks, rankings, a trophy cabinet and career history.
  Other matches in a bracket are real headless battles simulated in a Web
  Worker. Tournaments resume after a reload.
- **Rift Run** — roguelite runs through four Rifts (three floors and a rival
  boss each) on a branching map: battles, elites, vault challenges, traders,
  forges, shrines, camps and unknown events. Run-only loot (parts with
  elements, 38 charms in six resonating families including cursed ones,
  levelled boons tied to your Bit-Beast), Scorch / Static / Rust statuses
  that fuse, sweet-spot hits, hearts instead of one life, and Essence that
  buys permanent Rift Talents. Depths 0-8 add rules for more Essence; the
  Locker keeps your best find. Runs resume after a reload.
- **Modes hub** — **Practice Lab** (launch range with launch analysis,
  sparring targets with the physics debug overlay, a Build Lab that compares
  two builds with spin-decay curves and simulated head-to-heads), **Custom
  Battle** (both sides, all rules, AI-vs-AI exhibitions), **Challenges**
  (12 constrained goals), **Survival** (endless, escalating, wear carries
  over) and **League** (five divisions, promotion and relegation).
- **Workshop** — loadouts, inventory, repair, upgrades, trait reroll and
  transfer, tuning, crafting, the collection log.
- **Bit-Beasts**, **Skills** (five paths, respec), **Statistics** (records,
  charts, history and **replays**).

## How it works

**Physics** (`src/physics/`). Each top is an axisymmetric rigid body with its
own inertia tensor, assembled from the real mass and geometry of its parts.
State is position, velocity, orientation and angular momentum; rotation uses
an analytic torque-free update plus contact torques, so precession, nutation
and the sleeping/toppling threshold emerge rather than being scripted. The
simulation runs at a fixed 120 Hz with 16 substeps and sequential-impulse
contacts (Coulomb friction cones, torsional tip friction, velocity-weakening
friction, restitution, speculative tip contact). Blade profiles (face angle,
slope, catch) are shared by the collision code and the renderer. Every joule is
accounted for in an energy ledger (tip friction, landings, scrape,
collisions, walls, air drag, steering, abilities, damping, numerical
residual), visible in the battle telemetry panel. Lock damage accumulates
from counter-rotational angular impulse and can Shatter (burst) a top.

**Launching** (`src/game/launch.js`). Energy = launcher drive force × cord
length × transfer and cord efficiency × charge; spin = √(2E / I). Release
timing against a gold window, overcharge and misfire, lean and aim, and seven
techniques (four basic, three learned) change the initial state.

**Equipment.** 49 parts across six slots plus 6 launchers and 5 cords, each a
unique item instance (seeded stats, up to three traits from 72, optional
special trait, set membership across 6 sets, durability, XP and mastery,
history and nicknames) in 7 rarities. Traits feed bounded modifier channels
that the physics reads; there are no cosmetic-only stats. Durability degrades
physical properties; repairs, a free basic service and restoration keep any
build usable.

**AI** (`src/game/ai.js`). AIs use exactly the player's controls and
physics, see a delayed snapshot of what the HUD shows, and differ by
personality (seven behaviour profiles) and skill (launch accuracy, reaction,
steering precision). They steer by velocity control, back off when contacts
cost them more spin than they take, and adaptive rivals change builds and
tactics based on your recorded habits, and adjust between rounds.

**Look** (`src/render/`). Cel-shaded toon materials with hard light bands,
a specular band and rim light (`toon.js`), ink outlines drawn as inverted
hulls on their own layer (Settings → Graphics → Ink outlines), and a single
key light. Every one of the 49 parts is its own hand-designed procedural
model (`src/render/parts/`): a top is assembled by stacking the part models
at the heights the physics uses, and every part stays inside the space the
physics gives it (ring silhouettes are the collision profile). Parts click
together at the start of a battle, fly apart on a Shatter, and can be
inspected one by one in the Workshop's Inspect 3D view. Stadiums, effects
(star hit flashes, speed-line sparks, ring-out bursts, wobble warnings) and
the interface (Bangers and Chakra Petch display fonts, OFL, embedded) share
the same anime style. Bit-Beast abilities summon the beast itself: a
translucent 3D spirit, one procedural form per beast (`spirits.js`,
`spiritForms.js`), rising in a pillar of light over a sigil. It is purely
visual and fades low down so the top and its collisions stay readable.
`node tools/preview/shoot.js` renders part grids, assembled or exploded tops,
stadiums with effects, and the spirit gallery (`spirits`) headlessly, with an
envelope audit (`--audit`).

**Replays.** Battles are deterministic given their seed and inputs. Each
match records your per-tick controls, launch setups and releases and when
each top spawned; playback re-simulates the match and checks that it ends
the same way.

## Development

```sh
npm test               # 93 unit tests (physics, loot, progression, beasts,
                       # tournaments, AI, story, modes, replays, render, rift)
npm run test:browser   # builds, then plays the game in headless Chromium with
                       # a keyboard and a virtual gamepad (12 scenarios, ~3 min
                       # on a GPU; BROWSER_SOFTWARE=1 forces software rendering;
                       # first run: npx playwright install chromium)
npm run balance -- 8 all   # simulated round robin of reference builds on
                           # every stadium (worker threads)
```

Layout: `src/physics` (simulation), `src/game` (battle, AI, launch,
abilities, objectives, replays, background simulation), `src/systems`
(assembly, items, loot, progression, workshop, saves, rivals, tournaments,
story, modes, rift), `src/data` (all game content), `src/render` (Three.js),
`src/audio` (procedural Web Audio), `src/ui` (screens), `tools/`, `tests/`.

## Known limitations (honest list)

- **Type balance (AI vs AI, all seven stadiums, `npm run balance -- 8 all`):**
  Attack about 53%, Defense 60%, Stamina 59%, Burst 49%, Balance only about
  30%. The classic triangle holds (Attack beats Stamina, Stamina beats
  Defense, Defense beats Attack); the Balance reference build still loses
  long spin races to Defense and Stamina. Stadiums shift the numbers;
  `npm run balance:check` guards against regressions.
- The physics is a careful game model, not an engineering simulation: tops
  are treated as axisymmetric rigid bodies (blade asymmetry enters through
  the contact profile, not the inertia tensor), the stadium is a surface of
  revolution, and air drag is a simple quadratic model.
- Replays are only guaranteed to verify on the same game version; changing
  physics or content between versions makes old replays diverge (the game
  says so instead of showing a wrong result).
- Chapter 1 of the story is the most complete; chapters 2–6 are shorter
  (5–7 scenes each) and reuse the same battle and bracket systems.
- All 3D models and textures are generated in code (no imported model
  files), and music and sound effects are synthesised at runtime.
- Ink outlines and the detailed part models cost draw calls: a battle frame
  measures about 200 draw calls / 150k triangles at High with outlines and
  82 / 49k at Low without. On software rendering or weak GPUs turn off Ink
  outlines or lower Quality.
- Single-player only: no online or local versus play.
- Software-rendered browsers (no GPU) run slowly; lowering Render
  resolution, Quality and turning off Shadows in Settings helps. The physics
  step is fixed, so results do not depend on frame rate.
- Browser storage can be cleared by the browser; use save export for
  backups.
