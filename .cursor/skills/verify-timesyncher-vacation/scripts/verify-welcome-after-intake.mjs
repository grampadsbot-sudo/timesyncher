#!/usr/bin/env node
/**
 * Welcome after a real create-vacation intake.
 * Requires DATABASE_URL. A missing database is a failure, not a skip, pass, or gap.
 */
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onboardingOpenerFacts, upsellFactsForTurn } from '../../../../src/vacation/live-app-turn.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
export const WELCOME_DATABASE_MISSING = 'FAIL welcome-after-intake: DATABASE_URL missing';
export const WELCOME_MISSING = 'FAIL welcome-after-intake: welcome missing';
const scriptPath = fileURLToPath(import.meta.url);

export function assertWelcomeDatabase(env = process.env) {
  if (!String(env.DATABASE_URL || '').trim()) {
    const error = new Error(WELCOME_DATABASE_MISSING);
    error.exitCode = 1;
    throw error;
  }
  return env.DATABASE_URL;
}

function collaboratorWelcomeMarker() {
  const opener = onboardingOpenerFacts();
  const facts = upsellFactsForTurn({ intake: true, text: '' }, {}, true);
  return opener.first_message === true
    && opener.customer_said == null
    && facts?.collaborators === true
    && facts?.buildingItinerary === true;
}

function welcomeBeforeCustomer(turns) {
  const bubbles = Array.isArray(turns) ? turns : [];
  const firstUser = bubbles.findIndex((turn) => turn.speaker === 'customer' || turn.speaker === 'user');
  const prior = firstUser < 0 ? bubbles : bubbles.slice(0, firstUser);
  return prior.some((turn) => (turn.speaker === 'app' || turn.speaker === 'assistant') && String(turn.body || '').trim());
}

function jsonRequest(method, url, body, headers = {}) {
  const raw = Buffer.from(JSON.stringify(body || {}));
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (method !== 'GET' && raw.length) yield raw;
    },
  };
}

function captureResponse() {
  const headers = {};
  let raw = '';
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    end(chunk) {
      raw += chunk == null ? '' : String(chunk);
    },
  };
  return {
    res,
    body() {
      try {
        return JSON.parse(raw);
      } catch {
        return { raw };
      }
    },
  };
}

async function callHandler(handler, request) {
  const captured = captureResponse();
  await handler(request, captured.res);
  return { status: captured.res.statusCode, body: captured.body() };
}

async function screenshotApp(url, shotDir) {
  const file = path.join(shotDir, 'verify-welcome-after-intake.png');
  await mkdir(shotDir, { recursive: true });
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    const { createRequire } = await import('node:module');
    puppeteer = createRequire(import.meta.url)('/tmp/pptr/node_modules/puppeteer-core');
  }
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS;
    if (bypass) {
      await page.setExtraHTTPHeaders({
        'x-vercel-protection-bypass': bypass,
        'x-vercel-set-bypass-cookie': 'true',
      });
    }
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const shown = await page.evaluate(() => {
      const root = document.querySelector('#messages[data-screen="onboarding"]');
      if (!root) return false;
      const bubbles = [...root.querySelectorAll('article.bubble')];
      const firstUser = bubbles.findIndex((node) => node.classList.contains('user'));
      const prior = firstUser < 0 ? bubbles : bubbles.slice(0, firstUser);
      return prior.some((node) => !node.classList.contains('user') && (node.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
    });
    await page.screenshot({ path: file });
    return { file, shown };
  } finally {
    await browser.close();
  }
}

export async function runWelcomeAfterIntake({ env = process.env, shotDir } = {}) {
  assertWelcomeDatabase(env);
  const [{ sql }, { buildOnboardingFromCoupon, ensureVacationEulaSession, eulaSessionIdForOnboarding, vacationAppLink }, { acceptEulaPersistent }, { createPersistentStoreFromEnv }, requestHandler, appHandler] = await Promise.all([
    import('../../../../src/vacation/db.mjs'),
    import('../../../../src/vacation/onboarding.mjs'),
    import('../../../../src/onboarding/eula-persistent-core.mjs'),
    import('../../../../src/onboarding/eula-persistent-store.mjs'),
    import('../../../../routes/vacation-request.mjs'),
    import('../../../../routes/vacation-itinerary.mjs'),
  ]);
  const db = sql(env);
  const stamp = Date.now();
  const contact = {
    email: `verify-welcome-${stamp}@timesyncher.test`,
    firstName: 'Verify',
    lastName: 'Intake',
    displayName: 'Verify Intake',
  };
  const onboarding = await buildOnboardingFromCoupon({
    db,
    contact,
    plan: 'single',
    metadata: { trip_title: 'Create vacation intake check', source: 'verify-welcome-after-intake' },
    env,
  });
  const intakeText = 'Create a vacation for two on the Big Island in March. Include a collaborator who can view and edit the trip.';
  const intakeHeaders = {};
  if (env.TIMESYNCHER_INTAKE_TOKEN) intakeHeaders.authorization = `Bearer ${env.TIMESYNCHER_INTAKE_TOKEN}`;
  const intake = await callHandler(requestHandler.default, jsonRequest('POST', '/api/vacation-request', {
    customer: contact,
    trip: { id: onboarding.tripId, title: 'Create vacation intake check', destination: 'Big Island' },
    request: { source: 'web', type: 'trip_intake', text: intakeText },
  }, intakeHeaders));
  if (!intake.body?.ok || !intake.body?.requestId) {
    throw Object.assign(new Error(`FAIL welcome-after-intake: create-vacation intake did not finish (${intake.body?.error || intake.status})`), { exitCode: 1 });
  }
  const eula = await ensureVacationEulaSession(onboarding.session, { contact, env });
  await acceptEulaPersistent(createPersistentStoreFromEnv(env), eula?.sessionId || eulaSessionIdForOnboarding(onboarding.session), {
    acceptedByName: contact.displayName,
    checkboxConfirmed: true,
    ipAddress: '127.0.0.1',
    userAgent: 'verify-welcome-after-intake',
  });
  const appUrl = `/?app=1&session=${encodeURIComponent(onboarding.token)}`;
  const opened = await callHandler(appHandler.default, jsonRequest('GET', appUrl, null, { host: 'vacation-staging.timesyncher.com' }));
  const turns = opened.body?.turns || [];
  const welcomeShown = opened.body?.ok === true && collaboratorWelcomeMarker() && welcomeBeforeCustomer(turns);
  let screenshot = '';
  let pageShown = false;
  if (shotDir) {
    const pageUrl = vacationAppLink(onboarding.token, { ...env, TIMESYNCHER_SITE_BASE_URL: env.TIMESYNCHER_SITE_BASE_URL || 'https://vacation-staging.timesyncher.com' });
    const shot = await screenshotApp(pageUrl, shotDir);
    screenshot = shot.file;
    pageShown = shot.shown === true;
  }
  return {
    ok: welcomeShown && pageShown,
    welcomeShown,
    pageShown,
    screenshot,
    tripId: onboarding.tripId,
    requestId: intake.body.requestId,
    turns: turns.length,
  };
}

export function selfTestMissingWelcomeDatabase() {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const child = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: root, env, encoding: 'utf8' });
  const output = `${child.stdout || ''}${child.stderr || ''}`;
  if (child.status === 0 || !output.includes(WELCOME_DATABASE_MISSING)) {
    throw new Error(`welcome-after-intake missing-env self-test failed status=${child.status} output=${output}`);
  }
  return output;
}

async function main() {
  if (process.argv.includes('--self-test-missing-env')) {
    selfTestMissingWelcomeDatabase();
    process.stdout.write('welcome-after-intake missing-env self-test passed\n');
    return;
  }
  const outDir = path.resolve(path.join(root, '.cursor/skills/verify-timesyncher-vacation/output/verify'));
  try {
    const result = await runWelcomeAfterIntake({ shotDir: outDir });
    if (!result.ok) {
      process.stderr.write(`${WELCOME_MISSING}\n`);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.exit(error.exitCode || 1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  main();
}
