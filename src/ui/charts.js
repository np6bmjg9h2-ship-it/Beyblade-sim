// Small chart components for in-game data (statistics, Practice Lab).
// Categorical slots (validated for the dark panel surface #0e1526, all-pairs
// CVD/normal-vision checks pass for the first three): blue, orange, aqua.
// Text always uses text colours; colour marks carry identity only.

import { h } from './ui.js';

export const SERIES = ['#3987e5', '#d95926', '#199e70'];

// Horizontal bars for magnitude across labelled categories (one hue).
export function barList(rows, { format = (v) => String(v), max = null, color = SERIES[0], empty = 'No data yet.' } = {}) {
  if (!rows.length || rows.every((r) => !r.value)) return h('div', { class: 'muted small' }, empty);
  const m = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  return h('div', { class: 'barlist' }, rows.map((r) => h('div', { class: 'bl-row', 'data-tip': `${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}` },
    h('span', { class: 'bl-label' }, r.label),
    h('span', { class: 'bl-track' }, h('span', { class: 'bl-fill', style: { width: `${Math.max(0, (r.value / m) * 100)}%`, background: r.color || color } })),
    h('span', { class: 'bl-val' }, format(r.value)))));
}

// Line chart on canvas: series [{ name, color, points: [[x, y], ...] }].
// Recessive grid, one y axis, legend + direct end labels, crosshair tooltip.
export function lineChart(series, { width = 560, height = 220, xLabel = '', yLabel = '', xFmt = (x) => x.toFixed(0), yFmt = (y) => y.toFixed(0), yMin = 0 } = {}) {
  const wrap = h('div', { class: 'linechart' });
  const legend = h('div', { class: 'lc-legend' }, series.length > 1 ? series.map((s) => h('span', { class: 'lc-key' }, h('span', { class: 'lc-swatch', style: { background: s.color } }), s.name)) : null);
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * dpr; canvas.height = height * dpr;
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  const tip = h('div', { class: 'lc-tip' });
  wrap.append(legend, h('div', { class: 'lc-plot' }, canvas, tip), h('div', { class: 'lc-axis muted small' }, `${yLabel}${xLabel ? ` vs ${xLabel}` : ''}`));
  const pad = { l: 46, r: 92, t: 10, b: 26 };
  const all = series.flatMap((s) => s.points);
  if (!all.length) { wrap.append(h('div', { class: 'muted small' }, 'No data.')); return wrap; }
  const xMax = Math.max(...all.map((p) => p[0]), 1e-6), xMin = Math.min(...all.map((p) => p[0]));
  const yMax = Math.max(...all.map((p) => p[1]), yMin + 1e-6) * 1.05;
  const X = (x) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * (width - pad.l - pad.r);
  const Y = (y) => height - pad.b - ((y - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const ctx = canvas.getContext('2d');
  const draw = (hoverX = null) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px Inter, system-ui, sans-serif';
    // recessive grid + y ticks
    ctx.strokeStyle = 'rgba(160,180,215,0.12)'; ctx.fillStyle = '#9fb0cc'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4, y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(yFmt(v), pad.l - 6, y + 4);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) { const v = xMin + ((xMax - xMin) * i) / 4; ctx.fillText(xFmt(v), X(v), height - 8); }
    // series (2px lines)
    for (const s of series) {
      if (!s.points.length) continue;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
      // direct end label in text colour beside a colour dot
      const [lx, ly] = s.points[s.points.length - 1];
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(lx), Y(ly), 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8eefa'; ctx.textAlign = 'left';
      ctx.fillText(`${s.name}`, X(lx) + 8, Y(ly) + 4);
    }
    if (hoverX != null) {
      ctx.strokeStyle = 'rgba(232,238,250,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(hoverX) + 0.5, pad.t); ctx.lineTo(X(hoverX) + 0.5, height - pad.b); ctx.stroke();
    }
  };
  draw();
  const nearest = (pts, x) => pts.reduce((a, p) => (Math.abs(p[0] - x) < Math.abs(a[0] - x) ? p : a), pts[0]);
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < pad.l || px > width - pad.r) { tip.style.display = 'none'; draw(); return; }
    const x = xMin + ((px - pad.l) / (width - pad.l - pad.r)) * (xMax - xMin);
    draw(x);
    tip.innerHTML = '';
    tip.append(h('div', { class: 'lc-tip-x' }, `${xLabel} ${xFmt(x)}`), ...series.filter((s) => s.points.length).map((s) => { const p = nearest(s.points, x); return h('div', {}, h('span', { class: 'lc-swatch', style: { background: s.color } }), ` ${s.name}: ${yFmt(p[1])}`); }));
    tip.style.display = 'block';
    tip.style.left = `${Math.min(px + 12, width - 150)}px`;
    tip.style.top = '8px';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; draw(); });
  return wrap;
}
