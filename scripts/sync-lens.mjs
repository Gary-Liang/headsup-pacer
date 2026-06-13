/**
 * Copies the platform-agnostic core into lens/PacerCore/ so the Lens Studio
 * scripts have the engine alongside them. The core stays the single source of
 * truth (tested in Node); lens/PacerCore/ is generated and git-ignored.
 *
 * Node-only modules (replay.ts) are skipped — they pull in `node:fs` and never
 * run inside a Lens.
 *
 *   npm run sync:lens
 */
import { readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const outDir = join(root, 'lens', 'PacerCore');

const SKIP = new Set(['replay.ts']);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let n = 0;
for (const file of readdirSync(srcDir)) {
  if (!file.endsWith('.ts') || SKIP.has(file)) continue;
  copyFileSync(join(srcDir, file), join(outDir, file));
  n++;
}

console.log(`synced ${n} core modules → lens/PacerCore/`);
