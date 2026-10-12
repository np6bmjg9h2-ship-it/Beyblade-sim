// Deep property check: runs the fast-check suites (tests/properties-*.test.js)
// with 1,000 runs per property instead of the quick defaults. Takes a few
// minutes. Usage: npm run test:deep [-- <runs>]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const runs = process.argv[2] || '1000';
const files = fs.readdirSync('tests').filter((f) => /^properties-.*\.test\.js$/.test(f)).map((f) => `tests/${f}`);
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: { ...process.env, FC_RUNS: runs } });
process.exit(r.status ?? 1);
