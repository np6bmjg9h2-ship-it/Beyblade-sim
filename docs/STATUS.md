# Where we are (resume point)

Last updated 2026-10-11. Branch `claude/chaos-spin-arena-zero-ynh785`, pushed
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

Measured on this laptop (Intel UHD 620, 1080p): ~60-65 fps on High with ink
outlines, ~80 fps on Low. Unit tests: 72/72. Browser tests: 11/11.

## In progress: Phase 5, type balance

Goal: every reference build (attack, defense, stamina, balance, burst) wins
40-60% in `npm run balance -- 8 all`. Baseline (Standard Stadium, rounds won):
attack 30%, defense 71%, stamina 74%, balance 32%, burst 45%.

All-stadium baseline (`node tools/balance-par.js 8 all`, match win rates):

| Stadium | Attack | Defense | Stamina | Balance | Burst |
|---|---|---|---|---|---|
| standard | 22% | 72% | 84% | 25% | 47% |
| vortex | 13% | 75% | 91% | 44% | 28% |
| edgebreaker | 44% | 69% | 69% | 22% | 47% |
| crystal | 44% | 72% | 63% | 6% | 66% |
| magma | 22% | 69% | 100% | 50% | 9% |
| skyfall | 28% | 75% | 69% | 25% | 53% |
| zero | 41% | 69% | 66% | 13% | 63% |
| average | ~31% | ~72% | ~77% | ~26% | ~45% |

Diagnosis so far (see audit doc):
- Defense beats balance and burst 12-0 each; only stamina beats defense.
- Attack vs stamina is 8-8 (should favour attack); attack loses most rounds
  by being rung out itself, and runs out of spin in ~9 s when KOs miss.
- Balance's AI spends 17% of its energy steering (others 6-10%) and loses
  spin races; it attacks whenever spin is even.
- Rookie Cup: the new-player default launch aims at the stadium centre and
  clashes head-on ~0.1 s in; ~1 round in 6 is lost to an instant ring-out.

Tools: `tools/balance-par.js` (official metric) and `tools/balance-tune.js`
(experiments: part/AI overrides from a JSON file applied in every worker,
match win rates per build, per stadium and per matchup).

## Next steps (in order)

1. Tune with physics-honest changes only (part properties, AI behaviour),
   measuring each across all stadiums: attack spin drain and steering
   economy; balance AI aggression/steering; defense lock vs burst.
2. Add a balance regression check so future changes can't silently break it.
3. Review the new-player default launch (Rookie Cup instant ring-outs).
4. Verify the career loop end to end (build, inspect, tournament, rewards,
   upgrade, equip, progress, save/reload); fix gaps.
5. Final QA pass against the Phase 1 baseline; push.

## Deferred / known

- Optional bloom: not started (now measurable on the GPU).
- Story chapters 2-6 are short (content work, after balance).
- "Bit-Beast" is a franchise term (IP risk for a commercial release).
- Several ruflo MCP server processes stay resident on this machine (not part of the game).
