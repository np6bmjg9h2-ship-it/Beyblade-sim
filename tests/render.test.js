// Renderer logic that runs without WebGL: Spirit Chip spirit forms (every beast
// has its own sound, stadium-sized 3D form) and the camera rig's framing.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BEASTS } from '../src/data/beasts.js';
import { SPIRIT_FORMS, buildSpiritForm } from '../src/render/spiritForms.js';
import { spiritMaterial } from '../src/render/spirits.js';
import { CameraRig } from '../src/render/camera.js';

function measure(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  let tris = 0, meshes = 0, finite = true, hasWave = true;
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const pos = o.geometry.attributes.position;
    tris += pos.count / 3;
    if (!o.geometry.attributes.aU || !o.geometry.attributes.normal) hasWave = false;
    for (const v of pos.array) if (!Number.isFinite(v)) { finite = false; break; }
  });
  return { box, tris, meshes, finite, hasWave };
}

test('every Spirit Chip has its own spirit form', () => {
  for (const b of BEASTS) assert.ok(SPIRIT_FORMS[b.emblem], `${b.id} (${b.emblem}) has a dedicated form`);
  assert.equal(new Set(BEASTS.map((b) => b.emblem)).size, BEASTS.length, 'no two beasts share a form');
});

test('spirit forms are finite, stadium-sized and animate safely', () => {
  for (const quality of ['high', 'low']) {
    for (const b of BEASTS) {
      const mats = { body: spiritMaterial(b.colors.primary, b.colors.secondary), eye: new THREE.MeshBasicMaterial() };
      const form = buildSpiritForm(b.emblem, mats, quality);
      for (const [t, k] of [[0, 0], [0.4, 0.3], [1.1, 0.8], [2.2, 1]]) form.animate(t, k);
      const m = measure(form.group);
      const size = m.box.getSize(new THREE.Vector3());
      assert.ok(m.finite && m.hasWave, `${b.id}: finite geometry with normals and aU`);
      assert.ok(m.tris > 100 && m.tris < 40000, `${b.id} ${quality}: ${m.tris} triangles`);
      assert.ok(m.meshes <= 8, `${b.id}: ${m.meshes} draw calls`);
      assert.ok(size.y > 0.3 && size.y < 1.4 && size.x < 1.6 && size.z < 1.6, `${b.id}: size ${size.toArray().map((v) => v.toFixed(2))}`);
      assert.ok(Number.isFinite(form.wave) && form.fade > 0, `${b.id}: shader parameters`);
      form.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
  }
});

test('follow cameras pull back to keep the wall in frame when a top nears the edge', () => {
  const R = 0.21;
  const settle = (mode, xs) => {
    const rig = new CameraRig(new THREE.PerspectiveCamera(50, 16 / 9, 0.005, 30));
    rig.mode = mode;
    const tops = xs.map((x) => { const o = new THREE.Object3D(); o.position.set(x, 0.01, 0); return o; });
    for (let i = 0; i < 400; i++) rig.update(1 / 60, { tops, arenaRadius: R });
    return { dist: rig.camera.position.distanceTo(rig.lookAt), look: Math.hypot(rig.lookAt.x, rig.lookAt.z) };
  };
  for (const mode of ['tracking', 'player']) {
    const safe = settle(mode, [0.05, 0.08]);
    const edge = settle(mode, [0.05, 0.2]);
    assert.ok(edge.dist > safe.dist * 1.3, `${mode}: pulls back near the wall (${safe.dist.toFixed(3)} -> ${edge.dist.toFixed(3)} m)`);
    assert.ok(edge.dist >= R * 2.0, `${mode}: wide enough to see the wall`);
  }
  // with both tops near the centre the edge logic leaves tracking framing alone (0.3 m + 1.2 x separation)
  const calm = settle('tracking', [-0.03, 0.03]);
  assert.ok(Math.abs(calm.dist - (0.3 + 0.06 * 1.2)) < 0.003, `no pull-back without a ring-out threat (${calm.dist.toFixed(4)} m)`);
});

test('the realistic style builds physically based materials and skips ink hulls', async () => {
  const { toonMaterial, setRenderStyle, setMaterialContext, inked } = await import('../src/render/toon.js');
  try {
    setRenderStyle('realistic');
    const gloss = toonMaterial('#3366ff', { finish: 'gloss' });
    assert.ok(gloss.isMeshPhysicalMaterial && gloss.clearcoat === 1, 'tops get clearcoat gloss');
    const metal = toonMaterial('#cccccc', { finish: 'metal' });
    assert.ok(metal.isMeshStandardMaterial && metal.metalness === 1);
    setMaterialContext('arena');
    const bowl = toonMaterial('#888888', { finish: 'gloss' });
    assert.ok(bowl.isMeshStandardMaterial && !bowl.isMeshPhysicalMaterial, 'the stadium uses the cheaper material');
    setMaterialContext('top');
    const m = inked(new THREE.BoxGeometry(1, 1, 1), gloss);
    assert.equal(m.children.length, 0, 'no ink hull');
  } finally { setRenderStyle('ink'); setMaterialContext('top'); }
  const toon = toonMaterial('#3366ff', { finish: 'gloss' });
  assert.ok(toon.isMeshToonMaterial, 'back to cel shading');
});
