// Builds the stadium visuals from the same arena definition the physics uses:
// the floor is a lathe of the height profile, walls are cylinder segments
// with gaps at the exits, friction bands are painted onto the floor texture.

import * as THREE from 'three';
import { Arena } from '../physics/arena.js';

function floorTexture(def, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const th = def.theme;
  const R = def.radius;
  const cx = size / 2;
  const px = (r) => (r / R) * (size / 2) * 0.995;
  // base gradient
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, size / 2);
  g.addColorStop(0, th.floor);
  g.addColorStop(1, th.floorEdge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // friction bands
  for (const b of def.bands || []) {
    ctx.beginPath();
    ctx.arc(cx, cx, px(b.r1), 0, Math.PI * 2);
    ctx.arc(cx, cx, px(b.r0), 0, Math.PI * 2, true);
    if (b.friction > 1) {
      ctx.fillStyle = th.ring + '55';
      ctx.fill();
      // grip teeth
      ctx.save();
      ctx.strokeStyle = th.ring + 'aa';
      ctx.lineWidth = 2;
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * px(b.r0), cx + Math.sin(a) * px(b.r0));
        ctx.lineTo(cx + Math.cos(a + 0.03) * px(b.r1), cx + Math.sin(a + 0.03) * px(b.r1));
        ctx.stroke();
      }
      ctx.restore();
    } else {
      const gg = ctx.createRadialGradient(cx, cx, px(b.r0), cx, cx, px(b.r1));
      gg.addColorStop(0, '#ffffff10');
      gg.addColorStop(1, '#ffffff30');
      ctx.fillStyle = gg;
      ctx.fill();
    }
  }
  // concentric guide rings
  ctx.strokeStyle = th.accent + '44';
  ctx.lineWidth = 2;
  for (let r = 0.04; r < R; r += 0.04) {
    ctx.beginPath(); ctx.arc(cx, cx, px(r), 0, Math.PI * 2); ctx.stroke();
  }
  // radial spokes
  ctx.strokeStyle = th.accent + '22';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * px(0.03), cx + Math.sin(a) * px(0.03));
    ctx.lineTo(cx + Math.cos(a) * px(R), cx + Math.sin(a) * px(R)); ctx.stroke();
  }
  // centre mark: the Zero ring
  ctx.strokeStyle = th.accent + 'aa';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cx, px(0.022), 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cx, px(0.03), 0, Math.PI * 2); ctx.stroke();
  // exit markers (texture v is flipped relative to world z; see uv mapping)
  for (const o of def.wall.openings || []) {
    const a = (o.angle * Math.PI) / 180;
    const half = ((o.width * Math.PI) / 180) / 2;
    ctx.beginPath();
    ctx.arc(cx, cx, px(R), a - half, a + half);
    ctx.arc(cx, cx, px(R * 0.88), a + half, a - half, true);
    ctx.closePath();
    ctx.fillStyle = '#ff3b3b55';
    ctx.fill();
  }
  // scratches / grain
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * px(R);
    ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 2, 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildArena(def, quality = 'high') {
  const arena = new Arena(def);
  const group = new THREE.Group();
  group.name = 'arena';
  const R = def.radius;
  const th = def.theme;

  // floor lathe
  const pts = [];
  const N = 80;
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * R;
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), arena.heightAtR(r)));
  }
  const floorGeo = new THREE.LatheGeometry(pts, quality === 'low' ? 64 : 128);
  // planar UVs so the top-down texture maps directly (u = x, v = z)
  const pos = floorGeo.attributes.position;
  const uv = floorGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, 0.5 + pos.getX(i) / (2 * R), 0.5 - pos.getZ(i) / (2 * R));
  }
  floorGeo.computeVertexNormals();
  const smooth = def.surface.tag === 'ice' || def.surface.tag === 'smooth';
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture(def), roughness: smooth ? 0.18 : def.surface.tag === 'rough' ? 0.95 : 0.55,
    metalness: smooth ? 0.35 : 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // walls (segments between exits)
  const wallMat = new THREE.MeshStandardMaterial({ color: th.wall, transparent: true, opacity: 0.55, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const rimMat = new THREE.MeshStandardMaterial({ color: th.wall, emissive: th.accent, emissiveIntensity: 0.35, roughness: 0.4 });
  const openings = (def.wall.openings || []).map((o) => ({ a0: ((o.angle - o.width / 2) * Math.PI) / 180, a1: ((o.angle + o.width / 2) * Math.PI) / 180, lip: o.lipHeight || 0 }))
    .sort((a, b) => a.a0 - b.a0);
  const segments = [];
  if (!openings.length) segments.push([0, Math.PI * 2]);
  else {
    for (let i = 0; i < openings.length; i++) {
      const cur = openings[i], next = openings[(i + 1) % openings.length];
      let s0 = cur.a1, s1 = next.a0;
      if (s1 <= s0) s1 += Math.PI * 2;
      segments.push([s0, s1]);
    }
  }
  const edgeY = arena.edgeHeight;
  const H = def.wall.height;
  for (const [a0, a1] of segments) {
    const len = a1 - a0;
    const segs = Math.max(4, Math.ceil(len * 20));
    const geo = new THREE.CylinderGeometry(R + 0.002, R + 0.004, H, segs, 1, true, Math.PI / 2 - a1, len);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.y = edgeY + H / 2;
    m.renderOrder = 2;
    group.add(m);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.0025, 6, segs, len), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = a0;
    rim.position.y = edgeY + H;
    group.add(rim);
  }
  // exits: lip strip and pit
  const pitMat = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide });
  const lipMat = new THREE.MeshStandardMaterial({ color: '#ff4a4a', emissive: '#ff2020', emissiveIntensity: 0.6 });
  for (const o of openings) {
    const len = o.a1 - o.a0;
    if (o.lip > 0) {
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.002, R + 0.002, o.lip, 12, 1, true, Math.PI / 2 - o.a1, len), lipMat);
      lip.position.y = edgeY + o.lip / 2;
      group.add(lip);
    }
    const pit = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.06, 16, 1, o.a0, len), pitMat);
    pit.rotation.x = -Math.PI / 2;
    pit.rotation.z = 0;
    pit.scale.y = -1; // match atan2(z,x) angle convention after the x rotation
    pit.position.y = edgeY - 0.02;
    group.add(pit);
    // glowing exit markers on the rim
    const mark = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.002, 6, 12, len), lipMat);
    mark.rotation.x = Math.PI / 2;
    mark.rotation.z = o.a0;
    mark.position.y = edgeY + Math.max(0.002, o.lip);
    group.add(mark);
  }
  // stadium body
  const bodyGeo = new THREE.CylinderGeometry(R + 0.03, R + 0.06, edgeY + 0.08, 64, 1, true);
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#10141c', roughness: 0.8, side: THREE.DoubleSide });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = (edgeY + 0.08) / 2 - 0.08;
  group.add(body);
  const lipTop = new THREE.Mesh(new THREE.RingGeometry(R + 0.004, R + 0.03, 64), new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.7, side: THREE.DoubleSide }));
  lipTop.rotation.x = -Math.PI / 2;
  lipTop.position.y = edgeY - 0.001;
  group.add(lipTop);

  // surroundings: ground and crowd stands
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: th.sky, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  group.add(ground);
  if (quality !== 'low') {
    const crowdN = quality === 'high' ? 420 : 200;
    const boxGeo = new THREE.BoxGeometry(0.03, 0.06, 0.03);
    const crowdMat = new THREE.MeshStandardMaterial({ color: '#2a3140', roughness: 1 });
    const inst = new THREE.InstancedMesh(boxGeo, crowdMat, crowdN);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < crowdN; i++) {
      const tier = i % 4;
      const a = Math.random() * Math.PI * 2;
      const r = 0.7 + tier * 0.12 + Math.random() * 0.04;
      m.makeTranslation(Math.cos(a) * r, -0.04 + tier * 0.06 + Math.random() * 0.01, Math.sin(a) * r);
      inst.setMatrixAt(i, m);
      col.setHSL(Math.random(), 0.4, 0.25 + Math.random() * 0.2);
      inst.setColorAt(i, col);
    }
    group.add(inst);
    // light towers
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#333a46' }));
      pole.position.set(Math.cos(a) * 1.3, 0.5, Math.sin(a) * 1.3);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: '#fff6dd' }));
      lamp.position.set(Math.cos(a) * 1.3, 1.1, Math.sin(a) * 1.3);
      lamp.lookAt(0, 0, 0);
      group.add(lamp);
    }
  }
  return { group, arena, floor };
}
