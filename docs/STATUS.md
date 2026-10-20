# Where we are (resume point)

Last updated 2026-10-20 (real physics + anime rules, Playbook, story ch1-6 doubled). For the next steps read `docs/HANDOFF.md` first. Branch `claude/chaos-spin-arena-zero-ynh785`, pushed
to GitHub at every phase checkpoint. Work follows "Dizzi's" five-phase
SPINFORGE plan (audit, physics, visuals, input/feel, career/balance, QA).
Detailed evidence for every item: `docs/audit-phase1.md`.

## Play it

Open `index.html` in Chrome (or Edge). The committed bundle in `dist/` is the
current build; no install or server needed. WebGL required. On a phone or
tablet, open the shared artifact link and hold the phone sideways: touch
controls appear in battles (sticks float under your thumbs; hold LAUNCH and
let go in the gold window), menus are tapped, and pressing and holding an
item gives its second action (favourite, slot options).

## Done

| Phase | Commit(s) | What |
|---|---|---|
| 1 Audit | 9232c50 | Baseline, findings register (`docs/audit-phase1.md`) |
| 2 Physics | 4b4f350, 1ca8905 | Launches frame-rate independent (same seed = same result at 30/60/144 fps); collision/wall/stability tests; clamp energy ledger; browser tests on Windows |
| 3 Visuals | d196965, 5448640 | GPU leak fixes; 3D Bit-Beast spirits (11 forms, pillar, sigil, no first-summon stall); ring-out burst; wobble warning; camera keeps the wall in frame |
| 4 Input/feel | 9ba8c0b | Non-standard controllers translated; audio never crashes; glance-aware impact sparks/sound; low-spin warning; real fps readout; two battle bugs fixed (early finish awarded the win to the eliminated top; ring-out text) |
| Test infra | 79267f2 | Browser tests use the GPU: 11/11 in ~3 min (was 45 min) |
| 5 Balance pass 1 | d9801eb | Attack/Defense/Stamina/Burst in the 40-60% band; PHYSICS coefficients; pressWhenBehind AI; balance:check |
| Classic parts | 72951dc | 14 classic-series parts + 6 launchers from the plastic-gen research and the user's reference photos; moving parts in the physics (`physics/mechanisms.js`: magnets, spring tips, clutches, auto shift, rollers); own 3D models; 2 AI archetypes; tests `tests/classic.test.js`, browser scenario `classic`. Hit Clutch, Quad Spike and Final Clutch tuned from A/B runs |
| UI pass + Store | 0235969 | Main Store / Daily Store (prototype generator); crafting fixed (costs no longer need research; clear missing-resource feedback; the Forge needs no relic fragment); right stick / R-F scrolls any panel, scroll positions kept on refresh, edge fades; screen, panel, tab and modal motion; press flash; toasts bottom-right (max 3); wallet chips in headers; menu tile icons |
| Shop | 66f3644 | CR shop: packs with guaranteed rarities and printed odds, mystery capsules, themed bundles, materials crate, daily deals; menu tile with a badge for new deals; tests `tests/store.test.js`, browser scenario `store` |
| Playtest fixes | 176a613, 58f6a98, d85df0a | Battle callouts moved to a small side feed; Rift loot is the grind (boss secures finds, send home, full clear keeps all, Locker pre-selects); Final Clutch toned down (store 0.12) |
| Loot engine M1-M2 | 93c163e, b2d57b5 | Swap comparison in the Workshop; declarative traits with generated text (99), reactive traits, elemental/mastery/part-synergy/curse traits, 19 synergies with a Synergies tab and journal, generation v2 (budgets, names, variants, bad-luck protection), item validation and quarantine (save v4), "What powered your top". Plan and log: `docs/loot-engine.md` |
| 5 Balance pass 2, career loop, final QA | 70aaa89 | Every type 40-60%: AI reads the spin race (`readRace`), Pivot Ball / Comet Arc / Semi-Flat / Quad Spike tuned (Clutch Charger 29% -> 47%); career loop played end to end (browser scenario `career`); gaps fixed (upgrade/reroll feedback, prize launchers for the other spin offer a spin switch, squashed panels, newer-version saves warn); per-tick physics allocations removed (bit-identical results); findings register closed except the "Bit-Beast" name |
| Loot engine M3 | 03f76b5, 086f67e | Realistic art style (PBR materials, arena environment, bloom), opt-in play data to the shared artifact's database, item finishes on the 3D parts, Blender-rendered hall panorama and crowd |
| Safety nets | (this commit) | From the tool audit (report: claude.ai artifact "SPINFORGE Tool Audit"): fast-check property tests (`tests/properties-*.test.js`: any two legal loot tops never gain energy from a collision and stay finite; same seed, same simulation and same full battle; generated items stay valid, in budget and rebuild exactly; bad-luck protection; every trait finite at any magnitude; channels always within limits; synergies consistent; saves round-trip). They found that one damaged item made a whole save unreadable: saves now set damaged items aside, repair damaged loadouts, Bit-Beasts and fields, fall back to the backup and else salvage what can be read (30,000 fuzzed damaged saves load). tinybench perf gate (`npm run perf`, `npm run perf:check`, baseline per CPU in `tools/perf-baseline.json`), `npm run test:deep` (1,000 runs per property) |
| iPhone and touch | 124494e | On-screen controls as a virtual gamepad (floating aim/steer and lean/camera sticks; LAUNCH hold-and-release; DASH, GRIP, CNTR, SKILL, SKILL 2, GUARD, SURGE, ULT mirroring each ability's ready/cooldown/locked state; CAM, pause, Continue); tappable prompt buttons; press-and-hold for secondary actions; phones zoom the menus to fit and ask to be turned sideways; phones start on Medium graphics; iOS audio unlock on touch end; fixed mouse clicks in menus (a UI layer swallowed them); browser scenario `touch` (iPhone-sized, real touch events) |
| Loot engine M4 | a7658da | 12 handcrafted relics with signature powers and earn paths (story chapters 3-6, Arena Zero Championship, Rift Depth 3, Masterwork, 60 traits, awakening, Division 1, all rivals, Survival 12), recast if lost; the Journal (Relics, Parts with where to find them, Traits, Sets, Milestones with rewards, bad-luck counters); imprints from dismantling and engraving; spare copies train mastery; relic rarity reserved for relics |
| Same battle on every device | (this commit) | From the 2026-10-13 research and team review: `core/dmath.js` replaces Math.sin/cos/atan2/exp/log/pow/hypot in everything that decides a battle (engines disagreed in the last bits, measured); `npm run test:determinism` checks Node, Chromium, Firefox and WebKit play identically; replays record countdown aim/technique/spin changes and recompute the AI; Workshop undo checked before it is used; balance and perf unchanged |
| Skill over RPM S1-S5 | c2a3311..16147b3 | Launch judging, strike attribution and counters, earned spirit, dash windup, openings and punishes, AI judgment, seeded spawn angle (details in `docs/HANDOFF.md`) |
| Real physics, anime rules | 40f8428..faf2895 | User decision 2026-10-19: physics stays realistic, the rules reward active play. Judges' cards on time-outs (HUD), spirit for initiative, rubber ring edges with real spin steal (Grip Fang); AI clean launch and even-matchup conserving; fairness gate 1 retargeted (still failing) |
| Story ch1-6 doubled | 9bf61f1 | 40 -> 93 nodes, harder bosses (bo5, tiers 4-6), setback fights with recovery scenes, between-round lines, chapters in `src/data/story/chN.js`, story engine branches (`when`, won/lost flags), tiers to 8 |
| Rift Depth M1 | 7c5312f..be65b68 | Plan `rift-depth-plan.md` §3 done: early-run fix (viable first offer, dry-streak pity, consolation on loss; `systems/riftFit.js`), arena twists Slick Ring and Glass Floor (`data/arenaTwists.js`, `resolveArena("base+twist")`), 4 keystone legendaries, boss weaknesses for Sora, Daichi, Mirelle, Nyx (`data/riftBosses.js`), 5-event pack with lasting `run.flags` (`systems/riftFlags.js`). Open: attack build 0/20 vs Mirelle, stamina 5% vs Sora, Glass Floor drops defense 25% -> 16% on Standard (n=8), Cracked Mirror duplicates stack, twists steep/dome/thinrim/lowg not built |
| Playbook | de3b450..1325d80 | D-pad patterns (Anchor, Orbit, Sidestep, Slingshot, Feint, Herd) run in the battle step, recorded as triggers; Playbook screen in the Workshop; AI telegraphs its plans and reads the player's patterns |
| 5 Fun grind | e8ae499 | **Rift Run** roguelite mode (Gunfire Reborn-style): seeded branching map, run-only loot, 38 charms/6 families, 16 boons, statuses + fusions, sweet spots, hearts, forge/trader/shrine/camp/events, Essence talents, depths 0-8, Locker; fixed CSS custom properties in `h()` style objects (rarity/skill/chapter colours) |

Measured on this laptop (Intel UHD 620, 1080p): ~60-65 fps on High with ink
outlines, ~80 fps on Low (playtest telemetry 2026-10-18: 40-57 fps on High). Unit tests: 246/246 (2026-10-20). Browser tests: last full run 17/17 (2026-10-14); scenarios `playbook` and `rift` pass (2026-10-20).

## Phase 5: DONE

All five phases of the plan are complete (evidence: `docs/audit-phase1.md`,
"Phase 5 results").
Official `npm run balance -- 8 all` (all seven stadiums): attack 50%, defense 46%,
stamina 58%, balance 46%, burst 51% (Phase 1: 31 / 72 / 77 / 26 / 45). Contact pays off
for attackers (the playtest complaint "had to win by avoiding contact"), and
the Balance build now reads the spin race instead of trading hits it loses.
Guard: `npm run balance:check` (25-70% band). Experiments:
`tools/balance-tune.js` with part / AI / `PHYSICS` overrides and `SEED_OFFSET`.

## In progress: Blender part art

User request (2026-10-20): "3d models with blender based on the references,
thinner parts". Pipeline committed in 214d68c: `render/meshAsset.js` (shared
decoder), `tools/blender/parts-dump.mjs` (part numbers -> `.tools/parts.json`),
generic `tools/blender/mesh-to-module.mjs`. Three technical-artist agents
model rings, discs and tips in worktrees `.claude/worktrees/art-rings|art-discs|art-bases`
(new `render/parts/<slot>Model.js`, procedural fallback kept; reports in
`.claude/research/reviews/art-*-report.md`). Disc `thickness` is physics:
thinning it is a separate step behind the balance gate.

## Next steps

The ordered list is in `docs/HANDOFF.md` ("Start here"): Blender part art
(in progress), story chapters 7-20, fairness gate 1, Playbook M2, then the
older queue (battle feel, ring art branch, catalogue expansion, inventory
filters, store pack odds). Daily Seed stays paused on branch
`wip/daily-seed`. Multiplayer is paused by request (local versus first,
then share codes; online play needs hosting outside the shared artifact).

## Ideas waiting for a decision

- Plastic-generation research (wiki, 118 pages) suggests: clutch-release tips
  (stored spring burst, e.g. fires when struck), flip-mode support skirts
  (attack/defence face), magnet stadium + polarity cores, removable tip
  ballast, life-after-death skirts.
- `references/` (user's part photos: attack rings, bases, launchers, weight
  disks, winders) is untracked on purpose: product photos stay out of git.

## Deferred / known

- Optional bloom: not started (now measurable on the GPU).
- The published artifact (claude.ai) is still the 2026-10-12 build; republish to let the user playtest this work.
- "Bit-Beast" is a franchise term (IP risk for a commercial release).
- Several ruflo MCP server processes stay resident on this machine (not part of the game).
