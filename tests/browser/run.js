// End-to-end browser tests: boots the built game in Chromium and plays it
// through keyboard and a virtual standard gamepad.
// Usage: npm run test:browser   (builds first)  or  node tests/browser/run.js [scenario]

import { launch } from './harness.js';

const scenarios = {};
const results = [];

// Charge during the countdown so the meter is in the gold window at IGNITE, then release.
async function timedLaunch(h, { pad = false } = {}) {
  await h.waitFor(() => { const b = window.__app.ui.current?.battle; return b && b.phase === 'countdown'; }, 20000, 'countdown');
  const rate = await h.eval(() => window.__app.ui.current.battle.fighters[0].gear.chargeRate);
  const startAt = 3.0 - 0.92 / rate;
  await h.waitFor((t) => window.__app.ui.current.battle.phaseT >= t, 20000, 'charge start', startAt);
  if (pad) await h.padHold(6, 1); else await h.page.keyboard.down('Space');
  await h.waitFor(() => { const b = window.__app.ui.current.battle; const m = b.fighters[0].launch.meter; return b.phaseT >= 2.95 || m.charge >= 0.92; }, 20000, 'charged');
  // hold for whole frames: at software-rendering frame rates a fixed 150 ms tap can fall between polls
  if (pad) { await h.padHold(7, 1); await h.frames(3); await h.padHold(7, 0); await h.padHold(6, 0); }
  else await h.page.keyboard.up('Space');
  await h.waitFor(() => window.__app.ui.current.battle.fighters[0].launch.released, 10000, 'released');
  return h.eval(() => window.__app.ui.current.battle.fighters[0].launch.result.quality);
}

// Let a round start, then end it as a player win (unless physics already ended it).
async function forcePlayerRound(h) {
  // At 3x test speed a frame can advance 0.3 s of battle under software rendering,
  // enough for a natural ring-out to beat the debug finish. Run 1x until it lands.
  const speed = await h.eval(() => { const s = window.__testSpeed; window.__testSpeed = 1; return s ?? null; });
  await h.waitFor(() => { const b = window.__app.ui.current.battle; return (b.phase === 'battle' && b.fighters.every((f) => f.launch.launched)) || ['finishing', 'roundOver', 'matchOver'].includes(b.phase); }, 15000, 'battle running');
  const forced = await h.eval(() => {
    const b = window.__app.ui.current.battle;
    const info = { phase: b.phase, t: +b.battleTime.toFixed(2), finishes: b.roundFinishes.map((x) => `${x.fighter.index}:${x.how}@${x.time.toFixed(2)}`) };
    return { ok: b.debugFinish(1, 'out'), ...info };
  });
  await h.eval((s) => { window.__testSpeed = s ?? undefined; }, speed);
  if (!forced.ok) (h.notes = h.notes || []).push('round ended before the forced finish: ' + JSON.stringify(forced));
  return forced;
}

// Move focus to a tile with d-pad presses chosen from on-screen positions.
async function padNavigateTo(h, id, max = 10) {
  for (let i = 0; i < max; i++) {
    const d = await h.eval((target) => {
      const f = window.__app.ui.focused, t = document.querySelector(`[data-id="${target}"]`);
      if (!f || !t || f === t) return null;
      const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
      const dy = (b.top + b.height / 2) - (a.top + a.height / 2), dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      if (Math.abs(dy) > a.height / 2) return dy > 0 ? 13 : 12;
      return dx > 0 ? 15 : 14;
    }, id);
    if (d == null) return;
    await h.padButton(d);
  }
}

scenarios.keyboard = async () => {
  const h = await launch();
  try {
    await h.open();
    await h.shot('k01_title');
    await h.key('Enter');
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
    await h.key('Enter');
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name entry');
    await h.page.keyboard.type('Kai');
    await h.key('Enter');
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'main menu');
    const name = await h.eval(() => window.__app.profile.player.name);
    if (name !== 'Kai') throw new Error('name not set: ' + name);
    await h.shot('k02_menu');
    await h.focusId('quick');
    await h.key('Enter');
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'QuickBattleScreen', 10000, 'quick battle');
    // keyboard navigation down to Start
    for (let i = 0; i < 5; i++) await h.key('ArrowDown');
    const f = await h.eval(() => window.__app.ui.focused?.dataset.id);
    if (f !== 'start') throw new Error('keyboard navigation did not reach Start, focus=' + f);
    await h.eval(() => { window.__testRoundTime = 25; window.__testSpeed = 3; });
    await h.key('Enter');
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'battle screen');
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 10000, 'setup');
    await h.key('KeyD', 300); // move launcher
    await h.key('KeyT'); // cycle technique
    await h.shot('k03_setup');
    await h.key('Space'); // ready
    const q = await timedLaunch(h);
    await h.shot('k04_launched');
    // a fast natural ring-out can end the round before slow (software)
    // rendering lets us see the battle phase; steer and pause only if live
    const live = await h.waitFor(() => { const p = window.__app.ui.current.battle.phase; return p === 'battle' ? 'live' : ['finishing', 'roundOver', 'matchOver'].includes(p) ? 'ended' : false; }, 15000, 'battle running');
    if (live === 'live') {
      await h.page.keyboard.down('KeyW'); await h.page.waitForTimeout(800); await h.page.keyboard.up('KeyW');
      await h.key('Space'); // dash
      await h.key('Tab'); // telemetry
      await h.shot('k05_battle');
      // pause / resume
      await h.key('Escape');
      await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'pause');
      await h.shot('k06_pause');
      await h.key('Enter');
      await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen' && !window.__app.ui.current.paused, 5000, 'resume');
    }
    // play rounds until the match ends
    for (let round = 0; round < 6; round++) {
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 120000, 'round over');
      await h.shot('k07_round' + round);
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.key('Enter');
      if (done) break;
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 10000, 'next setup');
      await h.key('Space');
      await timedLaunch(h);
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
    await h.shot('k08_results');
    await h.key('Escape');
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'QuickBattleScreen', 10000, 'back to setup');
    return { launchQuality: q.label, errors: h.errors };
  } finally { await h.close(); }
};

scenarios.gamepad = async () => {
  const h = await launch();
  try {
    await h.open();
    await h.padNeutral();
    await h.padButton(0); // A: begin
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
    const device = await h.eval(() => window.__app.input.lastDevice);
    if (device.type !== 'gamepad' || device.padType !== 'xbox') throw new Error('gamepad not detected: ' + JSON.stringify(device));
    await h.padButton(13); // d-pad down to slot 2
    await h.padButton(0); // new game in slot 2
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name entry');
    // on-screen keyboard: type "AB" then Done
    await h.padButton(0); // A key (focused first)
    await h.padButton(15); // right -> B
    await h.padButton(0);
    const typed = await h.eval(() => document.querySelector('.osk-display').textContent);
    if (typed.trim() !== 'AB') throw new Error('OSK typing failed: ' + typed);
    await h.focusId('__none__');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.osk-key')].find((k) => k.textContent.includes('Done'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'main menu');
    await h.shot('g01_menu');
    // Settings via controller: d-pad to the Settings tile, then A
    // walk the tile grid with the d-pad until Settings is focused
    await padNavigateTo(h, 'settings');
    const onSettings = await h.eval(() => window.__app.ui.focused?.dataset.id);
    if (onSettings !== 'settings') throw new Error('d-pad navigation did not reach Settings: ' + onSettings);
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'SettingsScreen', 10000, 'settings');
    await h.padButton(5); await h.padButton(5); await h.padButton(5); // RB x3 -> Controls tab
    const tab = await h.eval(() => window.__app.ui.current.tab);
    if (tab !== 'controls') throw new Error('tab switching failed: ' + tab);
    await h.padButton(13); // stick dead zone row
    const dz0 = await h.eval(() => window.__app.input.settings.deadzone);
    await h.padButton(15); // adjust right
    const dz1 = await h.eval(() => window.__app.input.settings.deadzone);
    if (!(dz1 > dz0)) throw new Error('dead zone did not change via controller');
    await h.shot('g02_settings');
    await h.padButton(1); // back
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu again');
    await padNavigateTo(h, 'quick');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'QuickBattleScreen', 10000, 'quick battle');
    for (let i = 0; i < 5; i++) await h.padButton(13);
    await h.eval(() => { window.__testRoundTime = 20; window.__testSpeed = 3; });
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'battle');
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 10000, 'setup');
    await h.padAxes([0.8, 0, 0, -0.6]); await h.page.waitForTimeout(400); await h.padAxes([0, 0, 0, 0]);
    await h.padButton(0); // ready
    const q = await timedLaunch(h, { pad: true });
    await h.waitFor(() => ['battle', 'finishing', 'roundOver', 'matchOver'].includes(window.__app.ui.current.battle.phase), 15000, 'battle running');
    await h.padAxes([0, -1, 0, 0]); await h.page.waitForTimeout(700); await h.padAxes([0, 0, 0, 0]);
    await h.padButton(0); // dash
    await h.padButton(2); // counter
    await h.shot('g03_battle');
    await h.padButton(9); // pause
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'pause');
    await h.padButton(9);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 5000, 'unpause');
    // controller disconnect mid-battle auto-pauses (not on the round-over
    // banner, so if slow rendering let the round end, go to the next setup)
    if (await h.eval(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle.phase))) {
      await h.padButton(0);
      await h.waitFor(() => ['setup', 'countdown'].includes(window.__app.ui.current.battle?.phase), 10000, 'next round setup');
    }
    await h.eval(() => { const ev = new Event('gamepaddisconnected'); ev.gamepad = { index: 0, id: 'test pad' }; window.dispatchEvent(ev); });
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'auto pause on disconnect');
    await h.padButton(0); // Resume (focused)
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 5000, 'resume after reconnect');
    if (await h.eval(() => window.__app.ui.current.battle.phase === 'setup')) { await h.padButton(0); await timedLaunch(h, { pad: true }); }
    for (let round = 0; round < 6; round++) {
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 120000, 'round over');
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 10000, 'next setup');
      await h.padButton(0);
      await timedLaunch(h, { pad: true });
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
    await h.shot('g04_results');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'QuickBattleScreen', 10000, 'back');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'main menu end');
    // controller disconnect handling during a battle is covered by onControllerLost
    return { launchQuality: q.label, errors: h.errors };
  } finally { await h.close(); }
};

scenarios.workshop = async () => {
  const h = await launch();
  try {
    await h.open();
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
    await h.padButton(13); await h.padButton(13); await h.padButton(0); // slot 3
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.osk-key')].find((k) => k.textContent.includes('Done'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu');
    // seed some loot so every tab has content
    await h.eval(() => { const a = window.__app; a.profile.currency.credits = 5000; Object.assign(a.profile.materials, { scrap: 80, polymer: 30, alloy: 30, coreShard: 10 }); });
    await h.focusId('workshop'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen', 10000, 'workshop');
    // equip a different ring through the picker using only the controller
    await h.focusId('slot-ring'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ItemPicker', 10000, 'picker');
    const before = await h.eval(() => window.__app.profile.loadouts[0].parts.ring);
    await h.padButton(13); await h.padButton(13); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen', 10000, 'picked');
    const after = await h.eval(() => window.__app.profile.loadouts[0].parts.ring);
    if (before === after) throw new Error('ring did not change');
    // a left-spin-only launcher offers to switch the loadout's spin with it
    const lefty = await h.eval(() => {
      const P = window.__app.profile;
      const it = structuredClone(P.inventory[P.loadouts[0].launcher]);
      it.uid = 'test_lefty'; it.base = 'launcher_clipreverse';
      P.inventory[it.uid] = it;
      window.__app.ui.refresh(window.__app.ui.current);
      return { uid: it.uid, was: P.loadouts[0].launcher };
    });
    await h.focusId('slot-launcher'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ItemPicker', 10000, 'launcher picker');
    await h.focusId(lefty.uid); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.modal?.el.textContent.includes('left spin only'), 5000, 'spin choice');
    await h.shot('ws_spin_choice');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen', 10000, 'launcher picked');
    const L0 = await h.eval(() => { const L = window.__app.profile.loadouts[0]; return { spin: L.spin, launcher: L.launcher }; });
    if (L0.spin !== 'L' || L0.launcher !== lefty.uid) throw new Error('spin switch with a left-spin launcher failed ' + JSON.stringify(L0));
    await h.eval((was) => { const L = window.__app.profile.loadouts[0]; L.spin = 'R'; L.launcher = was; }, lefty.was);
    // inventory: favourite with X, lock with Y
    await h.padButton(5);
    await h.eval(() => window.__app.ui.focus(document.querySelector('.item-row')));
    await h.padButton(2); await h.padButton(3);
    const flags = await h.eval(() => { const uid = window.__app.ui.focused.dataset.id; const it = window.__app.profile.inventory[uid]; return [it.favourite, it.locked]; });
    if (!flags[0] || !flags[1]) throw new Error('favourite/lock failed ' + flags);
    // damage an item, repair via Repair tab
    await h.eval(() => { const it = Object.values(window.__app.profile.inventory)[0]; it.durability = 20; });
    await h.padButton(5);
    await h.waitFor(() => window.__app.ui.current.tab === 'repair', 5000, 'repair tab');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.repair-row .btn')][0]));
    await h.padButton(0);
    const dur = await h.eval(() => Object.values(window.__app.profile.inventory)[0].durability);
    if (dur <= 20) throw new Error('repair did not apply');
    for (let i = 0; i < 3; i++) { await h.padButton(5); await h.shot('ws_tab' + i); }
    // craft tab: crafting a blueprint works and shows what you got
    await h.padButton(4);
    await h.waitFor(() => window.__app.ui.current.tab === 'craft', 5000, 'craft tab');
    const inv0 = await h.eval(() => Object.keys(window.__app.profile.inventory).length);
    await h.eval(() => window.__app.ui.focus(document.querySelector('[data-id^="bp-"]')));
    await h.padButton(0);
    const inv1 = await h.eval(() => Object.keys(window.__app.profile.inventory).length);
    if (inv1 !== inv0 + 1) throw new Error(`blueprint craft did not add an item: ${inv0} -> ${inv1}`);
    // the Forge panel scrolls with the right stick even though focus is in the other panel
    await h.eval(() => { window.__app.profile.materials.coreShard = 20; window.__app.profile.materials.alloy = 40; window.__app.profile.currency.credits = 9000; });
    await h.eval(() => window.__app.ui.focus(document.querySelector('[data-id="forge-ring"]')));
    await h.padButton(0);
    const inv2 = await h.eval(() => Object.keys(window.__app.profile.inventory).length);
    if (inv2 !== inv1 + 1) throw new Error('forge did not add an item');
    await h.shot('ws_craft');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'back to menu');
    return { errors: h.errors };
  } finally { await h.close(); }
};

scenarios.beasts = async () => {
  const h = await launch();
  try {
    await h.open();
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
    await h.padButton(0); // slot 1 (fresh browser profile)
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.osk-key')].find((k) => k.textContent.includes('Done'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu');
    await h.eval(() => { window.__app.profile.player.level = 2; window.__app.ui.refresh(window.__app.ui.current); });
    await h.focusId('beasts'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BeastsScreen', 10000, 'beasts screen');
    await h.shot('b01_beasts');
    await h.focusId('beast-ferrowulf'); await h.padButton(0);
    const label = await h.eval(() => document.querySelector('[data-id="spirit-trial"]')?.textContent);
    if (!label) throw new Error('Ferrowulf trial not offered at level 2');
    await h.focusId('spirit-trial');
    await h.eval(() => { window.__testRoundTime = 20; window.__testSpeed = 3; });
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'trial battle');
    for (let round = 0; round < 4; round++) {
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
      await h.padButton(0);
      await timedLaunch(h, { pad: true });
      // a fast natural finish at 3x test speed can skip past 'battle' between polls
      await h.waitFor(() => ['battle', 'finishing', 'roundOver', 'matchOver'].includes(window.__app.ui.current.battle.phase), 15000, 'battle running');
      if (round === 0) await h.shot('b02_trial');
      // deterministic outcome: the trial champion is rung out
      await forcePlayerRound(h);
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
    await h.shot('b03_results');
    const owned = await h.eval(() => !!window.__app.profile.beasts.ferrowulf);
    if (!owned) throw new Error('Ferrowulf was not recruited after winning the trial');
    const how = await h.eval(() => window.__app.ui.current.opts?.result?.rounds?.map((r) => r.how).join(',') || '');
    if (!how.includes('out')) throw new Error('forced ring-outs were not scored as ring-outs: ' + how);
    const unlockShown = await h.eval(() => document.body.textContent.includes('has bonded with you'));
    if (!unlockShown) throw new Error('recruit message missing from results');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BeastsScreen', 10000, 'back to beasts');
    await h.focusId('beast-ferrowulf'); await h.padButton(0);
    await h.shot('b04_owned');
    await h.focusId('bond-loadout');
    await h.padButton(0);
    const lb = await h.eval(() => window.__app.profile.loadouts[window.__app.profile.activeLoadout].beast);
    if (lb !== 'ferrowulf') throw new Error('bonding to loadout failed: ' + lb);
    return { errors: h.errors };
  } finally { await h.close(); }
};

scenarios.tournament = async () => {
  const h = await launch();
  const cur = () => h.eval(() => window.__app.ui.current?.constructor.screenName);
  try {
    await h.open();
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.osk-key')].find((k) => k.textContent.includes('Done'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu');
    await h.focusId('tournaments'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentsScreen', 10000, 'board');
    await h.focusId('tour-rookie_cup'); await h.padButton(0);
    await h.shot('t01_board');
    await h.focusId('enter'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'confirm modal');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 10000, 'hub');
    const mode = await h.eval(() => window.__app.tournaments.mode);
    if (mode !== 'worker') throw new Error('simulation worker not running: ' + mode);
    await h.shot('t02_hub');
    // scouting report
    await h.focusId('hub-scout'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ScoutScreen', 5000, 'scout');
    await h.shot('t03_scout');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 5000, 'hub again');
    // play the first match
    await h.eval(() => { window.__testRoundTime = 20; window.__testSpeed = 3; });
    await h.focusId('hub-play'); await h.padButton(0);
    for (let i = 0; i < 6 && (await cur()) === 'DialogueScreen'; i++) { if (i === 0) await h.shot('t04_dialogue'); await h.padButton(0); }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'battle');
    for (let round = 0; round < 4; round++) {
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
      await h.padButton(0);
      await timedLaunch(h, { pad: true });
      await forcePlayerRound(h);
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 10000, 'back to hub');
    const st = await h.eval(() => { const t = window.__app.profile.tournaments.active; const ms = t.stages[0].matches; return { mine: ms.find((m) => (m.a === 0 || m.b === 0) && m.round === 0), sim: ms.filter((m) => m.simulated).length, id: t.id }; });
    if (st.mine.status !== 'done' || st.mine.winner !== 0) throw new Error('player match not recorded as a win: ' + JSON.stringify(st.mine) + ' ' + (h.notes || []).join('; '));
    // other first-round matches are simulated by the worker with real physics
    await h.waitFor(() => window.__app.profile.tournaments.active.stages[0].matches.filter((m) => m.round === 0 && m.simulated).length >= 3, 60000, 'AI matches simulated');
    await h.shot('t05_bracket');
    // persistence: reload the page and resume the tournament
    await h.page.waitForTimeout(800);
    await h.page.reload();
    await h.waitFor(() => !!window.__app?.ui?.current, 20000, 'reloaded');
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots again');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu after reload');
    const same = await h.eval(() => window.__app.profile.tournaments.active?.id);
    if (same !== st.id) throw new Error('tournament not persisted: ' + same);
    await h.focusId('tournaments'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 10000, 'hub restored');
    // withdraw -> ceremony -> career
    await h.focusId('hub-withdraw'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'withdraw confirm');
    await h.eval(() => window.__app.ui.focus([...window.__app.ui.modal.el.querySelectorAll('.btn')].find((b) => b.textContent === 'Withdraw')));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'CeremonyScreen', 10000, 'ceremony');
    await h.shot('t06_ceremony');
    await h.focusId('cer-continue'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentsScreen', 10000, 'board after');
    await h.padButton(5);
    await h.waitFor(() => window.__app.ui.current.tab === 'career', 5000, 'career tab');
    const hist = await h.eval(() => window.__app.profile.tournaments.history[0]);
    if (!hist?.withdrawn) throw new Error('career history missing withdrawal');
    await h.shot('t07_career');
    await h.padButton(5);
    await h.shot('t08_rivals');
    return { errors: h.errors };
  } finally { await h.close(); }
};

// Press confirm through dialogue / title cards until `until` holds.
// Focus a button and press it, retrying if a late re-render stole focus
// (common at software-rendering frame rates).
async function pressUntil(h, id, until, tries = 6) {
  for (let i = 0; i < tries; i++) {
    if (await h.eval(until)) return true;
    await h.focusId(id);
    await h.frames(2);
    if (await h.eval((x) => window.__app.ui.focused?.dataset?.id === x, id)) await h.padButton(0);
    for (let k = 0; k < 20 && !(await h.eval(until)); k++) {
      if (await h.eval(() => window.__app.ui.current?.constructor.screenName === 'DialogueScreen')) return true;
      await h.page.waitForTimeout(150);
    }
  }
  return h.eval(until);
}

async function advanceStory(h, until, max = 120, choiceDown = 0) {
  for (let i = 0; i < max; i++) {
    if (await h.eval(until)) return true;
    const scr = await h.eval(() => window.__app.ui.current?.constructor.screenName);
    if (scr === 'DialogueScreen') {
      const atChoice = await h.eval(() => { const d = window.__app.ui.current; return !!d.choices && d.i >= d.lines.length - 1; });
      if (atChoice && choiceDown) { await h.eval(() => { const d = window.__app.ui.current; d.shown = d.full.length; }); for (let k = 0; k < choiceDown; k++) await h.padButton(13); choiceDown = 0; }
      await h.padButton(0);
    } else if (scr === 'ChapterCardScreen') {
      await h.page.waitForTimeout(450);
      await h.padButton(0);
    } else await h.page.waitForTimeout(100);
  }
  return h.eval(until);
}

scenarios.story = async () => {
  const h = await launch();
  const scr = () => h.eval(() => window.__app.ui.current?.constructor.screenName);
  try {
    await h.open();
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.osk-key')].find((k) => k.textContent.includes('Done'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu');
    const first = await h.eval(() => window.__app.ui.focused?.dataset.id);
    if (first !== 'story') throw new Error('Story is not the default menu tile: ' + first);
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'StoryScreen', 10000, 'story screen');
    await h.shot('s01_story');
    await h.focusId('story-start'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ChapterCardScreen', 10000, 'chapter card');
    await h.shot('s02_card');
    await advanceStory(h, () => window.__app.ui.current?.constructor.screenName === 'DialogueScreen', 5);
    await h.shot('s03_dialogue');
    // through the intro to battler creation
    if (!(await advanceStory(h, () => window.__app.ui.current?.constructor.screenName === 'CreatorScreen'))) throw new Error('creator not reached');
    await h.focusId('style-guardian'); await h.padButton(0);
    await h.focusId('color-ff9f43'); await h.padButton(0);
    await h.shot('s04_creator');
    await h.focusId('creator-done'); await h.padButton(0);
    const style = await h.eval(() => window.__app.profile.player.archetype);
    if (style !== 'guardian') throw new Error('style not saved: ' + style);
    // scenes until the training node is next
    if (!(await advanceStory(h, () => window.__app.ui.current?.constructor.screenName === 'StoryScreen' && window.__app.profile.story.node === 'ch1_training' && !window.__app.ui.current.busy))) throw new Error('training node not reached');
    const items = await h.eval(() => Object.values(window.__app.profile.inventory).filter((i) => i.source === 'story').map((i) => i.base));
    if (!items.includes('ring_ironwall')) throw new Error('guardian starter parts missing: ' + items);
    await h.shot('s05_nextup');
    await h.eval(() => { window.__testRoundTime = 30; window.__testSpeed = 2; });
    await pressUntil(h, 'story-play', () => window.__app.ui.current?.constructor.screenName === 'BattleScreen');
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'training battle');
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'training setup');
    await h.padButton(0);
    await timedLaunch(h, { pad: true });
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'battle', 15000, 'training running');
    await h.page.waitForTimeout(300);
    await h.padButton(0); // Dash: a real objective, measured from the battle event
    await h.waitFor(() => window.__app.ui.current.objectives?.list.find((o) => o.type === 'dash').done, 5000, 'dash objective');
    await h.shot('s06_training');
    // the remaining objectives need aiming skill; complete them through the tracker for the test
    await h.eval(() => { const ob = window.__app.ui.current.objectives; for (const o of ob.list) { o.done = true; o.progress = o.n || 1; } ob.changed = true; });
    await advanceStory(h, () => window.__app.profile.story.node === 'ch1_sora1' && window.__app.ui.current?.constructor.screenName === 'StoryScreen' && !window.__app.ui.current.busy);
    // first rival battle
    await pressUntil(h, 'story-play', () => window.__app.ui.current?.constructor.screenName !== 'StoryScreen');
    await advanceStory(h, () => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 60);
    for (let round = 0; round < 4; round++) {
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
      await h.padButton(0);
      await timedLaunch(h, { pad: true });
      await forcePlayerRound(h);
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
    await h.padButton(1);
    // win lines, Orrery scene, the gift choice (pick the second option), then the Daichi battle card
    if (!(await advanceStory(h, () => window.__app.profile.story.node === 'ch1_daichi' && window.__app.ui.current?.constructor.screenName === 'StoryScreen' && !window.__app.ui.current.busy, 160, 1))) throw new Error('did not reach the Daichi battle');
    const st = await h.eval(() => ({ flags: window.__app.profile.story.flags, choice: window.__app.profile.story.choices.ch1_gift, rival: window.__app.profile.rivals.sora }));
    if (!st.flags.ch1_orrery) throw new Error('Orrery flag missing');
    if (st.choice !== 'weight') throw new Error('choice not recorded: ' + st.choice);
    if (!st.rival?.met) throw new Error('Sora not recorded as met');
    await h.shot('s07_daichi_card');
    // persistence
    await h.page.waitForTimeout(600);
    await h.page.reload();
    await h.waitFor(() => !!window.__app?.ui?.current, 20000, 'reloaded');
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots again');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu after reload');
    const node = await h.eval(() => window.__app.profile.story.node);
    if (node !== 'ch1_daichi') throw new Error('story progress not saved: ' + node);
    await h.focusId('story'); await h.padButton(0);
    await h.waitFor(() => !!document.querySelector('[data-id="story-play"]'), 10000, 'next-up card after reload');
    return { errors: h.errors };
  } finally { await h.close(); }
};

async function newGame(h) {
  await h.open();
  await h.padNeutral();
  await h.padButton(0);
  await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots');
  await h.padButton(0);
  await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'NameEntryScreen', 10000, 'name');
  await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.osk-key')].find((k) => k.textContent.includes('Done'))));
  await h.padButton(0);
  await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu');
}

async function openTile(h, id, screen) {
  await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu for ' + id);
  await h.focusId(id); await h.padButton(0);
  await h.waitFor((s) => window.__app.ui.current?.constructor.screenName === s, 10000, screen, screen);
}

scenarios.screens = async () => {
  const h = await launch();
  try {
    await newGame(h);
    await h.eval(() => { const p = window.__app.profile; p.player.skillPoints = 3; Object.assign(p.stats, { battles: 12, wins: 7, losses: 5, rounds: 30, roundsWon: 17, launches: 30, perfectLaunches: 9, highestImpact: 0.142 }); Object.assign(p.stats.finishes, { spin: 8, out: 5, burst: 3, decision: 1 }); Object.assign(p.stats.losses_by, { spin: 6, out: 4, burst: 2 }); p.stats.arenaUse = { standard: 9, vortex: 3 }; p.stats.buildUse = { 'Gale Striker': 8, 'Tidal Drift': 4 }; p.stats.beastUse = { orrery: 12 }; window.__app.ui.refresh(window.__app.ui.current); });
    await openTile(h, 'skills', 'SkillsScreen');
    await h.focusId('skill-agg_dash'); await h.padButton(0);
    const r = await h.eval(() => [window.__app.profile.player.skills.agg_dash, window.__app.profile.player.skillPoints]);
    if (r[0] !== 1 || r[1] !== 2) throw new Error('learning a skill failed: ' + r);
    await h.shot('x01_skills');
    await h.padButton(1);
    await openTile(h, 'stats', 'StatsScreen');
    await h.shot('x02_stats');
    await h.padButton(5); await h.shot('x03_stats_usage');
    await h.padButton(5); await h.padButton(1);
    return { errors: h.errors };
  } finally { await h.close(); }
};

scenarios.lab = async () => {
  const h = await launch();
  try {
    await newGame(h);
    await openTile(h, 'modes', 'ModesScreen');
    await h.focusId('mode-lab'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PracticeLabScreen', 10000, 'lab');
    await h.focusId('lab-range'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'range battle');
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'range setup');
    await h.padButton(0);
    await timedLaunch(h, { pad: true });
    await h.waitFor(() => window.__app.ui.current.launchLog?.length === 1, 10000, 'launch analysed');
    await h.page.waitForTimeout(600);
    await h.shot('l01_range');
    // pause -> relaunch
    await h.padButton(9);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'pause');
    await h.focusId('lab-relaunch'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen' && window.__app.ui.current.battle.phase === 'setup', 10000, 'relaunch setup');
    await h.padButton(0);
    await timedLaunch(h, { pad: true });
    await h.waitFor(() => window.__app.ui.current.launchLog?.length === 2, 10000, 'second launch analysed');
    const rounds = await h.eval(() => window.__app.ui.current.battle.roundResults.length);
    if (rounds !== 0) throw new Error('relaunch recorded a round result');
    // leave via pause menu
    await h.padButton(9);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'pause 2');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.pause-panel .btn')].find((b) => b.textContent.includes('Leave the lab'))));
    await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'leave confirm');
    await h.eval(() => window.__app.ui.focus([...window.__app.ui.modal.el.querySelectorAll('.btn')].find((b) => b.textContent === 'Quit')));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PracticeLabScreen', 10000, 'back to lab');
    // build lab comparison
    await h.padButton(5); await h.padButton(5);
    await h.waitFor(() => window.__app.ui.current.tab === 'build', 5000, 'build tab');
    await h.focusId('lab-run'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.current.results, 120000, 'comparison results');
    await h.page.waitForTimeout(300);
    await h.shot('l02_buildlab');
    const r = await h.eval(() => { const x = window.__app.ui.current.results; return { n: x.h2h.n, w: x.h2h.wins[0] + x.h2h.wins[1] + x.h2h.draws, a: x.spin[0].samples.length, b: x.spin[1].samples.length }; });
    if (r.w !== r.n || r.a < 5 || r.b < 5) throw new Error('comparison incomplete ' + JSON.stringify(r));
    return { errors: h.errors };
  } finally { await h.close(); }
};

// Play one match as the player, forcing each round's finish (`how`).
async function playForced(h, how = 'out', maxRounds = 5) {
  for (let round = 0; round < maxRounds; round++) {
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
    await h.padButton(0);
    await timedLaunch(h, { pad: true });
    await h.waitFor(() => { const b = window.__app.ui.current.battle; return (b.phase === 'battle' && b.fighters.every((f) => f.launch.launched)) || ['finishing', 'roundOver', 'matchOver'].includes(b.phase); }, 15000, 'battle running');
    await h.eval((w) => window.__app.ui.current.battle.debugFinish(1, w), how);
    await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
    const done = await h.eval(() => !!window.__app.ui.current.battle.result);
    await h.padButton(0);
    if (done) break;
  }
  await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
}

scenarios.modes = async () => {
  const h = await launch();
  const cur = () => h.eval(() => window.__app.ui.current?.constructor.screenName);
  try {
    await newGame(h);
    await openTile(h, 'modes', 'ModesScreen');
    await h.shot('m01_modes');
    // Custom battle: AI vs AI exhibition
    await h.focusId('mode-custom'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'CustomBattleScreen', 5000, 'custom');
    await h.focusId('cb-side1'); await h.padButton(15);
    await h.eval(() => { window.__testRoundTime = 15; window.__testSpeed = 3; });
    await h.focusId('cb-start'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'exhibition');
    if ((await h.eval(() => window.__app.ui.current.battle.fighters.some((f) => f.human)))) throw new Error('spectate battle has a human fighter');
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'battle', 20000, 'exhibition running');
    await h.shot('m02_exhibition');
    await h.eval(() => window.__app.ui.current.battle.debugFinish(1, 'out'));
    for (let i = 0; i < 6 && (await cur()) === 'BattleScreen'; i++) {
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase) || window.__app.ui.current?.constructor.screenName !== 'BattleScreen', 60000, 'exhibition round');
      if ((await cur()) !== 'BattleScreen') break;
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'battle', 20000, 'next exhibition round');
      await h.eval(() => window.__app.ui.current.battle.debugFinish(1, 'out'));
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'exhibition results');
    await h.eval(() => window.__app.ui.focus([...document.querySelectorAll('.results .btn')].find((b) => b.textContent === 'Continue')));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'CustomBattleScreen', 10000, 'back to custom');
    await h.padButton(1);
    // Challenge: Lock Breaker (needs a Shatter finish)
    await h.focusId('mode-challenges'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ChallengesScreen', 5000, 'challenges');
    await h.focusId('ch-lock_breaker'); await h.padButton(0);
    await h.focusId('ch-start'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'challenge battle');
    await playForced(h, 'burst');
    const done = await h.eval(() => !!window.__app.profile.stats.challengesDone?.lock_breaker);
    if (!done) throw new Error('challenge not recorded');
    await h.shot('m03_challenge_results');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ChallengesScreen', 10000, 'back to challenges');
    await h.padButton(1);
    // Survival: one stage, then cash out
    await h.focusId('mode-survival'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'SurvivalScreen', 5000, 'survival');
    await h.focusId('sv-start'); await h.padButton(0);
    await h.focusId('sv-fight'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'survival battle');
    await playForced(h, 'out', 3);
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'SurvivalScreen', 10000, 'back to survival');
    const wins = await h.eval(() => window.__app.profile.survival.active?.wins);
    if (wins !== 1) throw new Error('survival stage not recorded: ' + wins);
    await h.shot('m04_survival');
    await h.focusId('sv-cash'); await h.padButton(0);
    const best = await h.eval(() => [window.__app.profile.survival.best, window.__app.profile.survival.active]);
    if (best[0] !== 1 || best[1]) throw new Error('cash out failed ' + JSON.stringify(best));
    await h.padButton(1);
    // League: start a season
    await h.focusId('mode-league'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'LeagueScreen', 5000, 'league');
    await h.focusId('lg-start'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 10000, 'league hub');
    await h.waitFor(() => window.__app.profile.league.active?.stages[0].matches.some((m) => m.simulated), 60000, 'league AI matches simulated');
    await h.shot('m05_league_hub');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'LeagueScreen', 5000, 'league screen');
    await h.shot('m06_league');
    return { errors: h.errors };
  } finally { await h.close(); }
};

scenarios.replay = async () => {
  const h = await launch();
  try {
    await newGame(h);
    await openTile(h, 'quick', 'QuickBattleScreen');
    await h.eval(() => { window.__testRoundTime = 8; window.__testSpeed = 3; });
    await h.focusId('start'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 10000, 'battle');
    for (let round = 0; round < 6; round++) {
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
      await h.padAxes([0.5, 0, 0, -0.3]); await h.page.waitForTimeout(200); await h.padAxes([0, 0, 0, 0]);
      await h.padButton(0);
      await timedLaunch(h, { pad: true });
      // real steering and techniques during the round (all recorded)
      for (let k = 0; k < 4; k++) {
        if (await h.eval(() => window.__app.ui.current.battle?.phase !== 'battle')) break;
        await h.padAxes([Math.cos(k), Math.sin(k), 0, 0]); await h.page.waitForTimeout(250);
        if (k === 1) await h.padButton(0);
        if (k === 2) await h.padButton(2);
      }
      await h.padAxes([0, 0, 0, 0]);
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 60000, 'round over');
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
    const ctl = await h.eval(() => window.__app.ui.stack.find((s) => s.constructor.screenName === 'BattleScreen').battle.rec.controls.length);
    if (ctl < 5) throw new Error('too few recorded controls: ' + ctl);
    await h.page.waitForTimeout(500);
    await h.focusId('watch-replay'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen' && !!window.__app.ui.current.session.replay, 10000, 'replay screen');
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'battle', 20000, 'replay running');
    await h.shot('r01_replay');
    for (let i = 0; i < 8; i++) {
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase) || window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 90000, 'replay round');
      if ((await h.eval(() => window.__app.ui.current?.constructor.screenName)) === 'ResultsScreen') break;
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'replay results');
    const verified = await h.eval(() => window.__app.ui.stack.filter((s) => s.constructor.screenName === 'BattleScreen').pop().verified);
    await h.shot('r02_replay_done');
    if (verified !== true) throw new Error('replay did not reproduce the original match');
    // replay is listed under Statistics
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 10000, 'original results');
    await h.padButton(1); await h.padButton(1);
    await openTile(h, 'stats', 'StatsScreen');
    for (let i = 0; i < 3; i++) await h.padButton(5);
    await h.waitFor(() => (window.__app.ui.current.replays || []).length === 1, 10000, 'replay listed');
    await h.shot('r03_replays_tab');
    return { errors: h.errors };
  } finally { await h.close(); }
};

// Inspect: the 3D turntable shows a build as separate part models, focus
// ghosts the other parts, X explodes the stack, and leaving restores the
// menu scene. Also checks that a Shatter in battle throws the parts apart.
scenarios.inspect = async () => {
  const h = await launch();
  try {
    await newGame(h);
    await openTile(h, 'workshop', 'WorkshopScreen');
    await h.focusId('inspect3d'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'InspectScreen' && window.__app.renderer.inspectActive, 10000, 'inspect open');
    const parts = await h.eval(() => Object.keys(window.__app.renderer.inspect.visual.parts));
    for (const s of ['tip', 'lock', 'disc', 'ring', 'core']) if (!parts.includes(s)) throw new Error('missing part model ' + s);
    await h.waitFor(() => !window.__app.renderer.inspect.visual.assembling, 15000, 'assembly animation done');
    await h.padButton(2); // X: explode
    await h.waitFor(() => window.__app.renderer.inspect.visual.explode > 0.95, 10000, 'exploded');
    const spread = await h.eval(() => { const v = window.__app.renderer.inspect.visual; return v.parts.core.group.position.y - v.parts.tip.group.position.y; });
    if (!(spread > 0.05)) throw new Error('parts did not separate: ' + spread);
    await h.focusId('ins-ring');
    await h.waitFor(() => { const v = window.__app.renderer.inspect.visual; let ghost = false, solid = true; v.parts.disc.group.traverse((o) => { if (o.isMesh && !o.userData.isInk && o.material.opacity < 0.5) ghost = true; }); v.parts.ring.group.traverse((o) => { if (o.isMesh && !o.userData.isInk && o.material.opacity < 0.5 && !o.material.userData._ghost?.transparent) solid = false; }); return ghost && solid; }, 10000, 'focus ghosts other parts');
    await h.shot('i01_inspect_exploded');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen' && !window.__app.renderer.inspectActive, 10000, 'inspect closed');
    // a Shatter detaches every part model from the top
    await h.padButton(1);
    await openTile(h, 'quick', 'QuickBattleScreen');
    await h.eval(() => window.__app.ui.current.start?.());
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen' && window.__app.renderer.visuals.length === 2, 15000, 'battle');
    const burst = await h.eval(() => {
      const r = window.__app.renderer, v = r.visuals[1], f = v.fighter;
      r.onBattleEvent('topFinished', { fighter: f, how: 'burst' }, window.__app.ui.current.battle);
      return Object.values(v.meshes).every((g) => g.parent && g.parent.isScene) && r.effects.debris.length >= 5;
    });
    if (!burst) throw new Error('burst did not detach the part models');
    return { parts: parts.length, errors: h.errors };
  } finally { await h.close(); }
};

// Fight a Rift battle as the player (forced wins) until the spoils screen opens.
async function riftFight(h) {
  await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 15000, 'rift battle');
  for (let round = 0; round < 5; round++) {
    await h.waitFor(() => window.__app.ui.current.battle?.phase === 'setup', 15000, 'setup');
    await h.padButton(0);
    await timedLaunch(h, { pad: true });
    await h.waitFor(() => { const b = window.__app.ui.current.battle; return (b.phase === 'battle' && b.fighters.every((f) => f.launch.launched)) || ['finishing', 'roundOver', 'matchOver'].includes(b.phase); }, 15000, 'battle running');
    await h.eval(() => window.__app.ui.current.battle.debugFinish(1, 'out'));
    await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
    const done = await h.eval(() => !!window.__app.ui.current.battle.result);
    await h.padButton(0);
    if (done) break;
  }
  await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftRewardScreen', 15000, 'spoils');
}

// Take the first offer on every waiting reward screen (equipping parts that fit).
async function riftClaim(h) {
  const taken = [];
  for (let i = 0; i < 6 && (await h.screen()) === 'RiftRewardScreen'; i++) {
    taken.push(await h.eval(() => { const o = window.__app.profile.rift.active.pending[0].options[0]; return o.type === 'part' ? 'part:' + o.item.rarity : o.type; }));
    await h.focusId('loot-0'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal || window.__app.ui.current?.constructor.screenName !== 'RiftRewardScreen' || window.__app.profile.rift.active.pending.length < 9, 10000, 'reward taken');
    if (await h.eval(() => !!window.__app.ui.modal)) await h.padButton(0);
    await h.waitFor(() => !window.__app.ui.modal && ['RiftScreen', 'RiftRewardScreen'].includes(window.__app.ui.current?.constructor.screenName), 10000, 'after reward');
    await h.frames(4);
  }
  return taken;
}

scenarios.rift = async () => {
  const h = await launch();
  const openNode = (type) => h.eval((t) => [...document.querySelectorAll('.rift-node.open')].find((b) => b.classList.contains('type-' + t))?.dataset.id || null, type);
  const run = () => h.eval(() => { const r = window.__app.profile.rift.active; return r && { act: r.act, floor: r.floor, wins: r.stats.wins, bosses: r.stats.bosses, essence: r.essence, shards: r.shards, bag: r.bag.length, charms: r.charms.length, boons: Object.keys(r.boons).length, hearts: r.hearts, seed: r.seed }; });
  try {
    await newGame(h);
    await openTile(h, 'rift', 'RiftScreen');
    await h.shot('r01_lobby');
    const inv0 = await h.eval(() => Object.keys(window.__app.profile.inventory).length);
    await h.focusId('rift-start'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.profile.rift.active && !!document.querySelector('.rift-node.open'), 10000, 'rift map');
    await h.shot('r02_map');
    // floor 1 always offers a battle
    await h.eval(() => { window.__testRoundTime = 25; window.__testSpeed = 3; });
    const first = await openNode('battle');
    if (!first) throw new Error('no battle on floor 1');
    await h.focusId(first); await h.padButton(0);
    await riftFight(h);
    await h.page.waitForTimeout(900);
    await h.shot('r03_spoils');
    const spoils = await riftClaim(h);
    const a = await run();
    if (a.floor !== 1 || a.wins !== 1 || !(a.essence > 0)) throw new Error('battle node not completed: ' + JSON.stringify(a));
    // floor 2 always offers a trader
    await h.focusId(await openNode('trader')); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftNodeScreen', 10000, 'trader');
    await h.shot('r04_trader');
    const buyId = await h.eval(() => [...document.querySelectorAll('[data-id^="buy-"]')].find((b) => !b.disabled)?.dataset.id || null);
    if (buyId) {
      await h.focusId(buyId); await h.padButton(0);
      if (await h.eval(() => !!window.__app.ui.modal)) await h.padButton(0);
      await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftNodeScreen' && !window.__app.ui.modal, 10000, 'bought');
    }
    await h.focusId('node-leave'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftScreen' && window.__app.profile.rift.active.floor === 2, 10000, 'floor 3');
    // the run survives a reload
    const before = await run();
    await h.page.waitForTimeout(500);
    await h.page.reload();
    await h.waitFor(() => !!window.__app?.ui?.current, 20000, 'reloaded');
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots again');
    await h.padButton(0);
    await openTile(h, 'rift', 'RiftScreen');
    const after = await run();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('run not restored: ' + JSON.stringify({ before, after }));
    // floor 3 always offers a camp or a forge (shards topped up so a forge job is affordable)
    await h.eval(() => { window.__app.profile.rift.active.shards += 120; });
    const third = (await openNode('camp')) || (await openNode('forge'));
    await h.focusId(third); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftNodeScreen', 10000, 'camp or forge');
    await h.shot('r05_' + third.replace(/\W+/g, '_'));
    const work = await h.eval(() => [...document.querySelectorAll('[data-id^="tune-"], [data-id="job-upgrade"]')].find((b) => !b.disabled)?.dataset.id || null);
    if (work) { await h.focusId(work); await h.padButton(0); await h.frames(4); }
    const forged = await h.eval(() => { const r = window.__app.profile.rift.active; return [...Object.values(r.equipped), ...r.bag].filter(Boolean).some((x) => x.forge > 0); });
    if (!forged) throw new Error('no part was tuned or upgraded at ' + third);
    await h.focusId('node-leave'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftScreen' && window.__app.profile.rift.active.floor === 3, 10000, 'boss floor');
    // the boss: best of three, then a chain of rewards and the next Rift
    await h.eval(() => { window.__testRoundTime = 25; window.__testSpeed = 3; });
    await h.focusId(await openNode('boss')); await h.padButton(0);
    await riftFight(h);
    await h.page.waitForTimeout(900);
    await h.shot('r06_boss_spoils');
    const bossLoot = await riftClaim(h);
    const b = await run();
    if (b.act !== 1 || b.floor !== 0 || b.bosses !== 1 || !b.boons) throw new Error('boss not cleared: ' + JSON.stringify(b));
    await h.shot('r07_rift2');
    // abandon, keep a part in the Locker, bank
    await h.focusId('rift-abandon'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'abandon confirm');
    await h.eval(() => window.__app.ui.focus([...window.__app.ui.modal.el.querySelectorAll('.btn')].find((x) => x.textContent === 'Abandon')));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftSummaryScreen', 10000, 'summary');
    const secured = await h.eval(() => (window.__app.profile.rift.active.stash || []).length + [...Object.values(window.__app.profile.rift.active.equipped), ...window.__app.profile.rift.active.bag].filter((x) => x?.secured).length);
    if (!(secured >= 1)) throw new Error('beating the boss secured no parts');
    // the best unsecured find starts in the Locker
    const keepId = await h.eval(() => document.querySelector('.tour-btn.sel[data-id^="keep-"]')?.dataset.id || null);
    const anyKeepable = await h.eval(() => !!document.querySelector('[data-id^="keep-"]'));
    if (anyKeepable && !keepId) throw new Error('no part was pre-selected for the Locker');
    await h.shot('r08_summary');
    await h.focusId('rift-bank'); await h.padButton(0);
    await h.waitFor(() => !!document.querySelector('[data-id="rift-done"]'), 10000, 'banked');
    await h.shot('r09_banked');
    await h.focusId('rift-done'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'RiftScreen' && !window.__app.profile.rift.active, 10000, 'lobby again');
    const R = await h.eval(() => { const r = window.__app.profile.rift; return { essence: r.essence, runs: r.runs, history: r.history.length }; });
    const inv1 = await h.eval(() => Object.keys(window.__app.profile.inventory).length);
    if (R.runs !== 1 || R.history !== 1 || !(R.essence > 0)) throw new Error('run not banked: ' + JSON.stringify(R));
    if (inv1 < inv0 + secured + (keepId ? 1 : 0)) throw new Error(`secured / locker parts not added: ${inv0} -> ${inv1} (secured ${secured})`);
    // talents page
    await h.padButton(5);
    await h.waitFor(() => !!document.querySelector('.talent-grid'), 5000, 'talents');
    await h.shot('r10_talents');
    return { spoils, bossLoot, forged, kept: !!keepId, essence: R.essence, errors: h.errors };
  } finally { await h.close(); }
};

// Classic series in the real app: every classic part renders in Inspect,
// a classic top battles a classic opponent, the clutch fires and is shown.
scenarios.classic = async () => {
  const h = await launch();
  const equip = (parts) => h.eval((ps) => {
    const P = window.__app.profile, L = P.loadouts[P.activeLoadout];
    for (const [slot, base] of Object.entries(ps)) {
      const uid = 'cl_' + base;
      if (!P.inventory[uid]) {
        P.inventory[uid] = { uid, base, slot, rarity: 'rare', level: 5, seed: 7, stats: {}, traits: [], special: null, set: null, durability: 110, maxDurability: 110, xp: 0, tuning: [], upgrades: [],
          history: { battles: 0, wins: 0, knockouts: 0, bursts: 0, burstsSurvived: 0, highestImpact: 0, longestSpin: 0, tournamentWins: 0, moments: [], acquired: 'test', acquiredAt: 0 }, nickname: null, favourite: false, locked: false, visual: { color: null } };
        if (slot === 'launcher') P.inventory[uid].parts = { drive: 100, trigger: 100, grip: 100 };
      }
      if (slot === 'launcher') L.launcher = uid; else L.parts[slot] = uid;
    }
  }, parts);
  const inspect = async (label) => {
    await openTile(h, 'workshop', 'WorkshopScreen');
    await h.focusId('inspect3d'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'InspectScreen' && window.__app.renderer.inspectActive, 10000, 'inspect ' + label);
    await h.waitFor(() => !window.__app.renderer.inspect.visual.assembling, 15000, 'assembled ' + label);
    const r = await h.eval(() => { const v = window.__app.renderer.inspect.visual; return { parts: Object.keys(v.parts), spinners: v.spinners?.length || 0 }; });
    await h.shot('c_' + label);
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen', 10000, 'back to workshop');
    await h.padButton(1);
    return r;
  };
  try {
    await newGame(h);
    const looks = {};
    for (const [label, parts] of Object.entries({
      wing: { ring: 'ring_twinwing', disc: 'disc_octawide', tip: 'tip_springjump' },
      roller: { ring: 'ring_rollerguard', disc: 'disc_starlobe', tip: 'tip_autoshift', lock: 'lock_roller' },
      spike: { ring: 'ring_quadspike', disc: 'disc_hexheavy', tip: 'tip_steelball' },
      final: { ring: 'ring_hoophalo', disc: 'disc_magna', tip: 'tip_clutchfinal' },
    })) {
      await equip(parts);
      looks[label] = await inspect(label);
      if (looks[label].parts.length < 5) throw new Error(`${label}: missing part models ${JSON.stringify(looks[label])}`);
    }
    if (!(looks.roller.spinners >= 4)) throw new Error('roller guard and twin roller should add spinning rollers: ' + looks.roller.spinners);
    // a classic top (hit clutch, digital launcher) against the Magna Guard
    await equip({ ring: 'ring_quadspike', disc: 'disc_magna', tip: 'tip_clutchhit', lock: 'lock_click3', launcher: 'launcher_digital' });
    await openTile(h, 'quick', 'QuickBattleScreen');
    await h.eval(() => { window.__app.ui.current.cfg.opponent = 'magna'; window.__testRoundTime = 30; window.__testSpeed = 3; });
    await h.eval(() => window.__app.ui.current.start?.());
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 15000, 'battle');
    await h.eval(() => { window.__mech = []; window.__app.ui.current.battle.on('mechanism', (e) => window.__mech.push(`${e.fighter.index}:${e.kind}`)); });
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
    await h.padButton(0);
    await timedLaunch(h, { pad: true });
    await h.waitFor(() => [...document.querySelectorAll('.notif')].some((n) => n.textContent.includes('LCD')), 15000, 'digital launcher readout');
    const lcd = true;
    await h.waitFor(() => window.__mech.includes('0:clutch') || !window.__app.ui.current.battle?.fighters[0].top.active, 60000, 'clutch released');
    await h.shot('c_battle');
    const mech = await h.eval(() => window.__mech.slice());
    await h.eval(() => window.__app.ui.current.battle.debugFinish(1, 'out'));
    await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
    return { looks: Object.fromEntries(Object.entries(looks).map(([k, v]) => [k, v.spinners])), mech, lcd, errors: h.errors };
  } finally { await h.close(); }
};

// Shop: buy a pack (confirm, reveal), then a daily deal.
scenarios.store = async () => {
  const h = await launch();
  const confirmBuy = async () => {
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'buy confirm');
    await h.eval(() => window.__app.ui.focus([...window.__app.ui.modal.el.querySelectorAll('.btn')].find((b) => b.textContent.startsWith('Buy for'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'StoreRevealScreen', 10000, 'reveal');
  };
  try {
    await newGame(h);
    await h.eval(() => { window.__app.profile.currency.credits = 30000; });
    const inv0 = await h.eval(() => Object.keys(window.__app.profile.inventory).length);
    await openTile(h, 'store', 'StoreScreen');
    await h.shot('s01_packs');
    await h.focusId('offer-pack_street'); await h.padButton(0);
    await confirmBuy();
    await h.page.waitForTimeout(1600);
    await h.shot('s02_reveal');
    const got = await h.eval(() => window.__app.ui.current.result.items.map((it) => it.rarity));
    if (got.length !== 4) throw new Error('street pack should open 4 items: ' + got);
    await h.focusId('reveal-done'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'StoreScreen', 5000, 'back to shop');
    // today's deals sit further down the Main Store page: scroll there with the right stick
    await h.padNeutral();
    await h.eval(() => { window.__pad.axes = [0, 0, 0, 1]; });
    await h.page.waitForTimeout(900);
    await h.padNeutral();
    const scrolled = await h.eval(() => document.querySelector('[data-scroll="shop-main"]').scrollTop);
    if (!(scrolled > 50)) throw new Error('right stick did not scroll the store page: ' + scrolled);
    await h.shot('s03_deals');
    await h.focusId('deal-0'); await h.padButton(0);
    await confirmBuy();
    await h.focusId('reveal-done'); await h.padButton(0);
    const sold = await h.eval(() => !!document.querySelector('[data-id="deal-0"][disabled]'));
    // Daily Store: a one-of-a-kind prototype
    await h.padButton(5);
    await h.waitFor(() => !!document.querySelector('[data-id="proto-0"]'), 5000, 'daily store');
    await h.shot('s04_daily');
    await h.focusId('proto-0'); await h.padButton(0);
    await confirmBuy();
    const proto = await h.eval(() => !!window.__app.ui.current.result.items[0].def?.generated);
    await h.focusId('reveal-done'); await h.padButton(0);
    const after = await h.eval(() => ({ cr: window.__app.profile.currency.credits, inv: Object.keys(window.__app.profile.inventory).length }));
    if (!proto) throw new Error('daily store item is not a prototype');
    if (after.inv !== inv0 + 6) throw new Error(`inventory ${inv0} -> ${after.inv}`);
    if (!(after.cr < 30000 - 500)) throw new Error('credits not spent: ' + after.cr);
    if (!sold) throw new Error('deal not marked sold');
    return { got, credits: after.cr, errors: h.errors };
  } finally { await h.close(); }
};

// Career loop end to end: build and inspect, win a whole tournament, collect
// the prizes, spend CR in the Store, upgrade a part, equip a prize, spend a
// skill point, save and reload, then battle with the new top.
scenarios.career = async () => {
  const h = await launch();
  const cur = () => h.eval(() => window.__app.ui.current?.constructor.screenName);
  const playMatch = async () => {
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 15000, 'battle');
    for (let round = 0; round < 5; round++) {
      await h.waitFor(() => window.__app.ui.current.battle.phase === 'setup', 15000, 'setup');
      await h.padButton(0);
      await timedLaunch(h, { pad: true });
      await forcePlayerRound(h);
      await h.waitFor(() => ['roundOver', 'matchOver'].includes(window.__app.ui.current.battle?.phase), 30000, 'round over');
      const done = await h.eval(() => !!window.__app.ui.current.battle.result);
      await h.padButton(0);
      if (done) break;
    }
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ResultsScreen', 15000, 'results');
  };
  const snap = () => h.eval(() => { const p = window.__app.profile; return { cr: p.currency.credits, xp: p.player.xp, level: p.player.level, sp: p.player.skillPoints, inv: Object.keys(p.inventory).length, hist: p.tournaments.history.length }; });
  try {
    await newGame(h);
    const s0 = await snap();
    // build: swap the ring, then inspect the top
    await openTile(h, 'workshop', 'WorkshopScreen');
    await h.focusId('slot-ring'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'ItemPicker', 10000, 'picker');
    await h.padButton(13); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen', 10000, 'picked');
    await h.focusId('inspect3d'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'InspectScreen' && window.__app.renderer.inspectActive, 10000, 'inspect');
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'WorkshopScreen', 10000, 'back to workshop');
    await h.padButton(1);
    // a whole tournament: the Rookie Cup, three matches to the title
    await openTile(h, 'tournaments', 'TournamentsScreen');
    await h.focusId('tour-rookie_cup'); await h.padButton(0);
    await h.focusId('enter'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'enter confirm');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 10000, 'hub');
    await h.eval(() => { window.__testRoundTime = 20; window.__testSpeed = 3; });
    let played = 0;
    for (let match = 0; match < 5; match++) {
      await h.waitFor(() => { const b = document.querySelector('[data-id="hub-play"]'); return (b && !b.disabled) || !!document.querySelector('[data-id="collect"]'); }, 120000, 'next match ready');
      if (await h.eval(() => !!document.querySelector('[data-id="collect"]'))) break;
      await h.focusId('hub-play'); await h.padButton(0);
      for (let i = 0; i < 10 && (await cur()) === 'DialogueScreen'; i++) await h.padButton(0);
      await playMatch();
      played++;
      await h.padButton(1);
      await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentHubScreen', 15000, 'after match');
    }
    await h.focusId('collect'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'CeremonyScreen', 10000, 'ceremony');
    await h.shot('cr01_ceremony');
    await h.focusId('cer-continue'); await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'TournamentsScreen', 10000, 'board');
    await h.padButton(1);
    const s1 = await snap();
    const hist = await h.eval(() => window.__app.profile.tournaments.history[0]);
    if (played !== 3 || hist?.place !== 1) throw new Error(`did not win the cup: played ${played}, ${JSON.stringify(hist)}`);
    if (!(s1.cr > s0.cr && s1.inv >= s0.inv + 2 && (s1.level > s0.level || s1.xp > s0.xp))) throw new Error('prizes missing ' + JSON.stringify({ s0, s1 }));
    // store: a materials crate pays for an upgrade
    await openTile(h, 'store', 'StoreScreen');
    await h.focusId('offer-crate_materials'); await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'crate confirm');
    await h.eval(() => window.__app.ui.focus([...window.__app.ui.modal.el.querySelectorAll('.btn')].find((b) => b.textContent.startsWith('Buy for'))));
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'StoreRevealScreen', 10000, 'crate opened');
    await h.focusId('reveal-done'); await h.padButton(0);
    await h.padButton(1);
    // upgrade the equipped ring
    await openTile(h, 'workshop', 'WorkshopScreen');
    await h.padButton(5); await h.padButton(5); await h.padButton(5);
    await h.waitFor(() => window.__app.ui.current.tab === 'upgrade', 5000, 'upgrade tab');
    const ringUid = await h.eval(() => window.__app.profile.loadouts[window.__app.profile.activeLoadout].parts.ring);
    await h.eval((uid) => document.querySelector(`[data-id="up-${uid}"]`).click(), ringUid);
    await h.eval(() => window.__app.ui.focus(document.querySelector('[data-id="upg-ring_balance"]')));
    await h.padButton(0);
    const upgraded = await h.eval((uid) => window.__app.profile.inventory[uid].upgrades.slice(), ringUid);
    if (!upgraded.includes('ring_balance')) throw new Error('upgrade not applied: ' + JSON.stringify(upgraded));
    // equip a prize (the launcher or cord from the cup)
    await h.padButton(4); await h.padButton(4);
    await h.waitFor(() => window.__app.ui.current.tab === 'inventory', 5000, 'inventory tab');
    const prize = await h.eval(() => Object.values(window.__app.profile.inventory).find((it) => it.gen?.source?.includes('Rookie') && ['launcher', 'cable'].includes(it.slot))?.uid || null);
    if (!prize) throw new Error('no launcher/cord prize from the cup');
    await h.eval((uid) => window.__app.ui.focus(document.querySelector(`[data-id="${uid}"]`)), prize);
    await h.padButton(0);
    await h.waitFor(() => !!window.__app.ui.modal, 5000, 'item actions');
    await h.eval(() => window.__app.ui.focus([...window.__app.ui.modal.el.querySelectorAll('.btn')].find((b) => b.textContent.startsWith('Equip to'))));
    await h.padButton(0);
    // a prize launcher for the other spin direction asks first; take the switch
    await h.page.waitForTimeout(300);
    if (await h.eval(() => !!window.__app.ui.modal?.el.textContent.includes('spin only'))) await h.padButton(0);
    const equipped = await h.eval((uid) => { const L = window.__app.profile.loadouts[window.__app.profile.activeLoadout]; return L.launcher === uid || L.cable === uid; }, prize);
    if (!equipped) throw new Error('prize not equipped');
    await h.padButton(1);
    // skills: spend a point if the cup levelled us up
    let skilled = false;
    if ((await snap()).sp > 0) {
      await openTile(h, 'skills', 'SkillsScreen');
      await h.eval(() => window.__app.ui.focus(document.querySelector('.skill-btn.can')));
      await h.padButton(0);
      skilled = (await snap()).sp < s1.sp;
      await h.padButton(1);
    }
    // save, reload, and everything is still there
    const before = await h.eval(() => { const p = window.__app.profile; const L = p.loadouts[p.activeLoadout]; return JSON.stringify({ cr: p.currency.credits, inv: Object.keys(p.inventory).length, L: [L.parts.ring, L.launcher, L.cable], up: p.inventory[L.parts.ring].upgrades, hist: p.tournaments.history.length, sp: p.player.skillPoints }); });
    await h.focusId('save'); await h.padButton(0);
    await h.page.waitForTimeout(800);
    await h.page.reload();
    await h.waitFor(() => !!window.__app?.ui?.current, 20000, 'reloaded');
    await h.padNeutral();
    await h.padButton(0);
    await h.waitFor(() => document.querySelector('.slot-list .btn'), 10000, 'slots again');
    await h.padButton(0);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'menu after reload');
    const after = await h.eval(() => { const p = window.__app.profile; const L = p.loadouts[p.activeLoadout]; return JSON.stringify({ cr: p.currency.credits, inv: Object.keys(p.inventory).length, L: [L.parts.ring, L.launcher, L.cable], up: p.inventory[L.parts.ring].upgrades, hist: p.tournaments.history.length, sp: p.player.skillPoints }); });
    if (after !== before) throw new Error(`save/reload lost progress:\n${before}\n${after}`);
    // and the new top battles
    await openTile(h, 'quick', 'QuickBattleScreen');
    await h.eval(() => { window.__testRoundTime = 20; window.__testSpeed = 3; window.__app.ui.current.cfg.format = 'single'; });
    const invalid = await h.eval(() => document.querySelector('.warn-box')?.textContent || null);
    if (invalid) throw new Error('loadout cannot battle after the loop: ' + invalid);
    await h.eval(() => window.__app.ui.current.start?.());
    await playMatch();
    await h.shot('cr02_after');
    return { played, place: hist.place, credits: [s0.cr, s1.cr], level: [s0.level, s1.level], skilled, errors: h.errors };
  } finally { await h.close(); }
};

const only = process.argv[2];
let failed = 0;
for (const [name, fn] of Object.entries(scenarios)) {
  if (only && only !== name) continue;
  const t0 = Date.now();
  try {
    const r = await fn();
    const errs = r.errors || [];
    if (errs.length) { failed++; results.push(`FAIL ${name}: page errors:\n  ${errs.join('\n  ')}`); }
    else results.push(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s) ${JSON.stringify({ ...r, errors: undefined })}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${e.message}`);
  }
}
console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
