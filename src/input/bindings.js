// Action bindings. Gameplay systems read named actions; this file maps them
// to keyboard keys and standard-mapping gamepad buttons/axes per context.
//
// Standard gamepad indices: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle,
// 4 LB/L1, 5 RB/R1, 6 LT/L2, 7 RT/R2, 8 View/Share, 9 Menu/Options,
// 10 LS, 11 RS, 12 Up, 13 Down, 14 Left, 15 Right. Axes: 0 LX, 1 LY, 2 RX, 3 RY.

export const CONTEXTS = ['menu', 'launch', 'battle'];

export const ACTION_LABELS = {
  menu: {
    nav_up: 'Navigate up', nav_down: 'Navigate down', nav_left: 'Navigate left', nav_right: 'Navigate right',
    confirm: 'Confirm', back: 'Back / Cancel', tab_prev: 'Previous tab', tab_next: 'Next tab',
    alt: 'Secondary action', alt2: 'Tertiary action', pause: 'Menu',
  },
  launch: {
    aim_x: 'Move launcher (X)', aim_y: 'Move launcher (Y)', lean_x: 'Lean launcher (X)', lean_y: 'Lean launcher (Y)',
    charge: 'Charge power', release: 'Release', technique: 'Cycle technique', switch_config: 'Switch spin direction',
    cycle_prev: 'Fine lean −', cycle_next: 'Fine lean +', fine_up: 'Fine aim up', fine_down: 'Fine aim down',
    fine_left: 'Fine aim left', fine_right: 'Fine aim right', confirm: 'Confirm', back: 'Cancel', pause: 'Pause',
  },
  battle: {
    steer_x: 'Steer (X)', steer_y: 'Steer (Y)', cam_x: 'Camera (X)', cam_y: 'Camera (Y)',
    ability1: 'Signature ability', ability2: 'Secondary ability', tactical1: 'Tactical: Brace', tactical2: 'Tactical: Focus charge',
    dash: 'Dash', brace: 'Grip brace', counter: 'Counter stance', focus: 'Cycle camera',
    cmd_up: 'Quick: hold centre', cmd_down: 'Quick: evade', cmd_left: 'Quick: circle left', cmd_right: 'Quick: circle right',
    pause: 'Pause', telemetry: 'Telemetry',
  },
};

const k = (...keys) => ({ keys, pad: [] });
const b = (...buttons) => buttons.map((i) => ({ button: i }));

function base() {
  return {
    menu: {
      nav_up: { keys: ['ArrowUp', 'KeyW'], pad: [{ button: 12 }, { axis: 1, dir: -1 }] },
      nav_down: { keys: ['ArrowDown', 'KeyS'], pad: [{ button: 13 }, { axis: 1, dir: 1 }] },
      nav_left: { keys: ['ArrowLeft', 'KeyA'], pad: [{ button: 14 }, { axis: 0, dir: -1 }] },
      nav_right: { keys: ['ArrowRight', 'KeyD'], pad: [{ button: 15 }, { axis: 0, dir: 1 }] },
      confirm: { keys: ['Enter', 'Space'], pad: b(0) },
      back: { keys: ['Escape', 'Backspace'], pad: b(1) },
      tab_prev: { keys: ['KeyQ', 'PageUp'], pad: b(4) },
      tab_next: { keys: ['KeyE', 'PageDown'], pad: b(5) },
      alt: { keys: ['KeyX'], pad: b(2) },
      alt2: { keys: ['KeyY', 'KeyC'], pad: b(3) },
      pause: { keys: [], pad: b(9) },
    },
    launch: {
      aim_x: { axis: true, neg: ['KeyA'], pos: ['KeyD'], pad: [{ axis: 0 }] },
      aim_y: { axis: true, neg: ['KeyW'], pos: ['KeyS'], pad: [{ axis: 1 }] },
      lean_x: { axis: true, neg: ['ArrowLeft'], pos: ['ArrowRight'], pad: [{ axis: 2 }] },
      lean_y: { axis: true, neg: ['ArrowUp'], pos: ['ArrowDown'], pad: [{ axis: 3 }] },
      charge: { keys: ['Space'], pad: b(6) },
      release: { keys: ['Enter', 'KeyJ'], pad: b(7) },
      technique: { keys: ['KeyT', 'KeyX'], pad: b(2) },
      switch_config: { keys: ['KeyR', 'KeyY'], pad: b(3) },
      cycle_prev: { keys: ['KeyQ'], pad: b(4) },
      cycle_next: { keys: ['KeyE'], pad: b(5) },
      fine_up: { keys: ['KeyI'], pad: b(12) },
      fine_down: { keys: ['KeyK'], pad: b(13) },
      fine_left: { keys: ['KeyU'], pad: b(14) },
      fine_right: { keys: ['KeyO'], pad: b(15) },
      confirm: { keys: [], pad: b(0) },
      back: { keys: ['Backspace'], pad: b(1) },
      pause: { keys: ['Escape'], pad: b(9) },
    },
    battle: {
      steer_x: { axis: true, neg: ['KeyA'], pos: ['KeyD'], pad: [{ axis: 0 }] },
      steer_y: { axis: true, neg: ['KeyW'], pos: ['KeyS'], pad: [{ axis: 1 }] },
      cam_x: { axis: true, neg: ['ArrowLeft'], pos: ['ArrowRight'], pad: [{ axis: 2 }] },
      cam_y: { axis: true, neg: ['ArrowUp'], pos: ['ArrowDown'], pad: [{ axis: 3 }] },
      ability1: { keys: ['KeyU', 'KeyF'], pad: b(7) },
      ability2: { keys: ['KeyI', 'KeyG'], pad: b(6) },
      tactical1: { keys: ['KeyQ'], pad: b(4) },
      tactical2: { keys: ['KeyE'], pad: b(5) },
      dash: { keys: ['Space', 'KeyJ'], pad: b(0) },
      brace: { keys: ['KeyK', 'ShiftLeft'], pad: b(1) },
      counter: { keys: ['KeyL'], pad: b(2) },
      focus: { keys: ['KeyC'], pad: b(3) },
      cmd_up: { keys: ['Digit1'], pad: b(12) },
      cmd_down: { keys: ['Digit2'], pad: b(13) },
      cmd_left: { keys: ['Digit3'], pad: b(14) },
      cmd_right: { keys: ['Digit4'], pad: b(15) },
      pause: { keys: ['Escape', 'KeyP'], pad: b(9) },
      telemetry: { keys: ['Tab'], pad: b(8) },
    },
  };
}

// Presets. Classic: one-trigger launch (hold RT, let go to release).
// Competitive: LT charges, RT releases. Advanced: Competitive + stick-click
// dash/brace for keeping thumbs on the sticks. Custom: user edited.
export const PRESETS = {
  classic: {
    name: 'Classic', desc: 'Hold the charge input and let go to launch. Face buttons for techniques.',
    releaseOnChargeUp: true,
    build: () => {
      const m = base();
      m.launch.charge = { keys: ['Space'], pad: b(7) };
      m.launch.release = { keys: ['Enter'], pad: [] };
      return m;
    },
  },
  competitive: {
    name: 'Competitive', desc: 'LT charges, RT releases — separate timing input for precise launches.',
    releaseOnChargeUp: false,
    build: () => base(),
  },
  advanced: {
    name: 'Advanced', desc: 'Competitive layout plus stick-click dash (LS) and brace (RS) so you never leave the sticks.',
    releaseOnChargeUp: false,
    build: () => {
      const m = base();
      m.battle.dash = { keys: ['Space', 'KeyJ'], pad: b(0, 10) };
      m.battle.brace = { keys: ['KeyK', 'ShiftLeft'], pad: b(1, 11) };
      return m;
    },
  },
};

export function buildBindings(presetId = 'competitive') {
  const p = PRESETS[presetId] || PRESETS.competitive;
  return p.build();
}

export function presetReleaseMode(presetId) {
  return (PRESETS[presetId] || PRESETS.competitive).releaseOnChargeUp;
}

// ---------------------------------------------------------------- glyphs

export const PAD_GLYPHS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'Home'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'PS'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'Home'],
  generic: ['1', '2', '3', '4', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Home'],
};
export const AXIS_GLYPHS = ['LS ↔', 'LS ↕', 'RS ↔', 'RS ↕'];

export function detectPadType(id = '') {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
  if (/playstation|dualshock|dualsense|054c|ps4|ps5|sony/.test(s)) return 'playstation';
  if (/nintendo|057e|pro controller|joy-con/.test(s)) return 'nintendo';
  return 'generic';
}

export function keyGlyph(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter',
    Escape: 'Esc', Backspace: 'Bksp', ShiftLeft: 'Shift', ShiftRight: 'RShift', Tab: 'Tab',
    ControlLeft: 'Ctrl', PageUp: 'PgUp', PageDown: 'PgDn',
  };
  return map[code] || code;
}
