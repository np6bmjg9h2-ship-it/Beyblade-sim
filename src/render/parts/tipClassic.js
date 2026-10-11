// Classic-series performance tips, built with the tip kit of tip.js (passed
// in as `T` to keep the modules free of import cycles): a steel ball in a
// wide cup, a coil-spring jump tip, two engine-gear clutch bases and the
// automatic shift tip. Same contract as tip.js: exact contact end at y = 0,
// everything below the flange inside the tilt cone (k.minY), radius within
// bodyRadius (+0.3 for lock tabs).

import * as THREE from 'three';

export function classicTipLooks(T) {
  const { revolve, contactRuns, prism, notch, DEG, TAU, MM } = T;

  // y at radius r, kept above the tilt cone
  const safe = (k, r, y) => Math.max(y, k.minY(r) + 0.1);

  // Coil spring (helix tube) between y0 and y1 at radius rc, wire radius rw.
  function coil(rc, rw, y0, y1, turns, q) {
    const curve = new THREE.Curve();
    curve.getPoint = (t, out = new THREE.Vector3()) => {
      const a = t * turns * TAU;
      return out.set(rc * Math.cos(a) * MM, (y0 + (y1 - y0) * t) * MM, rc * Math.sin(a) * MM);
    };
    const g = new THREE.TubeGeometry(curve, Math.round(turns * (q === 'low' ? 10 : 18)), rw * MM, q === 'low' ? 4 : 6, false);
    return g.toNonIndexed();
  }
  // gear teeth: a ring of small blocks round the housing
  function teeth(k, bin, n, r0, r1, y0, y1) {
    for (let i = 0; i < n; i++) k.add(bin, prism([[r0, y0], [r1, y0 + 0.15], [r1, y1 - 0.15], [r0, y1]], Math.max(0.45, (TAU * r0) / n * 0.55)).rotateY((i * TAU) / n));
  }
  // two clutch arms reaching out under the flange
  function clutchArms(k, bin, y0, y1, r1) {
    for (const a of [0, Math.PI]) k.add(bin, prism([[r1 - 2.6, y0], [r1 - 0.3, y0], [r1, y0 + 0.3], [r1, y1], [r1 - 2.6, y1]], 1.3, 0.5).rotateY(a + TAU / 8));
  }

  // Steel Ball: a big steel ball in a wide cup under an eight-sided housing
  // with two small steel balls set in its sides.
  function steelball(k) {
    const R = k.b;
    const ball = contactRuns(0, R, null, k.arcSteps + 4, 24 * DEG);
    k.add('chrome', revolve([...ball.runs, { pts: [ball.top, [0, ball.top[1]]] }], k.n));
    k.lathe('trim', [[R - 0.25, 3.0], [3.0, safe(k, 3.0, 3.2)], [3.3, safe(k, 3.3, 3.6)], [3.3, 4.7], [2.0, 4.7], [R - 0.25, 3.0]]);
    k.bolts('chrome', 6, [3.3, 3.6], [3.3, 4.7], 0.55, { rad: 0.26, h: 0.22, sides: 8 });
    const H = [[0, 4.55], [3.4, 4.55], [3.7, 4.85], [6.0, safe(k, 6.0, 6.9)], [6.3, safe(k, 6.3, 7.25)], ...notch(6.3, 7.7), [6.3, 8.15], [0, 8.15]];
    k.add('body', revolve([{ pts: H }], 0, { facets: 8, phase: TAU / 16 }));
    k.band(H[2], H[3], 0.06, 0.4, { facets: 8, phase: TAU / 16 });
    for (const a of [0, Math.PI]) {
      const s = new THREE.SphereGeometry(0.95 * MM, k.lo ? 8 : 14, k.lo ? 6 : 10).toNonIndexed();
      s.translate(0, 6.05 * MM, 4.95 * MM);
      k.add('chrome', s.rotateY(a + TAU / 16));
    }
    k.flange({ y0: 8.15, r: 6.4, tabR: 7.2 });
    return k.finish();
  }

  // Spring Jump: a round green foot on a shaft wrapped in a chrome coil
  // spring, under a green housing.
  function springjump(k) {
    const foot = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
    const ft = foot.top;
    k.add('pale', revolve([...foot.runs, { pts: [ft, [ft[0], 1.85], [ft[0] - 0.3, 2.15], [0, 2.15]] }], k.n));
    k.lathe('dark', [[0, 2.0], [0.95, 2.0], [0.95, 6.1], [0, 6.1]]);
    k.lathe('trim', [[0.9, 2.05], [2.15, safe(k, 2.15, 2.05)], [2.15, safe(k, 2.15, 2.05) + 0.35], [0.9, safe(k, 2.15, 2.05) + 0.35], [0.9, 2.05]]);
    k.add('chrome', coil(1.75, k.lo ? 0.32 : 0.28, safe(k, 2.1, 2.5), 5.6, 5, k.q));
    const H = [[0, 5.75], [2.6, 5.75], [2.9, 6.05], [5.4, safe(k, 5.4, 8.25)], [5.7, safe(k, 5.7, 8.55)], ...notch(5.7, 8.95), [5.7, 9.35], [0, 9.35]];
    k.add('body', revolve([{ pts: H }], 0, { facets: 10 }));
    k.band(H[2], H[3], 0.1, 0.9, { facets: 10 });
    k.flange({ y0: 9.35, r: 5.9, tabR: 6.7 });
    return k.finish();
  }

  // Engine-gear clutch base: housing with a gold gear drum and two clutch
  // arms under the flange. `foot` builds the contact end and returns the
  // housing start [r, y].
  function clutch(k, foot, H0) {
    const H = [[0, H0[1]], H0, [H0[0] + 0.3, H0[1] + 0.3], [3.9, safe(k, 3.9, 4.7)], [3.9, 6.6], [5.7, safe(k, 5.7, 7.6)], [6.2, safe(k, 6.2, 8.0)], ...notch(6.2, 8.45), [6.2, 9.3], [0, 9.3]];
    k.add('body', revolve([{ pts: H }], k.n));
    const ty0 = safe(k, 4.65, 5.1);
    teeth(k, 'gold', k.lo ? 10 : 16, 3.8, 4.6, ty0, ty0 + 1.25);
    k.band(H[5], H[6], 0.15, 0.85);
    clutchArms(k, k.look.armBin || 'dark', safe(k, 6.9, 8.6), 9.25, 6.9);
    k.flange({ y0: 9.3, r: 6.4, tabR: 7.2 });
    return k.finish();
  }
  // Hit Clutch: white semi-flat foot ringed by the black rubber flat it
  // drops onto when the clutch trips.
  function clutchhit(k) {
    const f = contactRuns(k.fr, k.b, null, k.arcSteps, 0);
    k.add('pale', revolve([...f.runs, { pts: [f.top, [f.top[0], 1.5], [f.top[0] - 0.3, 1.8], [0, 1.8]] }], k.n));
    const y0 = safe(k, 3.2, 1.6);
    k.add('rubber', revolve([{ pts: [[2.3, y0], [2.9, y0], [3.2, y0 + 0.35], [3.2, y0 + 1.0], [2.3, y0 + 1.0], [2.3, y0]] }], k.n));
    return clutch(k, f, [3.1, y0 + 0.9]);
  }
  // Final Clutch: a steel point that stays sharp until the clutch lets go.
  function clutchfinal(k) {
    const tip = contactRuns(0, k.b, [1.0, 2.4], k.arcSteps);
    k.add('chrome', revolve([...tip.runs, { pts: [[1.0, 2.4], [1.0, 3.0], [0, 3.0]] }], k.n));
    k.lathe('trim', [[0.9, 2.6], [1.7, safe(k, 1.7, 2.6)], [1.95, safe(k, 1.95, 2.9)], [1.95, 3.4], [0.9, 3.4], [0.9, 2.6]]);
    return clutch(k, tip, [1.9, 3.3]);
  }

  // Auto Shift: steel point, the wide ball waiting above it and three
  // sliding weights in a chrome collar, under a blue housing.
  function autoshift(k) {
    const tip = contactRuns(0, k.b, [0.95, 3.2], k.arcSteps);
    k.add('chrome', revolve([...tip.runs, { pts: [[0.95, 3.2], [0.95, 3.6], [0, 3.6]] }], k.n));
    const c = [0, 4.0], R = 2.2, pts = [];
    for (let i = 0; i <= 8; i++) { const t = (-20 + (50 * i) / 8) * DEG; pts.push([R * Math.cos(t), c[1] + R * Math.sin(t)]); }
    k.add('pale', revolve([{ pts: [[0.9, pts[0][1]], ...pts, [0.9, pts[pts.length - 1][1]]], c }], k.n));
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(0.7 * MM, 0.7 * MM, 0.9 * MM, k.lo ? 8 : 12).toNonIndexed();
      g.translate(0, 5.0 * MM, 2.9 * MM);
      k.add('chrome', g.rotateY((i * TAU) / 3));
    }
    const H = [[0, 4.75], [2.5, 4.75], [2.8, 5.05], [5.3, safe(k, 5.3, 7.9)], [5.6, safe(k, 5.6, 8.2)], ...notch(5.6, 8.65), [5.6, 9.35], [0, 9.35]];
    k.add('body', revolve([{ pts: H }], 0, { facets: 12 }));
    k.band(H[2], H[3], 0.1, 0.9, { facets: 12 });
    k.flange({ y0: 9.35, r: 5.9, tabR: 6.7 });
    return k.finish();
  }

  const W = '#f4f5f9', INK = '#150f22', BADGE = '#1b1f2b';
  return {
    tip_steelball: { fn: steelball, body: '#1f8a52', sig: '#ffd21f', chrome: '#c3ccd8', motif: 'dots', tiles: 8,
      cap: { flange: 'body', tabs: 'trim', badge: BADGE, fg: '#e9f2ff', ring: '#ffd21f', glyph: 'ball' } },
    tip_springjump: { fn: springjump, body: '#3be05a', pale: '#58f07a', sig: '#ff4fa3', motif: 'stars', tiles: 8, dc: '#ff4fa3',
      cap: { flange: 'body', tabs: 'trim', badge: W, fg: '#1f9d4a', ring: INK, glyph: 'star' } },
    tip_clutchhit: { fn: clutchhit, body: W, sig: '#2f6bff', pale: '#ffffff', rubber: '#25272e', armBin: 'trim', motif: 'slash', tiles: 8,
      cap: { flange: 'trim', tabs: 'body', badge: '#2f6bff', fg: '#ffffff', ring: INK, glyph: 'semi' } },
    tip_clutchfinal: { fn: clutchfinal, body: '#2b6cff', sig: W, dark: '#ffd21f', motif: 'chevron', tiles: 8,
      cap: { flange: 'trim', tabs: 'body', badge: BADGE, fg: '#ffd21f', ring: '#2b6cff', glyph: 'needle' } },
    tip_autoshift: { fn: autoshift, body: '#1f5fd6', sig: '#9fe8ff', pale: '#eef4ff', motif: 'ticks', tiles: 10,
      cap: { flange: 'trim', tabs: 'body', badge: BADGE, fg: '#9fe8ff', ring: '#1f5fd6', glyph: 'hybrid' } },
  };
}
