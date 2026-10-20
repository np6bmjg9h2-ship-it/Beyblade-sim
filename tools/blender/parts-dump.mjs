// Writes every catalogue part's numbers as JSON for the Blender part scripts
// (tools/blender/<slot>s.py read it), so a model is built from the same
// dimensions the physics uses and follows any change to src/data/parts.js.
//   node tools/blender/parts-dump.mjs [out.json]   (default .tools/parts.json)
import fs from 'node:fs';
import { PARTS } from '../../src/data/parts.js';

const out = process.argv[2] || '.tools/parts.json';
const bySlot = {};
for (const p of PARTS) (bySlot[p.slot] ||= []).push(JSON.parse(JSON.stringify(p)));
fs.writeFileSync(out, JSON.stringify(bySlot, null, 1));
console.log(`${out}: ${PARTS.length} parts (${Object.entries(bySlot).map(([s, l]) => `${s} ${l.length}`).join(', ')})`);
