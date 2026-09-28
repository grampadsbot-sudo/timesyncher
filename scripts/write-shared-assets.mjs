import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Served JS is the raw pull after the canned-string strip and patchStyleTwoToConfigRenderer.
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const JS_NAME = 'index-BKun7ofk.js';
const CSS_NAME = 'index-CbEHlMj6.css';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = join(here, '..', 'public', 'assets', 'upstream');
const assetsDir = join(here, '..', 'public', 'assets');

let pending = null;

async function writeOnce() {
  const [rawJs, css] = await Promise.all([
    readFile(join(rawDir, JS_NAME), 'utf8'),
    readFile(join(rawDir, CSS_NAME), 'utf8'),
  ]);
  const js = renderServedTrekBundle(rawJs);
  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    writeFile(join(assetsDir, JS_NAME), js),
    writeFile(join(assetsDir, CSS_NAME), css),
  ]);
  console.log(`wrote shared assets js=${js.length} css=${css.length}`);
}

export function writeSharedAssets() {
  if (!pending) pending = writeOnce();
  return pending;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeSharedAssets();
}
