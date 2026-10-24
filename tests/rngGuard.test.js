// Determinism guard: gameplay code draws every random number from a seeded
// Rng (src/core/rng.js), never Math.random(), so seeds and replays reproduce.
// Cosmetic code (render, audio, ui) is free to use Math.random().

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createItem } from '../src/systems/items.js';
import { PARTS } from '../src/data/parts.js';

const GAMEPLAY_DIRS = ['src/core', 'src/game', 'src/physics', 'src/systems', 'src/input', 'src/data', 'src/workers'];

// Allowed uses: picking a fresh seed or a non-gameplay id, never a gameplay draw.
const ALLOWED = [
  ['src/game/battle.js', 'this.seed = opts.seed ?? '], // a new battle with no seed picks one
  ['src/systems/telemetry.js', 'this.session = '], // telemetry session id
];

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('gameplay code never calls Math.random()', () => {
  const found = [];
  for (const dir of GAMEPLAY_DIRS) {
    for (const file of jsFiles(dir)) {
      const rel = file.replaceAll('\\', '/');
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (!code.includes('Math.random')) return;
        if (ALLOWED.some(([f, text]) => rel === f && code.includes(text))) return;
        found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(found, [], 'use a seeded Rng instead:\n' + found.join('\n'));
});

test('createItem refuses to make an unseeded item', () => {
  const base = PARTS[0].id;
  assert.throws(() => createItem({ base }), /needs a seed/);
  const a = createItem({ base, rarity: 'rare', seed: 42 });
  const b = createItem({ base, rarity: 'rare', seed: 42 });
  assert.deepEqual([a.stats, a.traits, a.special, a.set], [b.stats, b.traits, b.special, b.set]);
});
