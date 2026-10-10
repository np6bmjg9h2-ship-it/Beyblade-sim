// Non-standard gamepads. Browsers report most Xbox and PlayStation pads with
// the W3C "standard" mapping, but generic/DirectInput pads (and some
// browser/OS combinations) arrive with their raw layout: face buttons in a
// different order, triggers as axes and the d-pad as a single "hat" axis.
// normalizePad() presents such a pad in the standard layout so bindings,
// prompts and menus work unchanged. Known layouts are matched by vendor id;
// anything else gets a best-effort generic layout (identity buttons plus hat
// d-pad), and the player is pointed at calibration and remapping.

// Standard order: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Menu,
// 10 LS, 11 RS, 12 Up, 13 Down, 14 Left, 15 Right, 16 Home.
const LAYOUTS = {
  // DualShock 4 / DualSense via DirectInput: Square, Cross, Circle, Triangle, L1, R1, L2, R2, Share, Options, L3, R3, PS, Pad
  sony: { buttons: [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, null, null, null, null, 12], axes: [0, 1, 2, 5], triggerAxes: [3, 4], hat: 9 },
  // Generic DirectInput pad: buttons already roughly in standard order
  generic: { buttons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], axes: [0, 1, 2, 3], triggerAxes: null, hat: 9 },
};

export function layoutFor(id = '') {
  const s = id.toLowerCase();
  if (/054c|sony|dualshock|dualsense/.test(s)) return 'sony';
  return 'generic';
}

// Hat switch: one axis stepping through eight directions in sevenths of the
// range (up = -1, then clockwise). Rest is reported outside [-1, 1] or, on some
// pads, as 0, which lies between two steps; anything off a step reads as neutral.
const NEUTRAL = { up: false, down: false, left: false, right: false };
export function decodeHat(v) {
  if (v == null || !Number.isFinite(v) || Math.abs(v) > 1.05) return NEUTRAL;
  const f = ((v + 1) * 7) / 2;
  if (Math.abs(f - Math.round(f)) > 0.08) return NEUTRAL;
  const dir = Math.round(f) % 8; // 0 = up, 1 = up-right, ... 7 = up-left
  return { up: dir === 7 || dir === 0 || dir === 1, right: dir >= 1 && dir <= 3, down: dir >= 3 && dir <= 5, left: dir >= 5 && dir <= 7 };
}

const btn = (value) => ({ pressed: value > 0.5, touched: value > 0, value });

// A standard-layout view of a raw non-standard pad (rumble passes through).
export function normalizePad(p) {
  const L = LAYOUTS[layoutFor(p.id)];
  const raw = (i) => {
    const b = i == null ? null : p.buttons[i];
    if (!b) return 0;
    return typeof b === 'object' ? (b.value || (b.pressed ? 1 : 0)) : b;
  };
  const values = L.buttons.map(raw);
  while (values.length < 17) values.push(0);
  // triggers reported as axes rest at -1 and reach +1; many browsers report an
  // untouched trigger axis as exactly 0, which must not read as half pressed
  if (L.triggerAxes) {
    L.triggerAxes.forEach((ax, k) => {
      const a = p.axes[ax];
      if (Number.isFinite(a) && a !== 0) values[6 + k] = Math.max(values[6 + k], (a + 1) / 2);
    });
  }
  // the d-pad: the hat axis, combined with d-pad buttons where the layout has them
  const hat = decodeHat(p.axes[L.hat]);
  [hat.up, hat.down, hat.left, hat.right].forEach((on, k) => { if (on) values[12 + k] = 1; });
  return {
    id: p.id, index: p.index, connected: p.connected !== false, timestamp: p.timestamp,
    mapping: 'standard', nonStandard: true, layout: layoutFor(p.id),
    buttons: values.map(btn), axes: L.axes.map((i) => p.axes[i] ?? 0),
    vibrationActuator: p.vibrationActuator,
  };
}
