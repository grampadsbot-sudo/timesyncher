import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VIEWPORTS } from './customer_suite/config.mjs';
import { Scenario, launchBrowser, newViewportPage, writeJson } from './customer_suite/harness.mjs';
import * as collab from './customer_suite/scenarios_collab.mjs';
import { buildState, createHttpCaller, dbFor } from './fixtures/vacation-collaborator-accept-e2e-fixtures.mjs';

import { hasDatabase } from '../src/vacation/db.mjs';

assert.ok(!hasDatabase(), 'Run this browser fixture without DATABASE_URL or NEON_DATABASE_URL');
process.env.TIMESYNCHER_HARNESS_STUB_OUTBOUND = '1';
const dir = await mkdtemp(join(tmpdir(), 's4-accept-browser-'));
process.env.TIMESYNCHER_EULA_STORE = '';
process.env.TIMESYNCHER_ONBOARDING_STORE = dir;
process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = '2500';
process.env.TIMESYNCHER_COLLABORATOR_NAME = 'Collaborator seat';
const { default: handler } = await import('../api/[...route].mjs');
const { useOnboardingLookup } = await import('../routes/eula.mjs');
const { useVacationAppDatabase } = await import('../routes/vacation-itinerary.mjs');
const call = createHttpCaller(handler);

let loadHandler;
let posted = 0;
const server = createServer(async (req, res) => {
  const route = new URL(req.url, 'http://localhost');
  if (route.pathname === '/vacation-app.html' || route.pathname === '/favicon.ico') {
    return res.end();
  }
  if (route.pathname === '/fixture/accept.js') {
    res.setHeader('content-type', 'application/javascript');
    return res.end(await loadHandler.promise);
  }
  if (route.pathname === '/api/eula' && req.method === 'POST') posted += 1;
  if (route.pathname.startsWith('/accept/')) {
    const result = await call('GET', req.url);
    const html = result.body.replace(/<script>([\s\S]*?)<\/script>/, (_, script) => {
      loadHandler.script = script;
      return '<script async src="/fixture/accept.js"></script>';
    });
    res.writeHead(result.statusCode, result.headers);
    return res.end(html);
  }
  return handler(req, res);
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
process.env.TIMESYNCHER_SITE_BASE_URL = origin;

let browser;
const failures = [];
try {
  browser = await launchBrowser();
  for (const viewport of VIEWPORTS) {
    loadHandler = Promise.withResolvers();
    const state = buildState({ withTrip: true, withInvite: false });
    const fixtureDb = dbFor(state);
    useOnboardingLookup(fixtureDb);
    useVacationAppDatabase(fixtureDb);
    const name = 'Morgan Reed';
    const invite = await call('POST', '/api/vacation-itinerary?app=1&session=' + state.ownerToken, {
      action: 'collaborator-invite',
      tripId: state.tripId,
      name,
      email: 'morgan@example.test',
    });
    assert.equal(invite.statusCode, 200);
    assert.equal(state.invites.length, 1);
    const sessionId = 'vacation-collaborator-' + state.invites[0].id;
    const { context, page } = await newViewportPage(browser, viewport);
    const before = posted;

    try {
      await page.goto(origin + '/accept/' + sessionId, { waitUntil: 'domcontentloaded' });
      assert.ok(loadHandler.script, 'accept script is held by the fixture');
      await page.fill('#name', name);
      await page.check('#agree');
      const attemptedNativeSubmit = await page.locator('#form button.btn').evaluate((button) => {
        let submitted = false;
        button.form.addEventListener('submit', (event) => {
          submitted = true;
          event.preventDefault();
        }, { once: true });
        button.click();
        return submitted;
      });
      assert.equal(attemptedNativeSubmit, false, `${viewport.width}px submit before handler attachment`);

      // Release the real script only after exercising the race condition.
      loadHandler.resolve(loadHandler.script);
      const sc = new Scenario({}, 'S4', 'Collaborator invite');
      await collab.submitCollaboratorTerms(page, sc, { origin, sessionId, name });
      assert.equal(posted - before, 1);
      assert.equal(sc.ok, true);
      assert.ok(new URL(page.url()).searchParams.get('session')?.length >= 10);

      const resultsFile = join(dir, 'results.json');
      writeJson(resultsFile, { scenarios: [sc.toJSON()] });
      const [result] = JSON.parse(await readFile(resultsFile, 'utf8')).scenarios;
      assert.deepEqual(result.meta.acceptTrace.map(({ at, ...entry }) => {
        assert.ok(Number.isFinite(Date.parse(at)));
        return entry;
      }), [
        { event: 'request', method: 'POST', path: '/api/eula', status: null },
        { event: 'response', method: 'POST', path: '/api/eula', status: 201 },
      ]);
      console.log(`S4 browser ${viewport.width}px: one POST, HTTP 201, persisted receipt and app redirect`);
    } catch (error) {
      failures.push(error);
    } finally {
      loadHandler.resolve('');
      await context.close();
    }
  }
  assert.equal(failures.length, 0, failures.map((error) => error.message).join('\n'));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
