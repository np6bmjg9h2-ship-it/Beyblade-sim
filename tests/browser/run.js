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
  if (pad) { await h.padHold(7, 1); await h.page.waitForTimeout(150); await h.padHold(7, 0); await h.padHold(6, 0); }
  else await h.page.keyboard.up('Space');
  await h.waitFor(() => window.__app.ui.current.battle.fighters[0].launch.released, 10000, 'released');
  return h.eval(() => window.__app.ui.current.battle.fighters[0].launch.result.quality);
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
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'battle', 15000, 'battle running');
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
    for (let i = 0; i < 6; i++) { if ((await h.eval(() => window.__app.ui.focused?.dataset.id)) === 'settings') break; await h.padButton(15); }
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
    for (let i = 0; i < 6; i++) { if ((await h.eval(() => window.__app.ui.focused?.dataset.id)) === 'quick') break; await h.padButton(14); }
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
    await h.waitFor(() => window.__app.ui.current.battle.phase === 'battle', 15000, 'battle running');
    await h.padAxes([0, -1, 0, 0]); await h.page.waitForTimeout(700); await h.padAxes([0, 0, 0, 0]);
    await h.padButton(0); // dash
    await h.padButton(2); // counter
    await h.shot('g03_battle');
    await h.padButton(9); // pause
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'pause');
    await h.padButton(9);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 5000, 'unpause');
    // controller disconnect mid-battle auto-pauses
    await h.eval(() => { const ev = new Event('gamepaddisconnected'); ev.gamepad = { index: 0, id: 'test pad' }; window.dispatchEvent(ev); });
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'PauseOverlay', 5000, 'auto pause on disconnect');
    await h.padButton(0); // Resume (focused)
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'BattleScreen', 5000, 'resume after reconnect');
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
    await h.padButton(1);
    await h.waitFor(() => window.__app.ui.current?.constructor.screenName === 'MainMenu', 10000, 'back to menu');
    return { errors: h.errors };
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
