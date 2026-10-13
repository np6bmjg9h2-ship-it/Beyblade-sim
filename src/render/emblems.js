// Procedural, original emblem art for each Spirit Chip, drawn with Canvas 2D
// paths. Used for HUD icons, menus, core-cap decals and 3D manifestations.

const cache = new Map();

function glowStroke(ctx, color, w) {
  ctx.shadowColor = color;
  ctx.shadowBlur = w * 3;
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

const SHAPES = {
  zero(ctx, s, c) {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); glowStroke(ctx, c.primary, s * 0.05);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.44, s * 0.16, -0.5, 0, Math.PI * 2); glowStroke(ctx, c.secondary, s * 0.025);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36, s * 0.045, 0, Math.PI * 2);
      ctx.fillStyle = c.secondary; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2); ctx.fillStyle = c.primary; ctx.fill();
  },
  dragon(ctx, s, c) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, s * 0.3);
    ctx.bezierCurveTo(-s * 0.1, s * 0.35, -s * 0.35, -s * 0.05, -s * 0.05, -s * 0.05);
    ctx.bezierCurveTo(s * 0.25, -s * 0.05, s * 0.05, -s * 0.38, s * 0.3, -s * 0.36);
    ctx.lineTo(s * 0.42, -s * 0.3); ctx.lineTo(s * 0.3, -s * 0.24);
    glowStroke(ctx, c.primary, s * 0.07);
    // wings
    ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 0.06); ctx.lineTo(-s * 0.3, -s * 0.36); ctx.lineTo(-s * 0.18, -s * 0.1);
    ctx.lineTo(-s * 0.4, -s * 0.16); ctx.lineTo(-s * 0.12, 0.02 * s); ctx.closePath(); ctx.fillStyle = c.secondary; ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.32, -s * 0.31, s * 0.025, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  },
  wolf(ctx, s, c) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.05); ctx.lineTo(-s * 0.24, -s * 0.4); ctx.lineTo(-s * 0.08, -s * 0.18);
    ctx.lineTo(s * 0.08, -s * 0.18); ctx.lineTo(s * 0.24, -s * 0.4); ctx.lineTo(s * 0.3, -s * 0.05);
    ctx.lineTo(s * 0.18, s * 0.2); ctx.lineTo(0, s * 0.38); ctx.lineTo(-s * 0.18, s * 0.2); ctx.closePath();
    ctx.fillStyle = c.primary; ctx.fill(); glowStroke(ctx, c.secondary, s * 0.025);
    ctx.fillStyle = '#0b0f18';
    ctx.beginPath(); ctx.moveTo(-s * 0.16, -s * 0.02); ctx.lineTo(-s * 0.05, s * 0.03); ctx.lineTo(-s * 0.16, s * 0.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.16, -s * 0.02); ctx.lineTo(s * 0.05, s * 0.03); ctx.lineTo(s * 0.16, s * 0.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.22); ctx.lineTo(s * 0.05, s * 0.22); ctx.lineTo(0, s * 0.3); ctx.fill();
  },
  phoenix(ctx, s, c) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.05);
      ctx.bezierCurveTo(side * s * 0.2, -s * 0.45, side * s * 0.45, -s * 0.3, side * s * 0.44, -s * 0.05);
      ctx.bezierCurveTo(side * s * 0.3, -s * 0.12, side * s * 0.2, 0, 0, s * 0.05);
      ctx.fillStyle = c.primary; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(0, s * 0.02);
    ctx.bezierCurveTo(s * 0.12, s * 0.2, -s * 0.12, s * 0.3, 0, s * 0.44);
    ctx.bezierCurveTo(s * 0.06, s * 0.3, s * 0.18, s * 0.28, s * 0.1, s * 0.12);
    glowStroke(ctx, c.secondary, s * 0.035);
    ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.07, 0, Math.PI * 2); ctx.fillStyle = c.secondary; ctx.fill();
  },
  serpent(ctx, s, c) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, a = t * Math.PI * 3.6, r = s * (0.42 - 0.32 * t);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    glowStroke(ctx, c.primary, s * 0.075);
    ctx.beginPath(); ctx.arc(s * 0.42, 0, s * 0.06, 0, Math.PI * 2); ctx.fillStyle = c.secondary; ctx.fill();
  },
  stag(ctx, s, c) {
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.05); ctx.lineTo(s * 0.1, -s * 0.05); ctx.lineTo(s * 0.06, s * 0.3); ctx.lineTo(-s * 0.06, s * 0.3); ctx.closePath();
    ctx.fillStyle = c.primary; ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * s * 0.06, -s * 0.06);
      ctx.lineTo(side * s * 0.22, -s * 0.3); ctx.lineTo(side * s * 0.38, -s * 0.38);
      ctx.moveTo(side * s * 0.16, -s * 0.22); ctx.lineTo(side * s * 0.12, -s * 0.42);
      ctx.moveTo(side * s * 0.28, -s * 0.33); ctx.lineTo(side * s * 0.36, -s * 0.2);
      glowStroke(ctx, c.secondary, s * 0.035);
    }
    ctx.beginPath(); ctx.moveTo(-s * 0.04, s * 0.05); ctx.lineTo(s * 0.06, s * 0.12); ctx.lineTo(-s * 0.02, s * 0.15); ctx.lineTo(s * 0.04, s * 0.24);
    glowStroke(ctx, '#fff', s * 0.02);
  },
  tortoise(ctx, s, c) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(a) * s * 0.34, Math.sin(a) * s * 0.3); }
    ctx.closePath(); ctx.fillStyle = c.primary; ctx.fill(); glowStroke(ctx, c.secondary, s * 0.03);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(a) * s * 0.15, Math.sin(a) * s * 0.13); }
    ctx.closePath(); glowStroke(ctx, '#ffffff', s * 0.02);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.15, Math.sin(a) * s * 0.13); ctx.lineTo(Math.cos(a) * s * 0.34, Math.sin(a) * s * 0.3);
      glowStroke(ctx, '#ffffff', s * 0.015);
    }
    ctx.beginPath(); ctx.arc(s * 0.42, 0, s * 0.07, 0, Math.PI * 2); ctx.fillStyle = c.secondary; ctx.fill();
  },
  raven(ctx, s, c) {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.18);
    ctx.lineTo(-s * 0.45, -s * 0.05); ctx.lineTo(-s * 0.3, s * 0.02); ctx.lineTo(-s * 0.42, s * 0.12); ctx.lineTo(-s * 0.12, s * 0.08);
    ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 0.12, s * 0.08); ctx.lineTo(s * 0.42, s * 0.12); ctx.lineTo(s * 0.3, s * 0.02); ctx.lineTo(s * 0.45, -s * 0.05);
    ctx.closePath(); ctx.fillStyle = c.primary; ctx.fill(); glowStroke(ctx, c.secondary, s * 0.02);
    ctx.beginPath(); ctx.moveTo(-s * 0.04, -s * 0.18); ctx.lineTo(0, -s * 0.32); ctx.lineTo(s * 0.04, -s * 0.18); ctx.fillStyle = c.secondary; ctx.fill();
  },
  lion(ctx, s, c) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2);
      ctx.lineTo(Math.cos(a + 0.12) * s * 0.44, Math.sin(a + 0.12) * s * 0.44);
      ctx.lineTo(Math.cos(a + 0.3) * s * 0.22, Math.sin(a + 0.3) * s * 0.22);
      ctx.fillStyle = i % 2 ? c.primary : c.secondary; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.fillStyle = c.primary; ctx.fill(); glowStroke(ctx, '#fff4d0', s * 0.02);
    ctx.fillStyle = '#1a0a05';
    ctx.beginPath(); ctx.arc(-s * 0.07, -s * 0.03, s * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.07, -s * 0.03, s * 0.025, 0, Math.PI * 2); ctx.fill();
  },
  manta(ctx, s, c) {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.25);
    ctx.bezierCurveTo(s * 0.2, -s * 0.25, s * 0.35, -s * 0.05, s * 0.46, s * 0.05);
    ctx.bezierCurveTo(s * 0.25, s * 0.05, s * 0.12, s * 0.12, 0, s * 0.18);
    ctx.bezierCurveTo(-s * 0.12, s * 0.12, -s * 0.25, s * 0.05, -s * 0.46, s * 0.05);
    ctx.bezierCurveTo(-s * 0.35, -s * 0.05, -s * 0.2, -s * 0.25, 0, -s * 0.25);
    ctx.fillStyle = c.primary; ctx.fill(); glowStroke(ctx, c.secondary, s * 0.02);
    ctx.beginPath(); ctx.moveTo(0, s * 0.18); ctx.quadraticCurveTo(s * 0.05, s * 0.32, -s * 0.02, s * 0.45); glowStroke(ctx, c.secondary, s * 0.02);
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((i - 2) * s * 0.07, -s * 0.05, s * 0.012, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
  },
  scorpion(ctx, s, c) {
    ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.12, s * 0.18, 0, 0, Math.PI * 2); ctx.fillStyle = c.primary; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, s * 0.28);
    ctx.bezierCurveTo(s * 0.05, s * 0.48, s * 0.42, s * 0.2, s * 0.32, -s * 0.18);
    ctx.lineTo(s * 0.2, -s * 0.12);
    glowStroke(ctx, c.secondary, s * 0.05);
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * s * 0.08, -s * 0.02); ctx.quadraticCurveTo(side * s * 0.25, -s * 0.2, side * s * 0.16, -s * 0.36);
      glowStroke(ctx, c.primary, s * 0.045);
      ctx.beginPath(); ctx.arc(side * s * 0.16, -s * 0.38, s * 0.05, side > 0 ? Math.PI : 0, side > 0 ? Math.PI * 2.4 : Math.PI * 1.4); glowStroke(ctx, c.secondary, s * 0.03);
    }
  },
  blank(ctx, s, c) {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); glowStroke(ctx, c.primary || '#9ab', s * 0.04);
  },
};

export function drawEmblem(ctx, emblem, colors, size, opts = {}) {
  ctx.save();
  ctx.translate(size / 2, size / 2);
  if (opts.background !== false) {
    const g = ctx.createRadialGradient(0, 0, size * 0.05, 0, 0, size * 0.5);
    g.addColorStop(0, (colors.glow || colors.primary) + '55');
    g.addColorStop(1, '#00000000');
    ctx.fillStyle = g;
    ctx.fillRect(-size / 2, -size / 2, size, size);
  }
  (SHAPES[emblem] || SHAPES.blank)(ctx, size, colors);
  ctx.restore();
}

export function emblemCanvas(emblem, colors, size = 128, opts = {}) {
  const key = `${emblem}|${colors.primary}|${colors.secondary}|${size}|${opts.background}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawEmblem(c.getContext('2d'), emblem, colors, size, opts);
  cache.set(key, c);
  return c;
}

export function emblemDataURL(emblem, colors, size = 96) {
  return emblemCanvas(emblem, colors, size).toDataURL();
}
