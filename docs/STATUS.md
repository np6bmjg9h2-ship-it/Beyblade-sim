# Where we are (resume point)

Last updated 2026-10-12 (Phase 5 done). Branch `claude/chaos-spin-arena-zero-ynh785`, pushed
to GitHub at every phase checkpoint. Work follows "Dizzi's" five-phase
SPINFORGE plan (audit, physics, visuals, input/feel, career/balance, QA).
Detailed evidence for every item: `docs/audit-phase1.md`.

## Play it

Open `index.html` in Chrome (or Edge). The committed bundle in `dist/` is the
current build; no install or server needed. WebGL required.

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
| 5 Balance pass 2, career loop, final QA | (this commit) | Every type 40-60%: AI reads the spin race (`readRace`), Pivot Ball / Comet Arc / Semi-Flat / Quad Spike tuned (Clutch Charger 29% -> 47%); career loop played end to end (browser scenario `career`); gaps fixed (upgrade/reroll feedback, prize launchers for the other spin offer a spin switch, squashed panels, newer-version saves warn); per-tick physics allocations removed (bit-identical results); findings register closed except the "Bit-Beast" name |
| 5 Fun grind | e8ae499 | **Rift Run** roguelite mode (Gunfire Reborn-style): seeded branching map, run-only loot, 38 charms/6 families, 16 boons, statuses + fusions, sweet spots, hearts, forge/trader/shrine/camp/events, Essence talents, depths 0-8, Locker; fixed CSS custom properties in `h()` style objects (rarity/skill/chapter colours) |

Measured on this laptop (Intel UHD 620, 1080p): ~60-65 fps on High with ink
outlines, ~80 fps on Low. Unit tests: 114/114. Browser tests: 15/15 (about 4 min on the GPU).

## Phase 5: DONE

All five phases of the plan are complete (evidence: `docs/audit-phase1.md`,
"Phase 5 results").
Official `npm run balance -- 8 all` (all seven stadiums): attack 50%, defense 46%,
stamina 58%, balance 46%, burst 51% (Phase 1: 31 / 72 / 77 / 26 / 45). Contact pays off
for attackers (the playtest complaint "had to win by avoiding contact"), and
the Balance build now reads the spin race instead of trading hits it loses.
Guard: `npm run balance:check` (25-70% band). Experiments:
`tools/balance-tune.js` with part / AI / `PHYSICS` overrides and `SEED_OFFSET`.

## Next steps (after the plan)

1. Playtest and tune Rift Run's economy and difficulty, the Store prices and
   the Daily Store prototypes (all first estimates).
2. Story chapters 2-6 (content).
3. Multiplayer is paused by request (local versus first, then share codes;
   online play needs hosting outside the shared artifact).
4. Optional bloom; rename "Bit-Beast" before any commercial release.

## Ideas waiting for a decision

- Plastic-generation research (wiki, 118 pages) suggests: clutch-release tips
  (stored spring burst, e.g. fires when struck), flip-mode support skirts
  (attack/defence face), magnet stadium + polarity cores, removable tip
  ballast, life-after-death skirts.
- `references/` (user's part photos: attack rings, bases, launchers, weight
  disks, winders) is untracked on purpose: product photos stay out of git.

## Deferred / known

- Optional bloom: not started (now measurable on the GPU).
- Story chapters 2-6 are short (content work, after balance).
- "Bit-Beast" is a franchise term (IP risk for a commercial release).
- Several ruflo MCP server processes stay resident on this machine (not part of the game).
