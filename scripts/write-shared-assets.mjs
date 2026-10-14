import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const JS_NAME = 'index-BKun7ofk.js';
const CSS_NAME = 'index-CbEHlMj6.css';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, '..', 'public', 'assets');

export async function writeSharedAssets() {
  const [js, css] = await Promise.all([
    readFile(join(assetsDir, JS_NAME)),
    readFile(join(assetsDir, CSS_NAME)),
  ]);
  console.log(`shared assets already committed js=${js.length} css=${css.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writeSharedAssets();
}
