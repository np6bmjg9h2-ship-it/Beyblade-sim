# Handoff — 2026-10-14

Read this first in a new session; `docs/STATUS.md` has the long-term picture.

## User playtest feedback (2026-10-19) — story and Rift need depth

The user finished the story: good, but too short and needs development.
- **Story length:** every existing chapter (ch1-ch6 in `src/data/story.js`)
  must at least double in length.
- **More chapters:** add chapters 7-20 after the current ending.
- **Quality:** improve the writing and storytelling throughout, not just the length.
- **Rift Run:** needs more depth as well.

Telemetry from the user's play (artifact `24WkGVSTtfLpnzkhjHV1XJ`, collection
`telemetry`, 8 sessions 2026-10-12..18, build `2026.10.12-m4`, 239 events):
story = only 12 battles in total, 11 won (only loss: the ch1 Sora fight, which
continues on a loss); Kaela and Theo fell in under 3.5 s a round, so the story
is short and easy. Rift: 20 runs (6 won at depths 0-5, 13 lost, 1 abandoned;
10 of the losses at depth 0), 129 Rift battles.
Store: 16,320 credits spent, and 12 of 37 pack items were Mythic (packs look
too generous; check against the loot curve). FPS 40-57 on Intel UHD 620.

## Where we stopped

Working on **skill over RPM** (spec: `.claude/research/reviews/skill-loop-spec.md`,
build order S0-S9). Baseline (`npm run fairness`, 2,800 battles,
`../Beyblade-sim-research/2026-10-13/reports/fairness-baseline.txt`): a
no-input bot wins 46-57% vs the AI at every difficulty (target < 30%),
difficulty steps flat (target >= 10 pts each), gear curve OK (Epic 66%).

| Step | State |
|---|---|
| S1 launch judging (Perfect = best safe release) | committed c2a3311 |
| S2 strike attribution, counters only when struck, stagger, RULES_REV 2 | committed 19d255e |
| S3 spirit earned (passive 2.0 -> 1.0/s, struck 0.5x, clash 0.75x, Good launch +4) + AI counter read every tick (`readCounter`, own RNG stream) | committed b58c726, pushed (balance 55/39/60/46/50, browser 17/17) |
| S4 dash commitment: 0.15 s windup with latched direction (`ability.windup`, `releaseDash()`), speed 0.65, cooldown 3.0, 45% conversion + 1.2% spin floor, 0.35 s recovery, a struck hit >= 0.04 cancels the windup (`dashInterrupted`); telegraph ring + floor streak + whine; "INCOMING DASH" HUD warning; AI `readWindup` (counter timed to the landing, or sidestep), reflex counter halved; RULES_REV 3; `tests/dash.test.js` | see git log (counter AI stops 42% of dashes at 1.3, 17% at 0.8) |
| S5 openings and punish: `src/game/skillRules.js` (`openness`, +10 spirit for opening strike / punish within 1 s of a whiffed counter or broken dash / interrupt), `battle.skillMoment()` + `skillMoment` event + HUD notices, `ability.exposedAt`; AI attacks openings and punishes whiffs (rngRead stream); `tests/skillRules.test.js`; displayTime test counts ticks over all rounds (test bug) | balance 55/42/54/47/52, browser 17/17, unit 196/196 |
| **Fairness finding (2026-10-14)** | No-input bot still wins 49-57% after S1-S5. Diagnosis (60 battles, d1.0): the bot releases at the exact Perfect centre every time (spin energy 3.00 J vs AI 2.82 J at start), and contact drains both sides equally (collision 0.19 vs 0.22 J/round) while the AI also pays steering 0.13 J + extra tip friction 0.15 J. Fix must make initiative pay in the physics/AI (S6 strike from uphill, out/burst wins) and consider giving the gate bot an average launch as a second baseline. |
| **Realistic plan steps 1-4 done (2026-10-14, pushed 79e81f9..16147b3)** | (1) `faceCoupling` 0.75. (2) Fairness gate 1 now has two bots: 1a perfect launch (3.0 J), 1b average Good launch (charge 0.86+-0.03, ~2.5 J). (3) `nutationDamping` 1.4, dead `tiltImpulseScale` removed. (4) AI judgment stream (`rngJudge`, `judge` from difficulty): stamina/defense rest near centre and strike only openings; blades run up (hold 11.5 cm, dash from 8.5-17 cm); ahead on spin = outlast; steering spend -90%. (5) Side bias fixed: cause was Standard's 3 exits (not symmetric under the half turn between spawns); spawns now at a seeded `spawnAngle` per round (battle.js startRound, passed to AI chooseLaunch). Side 0 in idle mirrors 56% -> 46% (attack 75% -> 57%), Vortex was already fair. RULES_REV 5. Checks: unit 196/196, balance 56/35/45/49/64, browser 17/17. Fairness: bot 1a 47->39%, 1b 49->34% from difficulty 0.6 to 1.3 (target < 30%); difficulty steps +4..+6 (target +10). |
| **Equal-gear finding (2026-10-14 evening)** | Gates 1 and 3 now use the SAME build on both sides (`--only 1m` keeps the cross-build run as a report; commit 6431828). On equal gear the no-input bot beats the AI 80-88%; difficulty steps now real (AI vs AI@1.0: 33% -> 72%). Diagnosis with scratch probes: a fully PASSIVE AI still loses (defense 17-3, stamina 18-2 of 20 bo3), but a passive AI with a CLEAN launch (normal technique, 7 cm circling spot, lean 0.12, no overcharge risk = what the bot does) is about even (attack 9-11, stamina 12-8, burst 9-11, defense 5-15). So most of the gap is the AI's launch choices (controlled technique -10% energy, centre spots, tilted power/lance launches with overcharge); the rest is its in-battle spending. A clean launch alone with the normal (active) AI left gate 1a at ~80%, so the AI must also stop spending in mirrors. **User decision: realistic + counters** (option 1; user first picked cheaper actions, then reverted to the recommendation). Cheaper actions were tested and rejected anyway: steerEff 0.9 / idle 0.015 / dash eff 0.7 / floor 0.006 left the bot at 78-82% and pushed burst to 71% (balance FAIL). Plan: in `ai.js` chooseLaunch, skilled AIs pick the clean launch for their build (the experiment script is `scratchpad/edits/exp_launch.py`); in mirrors / non-favourable matchups the AI conserves (no steer, no dash) and strikes only openings; attack beats stamina, stamina beats defense, defense beats attack decides when attacking pays; later spin-steal as a part property (rubber rings vs opposite spin). Probes: `scratchpad/edits/passive.mjs`, `launchcmp.mjs`, `ledger.mjs`. |
| Next | (1) AI launch + conserve per the plan above, gate 1a/3 + balance. (2) Review ring WIP branch `wip/ring-art2` (commit 4507763, local only, unverified: windows/hooks/crease lines in ring.js; a background agent hit its turn limit), verify with `shoot.js slot ring --audit`, balance must stay 55/31/47/52/64. (3) Battle feel from the AMV study: `../Beyblade-sim-research/2026-10-14/reports/amv-battle-feel.md` 17-item checklist (signature colour per top + neon path ribbons, heavy hit = hitstop + white flash + 2x sparks + camera punch-in, finisher whiteout). (4) S6 terrain AI, S7, S8, S9; catalogue expansion (every reference photo becomes a part) + visual customisation (paint, decals, launcher colours) — both approved by the user. |

AI counter read result (12 bo3, counter vs striker at 1.3): 80 presses, 43
counters landed (was 5 presses, 0 landed).

Open user decisions (spec 5c): default format Points Race vs best of 3;
dash windup 0.15 vs 0.12 s; passive spirit (1.0/s used, spec says 0.8);
steering limited by tip grip (P10).

## 2026-10-14 evening: also done (pushed)

- **Ring redesign** steps 1 and 5: `hitBand` (physics) split from `thickness` (drawn plate, now 2.4-3.6 mm), physics unchanged (604cacc); five attack rings with deeper, narrower blades and massDist keeping inertia within 0.1% (56532e0, balance 55/31/47/52/64).
- **Launchers:** all 12 modelled in Blender from the user's photos and web refs, anime style (two-tone cel, crease lines, ink): `tools/blender/launchers.py` -> `.tools/launcher-out/*.json` -> `node tools/blender/mesh-to-module.mjs .tools/launcher-out` -> `src/render/assets/launchers.js` (compact int16/int8 meshes, 714 KB); game side `src/render/parts/launcher.js` (palette slots body/panel/accent/accent2/metal/lcd/cap, variants share meshes). Poses: flip (Catapult cradle-down with a launcher in the cradle, Titan grip), muzzleDown (Sliding, Digital, grip toward the player), flat (Spark, Mirror, Torque, Precision). Launchers seat on the top's upper face (`geometry.topZ`). Commits 5735a8b, 40569d0.
- **Camera:** launch camera sits behind the player's rotated spawn each round (fa78d4d) and is framed wider for held launchers.
- **Research filed** in `../Beyblade-sim-research/2026-10-14/reports/`: `yt-championship-and-rules.md` (WBO rules: win 3 rounds, last spinning or out, release on "shoot", early/late loses the round, one re-shoot; X scoring 1/2/2/3 to 4; commentary counts over 18 championship videos: spin 46, Xtreme 20, burst 9, over 8) and `amv-battle-feel.md`.
- **Agents:** named teammates stalled for hours (launcher-art, ring-art, yt-matches, yt-launch, amv-feel); plain background agents (no `name`) start in seconds. User rule: stop non-progressing agents, retry once with a tighter brief (first step writes "started"), then take over. YouTube recipe that works (search, subtitles, storyboard frames, `timeout 60` on everything) in `scratchpad/yt/` (mhtml2jpg.py, vtt2txt.py); never pull long livestreams. LESSONS.md updated.
- Memories added: `anime-style.md` (user wants a Japanese anime look, max customisation, every reference photo as a part); `agent-takeover.md` updated.

## Done today (pushed)

- Rendering: no double MSAA, composer/ink follow render scale, render stats
  in the debug panel. Hit-stop (`src/ui/hitStop.js`), exact-length freezes.
- Contact feel: "why it won" tags (`src/game/whyTag.js`), heavy-hit thump,
  ring-out gasp, Accessibility > Reduced effects turns hit-stop off.
- Names: Spirit Chip, spinner, countdown READY! SET! SPIN!!!
- Loot curve: Legendary+ 3.5% (tier 0) to 10.1% (tier 4), soft bad-luck
  ramp; `npm run loot:sim`. `npm run fairness` tool.
- `/doctor` cleanup applied; `defaultMode: auto` set (the user presses
  Shift+Tab in this old session; new sessions start in auto).

## Agents

Rules (Claude's memory: agent-team, agent-takeover, strict-boss): worktrees
in `.claude/worktrees/<name>` (inside the project), every brief says read
`.claude/research/reviews/LESSONS.md` and message `team-lead` when stuck,
stuck 1-2 min = Claude takes over. Shell-using agents froze today (likely
invisible permission prompts before auto mode); web-search/read-only agents
work. A stray folder `.claude/worktrees$n` holds only a node_modules
junction: leave it, or remove the junction with `cmd /c rmdir` (never a
recursive delete, which would follow the link).
Finished and filed (research records `reports/team-reviews/`):
`loot-patch-notes.md` (keep 3-10% Legendary; ideas for later: dedicated
drops per rival, guaranteed first clears, duplicate protection, capped
reroll cost, drop-only greater traits) and `fp-rift-generation.md`,
`fp-rift-design.md`, `fp-rift-tech.md` (first-person Rift: grid-step
movement, coarse room-cell maze with loops, a `MazeStage` scene like
Inspect, plain WebGL).

## Plans queued after skill over RPM

Inventory sort/filter/bulk dismantle; Rift M6 (`rift-m6-spec.md`); playable
build for the user; then graphics phase in the agreed order (Claude's
memory next-phase-graphics): upgrade three.js (explain the install to the
user), WebGPU trial + Blender rings/launchers (`ring-redesign-spec.md`,
refs in `.claude/research/refs-web/`), built-in WebGPU effects; abilities
feel (`ability-feel-spec.md`); launcher spec still unwritten (agent
stalled). Then the first-person Rift.

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

## 4. `/doctor` cleanup (applied 2026-10-13)

Every change is reversible and every edited file has a `.bak-doctor-2026-10-13` copy next to it.
- 30 Ruflo skills off: `skillOverrides` in `~/.claude/settings.json` (still installed; delete a line to turn one back on). Kept on: agent-reach, the claude.ai skills.
- 148 Ruflo slash commands: folder moved to `~/.claude/commands.off-2026-10-13` (rename back to restore).
- Plugins ruflo-mods, ruflo-swarm, ruflo-console: `enabledPlugins` false. ruflo-ai-team kept.
- `claude-flow` MCP: `disabledMcpjsonServers` in `.claude/settings.local.json` (`enableAllProjectMcpServers` removed).
- `C:/Users/Benjamin/CLAUDE.md` cut from 224 to 32 lines (rules + agent concurrency); the Ruflo workflow moved to the `ruflo-workflow` skill in `~/.claude/skills`.
- Left for the user: turn off the claude.ai connectors (Floot, Macaly Cloud, Cloudflare, CodeWords, Three.js 3D Viewer) with `/mcp`, and the synced plugins unity, unity-perf, meshy-3d-agent, code-review and unreal-engine-skills (claude.ai plugin settings or `/plugin`); their keys are synced from claude.ai, so Claude did not guess them.

Permissions: `"defaultMode": "auto"` set in `~/.claude/settings.json` on the user's request (2026-10-13). Warning: the allow rules for `python`,
`node`, `npm`, `find`, `sed`, `cp`, `git -c` and `git fetch` in
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
