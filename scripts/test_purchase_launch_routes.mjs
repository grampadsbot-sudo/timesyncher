import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/[...route].mjs';
import { buildSha } from '../routes/version.mjs';
import { createOnboardingSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { LocalJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { assignTripSiteUrl } from '../src/vacation/onboarding.mjs';
import { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

function builderSrc(src) {
  if (src.startsWith('^') && src.endsWith('$')) return src;
  return `^${src.startsWith('^') ? src.slice(1) : src}${src.endsWith('$') ? '' : '$'}`;
}

function firstRoute(routes, pathname) {
  for (const route of routes) {
    const match = pathname.match(new RegExp(builderSrc(route.src)));
    if (match) return { route, match };
  }
  return null;
}

function contentType(file) {
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`))));
  });
}

const vercelSha = '0123456789abcdef0123456789abcdef01234567';
process.env.VERCEL_GIT_COMMIT_SHA = vercelSha;
delete process.env.TIMESYNCHER_BUILD_SHA;
const expectedSha = buildSha();
assert.equal(expectedSha, vercelSha);

const htmlEntries = [
  'index.html',
  'privacy.html',
  'terms.html',
  'support.html',
  'login.html',
  'order-test.html',
  'addons-checkout.html',
  'owner-media-checkout.html',
  'access-checkout.html',
  'order-success.html',
  'admin-onboardings.html',
  'openclaw-admin.html',
  'itinerary.html',
  'vacation-app.html',
  'shared-app.html',
  'onboarding-eula.html',
];

await build();

for (const name of ['vacation-app.html', 'shared-app.html', 'index.html']) {
  const built = await readFile(path.join(dist, name), 'utf8');
  const value = stampValue(built);
  assert.ok(value, `${name} built stamp is empty`);
  assert.equal(value, expectedSha, `${name} built stamp`);
}

const storeDir = await mkdtemp(path.join(tmpdir(), 'eula-purchase-'));
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
process.env.TIMESYNCHER_EULA_STORE = '';
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
const sessionId = 'vacation-route-token';
await createOnboardingSessionPersistent(new LocalJsonStore(storeDir), {
  sessionId,
  clientKey: 'vacation-onboarding:route-token',
  clientLabel: 'Route Test',
  contact: { email: 'route-test@example.com' },
  selectedFunctionality: ['vacation_planning_onboarding'],
  google: {},
  eula: { version: '2026-06-terms-advisory-only', text: 'Terms for the purchase route.' },
});

const intakeTripId = '01234567-89ab-4cde-8f01-23456789abcd';
const intakeTrip = {
  id: intakeTripId,
  title: 'Purchase trip',
  destination: '',
  start_date: null,
  end_date: null,
  metadata: {},
};
const purchaseDb = (strings, ...values) => {
  const query = strings.join(' ');
  if (/update trips/i.test(query)) {
    const patch = values.find((value) => value && value.publicSlug);
    intakeTrip.metadata = { ...(intakeTrip.metadata || {}), ...patch };
    return [];
  }
  if (query.includes('from trips')) {
    const meta = intakeTrip.metadata || {};
    const shared = meta.intakeShare === true || meta.intakeShare === 'true';
    if (meta.publicSlug === values[0] && shared && query.includes("metadata->>'intakeShare'")) return [{ ...intakeTrip }];
    return [];
  }
  if (query.includes('from trip_things')) return [];
  return [];
};
const assigned = await assignTripSiteUrl(purchaseDb, intakeTripId, process.env);
assert.equal(assigned.publicSlug, intakeShareSlug(intakeTripId));
assert.equal(assigned.publicSlug, 'intake-0123456789ab');
assert.equal(intakeTrip.metadata.intakeShare, true);
useSharedTripDatabase(purchaseDb);

const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const found = firstRoute(vercel.routes, url.pathname);
  if (found && String(found.route.dest).startsWith('/api/[...route]')) {
    await handler(req, res);
    return;
  }
  const pathname = found && !String(found.route.dest).startsWith('/api/')
    ? found.route.dest
    : url.pathname;
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const filePath = path.join(dist, rel);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentType(filePath));
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('The page could not be found\n');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function get(pathname) {
  const response = await fetch(`${origin}${pathname}`);
  const body = await response.text();
  return {
    status: response.status,
    type: response.headers.get('content-type') || '',
    body,
  };
}

function stampValue(body) {
  const meta = body.match(/<meta\b[^>]*\bname="timesyncher-build"[^>]*>/i);
  const content = meta && meta[0].match(/\bcontent="([^"]*)"/i);
  const data = body.match(/<html\b[^>]*\bdata-build-sha="([^"]*)"/i);
  return (content && content[1]) || (data && data[1]) || '';
}

function assertStamp(result, label) {
  assert.notEqual(result.status, 404, `${label} ${result.body.slice(0, 180)}`);
  const value = stampValue(result.body);
  assert.ok(value, `${label} build stamp is empty`);
  assert.equal(value, expectedSha, `${label} stamp differs from /api/version`);
}

try {
  const version = await get('/api/version');
  assert.equal(version.status, 200, version.body);
  assert.match(version.type, /json/);
  const reportedSha = JSON.parse(version.body).sha;
  assert.equal(reportedSha, expectedSha);

  const builtHtml = (await readdir(dist)).filter((name) => name.endsWith('.html')).sort();
  assert.deepEqual(builtHtml, [...htmlEntries].sort());
  for (const name of htmlEntries) {
    const page = await get(`/${name}`);
    assertStamp(page, name);
    assert.match(page.type, /text\/html/);
    assert.ok(page.body.includes(`content="${reportedSha}"`), `${name} stamp differs from /api/version`);
  }

  const markdown = await get('/src/onboarding/eula-markdown.mjs');
  assertStamp(markdown, 'eula module');
  assert.match(markdown.type, /javascript/);
  assert.ok(markdown.body.includes(['export', 'function', 'renderEulaMarkdown'].join(' ')));

  const accept = await get(`/accept/${sessionId}`);
  assertStamp(accept, 'accept');
  assert.match(accept.type, /text\/html/);
  assert.match(accept.body, /Review & continue/);
  assert.doesNotMatch(accept.body, /"error":"not found"/);

  const purchase = await get('/shared/?eulaSession=vacation-route-token&purchase=1');
  assertStamp(purchase, 'purchase');
  assert.match(purchase.type, /text\/html/);
  assert.match(purchase.body, /TimeSyncher Vacation App/);
  assert.doesNotMatch(purchase.body, /index-BKun7ofk\.js/);
  const script = purchase.body.match(/src="(\/assets\/vacationApp-[^"]+\.js)"/);
  assert.ok(script, purchase.body);
  const bundle = await get(script[1]);
  assert.notEqual(bundle.status, 404, bundle.body);
  assert.match(bundle.type, /javascript/);
  assert.match(bundle.body, /eulaSession/);

  const intake = await get(`/shared/${assigned.publicSlug}/`);
  assert.notEqual(intake.status, 404, intake.body.slice(0, 180));
  assertStamp(intake, 'intake share');
  assert.match(intake.type, /text\/html/);
  assert.doesNotMatch(intake.body, /Invalid or expired link/);

  const intakeApi = await get(`/api/shared/${assigned.publicSlug}`);
  assert.equal(intakeApi.status, 200, intakeApi.body.slice(0, 180));
  assert.match(intakeApi.type, /json/);
  const intakeBody = JSON.parse(intakeApi.body);
  assert.ok(intakeBody.trip, intakeApi.body.slice(0, 180));
  assert.equal(intakeBody.error, undefined);
  assert.deepEqual(intakeBody.places, []);
  assert.doesNotMatch(intakeApi.body, /Invalid or expired link/);

  const home = await get('/');
  assertStamp(home, 'home');
  assert.match(home.type, /text\/html/);
  assert.match(home.body, /TimeSyncher/);

  const editAccess = await get('/edit-access');
  assertStamp(editAccess, 'edit-access');
  assert.match(editAccess.type, /text\/html/);

  const editApi = await get(`/api/shared/${assigned.publicSlug}/edit-access`);
  assert.equal(editApi.status, 200, editApi.body.slice(0, 180));
  assert.match(editApi.type, /json/);
  assert.equal(JSON.parse(editApi.body).canEdit, false);

  const trek = await get('/assets/index-BKun7ofk.js');
  assertStamp(trek, 'trek bundle');
  assert.match(trek.type, /javascript/);
  assert.equal(trek.body.includes('Rt.get("/system-notices/active")'), false);
  assert.equal(trek.body.includes('Rt.get("/auth/app-config")'), false);
  assert.equal(trek.body.includes('async fetch(){e({notices:[],loaded:!0})}'), true);
  assert.equal(trek.body.includes('getAppConfig:()=>Promise.resolve({})'), true);
} finally {
  useSharedTripDatabase(null);
  await new Promise((resolve) => server.close(resolve));
  await rm(storeDir, { recursive: true, force: true });
}

console.log('purchase launch routes passed');
