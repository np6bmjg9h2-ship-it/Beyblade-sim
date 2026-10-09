// Bundles src/ into a single classic script (dist/chaos-spin.js) so the game
// runs by opening index.html directly in Chrome (file://), no server needed.
// The tournament simulation worker (src/workers/simWorker.js) is bundled
// first and embedded as a string; the game starts it from a Blob URL.
// Usage: node tools/build.js [--watch] [--dev]

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev') || watch;

async function buildWorker() {
  const r = await esbuild.build({
    entryPoints: ['src/workers/simWorker.js'],
    bundle: true, format: 'iife', target: ['chrome100'], write: false, minify: true, legalComments: 'none', metafile: true,
  });
  return { src: r.outputFiles[0].text, inputs: Object.keys(r.metafile.inputs) };
}

// Re-embeds the worker on every (re)build so watch mode stays in sync.
const workerPlugin = {
  name: 'sim-worker',
  setup(build) {
    build.onStart(async () => {
      const w = await buildWorker();
      build.initialOptions.define.__SIM_WORKER_SRC__ = JSON.stringify(w.src);
      console.log(`sim worker: ${(w.src.length / 1024).toFixed(0)} KB`);
    });
  },
};

const first = await buildWorker();
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
  define: { __SIM_WORKER_SRC__: JSON.stringify(first.src) },
  banner: { js: '/* Chaos Spin: Arena Zero — bundled build. Source in src/. Three.js (MIT) bundled. */' },
};

if (watch) {
  const ctx = await esbuild.context({ ...opts, plugins: [workerPlugin] });
  await ctx.watch();
  console.log('watching src/ …');
} else {
  await esbuild.build(opts);
  console.log(`sim worker embedded: ${(first.src.length / 1024).toFixed(0)} KB`);
}
