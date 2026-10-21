# Handoff — 2026-10-21 (session 4)

## Session 4 (2026-10-21): draw calls, story test, playtest build

- Blender part models merge per material bin and draw all crease lines as
  one vertex-coloured LineSegments (`meshAsset.js` `mergeParts` /
  `creaseLines`): draw objects tips 274 -> 153, discs 120 -> 95, rings
  216 -> 163, renders unchanged (1c0428e). `shoot.js slot <s> --audit` prints
  `draws` per part.
- Browser `story` scenario was failing since the ch1 rewrite (new nodes
  training2, orrery_test, dockfight); fixed (51d6e50). Full browser suite
  19/19 (`rift` timed out once in the full run, passes alone).
- Playtest artifact `24WkGVSTtfLpnzkhjHV1XJ` republished (version 16) with
  build 2026.10.21: the page now loads `dist/chaos-spin.js` + `styles.css` +
  `fonts.css` (the old unbundled `src/*` files are still in the artifact,
  unreferenced). Title screen checked in Chrome.
- Rift Cracked Mirror: no copies of economy charms, no third copy (9e78748).
- **Spin lock found and fixed by rules (4808d4d, user OK "let's try, adjust
  later")**: opposite-spin hits tighten the struck lock and carry little
  recoil, so right-spin attack/burst went 0/32 rounds vs ANY left-spin top.
  Rift Mirelle now: weakness `sameSpin` (lock -20%), Twin-Gear launcher,
  `spinRead` 0.4 (opens left, keeps a winning spin, answers a lost round);
  traders in her acts sell a run-only Twin-Gear (`run.launcherBase`,
  `runLauncherOf`); boss cards show spin; AI defaults to its build spin on a
  two-way launcher (was always R) and attackers match the spin they face.
  Gate probe (scratchpad `rift/gate.mjs`, equal act-tier gear, n=12-16):
  prepared attackers 56-63%, unprepared right-spin attackers 0% (must buy the
  launcher), **defense/stamina/balance 92-100% vs her (open; drag mods, rubber
  ring, aggression and next-act gear did not move it; her balance build loses
  the spin race)**. Stamina vs Sora 5% kept (attack beats stamina).
- User asked for **online multiplayer** (2026-10-21): options given (lockstep
  netplay on the deterministic sim needs a relay/Worker outside the artifact;
  or ghost challenge codes through the artifact db). Awaiting choice.

## Session 3 (2026-10-20/21): Blender part art done, thinner discs and cores

Branch `claude/chaos-spin-arena-zero-ynh785`, everything committed and pushed
(head after this doc commit). Unit 246/246; browser `inspect` passes (full
browser suite not re-run); balance 8/pair all stadiums 59/26/45/52/66 (was
59/22/34/53/81, now all inside the 25-70 band).

- **Docs** (a7c9c54): STATUS, CODEBASE (riftFit, riftFlags, riftBosses,
  arenaTwists/resolveArena, meshAsset, twist-stream invariant), README.
- **Blender part art** (user: "3d models with blender based on the
  references, thinner parts"): three background technical-artist agents in
  worktrees `.claude/worktrees/art-rings|art-discs|art-bases`, merged
  8e4fe3f (12 discs), ae0f166 (15 tips), f585bd1 (17 rings).
  `tools/blender/{rings,discs,tips}.py` read `.tools/parts.json`
  (`node tools/blender/parts-dump.mjs`), run with
  `.tools/blender-4.5.9-windows-x64/blender.exe -b --factory-startup --python tools/blender/<slot>s.py -- .tools/<slot>-out`,
  then `node tools/blender/mesh-to-module.mjs .tools/<slot>-out src/render/assets/<slot>s.js <SLOT>_MESHES tools/blender/<slot>s.py`.
  Game side `src/render/parts/{ring,disc,tip}Model.js`: the mesh is used only
  when the part's numbers match the bake, else the procedural model.
  **Any change to a part's numbers in `parts.js` needs a re-bake**, or that
  part silently falls back to procedural. Reports:
  `.claude/research/reviews/art-{rings,discs,bases}-report.md`; screenshots
  in the session scratchpad.
- **Thinner physics** (88a81a8, user OK): disc `thickness` ~25-30% down
  (ten 3.0, heavyring 3.6, feather 2.2, wide 3.0, counter 3.8, orbit 3.2,
  compact 2.4, titan 4.0, hexheavy 3.0, octawide 2.6, starlobe 2.8, magna 3.2),
  core `height` ~30% down (helix 3.5, quad 3.8, apex 2.5, gravity 3.2, ...),
  Apex-Low `maxDiscThickness` 2.6 (same discs fit), generated discs 2.2-4 mm,
  RULES_REV 8. Slingshot dive lost speed (0.22 -> 0.15 m/s); fixed by the
  firm stick from 15 cm instead of 10 (`playbook.js`), back to 0.22.
- **Art follow-ups (open)**: tips 5-8 meshes each (merge per material for
  draw calls); no low-quality meshes; +2.3 MB of mesh modules (rings 1.2 MB);
  rings lost the procedural stickers/decals, Roller Guard still plain;
  rolled items / prototypes with non-catalogue numbers draw procedural (mixed
  look); disc hub collar looks tall alone; feather disc left spin not
  rendered; `disc.js` 671 lines (> 500 rule); cores have no Blender model yet
  (procedural, now thinner).
- A balance run was once killed by Claude Code for low memory; it ran fine
  later (167 s on 8 threads).
- Art worktrees and older ones (`git worktree list`) can be removed with
  `git worktree remove <path>` once no longer needed.


## Session 2 (2026-10-20): Rift Depth M1 done, Blender part art started

Branch `claude/chaos-spin-arena-zero-ynh785`, commits `7c5312f..` (pushed
in session 3). Unit 246/246, browser scenario `rift` passes.

- **Rift Depth M1 complete** (plan `.claude/research/reviews/rift-depth-plan.md` §3):
  1 early-run fix (`src/systems/riftFit.js`: viable first offer + dry-streak
  pity, consolation on loss, wall/drifter opener) `7c5312f`; 3 arena twists
  Slick Ring + Glass Floor (`src/data/arenaTwists.js`, `resolveArena("base+twist")`)
  `1c988b3`; 4 keystones `fbafaf2`; 2 boss weaknesses (`src/data/riftBosses.js`)
  `0d2c63b`; 5 event pack + `run.flags` (`src/systems/riftFlags.js`) `be65b68`.
  Agent reports: `.claude/research/reviews/rift-{bosses,keystones,events}-report.md`.
- **Open Rift issues**: attack build 0/20 vs Mirelle (pre-existing; act pools of
  3 kept for that reason, kits apply when a kit boss rolls); stamina 5% vs Sora;
  Glass Floor drops defense 25% -> 16% on Standard (n=8, +-17); Cracked Mirror
  duplicates stack (Coin Purse); twists steep/dome/thinrim/lowg not built.
- **Blender part art (user request: "3d models with blender based on the
  references, thinner parts")**: infra committed (`src/render/meshAsset.js`,
  `tools/blender/parts-dump.mjs` -> `.tools/parts.json`, generic
  `mesh-to-module.mjs <dir> <out.js> <EXPORT> <source.py>`). Three
  technical-artist agents were STOPPED by the user early, then restarted and
  finished in session 3 (see above). Worktrees left:
  `.claude/worktrees/art-rings|art-discs|art-bases` (branches wt/art-*), briefs
  in this session's history; notes in `.claude/research/reviews/art-*-report.md`.
  Restart them with the same brief (Blender: `.tools/blender-4.5.9-windows-x64/blender.exe -b --factory-startup --python tools/blender/<slot>s.py -- .tools/<slot>-out`;
  new `src/render/parts/<slot>Model.js` + small hook; procedural fallback).
  Disc `thickness` is physics (stack + contact layer): thinning it is the
  lead's job with a balance gate; baseline saved in the session scratchpad
  (`balance-baseline-be65b68.json`, 8/pair all stadiums: 59/22/34/53/81).
- Commit identity: `git -c user.name=Claude -c user.email=noreply@anthropic.com`,
  no Co-Authored-By (CLAUDE.md). Ruflo swarm/memory used for the ledger
  (namespace `patterns`, keys `rift-depth-m1-*`).

---

Read this first in a new session; `docs/STATUS.md` has the long-term picture,
`docs/CODEBASE.md` the architecture and invariants. Branch
`claude/chaos-spin-arena-zero-ynh785`, everything committed and pushed;
`main` is NOT fast-forwarded (it waits for fairness gate 1 to pass).

## Start here: the next steps, in order

1. **Art follow-ups / Rift M1 leftovers**: the open art items in session 3
   above (LOD, decals, Blender cores); Rift: Mirelle too easy for
   defense/stamina/balance, Glass Floor vs defense, twists
   steep/dome/thinrim/lowg; online multiplayer (user request). Republish the claude.ai
   artifact so the user can playtest (still the 2026-10-12 build).
2. **Chapters 7-20** (user approved): `.claude/research/reviews/story-expansion-plan.md`
   section 4 (three acts, tiers 6-8, Stillwater Order arc, ~250 nodes). Add
   the data first (10 rivals in characters.js, 6 arenas, story brackets, cast),
   then writers in worktrees, one or two chapters each, files
   `src/data/story/ch7.js`.. (register them in `src/data/story.js`).
   Also open: `noBeast` opponents (ch5 Hollow), the setback hint card (plan
   E13), chapter `act` headers (E5), side rematches (E10).
3. **Fairness gate 1** still fails: average-launch no-input bot beats the AI
   on equal parts 77% at Elite (target < 70%) and 59% at Legend (< 50%);
   gate 3 steps are noisy around +10 at n=100 (use n >= 150). Finding: in a
   mirror the better launch wins the spin race (a fully passive AI with a
   clean launch wins only 30% vs the perfect-launch bot); centre AIs
   (defense, stamina) still use their controlled centre launch, which loses
   mirrors but is needed for balance (removing it dropped defense to 9%).
   Ideas: matchup-aware launch (the AI sees the opponent's part cards),
   AI playbook use (Slingshot/Feint at high judge).
4. **Playbook M2**: Hound, Pendulum, Homecoming, Rail Ride; floor path
   ribbon and opponent chevron; mastery stars; named chains; Spirit x1.5 for
   strike patterns; AI using patterns (today it only telegraphs plans and
   reads the player's). Design: `.claude/research/reviews/playbook-design.md`.
5. Older queue (still valid): battle feel from the AMV study (17 items),
   ring WIP branch `wip/ring-art2` review, S6-S9 of skill-loop spec,
   catalogue expansion + visual customisation, inventory filters, store
   pack odds (playtest: 12 of 37 pack items were Mythic).

## User decisions this session (2026-10-19/20)

- **Realistic physics stays; the fun goes in the rules** ("real physics,
  anime rules"). Fairness gate 1 retargeted accordingly (see tools/fairness.js
  header). Any arcade-style physics change still needs the user's approval.
- Approved and built: judges' cards, spirit for initiative (passive 0.8/s),
  rubber spin steal, the Playbook, the story plan (ch1-6 doubled, ch7-20 to
  come), the Rift depth plan.
- Playtest verdict (2026-10-19): story good but too short and too easy; Rift
  needs depth. Telemetry: artifact `24WkGVSTtfLpnzkhjHV1XJ`, collection
  `telemetry` (8 sessions, build 2026.10.12-m4): 12 story battles, 11 won;
  Rift 20 runs (6 won, 13 lost, 10 of them at depth 0); FPS 40-57 on Intel
  UHD 620. The published artifact is still the 2026-10-12 build.

## Done this session (commits 40f8428..1325d80, all pushed)

| Area | What | Where |
|---|---|---|
| AI | clean launch for non-centre AIs; even-matchup conserving (rest the stick, dodge only strikes already coming, strike only open tops near the rim); chases the judges' card in the last 15 s | `src/game/ai.js` |
| Rules | judges' cards on time-out (strike 1, heavy/opening/punish/interrupt/counter 2, stability 2), live HUD "JUDGES a - b"; spirit skill moments 15, struck 0.4, passive 0.8/s | `battle.js` decision(), `skillRules.js` JUDGE |
| Physics | rubber ring edges (`ring.rubber`, `PHYSICS.rubberMu` 0.6): spin steal measured (+6.7 rad/s to the slower opposite-spin top vs +1.8 plastic); new ring Grip Fang (L) | `simulation.js`, `parts.js`, physics test |
| Story | engine: node `when`, `<node>:won/lost` flags, lost continue battles pay nothing, roundLines between rounds, tiers to 8, chapters in `src/data/story/chN.js`; ch1-6 rewritten 40 -> 93 nodes (writers), harder bosses (bo5, tier 4-6), setback fights + recovery scenes; ch6 bracket (top 4) leads into scripted Valen semi and Aurelia final | `src/systems/story.js`, `src/data/story/` |
| Playbook | 6 D-pad patterns (Anchor, Orbit, Sidestep, Slingshot, Feint, Herd) run in the battle step, only triggers recorded; double-tap variants; stick nudge/break; Playbook screen; ch2 teaches Herd (Rook) and Feint (Mirelle); AI telegraphs its plans as patterns and reads Feint/Slingshot/Herd | `src/game/playbook.js`, `ui/screens/playbook.js` |

RULES_REV was 7 (now 8, session 3). Checks at 1325d80: unit 204/204, balance check passes
58/29/47/52/63, `test:determinism` OK on Node/Chromium/Firefox/WebKit,
browser scenario `playbook` passes (full browser suite not re-run this session).

## Agents (how it worked this session)

- The studio agents in `.claude/agents/` only load when the session starts in
  the project folder. From another folder, spawn `general-purpose` and tell
  it to read `.claude/agents/<role>.md`; that worked every time.
- Writers in worktrees `.claude/worktrees/story-a/-b/-c` (one or two chapter
  files each) finished in 20-27 minutes; a UI agent built the Playbook screen
  in 3 minutes (two bugs found from its screenshot, lessons added to
  `.claude/research/reviews/LESSONS.md`). Worktrees are left in place;
  remove with `git worktree remove` when no longer needed.
- Plans written by agents this session (all in `.claude/research/reviews/`):
  `story-expansion-plan.md`, `rift-depth-plan.md`, `playbook-design.md`,
  writer reports `story-a/b/c-report.md`, `playbook-ui-report.md`.

## Earlier: skill over RPM (2026-10-14)

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
