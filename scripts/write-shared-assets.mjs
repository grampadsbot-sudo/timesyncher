import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchStyleTwoToConfigRenderer } from '../src/vacation/trek-style2-bundle.mjs';

const JS_NAME = 'index-BKun7ofk.js';
const CSS_NAME = 'index-CbEHlMj6.css';
const JS_URL = `https://travel.timesyncher.com/assets/${JS_NAME}`;
const CSS_URL = `https://travel.timesyncher.com/assets/${CSS_NAME}`;

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

let pending = null;

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`shared asset ${url} returned ${response.status}`);
  return response.text();
}

async function writeOnce() {
  const [jsSource, css] = await Promise.all([fetchText(JS_URL), fetchText(CSS_URL)]);
  const js = patchStyleTwoToConfigRenderer(jsSource);
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
