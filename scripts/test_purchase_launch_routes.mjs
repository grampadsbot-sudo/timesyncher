import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/[...route].mjs';
import { createOnboardingSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { LocalJsonStore } from '../src/onboarding/eula-persistent-store.mjs';

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
    const child = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`))));
  });
}

await build();

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

const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const found = firstRoute(vercel.routes, url.pathname);
  if (found && String(found.route.dest).startsWith('/api/[...route]')) {
    await handler(req, res);
    return;
  }
  const filePath = found && !String(found.route.dest).startsWith('/api/')
    ? path.join(dist, found.route.dest.replace(/^\//, ''))
    : path.join(dist, url.pathname.replace(/^\//, ''));
  try {
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

try {
  const markdown = await get('/src/onboarding/eula-markdown.mjs');
  assert.notEqual(markdown.status, 404, markdown.body);
  assert.match(markdown.type, /javascript/);
  assert.ok(markdown.body.includes(['export', 'function', 'renderEulaMarkdown'].join(' ')));

  const accept = await get(`/accept/${sessionId}`);
  assert.notEqual(accept.status, 404, accept.body);
  assert.match(accept.type, /text\/html/);
  assert.match(accept.body, /Review & continue/);
  assert.doesNotMatch(accept.body, /"error":"not found"/);

  const purchase = await get('/shared/?eulaSession=vacation-route-token&purchase=1');
  assert.notEqual(purchase.status, 404, purchase.body);
  assert.match(purchase.type, /text\/html/);
  assert.match(purchase.body, /TimeSyncher Vacation App/);
  assert.doesNotMatch(purchase.body, /index-BKun7ofk\.js/);
  const script = purchase.body.match(/src="(\/assets\/vacationApp-[^"]+\.js)"/);
  assert.ok(script, purchase.body);
  const bundle = await get(script[1]);
  assert.notEqual(bundle.status, 404, bundle.body);
  assert.match(bundle.type, /javascript/);
  assert.match(bundle.body, /eulaSession/);

  const config = await get('/api/auth/app-config');
  assert.notEqual(config.status, 404, config.body);
  assert.match(config.type, /application\/json/);
  const configJson = JSON.parse(config.body);
  assert.equal(configJson.password_login, true);
  assert.notEqual(configJson.error, 'not found');

  const notices = await get('/api/system-notices/active');
  assert.notEqual(notices.status, 404, notices.body);
  assert.match(notices.type, /application\/json/);
  assert.deepEqual(JSON.parse(notices.body), []);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(storeDir, { recursive: true, force: true });
}

console.log('purchase launch routes passed');
