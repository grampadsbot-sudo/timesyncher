import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = path.join(root, 'public/assets/index-BKun7ofk.js');

const [html, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(bundlePath, 'utf8'),
]);

assert.match(html, /index-BKun7ofk\.js/);
assert.match(html, /trek\.src\s*=\s*['"]\/assets\/index-BKun7ofk\.js['"]/);
assert.match(js, /tsTripMapInitialView=/);
assert.match(js, /tsMapIv=I\.useMemo\(\(\)=>tsTripMapInitialView\(\{places:z,trip:r\}\)/);
assert.match(js, /data-map-center-unresolved/);
assert.match(js, /map_center_unresolved/);

console.log('trip map initial view site wiring tests passed');
