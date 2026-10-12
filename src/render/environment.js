// Image-based lighting for the realistic style: a small procedural arena
// hall (dark walls, a ring of overhead light panels, accent strips in the
// stadium's colours, a warm floor bounce) prefiltered into an environment
// map. Tops and stadium reflect it and it lights them; blurred, it is also
// the backdrop. Built once per stadium, no image files needed.

import * as THREE from 'three';

const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

export function arenaEnvironment(renderer, theme = {}) {
  const scene = new THREE.Scene();
  const disposables = [];
  const add = (geo, mat, setup) => {
    const m = new THREE.Mesh(geo, mat);
    setup?.(m);
    scene.add(m);
    disposables.push(geo, mat);
    return m;
  };
  // the hall: a sphere shaded from a dark floor to a deep ceiling
  const hall = new THREE.SphereGeometry(8, 48, 24);
  const col = [];
  const pos = hall.attributes.position;
  const sky = new THREE.Color(theme.sky || '#101425'), floor = new THREE.Color('#1a1814');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 8;
    const c = floor.clone().lerp(sky, THREE.MathUtils.smoothstep(y, -0.3, 0.6)).multiplyScalar(0.55);
    col.push(c.r, c.g, c.b);
  }
  hall.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  add(hall, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  // a ring of overhead softboxes (the key reflections on plastic and metal)
  const panelGeo = new THREE.PlaneGeometry(1.6, 0.6);
  const panelMat = new THREE.MeshBasicMaterial({ color: hdr('#fff4e6', 9), side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(panelGeo, panelMat, (m) => { m.position.set(Math.cos(a) * 2.6, 4.2, Math.sin(a) * 2.6); m.lookAt(0, 0, 0); });
  }
  // one big top light right above the bowl
  add(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: hdr('#ffffff', 6), side: THREE.DoubleSide }), (m) => { m.position.set(0, 5.5, 0); m.rotation.x = Math.PI / 2; });
  // accent strips in the stadium's colours around the walls
  const stripGeo = new THREE.BoxGeometry(2.4, 0.08, 0.08);
  const accents = [theme.accent || '#4fc3ff', theme.ring || '#ff7a3d'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const mat = new THREE.MeshBasicMaterial({ color: hdr(accents[i % 2], 4) });
    add(stripGeo, mat, (m) => { m.position.set(Math.cos(a) * 6.5, 1.2, Math.sin(a) * 6.5); m.lookAt(0, 1.2, 0); });
  }
  // warm bounce from the arena floor
  add(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ color: hdr('#3a3328', 1.2), side: THREE.DoubleSide }), (m) => { m.position.y = -1.2; m.rotation.x = -Math.PI / 2; });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}
