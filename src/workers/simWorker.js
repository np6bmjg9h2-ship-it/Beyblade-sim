// Web Worker entry: runs tournament AI-vs-AI matches off the main thread with
// the same physics and AI code the game uses. Bundled separately by
// tools/build.js and embedded in the main bundle as a Blob-URL worker.

import { runMatchJob } from '../game/matchJob.js';

self.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const t0 = performance.now();
    const result = runMatchJob(job);
    result.cpuMs = Math.round(performance.now() - t0);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack || err) });
  }
};
