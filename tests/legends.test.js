// The Archive and the Four Founders' legends: research projects in order,
// awakening into the Legend slot, the slot's fixed kit, and save repair.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGENDS, LEGEND_PROJECTS } from '../src/data/legends.js';
import { BEAST_INDEX } from '../src/data/beasts.js';
import { TRAIT_INDEX } from '../src/data/traits.js';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { projectStatus, completeProject, legendLoadout, legendKit, setLegend, unlockLegend } from '../src/systems/legends.js';
import { validateLoadout, buildParticipant } from '../src/systems/loadout.js';
import { canStart } from '../src/systems/rift.js';
import * as WS from '../src/systems/workshop.js';
import { Battle } from '../src/game/battle.js';

const veteran = () => {
  const p = newProfile(21);
  p.player.level = 30;
  p.story.completed = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6'];
  p.currency.research = 5000;
  return p;
};

test('every legend: a fixed kit that validates, its own chip and three projects', () => {
  for (const L of LEGENDS) {
    assert.equal(L.projects.length, 3, L.id);
    const B = BEAST_INDEX[L.beast];
    assert.ok(B && B.legend === L.id, `${L.id} chip`);
    for (const [slot, list] of Object.entries(L.traits || {})) for (const [id] of list) assert.ok(TRAIT_INDEX[id]?.slots.includes(slot), `${L.id} ${slot} trait ${id}`);
    const p = veteran();
    unlockLegend(p, L.id);
    const slot = legendLoadout(p);
    assert.equal(slot.legend, L.id);
    const v = validateLoadout(p, slot);
    assert.ok(v.ok, `${L.id}: ${v.errors.join(' ')}`);
    assert.equal(slot.spin, L.spin);
  }
});

test('projects run in order, cost research and the third awakens the legend', () => {
  const p = newProfile(22);
  const [a1, a2, a3] = LEGENDS[0].projects;
  assert.equal(projectStatus(p, a1.id).available, false, 'level gate');
  p.player.level = 30;
  p.currency.research = 10;
  assert.match(projectStatus(p, a1.id).reason, /research/);
  p.currency.research = 1000;
  assert.match(projectStatus(p, a2.id).reason, /first/);
  assert.ok(completeProject(p, a1.id).ok);
  assert.equal(p.currency.research, 1000 - a1.cost);
  assert.equal(completeProject(p, a1.id).ok, false, 'only once');
  assert.match(projectStatus(p, a2.id).reason, /Chapter/);
  p.story.completed = ['ch1', 'ch2'];
  assert.ok(completeProject(p, a2.id).ok);
  assert.equal(legendLoadout(p), null, 'no slot before the legend wakes');
  const r = completeProject(p, a3.id);
  assert.ok(r.ok && r.awakened);
  assert.ok(p.beasts[LEGENDS[0].beast], 'the chip joins');
  assert.equal(legendLoadout(p).legend, LEGENDS[0].id);
  assert.equal(p.loadouts.filter((l) => l.legend).length, 1);
});

test('the Legend slot is fixed: no equipping, no Rift, no inventory items; switching legends keeps one slot', () => {
  const p = veteran();
  for (const pr of LEGEND_PROJECTS) assert.ok(completeProject(p, pr.id).ok, pr.id);
  const slot = legendLoadout(p);
  const i = p.loadouts.indexOf(slot);
  const anyRing = Object.values(p.inventory).find((it) => it.slot === 'ring');
  assert.equal(WS.equip(p, i, 'ring', anyRing.uid).ok, false);
  assert.equal(canStart(p, i).ok, false);
  setLegend(p, slot, 'black');
  assert.equal(slot.name, 'Black Bulwark');
  assert.equal(slot.beast, 'genbukai');
  assert.equal(legendKit('black').parts.aux.legend, 'black');
  assert.equal(Object.keys(slot.parts).length, 0, 'no inventory items in the slot');
  const me = buildParticipant(p, slot);
  assert.equal(me.beast.id, 'genbukai');
  const b = new Battle({ arenaId: 'standard', format: 'single', seed: 3, participants: [{ ...me, human: false, ai: 'defensive' }, { ...buildParticipant(p, p.loadouts[0], { id: 'b' }), human: false, ai: 'aggressive' }] });
  const res = b.runHeadless();
  assert.ok(res.rounds.length >= 1);
});

test('save repair: one Legend slot, only for awakened legends, chips restored', () => {
  const p = veteran();
  unlockLegend(p, 'azure');
  p.loadouts.push({ ...structuredClone(legendLoadout(p)), id: 'dup' });
  delete p.beasts.seiryuga;
  normalizeProfile(p);
  assert.equal(p.loadouts.filter((l) => l.legend).length, 1);
  assert.ok(p.beasts.seiryuga);
  p.archive.legends = { nope: { at: 1 } };
  normalizeProfile(p);
  assert.equal(legendLoadout(p), null, 'unknown legends removed, slot with them');
  const fresh = newProfile(1);
  normalizeProfile(fresh);
  assert.deepEqual(fresh.archive, { done: {}, legends: {} });
});
