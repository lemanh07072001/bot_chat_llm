/**
 * Fails when the widget's copy of the emoji dataset or font drifts from the
 * admin originals.
 *
 * The widget cannot import from `app/admin` (it ships as a standalone bundle
 * and is served from the customer's origin), so the two files are copies. A
 * copy that nobody re-checks is a silent version skew: the admin panel would
 * gain a new emoji the widget never offers, or the widget would ask for a glyph
 * the widget font subset no longer covers.
 *
 * Run with `npm run check:emoji` in `app/widget` or in CI.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PAIRS = [
  {
    name: 'emoji dataset',
    source: 'app/admin/src/lib/emoji-data.json',
    copy: 'app/widget/public/assets/emoji-data.json',
  },
  {
    name: 'emoji fill font',
    source: 'app/admin/public/fonts/chat-emoji-fill.woff2',
    copy: 'app/widget/public/assets/chat-emoji-fill.woff2',
  },
];

async function digest(relativePath) {
  const buffer = await readFile(resolve(root, relativePath));

  return {
    bytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

let failed = false;

for (const pair of PAIRS) {
  let source;
  let copy;

  try {
    [source, copy] = await Promise.all([digest(pair.source), digest(pair.copy)]);
  } catch (error) {
    failed = true;
    console.error(`✗ ${pair.name}: cannot read one of the files`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (source.sha256 === copy.sha256) {
    console.log(`✓ ${pair.name} (${source.bytes} bytes, ${source.sha256.slice(0, 12)})`);
    continue;
  }

  failed = true;
  console.error(`✗ ${pair.name} has drifted`);
  console.error(`  ${pair.source}: ${source.bytes} bytes ${source.sha256.slice(0, 12)}`);
  console.error(`  ${pair.copy}: ${copy.bytes} bytes ${copy.sha256.slice(0, 12)}`);
  console.error(`  fix: copy ${pair.source} over ${pair.copy}`);
}

if (failed) {
  process.exitCode = 1;
}
