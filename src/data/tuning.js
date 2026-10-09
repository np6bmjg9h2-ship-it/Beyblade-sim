// Mastery tuning options. Each mastery stage from Skilled upward unlocks one
// tuning slot on that specific item; the player picks one of the options for
// the item's slot. Tunings are small, physical and come with trade-offs.

export const TUNINGS = [
  // rings
  { id: 'ring_sharpen', slot: 'ring', name: 'Sharpen Faces', desc: 'Blade face +1.5°, max durability -5%.', apply: (p) => { p.faceAngle = (p.faceAngle || 0) + 1.5; }, maxDurability: -0.05 },
  { id: 'ring_smooth', slot: 'ring', name: 'Smooth Profile', desc: 'Air drag -8%, blade face -0.5°.', apply: (p) => { p.aero = (p.aero || 0.015) * 0.92; p.faceAngle = Math.max(0, (p.faceAngle || 0) - 0.5); } },
  { id: 'ring_counter', slot: 'ring', name: 'Counter-Impact Tuning', desc: 'Restitution +4%, contact friction -6%.', apply: (p) => { p.restitution *= 1.04; p.friction *= 0.94; } },
  { id: 'ring_rebalance', slot: 'ring', name: 'Rebalance', desc: 'Removes 0.06 mm of imbalance.', apply: (p) => { p.ecc = Math.max(0, (p.ecc || 0) - 0.06); } },
  // tips
  { id: 'tip_refine', slot: 'tip', name: 'Refine Contact', desc: 'Contact patch -8% (less spin drag).', apply: (p) => { p.patchRadius *= 0.92; } },
  { id: 'tip_score', slot: 'tip', name: 'Score Grip', desc: 'Tip friction +7%.', apply: (p) => { p.mu *= 1.07; } },
  { id: 'tip_polish', slot: 'tip', name: 'Polish Face', desc: 'Tip friction -6%.', apply: (p) => { p.mu *= 0.94; } },
  // discs
  { id: 'disc_true', slot: 'disc', name: 'True the Disc', desc: 'Removes 0.08 mm of imbalance.', apply: (p) => { p.ecc = Math.max(0, (p.ecc || 0) - 0.08); } },
  { id: 'disc_rim', slot: 'disc', name: 'Rim Shift', desc: 'Mass distribution +0.1 toward the rim.', apply: (p) => { p.massDist = Math.min(0.95, (p.massDist || 0) + 0.1); } },
  { id: 'disc_trim', slot: 'disc', name: 'Trim Mass', desc: 'Mass -1 g.', apply: (p) => { p.mass = Math.max(5, p.mass - 1); } },
  // locks
  { id: 'lock_tighten', slot: 'lock', name: 'Tighten Teeth', desc: 'Lock threshold +8%.', apply: (p) => { p.threshold *= 1.08; } },
  { id: 'lock_ease', slot: 'lock', name: 'Spring Seat', desc: 'Partial-slip recovery +0.3/s.', apply: (p) => { p.recovery = (p.recovery || 0) + 0.3; } },
  // cores
  { id: 'core_center', slot: 'core', name: 'Centre Core', desc: 'Removes 0.06 mm of imbalance.', apply: (p) => { p.ecc = Math.max(0, (p.ecc || 0) - 0.06); } },
  { id: 'core_lower', slot: 'core', name: 'Seat Lower', desc: 'Core height -0.4 mm.', apply: (p) => { p.height = Math.max(2.5, p.height - 0.4); } },
  // aux
  { id: 'aux_reinforce', slot: 'aux', name: 'Reinforce Mount', desc: 'Max durability +10%.', apply: () => {}, maxDurability: 0.1 },
  { id: 'aux_lighten', slot: 'aux', name: 'Lighten Module', desc: 'Mass -0.6 g.', apply: (p) => { p.mass = Math.max(1, p.mass - 0.6); } },
  // launchers
  { id: 'launcher_trigger', slot: 'launcher', name: 'Tune Trigger', desc: 'Perfect window +8%.', launch: { window: 0.08 } },
  { id: 'launcher_drive', slot: 'launcher', name: 'Tune Drive', desc: 'Launch energy +3%, launcher wear +10%.', launch: { power: 0.03, wear: 0.1 } },
  { id: 'launcher_grip', slot: 'launcher', name: 'Wrap Grip', desc: 'Launch angle error -8%.', launch: { consistency: 0.08 } },
  // cables
  { id: 'cable_wax', slot: 'cable', name: 'Wax Cable', desc: 'Transfer efficiency +2%.', launch: { power: 0.02 } },
  { id: 'cable_braid', slot: 'cable', name: 'Tight Braid', desc: 'Launch angle error -10%.', launch: { consistency: 0.1 } },
];

export const TUNING_INDEX = Object.fromEntries(TUNINGS.map((t) => [t.id, t]));
export const tuningsForSlot = (slot) => TUNINGS.filter((t) => t.slot === slot);
