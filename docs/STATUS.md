# Where we are (resume point)

Last updated 2026-10-11 (after balance pass 1). Branch `claude/chaos-spin-arena-zero-ynh785`, pushed
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
| 5 Balance pass 1 | (this commit) | Attack/Defense/Stamina/Burst in the 40-60% band; PHYSICS coefficients; pressWhenBehind AI; balance:check |

Measured on this laptop (Intel UHD 620, 1080p): ~60-65 fps on High with ink
outlines, ~80 fps on Low. Unit tests: 72/72. Browser tests: 11/11.

## In progress: Phase 5

Balance pass 1 is DONE (see `docs/audit-phase1.md`, Phase 5 results).
Official `npm run balance -- 8 all` after: attack ~53%, defense ~60%,
stamina ~59%, burst ~49%, balance ~30% (before: 31 / 72 / 77 / 45 / 26).
The classic triangle works again; contact now pays off for attackers,
which was the playtest complaint ("had to win by avoiding contact").
Guard: `npm run balance:check` (25-70% band). Experiments:
`tools/balance-tune.js` with part / AI / `PHYSICS` overrides and `SEED_OFFSET`.

## Next steps (in order)

1. Balance type (~30%): needs a deeper look (build or AI redesign); rim
   weighting its ring and a calmer AI did not help.
2. DONE: the default player launch now circles the bowl (no instant
   launch-clash ring-outs; fastest Rookie Cup loss 0.8 s instead of 0.1 s).
3. "Fun grind" (playtest): early-game pacing and progression feel.
4. Verify the career loop end to end (build, inspect, tournament, rewards,
   upgrade, equip, progress, save/reload); fix gaps.
5. Final QA pass against the Phase 1 baseline; push.

## Deferred / known

- Optional bloom: not started (now measurable on the GPU).
- Story chapters 2-6 are short (content work, after balance).
- "Bit-Beast" is a franchise term (IP risk for a commercial release).
- Several ruflo MCP server processes stay resident on this machine (not part of the game).
