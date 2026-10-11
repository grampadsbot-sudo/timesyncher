import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = path.join(root, 'public/assets/index-BKun7ofk.js');

const [legacyShell, servedEntry, dayMapSource, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'vacation-app-next.html'), 'utf8'),
  readFile(path.join(root, 'apps/vacation-client/src/components/DayMap.tsx'), 'utf8'),
  readFile(bundlePath, 'utf8'),
]);

assert.doesNotMatch(legacyShell, /index-BKun7ofk\.js/);
assert.doesNotMatch(legacyShell, /appendSharedTrekBundle/);
assert.match(servedEntry, /apps\/vacation-client\/src\/main\.tsx/);
assert.doesNotMatch(servedEntry, /index-BKun7ofk\.js/);
assert.match(dayMapSource, /data-ts-day-map/);
assert.match(dayMapSource, /MapContainer/);

assert.match(js, /tsTripMapInitialView=/);
assert.match(js, /tsMapIv=I\.useMemo\(\(\)=>tsTripMapInitialView\(\{places:z,trip:r\}\)/);
assert.match(js, /data-map-center-unresolved/);
assert.match(js, /map_center_unresolved/);
assert.match(js, /map_mount_failed/);

console.log('trip map initial view site wiring tests passed');
