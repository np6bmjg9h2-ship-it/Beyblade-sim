# Loot engine: procedural items, relics and synergies

Plan and milestone log for the "Procedural loot, legendary items and roguelite
synergy engine" brief (2026-10-12), plus the requests that came with it: part
comparison in the Workshop, the Daily Seed mode, longer story chapters and
economy tuning. Terms: the brief's *affix* is the game's *trait*; *unique
relic* is the existing `relic` rarity, now reserved for handcrafted relics.

## Audit: what exists and is reused

| Area | Where | State |
|---|---|---|
| Item instances | `systems/items.js` `createItem` | Seeded, reproducible: base id, rarity, level, rolled tolerances (`stats`), traits `{id, mag}`, special trait, set, durability, XP/mastery, tuning, upgrades, history, provenance (`history.acquired`, `gen`). Generated prototypes carry their own `def` (copied, never shared). |
| Definitions | `data/parts.js`, `data/launchers.js` | Immutable global bases (`PART_INDEX`); assembly clones before applying anything. |
| Rarity | `data/rarity.js` | Common, Uncommon, Rare, Epic, Legendary, Mythic, plus Relic. Rarity sets trait count and magnitude range, never base physics. |
| Traits (affixes) | `data/traits.js` | 72 traits in kinds `physical` (change the part at assembly), `conditional` (modifier channels while a battle condition holds), `launch`, `item`. Families offense/defense/endurance/mobility/technical/risk. Exclusion groups, special (legendary+) traits. Descriptions are hand-written functions, separate from the effect. |
| Modifier channels | `systems/modifiers.js`, `CHANNEL_LIMITS` | Bounded channels the physics reads every tick; duplicate traits never stack; conditions evaluated per tick; timed effects. |
| Sets | `data/sets.js` | 6 sets, bonuses at 2/3/5 pieces, some with drawbacks. |
| Physics link | `systems/assembly.js` | Tolerances, physical traits, tuning, upgrades and wear change mass, inertia, contact layers, tip and lock before the simulation runs. `summarize()` gives estimated free spin, stability threshold, reach and more. |
| Battle hooks | `game/battle.js`, `game/riftEffects.js` | Events: impact, grind, wall, lock click, mechanism, ability, finish. Rift statuses already react to hits through timed modifiers (pattern to reuse). |
| Loot | `systems/loot.js`, `systems/riftLoot.js`, `systems/store.js`, `systems/partGen.js` | Seeded drops with source tiers and favoured pools; Rift run loot, charms (with resonance families and curses), boons, forge, trader, shrine; Store packs with guarantees and printed odds; Daily Store prototypes. No pity protection, no named drop tables. |
| Crafting | `systems/workshop.js` | Repair, upgrade, reroll trait, transfer trait (donor consumed), tuning, blueprints, Forge, dismantle. |
| Collection | Workshop `collection` tab, `profile.discovery` | Parts, sets and traits discovered. |
| Comparison | Workshop item detail | Assembled-top comparison exists but sits below history, is always against the *active* loadout and ignores traits, sets and launch gear. |
| Saves | `systems/save.js`, `systems/profile.js` | Schema v3, step migrations, backup rotation, `normalizeProfile` repairs. No per-item validation. |
| Tests/tools | `tests/*.test.js`, `tests/browser/run.js`, `tools/balance*.js` | 114 unit tests, 15 browser scenarios, parallel AI-vs-AI balance runs. |

Missing for the brief: event-triggered (reactive) effects with cooldowns and
stacks; cross-item synergy rules and an explanation of them; mastery/evolution,
curse and component-synergy traits on permanent items; a versioned generation
pipeline with power budgets, names and visual variants; handcrafted relics;
pity protection; item validation on load; a debug breakdown of what powered a
battle; a content schema for AI-assisted authoring; loot-level balancing.

## Architecture

```
data/traits.js       declarative trait specs  ──┐ compile (validated)
data/synergies.js    declarative rules          ├─> systems/effects.js  runtime: modifier sources,
data/relics.js       handcrafted relics         │                      reactive triggers, descriptions
data/lootTables.js   sources, rarity, pity    ──┘
systems/itemGen.js   seed -> base -> rarity -> traits -> exclusions -> budget
                     -> stats -> validate -> name -> visual -> instance (genVersion)
systems/synergy.js   build context -> active / near / hidden rules + graph
game/itemEffects.js  battle hooks -> triggers -> timed modifiers, spirit, lock stress
```

- **Declarative effects.** Every trait, synergy and relic is plain data:
  channel deltas with magnitude ranges, physical field operations, launch
  modifiers, reactive triggers (event, threshold, cooldown, stacks) and a fixed
  set of effect types. A compiler turns them into the runtime shapes the game
  already uses (`fx(m)`, `physical(part, m)`), and descriptions are generated
  from the same data, so the text can never claim an effect that isn't there.
  The existing traits are converted with a test proving identical results.
- **No code in item data.** Instances keep only ids, magnitudes, seeds and
  provenance; behaviour lives in registered definitions.
- **Reactive effects** run in a per-battle engine fed by existing events
  (impact, wall, lock click, ability, dash, counter, spin thresholds). Effects
  go through the modifier stack and the simulation's own helpers (spirit
  meter, lock stress, energy ledger), with cooldowns, stack caps and per-round
  limits. Deterministic: same seed, same battle.
- **Synergies** are rules with prerequisites (traits, trait families, part
  properties, set pieces, Bit-Beast, launcher, Rift charms/boons) and effects.
  Evaluated once when a battle or the Workshop builds the top, not per tick.
  The graph lists which items feed each rule and what is missing.
- **Generation** is seeded and versioned (`gen: { v, seed, source }`): the
  same seed and version reproduce the item. Power budgets per rarity keep
  combinations bounded; curses buy budget with a drawback.
- **Saves** move to schema v4: provenance and generation version on items, a
  journal, pity counters, daily-seed records. Items that fail validation on
  load are quarantined (kept, unequipped, listed), never silently deleted.

## Milestones

1. **Compare before you equip** (requested). Picker detail leads with the
   comparison: per-part stats better/worse, traits gained and lost, set
   bonuses gained and lost, and the effect on the finished top (free spin,
   stability, reach, mass, inertia, lock, launch energy for gear), with a
   one-line verdict. Uses the loadout being edited.
2. **Vertical slice of the engine.** Declarative traits + generated
   descriptions + equivalence test; item validation; generation pipeline v2
   with budgets, names, visual variants, version; reactive traits; synergy
   engine with a first set of rules, Workshop "Synergies" panel and a
   post-battle "What powered your top" breakdown; save v4 migration; tests.
3. **Visual leap** (requested 2026-10-12). A Realistic render style next to
   the anime ink style: post-processing (pmndrs/postprocessing: bloom, SMAA,
   N8AO ambient occlusion), physically based materials for plastic and metal
   lit by CC0 HDR studio lighting, item finishes from the visual variants,
   three.quarks for sparks, debris and trails, and Blender (4.5 LTS, headless
   scripts) for Bit-Beast spirits and stadium scenery. Must keep 60 fps on
   an Intel UHD 620 at the default setting.
4. **Relics, drop tables, journal, targeted crafting.** Handcrafted relics
   with fixed signature mechanics and clear acquisition paths; configurable
   drop tables with pity; collection journal (traits, synergies incl. hidden
   ones, relics, provenance); trait imprinting from dismantles and targeted
   engraving; a use for duplicates.
5. **Daily Seed.** One shared challenge per day: fixed starting top, fixed
   part options, rival sequence and a stadium modifier; local best and streak;
   shareable replay codes that re-simulate and verify the run. Offline first.
6. **Rift Run integration.** Rerolls with clear costs, relic rewards from deep
   bosses, run synergies with charms and boons, discovery notices, cleanup
   tests (nothing run-only leaks into tournaments).
7. **Authoring and balancing tools.** Content schema and validator CLI for
   Claude-assisted authoring (explicit registration, no network); loot
   simulation harness (trait/synergy usage, win-rate effect, outliers).
8. **Story and economy.** Longer chapters 2-6; Rift/Store economy checked by
   simulation until there is playtest data.

Every milestone: unit + browser tests, balance guard, build, commit and push,
artifact and patch notes updated, and a log entry below.

## Milestone log

### M1: Compare before you equip (2026-10-12)

- Files: `src/systems/compare.js` (new: measured swap comparison for any
  build), `src/ui/compare.js` (new: full and compact panels),
  `src/ui/screens/workshop.js` (picker and inventory detail lead with the
  comparison against the loadout being edited; list rows show ▲/▼ roles),
  `src/ui/screens/riftReward.js` (Rift loot cards use the same comparison),
  `styles.css`, `tests/compare.test.js`, `tests/browser/run.js`.
- Works: per-part rows from the resolved part (tolerances, traits, upgrades,
  wear), finished-top rows from the assembled summary (free spin, topple
  speed, inertia, mass, reach, blade face, hook catch, lock, centre of mass,
  imbalance, tip grip, air drag), launch rows for launchers and cables
  (energy, launch RPM for this top, perfect window, angle error, charge
  speed), traits and set bonuses gained or lost, legality. Each row names the
  roles a change helps or hurts; the verdict adds them up. Changes too small
  to show at the row's precision count as no change.
- Tests: 119/119 unit (5 new), 15/15 browser (workshop checks the panel).
- Known limits: role verdicts are a sum of measured changes, not a battle
  prediction; Bit-Beast and skill effects are not part of the comparison.

### M2: Loot engine vertical slice (2026-10-12)

- Files: `src/data/channels.js` (new: channel limits and conditions),
  `src/systems/effectSpec.js` (new: spec compiler and generated
  descriptions), `src/data/traits.js` (rewritten as 99 declarative specs: the
  72 originals bit-identical, plus 12 reactive, 3 elemental, 3 mastery, 4
  part-synergy and 5 curse traits), `src/game/itemEffects.js` (new: reactive
  engine), `src/data/synergies.js` + `src/systems/synergy.js` (new: 19 rules,
  7 of them hidden), `src/systems/itemGen.js` + `src/systems/itemValidate.js`
  (new), `src/systems/loot.js` (v2 generation, bad-luck protection,
  validated adds), `src/systems/riftLoot.js` (Rift parts through v2),
  `src/systems/loadout.js` and `src/systems/riftBattle.js` (synergies and
  statuses into participants), `src/systems/modifiers.js` (requirements,
  mastery growth, per-source uptime), `src/game/battle.js` (item effects,
  breakdown stats), `src/systems/assembly.js`, `src/game/launch.js`,
  `src/systems/items.js` (titles, compiled-trait checks, curse filter),
  `src/systems/profile.js` + `src/systems/save.js` (schema v4, quarantine),
  `src/systems/progression.js` + `src/ui/screens/rift.js` (synergy discovery),
  `src/ui/synergyPanel.js` (new), `src/ui/screens/workshop.js` (Synergies
  tab, synergy summary), `src/ui/screens/results.js` ("What powered your
  top"), `src/ui/widgets.js`, `styles.css`; tests `traits`, `itemEffects`,
  `synergy`, `itemGen` (new) and updates to `progression`.
- Works: every trait is data with generated text; reactive traits fire from
  real battle events through modifiers, spirit, lock stress and the spin
  ledger; Scorch/Static/Rust traits work in every mode (the Rift status
  system, including fusions); mastery traits grow with use; part-synergy
  traits need their part; cursed rolls trade a drawback for an extra trait;
  synergies combine traits, sets, mastery, curses, part types, the Bit-Beast
  and Rift charms, show their contributing items and near misses, and are
  discovered in battle (hidden ones reveal their names); drops are generated
  by a seeded, versioned pipeline with power budgets, names and visual
  variants, and can be rebuilt from their record; bad-luck protection
  guarantees an Epic within 20 random drops and a Legendary within 60;
  invalid items are refused or quarantined; the results screen shows each
  effect's active time and trigger count.
- Tests: 134/134 unit (traits 3, itemEffects 3, synergy 5, itemGen 4 new;
  save test extended), 15/15 browser (workshop checks the Synergies tab,
  career checks the results breakdown), balance guard unchanged (50 / 46 / 57
  / 46 / 51%), bare battles bit-identical to the previous commit (16 seeded
  matches), 0.20 ms per tick.
- Known limits: item finishes are colour-only until the visual leap; relic
  rarity can still roll at random (M4 reserves it for handcrafted relics); no
  loot-level balance harness yet (M7); synergy strengths are first estimates.

### M3a: Realistic style and play data (2026-10-12)

- Files: `src/render/toon.js` (render style switch: physically based
  materials for every cel finish, cheaper standard materials for the
  stadium, no ink hulls), `src/render/environment.js` (new: procedural arena
  hall → PMREM environment map, also the blurred backdrop),
  `src/render/post.js` (new: HDR composer, bloom, FXAA on Medium, MSAA on
  High), `src/render/lighting.js` (light levels per style, Neutral tone
  mapping), `src/render/renderer.js` + `src/render/inspect.js` (style
  switching rebuilds stadium and tops), `src/systems/profile.js` +
  `src/ui/screens/settings.js` (Art style setting), `src/systems/telemetry.js`
  + `src/version.js` (new: opt-in play data), hooks in `src/app.js`,
  `src/ui/screens/rift.js`, `src/ui/screens/riftReward.js`,
  `src/ui/screens/store.js`; tests `render` (style) and `telemetry` (new).
- Frame rate, Intel UHD 620, 1920×1080, frozen showcase battle: Anime ink
  High 76-82 fps; Realistic High 40, Medium 48, Low 60. Ambient occlusion
  (GTAO) is built but off: with it High fell to about 20 fps.
- Play data: when the game runs as the shared artifact and the viewer may
  write to its database (the owner), the game asks once and then sends one
  record per battle (builds with traits, synergies, results, effects fired,
  stats, frame rate, Rift context), Rift run ends, Store purchases and
  errors to `telemetry/<session>-<part>` (80 events per document, one write
  at a time). No names or save data. Rules make it readable only to the owner
  and editors.
- Tests: 137/137 unit, 15/15 browser (screens switches to Realistic and
  back).

### M3b: Item finishes and Blender assets (2026-10-12)

- Files: `src/render/parts/common.js` (`shellFinish`, `metalFinish`),
  `src/render/parts/ring.js`, `src/render/parts/disc.js` (an item's finish
  picks the shell / body material), `src/systems/assembly.js` (variant
  colour and finish on the resolved part, cosmetic only),
  `src/render/environment.js` (Blender hall panorama as backdrop and
  reflections; Blender crowd sprite loader), `src/render/arenaMesh.js`
  (realistic stands use the rendered crowd), `src/render/renderer.js`,
  `src/render/inspect.js`, `src/render/assets/hallPanorama.js` +
  `crowdStrip.js` (generated data-URI modules, 193 KB + 44 KB),
  `tools/blender/hall_panorama.py`, `crowd_strip.py`, `pano-to-module.mjs`
  (new: headless Blender renders and the module wrapper),
  `tools/preview/entry.js` + `shoot.js` (`--style realistic`, build
  `finish`/`tint`).
- Blender 4.5.9 LTS renders headless: the 2048×1024 hall panorama in about
  75 s, the 17-seat crowd row in about 5 s (CPU, Cycles, denoised).
- Frame rate unchanged within noise (Realistic High 38-40 fps on the UHD 620).
- Tests: 137/137 unit, 15/15 browser.
