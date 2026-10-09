// Bundles src/ into a single classic script (dist/chaos-spin.js) so the game
// runs by opening index.html directly in Chrome (file://), no server needed.
// Usage: node tools/build.js [--watch] [--dev]

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev') || watch;

const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['chrome100'],
  outfile: 'dist/chaos-spin.js',
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: '/* Chaos Spin: Arena Zero — bundled build. Source in src/. Three.js (MIT) bundled. */' },
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('watching src/ …');
} else {
  await esbuild.build(opts);
}
