// Material upgrades. Each upgrade is a physical modification with a cost and
// usually a trade-off. An item can hold at most MAX_UPGRADES (plus one at
// Expert mastery), and each upgrade only once. Upgrades are applied on top of
// the base part in assembly (parts) or the launch model (launchers/cables).

export const MAX_UPGRADES = 2;

export const UPGRADES = [
  // rings
  { id: 'ring_reinforce', slot: 'ring', name: 'Reinforce Ring', desc: 'Max durability +12%, mass +0.4 g.', cost: { credits: 120, scrap: 6, alloy: 1 }, apply: (p) => { p.mass += 0.4; }, maxDurability: 0.12 },
  { id: 'ring_hone', slot: 'ring', name: 'Hone Blade Faces', desc: 'Blade face +1°, max durability -5%.', cost: { credits: 150, polymer: 3, alloy: 1 }, apply: (p) => { p.faceAngle = (p.faceAngle || 0) + 1; }, maxDurability: -0.05 },
  { id: 'ring_balance', slot: 'ring', name: 'Balance Grind', desc: 'Removes 0.05 mm imbalance, mass -0.2 g.', cost: { credits: 100, scrap: 4 }, apply: (p) => { p.ecc = Math.max(0, (p.ecc || 0) - 0.05); p.mass -= 0.2; } },
  // tips
  { id: 'tip_refine', slot: 'tip', name: 'Refine Contact Profile', desc: 'Contact patch -6% (less spin drag).', cost: { credits: 110, polymer: 3 }, apply: (p) => { p.patchRadius *= 0.94; } },
  { id: 'tip_texture', slot: 'tip', name: 'Grip Texture', desc: 'Tip friction +5%; wears 10% faster.', cost: { credits: 90, polymer: 2 }, apply: (p) => { p.mu *= 1.05; }, wear: 0.1 },
  { id: 'tip_hardcoat', slot: 'tip', name: 'Hard Coat', desc: 'Max durability +15%.', cost: { credits: 100, alloy: 1, scrap: 3 }, apply: () => {}, maxDurability: 0.15 },
  // discs
  { id: 'disc_reinforce', slot: 'disc', name: 'Reinforce Disc', desc: 'Max durability +12%.', cost: { credits: 100, alloy: 1, scrap: 4 }, apply: () => {}, maxDurability: 0.12 },
  { id: 'disc_rim', slot: 'disc', name: 'Rim Weighting', desc: 'Mass distribution +0.05 outward, mass +0.5 g.', cost: { credits: 140, alloy: 2 }, apply: (p) => { p.massDist = Math.min(0.95, (p.massDist || 0) + 0.05); p.mass += 0.5; } },
  { id: 'disc_true', slot: 'disc', name: 'True Disc', desc: 'Removes 0.06 mm imbalance.', cost: { credits: 90, scrap: 4 }, apply: (p) => { p.ecc = Math.max(0, (p.ecc || 0) - 0.06); } },
  // locks
  { id: 'lock_teeth', slot: 'lock', name: 'Recut Teeth', desc: 'Lock threshold +5%.', cost: { credits: 130, alloy: 1, polymer: 1 }, apply: (p) => { p.threshold *= 1.05; } },
  { id: 'lock_spring', slot: 'lock', name: 'Spring Seat', desc: 'Partial slips reseat +0.15/s.', cost: { credits: 110, alloy: 1 }, apply: (p) => { p.recovery = (p.recovery || 0) + 0.15; } },
  { id: 'lock_reinforce', slot: 'lock', name: 'Reinforce Lock', desc: 'Max durability +15%.', cost: { credits: 100, scrap: 5 }, apply: () => {}, maxDurability: 0.15 },
  // cores
  { id: 'core_seat', slot: 'core', name: 'Low Seat', desc: 'Core height -0.3 mm (lower COM).', cost: { credits: 110, alloy: 1 }, apply: (p) => { p.height = Math.max(2.5, p.height - 0.3); } },
  { id: 'core_centre', slot: 'core', name: 'Centre Core', desc: 'Removes 0.04 mm imbalance.', cost: { credits: 90, scrap: 3 }, apply: (p) => { p.ecc = Math.max(0, (p.ecc || 0) - 0.04); } },
  { id: 'core_reinforce', slot: 'core', name: 'Reinforce Core', desc: 'Max durability +12%.', cost: { credits: 90, scrap: 4 }, apply: () => {}, maxDurability: 0.12 },
  // aux
  { id: 'aux_reinforce', slot: 'aux', name: 'Reinforce Mount', desc: 'Max durability +15%.', cost: { credits: 90, scrap: 4 }, apply: () => {}, maxDurability: 0.15 },
  { id: 'aux_lighten', slot: 'aux', name: 'Lighten Module', desc: 'Mass -0.4 g.', cost: { credits: 100, polymer: 2 }, apply: (p) => { p.mass = Math.max(1, p.mass - 0.4); } },
  // launchers
  { id: 'launcher_drive', slot: 'launcher', name: 'Rebuild Drive', desc: 'Drive force +2%, drive wear +10%.', cost: { credits: 160, alloy: 2 }, launch: { power: 0.02, wear: 0.1 } },
  { id: 'launcher_trigger', slot: 'launcher', name: 'Polish Trigger', desc: 'Perfect window +5%.', cost: { credits: 140, alloy: 1, polymer: 1 }, launch: { window: 0.05 } },
  { id: 'launcher_grip', slot: 'launcher', name: 'Wrap Grip', desc: 'Launch angle error -6%.', cost: { credits: 90, polymer: 2 }, launch: { consistency: 0.06 } },
  // cables
  { id: 'cable_wax', slot: 'cable', name: 'Wax Cable', desc: 'Transfer efficiency +1%.', cost: { credits: 70, polymer: 1 }, launch: { power: 0.01 } },
  { id: 'cable_braid', slot: 'cable', name: 'Re-braid', desc: 'Launch angle error -6%.', cost: { credits: 90, polymer: 2 }, launch: { consistency: 0.06 } },
  { id: 'cable_reinforce', slot: 'cable', name: 'Reinforced Weave', desc: 'Max durability +15%, wear -10%.', cost: { credits: 100, scrap: 3, polymer: 1 }, maxDurability: 0.15, wear: -0.1 },
];

export const UPGRADE_INDEX = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
export const upgradesForSlot = (slot) => UPGRADES.filter((u) => u.slot === slot);
