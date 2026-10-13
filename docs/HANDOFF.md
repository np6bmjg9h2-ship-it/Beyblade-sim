# Handoff — 2026-10-13

Where everything stands and how to pick each piece back up. Read this
first in a new session; `docs/STATUS.md` has the long-term picture.

## At a glance

| Work | State | Next step |
|---|---|---|
| Research round (6 reports + 4 team reviews) | **Done**, filed in `../Beyblade-sim-research/2026-10-13/` | Work through `reports/improvement-plan.md` |
| Same battle on every device (deterministic maths, replay v2, Workshop undo fix) | **Done** on the main branch | — |
| Daily Seed (loot engine M5) | **Paused by request**, kept on branch `wip/daily-seed` (pushed) | Only if the user asks to bring it back |
| `/doctor` health check | Checks done (read-only), **nothing applied** | Ask the user the two questions below |
| Permissions | Fix proposed, not applied | Auto mode as the default (one setting) |

## 1. Research and the plan

- Records: `C:\Users\Benjamin\Documents\Beyblade-sim-research\` (index
  `README.md`). Round 2026-10-13: `reports/` holds the six researcher
  reports (`tops`, `roguelites`, `github`, `loot`, `threejs`, `academic`),
  `team-reviews/` (design, loot, tech, QA) and `improvement-plan.md` (the
  ranked build order). `sources.md` lists every citation;
  `research/physics/lead-notes.md` has the physics findings.
- A copy of the reports and reviews is in `.claude/research/` (excluded
  from git) because agents without Bash can only read inside the project.
- Rule for new research: save every report to `reports/<topic>.md`, add its
  citations to `sources.md`. The user's priority academic venues: ACM DL,
  IEEE Xplore, Game Studies, DiGRA DL, arXiv.
- The user's standing instruction: evaluate research with the game-dev team,
  then keep improving the game from what was learned. Use Agent Reach (the
  user calls it "agent eye") whenever research is missing.

Next items from the plan, in order:
1. Quick tech wins: `antialias:false` on the canvas when the post-processing
   composer is active (MSAA runs twice on High today); confirm the composer
   is resized when render scale changes; `renderer.info` in the debug overlay.
2. Contact feel: render-side hit-stop on heavy impacts, slow-mo on burst and
   ring-out, a short "why" tag on decisive hits (sim unchanged).
3. Loot: a 100k-roll loot simulation harness, then fix the rarity curve
   (tier-2 sources give ~26% Legendary+ today; target 8-10% at the top
   regular tier, ~3% at tier 0) and add a soft pity ramp.
4. Inventory sort, filters and bulk dismantle with safeguards.
5. M6 Rift: seeded rerolls, a guaranteed viable first offer, per-depth arena
   twists, bosses with a visible weakness.
6. AI and fairness gates (no-input bot, gear curve, difficulty steps) and an
   outcome-randomness report.

## 2. Same battle on every device (done, this commit)

- Every engine returned different last bits for `Math.sin`, `cos`, `atan2`,
  `exp`, `log`, `pow`, `hypot` (`tests/browser/mathprobe.js`). Everything
  that decides a battle now uses `src/core/dmath.js`. Rule in
  `docs/CODEBASE.md` §5: never `Math.sin` etc. in outcome code.
- `npm run test:determinism`: Node, Chromium, Firefox and WebKit play five
  battles bit for bit identically and replay each other's recordings
  (needs Playwright's firefox and webkit, installed on this PC).
- Replays v2 record countdown aim/technique/spin changes; AI launches,
  false starts and spawns are recomputed. v1 replays still play.
- Details: `docs/loot-engine.md`, "Same battle on every device".

## 3. Daily Seed (paused)

Branch `wip/daily-seed` (commit 3ed8e12, pushed) has the whole mode: the
day's challenge, five battles, part picks, scores, streaks, replay codes
verified by re-simulation, and the review fixes (strict verification, quit
counts as a loss, runs across midnight, first-run score). One open item is
noted in that commit: the browser test harness shortens rounds to 15 s
while verification always uses the official 60 s, so the daily browser
scenario must play official-length rounds. To revive it, merge the branch
and fix that scenario; the shared parts (dmath, replay v2) are already on
the main branch.

## 4. `/doctor` health check (nothing applied yet)

Healthy: Claude Code 2.1.296 (latest), one native install, settings files
valid, 66 agent files and 32 skills valid, hooks fast.

Question 1, cleanup ("Clean up everything (recommended)" / "Let me pick" /
"No"), all reversible, about 10k est. tokens of context saved per session:
- 31 unused Ruflo skills and 147 unused Ruflo slash commands:
  `skillOverrides` "off" in `~/.claude/settings.json`.
- Unused synced plugins unity, unity-perf, meshy-3d-agent, code-review
  (duplicates the built-in `/code-review`): `enabledPlugins` false.
- Ruflo plugins ruflo-mods, ruflo-swarm, ruflo-console: ask the user first
  (their hooks run but aren't counted).
- `claude-flow` connection (from `C:\Users\Benjamin\.mcp.json`, never
  called): `disabledMcpjsonServers` in this project's
  `.claude/settings.local.json`.
- Unused claude.ai connectors (Floot, Macaly Cloud, Cloudflare, CodeWords,
  Three.js 3D Viewer): the user disables them with `/mcp`.
- `C:\Users\Benjamin\CLAUDE.md` (not in git, back it up first): cut ~80
  derivable lines, move ~90 lines of Ruflo workflow into a skill.

Question 2, permissions (separate): add `"defaultMode": "auto"` to the
`permissions` object in `~/.claude/settings.json`. If Claude writing it is
blocked as self-modification, the user applies it (Shift+Tab now; the
setting for every session). Warning: the allow rules for `python`, `node`,
`npm`, `find`, `sed`, `cp`, `git -c` and `git fetch` in
`.claude/settings.local.json` let those run unchecked when auto mode is off.

## 5. Other changes this session

- Free Claude Code disabled (still installed; nothing starts it).
- Agent Reach 1.5.0 installed (web research; always send `x-no-cache` to
  Jina: its shared cache was found tampered with). OpenCLI 1.8.8 was
  installed by another session.
- Playwright Firefox and WebKit installed (for the determinism check).
- The 49 game-studio agents are sorted into crews; rules in Claude's memory
  `agent-team.md` (Claude keeps physics, replay, save, anti-cheat,
  architecture and all commits; every delegation names the exact files a
  worker may write).
