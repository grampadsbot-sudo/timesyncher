#!/usr/bin/env node
/**
 * Welcome after a real create-vacation intake.
 * Uses DATABASE_URL when it is set. Otherwise loads the staging project value
 * with VERCEL_TOKEN into process.env for this process only. A missing token,
 * failed fetch, or empty value is a failure, not a skip, pass, or gap.
 * The loaded value is never printed, logged, or written to disk.
 */
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onboardingOpenerFacts, upsellFactsForTurn } from '../../../../src/vacation/live-app-turn.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const STAGING_DATABASE_ENV_URL = 'https://api.vercel.com/v1/projects/timesyncher-vacation-staging/env/A9IvKmyFpAfVBLQx?decrypt=true';
export const WELCOME_VERCEL_TOKEN_MISSING = 'FAIL welcome-after-intake: VERCEL_TOKEN missing';
export const WELCOME_DATABASE_FETCH_FAILED = 'FAIL welcome-after-intake: staging DATABASE_URL fetch failed';
export const WELCOME_DATABASE_EMPTY = 'FAIL welcome-after-intake: staging DATABASE_URL empty';
export const WELCOME_MISSING = 'FAIL welcome-after-intake: welcome missing';
const scriptPath = fileURLToPath(import.meta.url);

function fail(message) {
  const error = new Error(message);
  error.exitCode = 1;
  return error;
}

export function redactWelcomeSecrets(text, secret = process.env.DATABASE_URL) {
  let out = String(text ?? '');
  const value = String(secret || '');
  if (value) {
    out = out.split(value).join('[redacted]');
    const encoded = encodeURIComponent(value);
    if (encoded && encoded !== value) out = out.split(encoded).join('[redacted]');
  }
  return out.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function redactWelcomeError(error) {
  const message = redactWelcomeSecrets(error?.message || WELCOME_DATABASE_FETCH_FAILED);
  const wrapped = new Error(message);
  wrapped.exitCode = error?.exitCode || 1;
  const stack = redactWelcomeSecrets(error?.stack || '');
  if (stack) wrapped.stack = stack;
  return wrapped;
}

export async function ensureWelcomeDatabase({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (String(env.DATABASE_URL || '').trim()) return;
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) throw fail(WELCOME_VERCEL_TOKEN_MISSING);
  let response;
  try {
    response = await fetchImpl(STAGING_DATABASE_ENV_URL, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw fail(WELCOME_DATABASE_FETCH_FAILED);
  }
  if (!response || response.ok !== true) {
    const status = Number(response?.status);
    const suffix = Number.isInteger(status) && status > 0 ? ` (HTTP ${status})` : '';
    throw fail(`${WELCOME_DATABASE_FETCH_FAILED}${suffix}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw fail(WELCOME_DATABASE_FETCH_FAILED);
  }
  const value = typeof payload?.value === 'string' ? payload.value.trim() : '';
  if (payload?.key !== 'DATABASE_URL' || !value) {
    throw fail(payload?.key === 'DATABASE_URL' ? WELCOME_DATABASE_EMPTY : WELCOME_DATABASE_FETCH_FAILED);
  }
  process.env.DATABASE_URL = value;
  if (env !== process.env) env.DATABASE_URL = value;
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
  try {
    return await runWelcomeAfterIntakeUnchecked({ env, shotDir });
  } catch (error) {
    throw redactWelcomeError(error);
  }
}

async function runWelcomeAfterIntakeUnchecked({ env, shotDir }) {
  await ensureWelcomeDatabase({ env });
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
    const intakeError = redactWelcomeSecrets(typeof intake.body?.error === 'string' ? intake.body.error : intake.status);
    throw Object.assign(new Error(`FAIL welcome-after-intake: create-vacation intake did not finish (${intakeError})`), { exitCode: 1 });
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
  delete env.NEON_DATABASE_URL;
  delete env.VERCEL_TOKEN;
  const child = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: root, env, encoding: 'utf8' });
  const output = `${child.stdout || ''}${child.stderr || ''}`;
  if (/postgres(?:ql)?:\/\//i.test(output) || /Bearer\s+\S+/.test(output)) {
    throw new Error('welcome-after-intake missing-env self-test leaked a secret');
  }
  if (child.status === 0 || !output.includes(WELCOME_VERCEL_TOKEN_MISSING)) {
    throw new Error(`welcome-after-intake missing-env self-test failed status=${child.status}`);
  }
}

function writeRedacted(stream, text) {
  stream.write(`${redactWelcomeSecrets(text)}`);
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
    const line = `${redactWelcomeSecrets(JSON.stringify(result))}\n`;
    if (!result.ok) {
      writeRedacted(process.stderr, `${WELCOME_MISSING}\n`);
      writeRedacted(process.stdout, line);
      process.exit(1);
    }
    writeRedacted(process.stdout, line);
  } catch (error) {
    writeRedacted(process.stderr, `${error?.message || WELCOME_DATABASE_FETCH_FAILED}\n`);
    process.exit(error?.exitCode || 1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  main();
}
