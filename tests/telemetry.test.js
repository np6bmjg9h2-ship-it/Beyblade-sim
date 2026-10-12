// Play data: records are plain gameplay numbers (no names), sending needs the
// artifact database and consent, writes are one at a time and roll over into
// new parts, and a viewer who may not write stops quietly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry, matchRecord, MAX_EVENTS } from '../src/systems/telemetry.js';
import { Battle } from '../src/game/battle.js';
import { ARCHETYPE_INDEX, participantFromDef } from '../src/data/opponents.js';
import { newProfile } from '../src/systems/profile.js';
import { buildParticipant } from '../src/systems/loadout.js';
import { defaultSettings } from '../src/systems/profile.js';

function playOne() {
  const p = newProfile(8);
  p.player.name = 'Secret Name';
  const me = buildParticipant(p, p.loadouts[0]);
  const b = new Battle({ arenaId: 'standard', format: 'single', seed: 4, headless: true, participants: [{ ...me, human: true }, participantFromDef(ARCHETYPE_INDEX.wall, { id: 'B' })], rules: { durability: false, slowmo: false }, roundTime: 30 });
  // a human fighter in a headless battle: steer nothing, the result is what matters
  b.fighters[0].human = false;
  b.fighters[0].controller = b.fighters[1].controller;
  const result = b.runHeadless();
  result.fighters[0].human = true;
  return { b, result };
}

class FakeDb {
  constructor({ deny = false } = {}) { this.writes = []; this.deny = deny; this.busy = false; }
  doc(path) {
    return {
      path,
      set: async (data) => {
        assert.ok(!this.busy, 'one write at a time');
        this.busy = true;
        await new Promise((r) => setTimeout(r, 5));
        this.busy = false;
        if (this.deny) throw { code: 'invalid_argument', message: 'no' };
        this.writes.push({ path, data: structuredClone(data) });
      },
    };
  }
}

const fakeApp = () => ({ settings: defaultSettings(), renderer: null, ui: null });

test('a match record holds builds, results and effects, never names', () => {
  const { b, result } = playOne();
  const r = matchRecord(result, { mode: 'quick' }, b, null);
  assert.equal(r.kind, 'match');
  assert.ok(r.me.build.ring.base && Array.isArray(r.me.build.ring.traits));
  assert.ok(r.rounds.length >= 1 && r.opp.who === 'B');
  const text = JSON.stringify(r);
  assert.ok(!text.includes('Secret Name'), 'the player name never leaves the game');
  assert.ok(text.length < 4000, `compact (${text.length} bytes)`);
});

test('nothing is sent without the database and consent; parts roll over; refusals stop it', async () => {
  const { b, result } = playOne();
  const t = new Telemetry(fakeApp());
  t.match(result, { mode: 'quick' }, b, null);
  assert.equal(t.events.length, 0, 'no database: nothing recorded');
  t.db = new FakeDb(); t.state = 'ready';
  t.match(result, { mode: 'quick' }, b, null);
  assert.equal(t.events.length, 0, 'no consent yet');
  t.app.settings.gameplay.shareData = true;
  for (let i = 0; i < MAX_EVENTS + 5; i++) t.event('store', { offer: 'x', i });
  clearTimeout(t.timer);
  await t.flush();
  await t.flush();
  const paths = t.db.writes.map((w) => w.path);
  assert.deepEqual(paths, [`telemetry/${t.session}-0`, `telemetry/${t.session}-1`]);
  assert.equal(t.db.writes[0].data.events.length, MAX_EVENTS);
  assert.equal(t.db.writes[1].data.events.length, 5);
  // a viewer who may not write: stop quietly
  const d = new Telemetry(fakeApp());
  d.db = new FakeDb({ deny: true }); d.state = 'ready'; d.app.settings.gameplay.shareData = true;
  d.event('store', { offer: 'y' });
  clearTimeout(d.timer);
  await d.flush();
  assert.equal(d.state, 'denied');
  d.event('store', { offer: 'z' });
  assert.equal(d.events.length, 1, 'nothing more is recorded');
});
