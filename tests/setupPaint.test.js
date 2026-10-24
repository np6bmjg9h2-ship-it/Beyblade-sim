// Part setup sliders (data/setup.js) and paint (data/paint.js): sliders move
// the resolved part within their range and nothing else; paint changes the
// look only; both survive a save load and are cleaned when out of range.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, normalizeProfile } from '../src/systems/profile.js';
import { createItem } from '../src/systems/items.js';
import { resolvePart, assembleTop } from '../src/systems/assembly.js';
import { SETUP_AXES, SETUP_STEPS, cleanSetup } from '../src/data/setup.js';
import { PAINT_COLOR_INDEX, finishAllowed } from '../src/data/paint.js';
import * as WS from '../src/systems/workshop.js';

const strip = (d) => { const o = { ...d }; for (const k of ['_notes', '_item', 'color', 'itemFinish']) delete o[k]; return o; };

test('every slider moves only its own fields, in proportion, and 0 is the designed part', () => {
  const p = newProfile(11);
  for (const [slot, axes] of Object.entries(SETUP_AXES)) {
    const it = Object.values(p.inventory).find((x) => x.slot === slot) || createItem({ base: { aux: 'aux_gyro' }[slot], seed: 5, noTraits: true });
    const plain = resolvePart(it);
    assert.deepEqual(strip(resolvePart({ ...it, setup: {} })), strip(plain));
    for (const ax of axes) {
      const lo = strip(resolvePart({ ...it, setup: { [ax.id]: -SETUP_STEPS } }));
      const hi = strip(resolvePart({ ...it, setup: { [ax.id]: SETUP_STEPS } }));
      const changed = Object.keys(hi).filter((k) => typeof hi[k] === 'number' && (hi[k] !== plain[k] || lo[k] !== plain[k]));
      assert.ok(changed.length >= 1 && changed.length <= 2, `${slot}.${ax.id} changes ${changed}`);
      for (const k of changed) assert.ok(Math.abs(hi[k] - plain[k]) <= Math.abs(plain[k]) * 0.6 + 0.6, `${slot}.${ax.id} keeps ${k} near the design`);
    }
  }
});

test('setup is set and reset through the Workshop, and the finished top follows it', () => {
  const p = newProfile(12);
  const L = p.loadouts[0];
  const ring = p.inventory[L.parts.ring];
  const build = () => Object.fromEntries(Object.entries(L.parts).map(([s, uid]) => [s, p.inventory[uid]]));
  const before = assembleTop(build());
  assert.equal(WS.setSetup(p, ring.uid, 'weight', 4).ok, true);
  assert.deepEqual(ring.setup, { weight: 4 });
  assert.ok(assembleTop(build()).spec.I3 > before.spec.I3, 'rim weight raises the top inertia');
  assert.equal(WS.setSetup(p, ring.uid, 'weight', 9).ok, false, 'out of range is refused');
  assert.equal(WS.setSetup(p, ring.uid, 'grip', 1).ok, false, 'a ring has no grip slider');
  assert.equal(WS.resetSetup(p, ring.uid).ok, true);
  assert.deepEqual(ring.setup, {});
  assert.equal(assembleTop(build()).spec.I3, before.spec.I3);
});

test('paint changes the look only, and finishes follow rarity', () => {
  const p = newProfile(13);
  const common = createItem({ base: 'ring_galefang', rarity: 'common', seed: 9, noTraits: true });
  const mythic = createItem({ base: 'ring_galefang', rarity: 'mythic', seed: 9 });
  p.inventory[common.uid] = common; p.inventory[mythic.uid] = mythic;
  assert.equal(WS.setPaint(p, common.uid, { color: 'gold', finish: 'matte' }).ok, true);
  assert.equal(WS.setPaint(p, common.uid, { finish: 'prism' }).ok, false, 'prism needs a Mythic');
  assert.equal(WS.setPaint(p, mythic.uid, { finish: 'prism' }).ok, true);
  assert.ok(!finishAllowed('metallic', 'rare') && finishAllowed('metallic', 'epic'));
  const painted = resolvePart(common), plain = resolvePart({ ...common, paint: undefined });
  assert.equal(painted.color, PAINT_COLOR_INDEX.gold.hex);
  assert.equal(painted.itemFinish, 'matte');
  assert.deepEqual(strip(painted), strip(plain), 'no physical field changes');
  assert.equal(WS.setPaint(p, common.uid, { color: null }).ok, true);
  assert.deepEqual(common.paint, { finish: 'matte' }, 'clearing the colour keeps the finish');
});

test('saved setup and paint survive a load and bad values are cleaned', () => {
  const p = newProfile(14);
  const tip = Object.values(p.inventory).find((x) => x.slot === 'tip');
  tip.setup = { grip: 3, height: 99, angle: 2, junk: 1 };
  tip.paint = { color: 'teal', finish: 'prism' };
  const q = normalizeProfile(JSON.parse(JSON.stringify(p)));
  const t2 = q.inventory[tip.uid];
  assert.deepEqual(t2.setup, { grip: 3 });
  assert.deepEqual(t2.paint, { color: 'teal' }, 'a common tip cannot keep a prism finish');
  assert.deepEqual(cleanSetup('tip', { grip: 1.5 }), {}, 'only whole steps');
});
