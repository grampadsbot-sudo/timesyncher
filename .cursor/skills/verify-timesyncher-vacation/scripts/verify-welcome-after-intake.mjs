#!/usr/bin/env node
/**
 * Onboarding welcome verify against staging.
 * Signs up a fresh customer, agrees, captures the welcome, then sends three
 * fresh-trip fixtures. Shape alone is not a pass.
 * DATABASE_URL is used when set. Otherwise the staging project value is loaded
 * with VERCEL_TOKEN into process.env for this process only. The value is never
 * printed, logged, or written to disk.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyJudgeGrade,
  countRealVacations,
  collaboratorOwnFirstMessage,
  collaboratorWelcomeTurn,
  domBuildShaFromHtml,
  generateOnboardingFixtures,
  gradeJudgeRaw,
  normalizeBuildSha,
  onboardingBars,
  onboardingVerdict,
  precheckOnboardingRun,
  renderJudgePacketMarkdown,
  sharedTripApiUrl,
  stampBuildSha,
  tripSiteLooksExpired,
  turnText,
} from './onboarding-welcome-precheck.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const STAGING = 'https://vacation-staging.timesyncher.com';
const STAGING_DATABASE_ENV_URL = 'https://api.vercel.com/v1/projects/timesyncher-vacation-staging/env/A9IvKmyFpAfVBLQx?decrypt=true';
const STAGING_COLLAB_PRICE_ENV_URL = 'https://api.vercel.com/v1/projects/timesyncher-vacation-staging/env/wxF011VOpOXjWFqi?decrypt=true';
const DEFAULT_ARTIFACTS = '/opt/cursor/artifacts/onboarding-welcome-judge';
export const WELCOME_VERCEL_TOKEN_MISSING = 'FAIL welcome-after-intake: VERCEL_TOKEN missing';
export const WELCOME_DATABASE_FETCH_FAILED = 'FAIL welcome-after-intake: staging DATABASE_URL fetch failed';
export const WELCOME_DATABASE_EMPTY = 'FAIL welcome-after-intake: staging DATABASE_URL empty';
export const WELCOME_VERIFY_FAILED = 'FAIL welcome-after-intake: onboarding welcome not graded pass';
export const WELCOME_ONBOARDING_TIMEOUT = 'FAIL welcome-after-intake: onboarding chat did not open';
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

export async function ensureCollaboratorPrice({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (String(env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS || '').trim()) return;
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) return;
  let response;
  try {
    response = await fetchImpl(STAGING_COLLAB_PRICE_ENV_URL, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return;
  }
  if (!response || response.ok !== true) return;
  let payload;
  try {
    payload = await response.json();
  } catch {
    return;
  }
  const value = typeof payload?.value === 'string' ? payload.value.trim() : '';
  if (payload?.key !== 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS' || !value) return;
  process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = value;
  if (env !== process.env) env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = value;
}

function staticFail(error, message) {
  if (String(error?.message || '').startsWith('FAIL welcome-after-intake:')) throw error;
  throw fail(message);
}

export function welcomeShownFromBubbles(bubbles) {
  const list = Array.isArray(bubbles) ? bubbles : [];
  const firstUser = list.findIndex((bubble) => bubble.user === true);
  const prior = firstUser < 0 ? list : list.slice(0, firstUser);
  return prior.some((bubble) => bubble.user !== true && String(bubble.text || '').trim().length > 0);
}

export function priorWelcomeTexts(bubbles) {
  const list = Array.isArray(bubbles) ? bubbles : [];
  const firstUser = list.findIndex((bubble) => bubble.user === true);
  const prior = firstUser < 0 ? list : list.slice(0, firstUser);
  return prior
    .filter((bubble) => bubble.user !== true)
    .map((bubble) => String(bubble.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function welcomeTextSettled(text, { typing = false } = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return typing !== true && value.length >= 40 && /[.!?]["']?$/.test(value);
}

export async function agreeThenReadWelcome(driver, { name = 'Verify', timeoutMs = 90000 } = {}) {
  try {
    await driver.fill('#eulaName', name);
  } catch (error) {
    staticFail(error, 'FAIL welcome-after-intake: terms name missing');
  }
  try {
    await driver.check('#eulaAgree');
    await driver.click('#eulaAgreeButton');
  } catch (error) {
    staticFail(error, 'FAIL welcome-after-intake: terms agree missing');
  }
  try {
    const opened = await driver.waitFor('#messages[data-screen="onboarding"]', timeoutMs);
    if (opened === false) throw new Error('not open');
  } catch (error) {
    staticFail(error, WELCOME_ONBOARDING_TIMEOUT);
  }
  return driver.readWelcome();
}

function pageWelcomeDriver(page) {
  return {
    async fill(selector, value) {
      await page.waitForSelector(selector, { timeout: 20000 });
      await page.$eval(selector, (input, next) => {
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    },
    async check(selector) {
      await page.waitForSelector(selector, { timeout: 20000 });
      await page.$eval(selector, (box) => {
        box.checked = true;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
    async click(selector) {
      await page.waitForSelector(selector, { timeout: 20000 });
      await page.click(selector);
    },
    async waitFor(selector, timeoutMs) {
      await page.waitForSelector(selector, { timeout: timeoutMs });
      return true;
    },
    async readWelcome() {
      const snapshot = () => page.evaluate(() => {
        const root = document.querySelector('#messages[data-screen="onboarding"]');
        if (!root) return { shown: false, prior: [], lastApp: '', typing: false, appCount: 0 };
        const bubbles = [...root.querySelectorAll('article.bubble')].filter((node) => node.id !== 'tsTyping').map((node) => {
          const label = node.querySelector('small')?.textContent || '';
          const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
          const text = label ? raw.replace(label, '').replace(/\s+/g, ' ').trim() : raw;
          return { user: node.classList.contains('user'), text };
        });
        const firstUser = bubbles.findIndex((bubble) => bubble.user === true);
        const prior = firstUser < 0 ? bubbles : bubbles.slice(0, firstUser);
        const texts = prior.filter((bubble) => bubble.user !== true).map((bubble) => bubble.text).filter(Boolean);
        const appTexts = bubbles.filter((bubble) => bubble.user !== true).map((bubble) => bubble.text).filter(Boolean);
        return {
          shown: texts.length > 0,
          prior: texts,
          lastApp: appTexts.at(-1) || '',
          typing: Boolean(root.querySelector('#tsTyping')),
          appCount: appTexts.length,
          hasUser: firstUser >= 0,
        };
      });
      const initial = await snapshot();
      const started = Date.now();
      let previous = initial.hasUser ? initial.lastApp : initial.prior.join('\n');
      let stable = 0;
      let sawTyping = initial.typing === true;
      let latest = initial;
      while (Date.now() - started < 50000) {
        latest = await snapshot();
        if (latest.typing) sawTyping = true;
        const candidate = latest.hasUser ? latest.lastApp : latest.prior.join('\n');
        const grew = latest.hasUser
          ? (latest.appCount > initial.appCount || latest.lastApp.length > initial.lastApp.length)
          : candidate.length > 0;
        const settled = grew && candidate === previous && welcomeTextSettled(candidate, { typing: latest.typing });
        if (settled) {
          stable += 1;
          if (stable >= 2) break;
        } else {
          stable = 0;
        }
        previous = candidate;
        const quiet = !latest.hasUser ? false : (!sawTyping && !grew && Date.now() - started > 12000);
        if (quiet && welcomeTextSettled(candidate, { typing: false })) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      return { shown: latest.shown || latest.prior.length > 0, prior: latest.prior };
    },
  };
}

async function launchBrowser() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    const { createRequire } = await import('node:module');
    puppeteer = createRequire(import.meta.url)('/tmp/pptr/node_modules/puppeteer-core');
  }
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

function bypassHeaders(env) {
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET || env.VERCEL_PROTECTION_BYPASS;
  if (!bypass) return null;
  return {
    'x-vercel-protection-bypass': bypass,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

const BUILD_HEADER_NAMES = [
  'x-timesyncher-build',
  'x-timesyncher-sha',
  'x-git-sha',
  'x-commit-sha',
  'x-vercel-git-commit-sha',
];

function headerSha(response) {
  const found = [];
  let sha = '';
  for (const name of BUILD_HEADER_NAMES) {
    const value = response?.headers?.get?.(name) || '';
    if (!value) continue;
    found.push(name);
    if (!sha) sha = normalizeBuildSha(value);
  }
  return { found, sha };
}

export async function readBuildStamp({ env = process.env, fetchImpl = globalThis.fetch, origin = STAGING } = {}) {
  const headers = { accept: 'application/json' };
  const bypass = bypassHeaders(env);
  if (bypass) headers['x-vercel-protection-bypass'] = bypass['x-vercel-protection-bypass'];
  const targets = [
    { kind: 'endpoint', url: `${origin}/api/version` },
    { kind: 'document', url: `${origin}/vacation-app.html` },
    { kind: 'document', url: `${origin}/` },
    { kind: 'document', url: `${origin}/shared/` },
  ];
  const checked = [];
  for (const target of targets) {
    const row = {
      target: target.url,
      kind: target.kind,
      status: null,
      sha: '',
      headers: [],
      meta: [],
    };
    try {
      const response = await fetchImpl(target.url, {
        headers: { ...headers, accept: target.kind === 'endpoint' ? 'application/json' : 'text/html' },
        redirect: 'follow',
      });
      row.status = response?.status ?? null;
      const fromHeaders = headerSha(response);
      row.headers = fromHeaders.found;
      row.sha = fromHeaders.sha;
      if (target.kind === 'endpoint') {
        const payload = await response.json().catch(() => null);
        const sha = normalizeBuildSha(payload?.sha || payload?.gitSha || payload?.commit);
        row.bodyField = payload && typeof payload === 'object' && ('sha' in payload || 'gitSha' in payload || 'commit' in payload) ? 'sha' : '';
        if (sha) row.sha = sha;
      } else {
        const html = typeof response?.text === 'function' ? await response.text() : '';
        const metas = [...String(html).matchAll(/<meta\s+[^>]*>/gi)].map((match) => match[0]);
        row.meta = metas.filter((tag) => /timesyncher-build|data-build-sha|sha|commit|version|build/i.test(tag)).slice(0, 8);
        row.domSha = domBuildShaFromHtml(html);
        if (!row.sha) row.sha = row.domSha;
      }
    } catch {
      row.error = 'request failed';
    }
    checked.push(row);
  }
  return stampBuildSha({ checked, checkedAt: new Date().toISOString() });
}

async function waitForEulaAccept(page) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(new Date().toISOString()), 20000);
    const onResponse = (response) => {
      const url = response.url();
      if (response.request().method() !== 'POST' || !url.includes('/api/eula')) return;
      clearTimeout(timer);
      page.off('response', onResponse);
      resolve(new Date().toISOString());
    };
    page.on('response', onResponse);
  });
}

async function openSession(browser, url, env) {
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(90000);
  await page.setViewport({ width: 1280, height: 900 });
  const headers = bypassHeaders(env);
  if (headers) await page.setExtraHTTPHeaders(headers);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return page;
}

async function readSession(page, token) {
  return page.evaluate(async (session) => {
    const res = await fetch(`/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  }, token);
}

function normalizeTurns(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const speaker = row.speaker || 'customer';
    let at = row.at || row.received_at || row.sent_at || row.created_at || null;
    if (at instanceof Date) at = at.toISOString();
    return {
      speaker,
      text: turnText(row),
      at: at ? String(at) : null,
      direction: row.direction || '',
    };
  });
}

function withObservedWelcome(turns, domPrior, welcomeWall, submittedWall, fixtureText) {
  const list = normalizeTurns(turns);
  const customer = list.find((turn) => turn.speaker === 'customer' || turn.speaker === 'user');
  if (customer && !customer.at) customer.at = submittedWall;
  const timing = list.find((turn) => turn.speaker === 'app' && turn.text);
  const customerIndex = list.findIndex((turn) => turn.speaker === 'customer' || turn.speaker === 'user');
  const appBefore = customerIndex < 0
    ? timing
    : list.slice(0, customerIndex).find((turn) => turn.speaker === 'app' && turn.text);
  const domText = (domPrior || []).map((line) => String(line || '').trim()).filter(Boolean).join('\n');
  if (!appBefore && domText) {
    list.unshift({ speaker: 'app', text: domText, at: welcomeWall, direction: 'outbound' });
  } else if (appBefore && !appBefore.at) {
    appBefore.at = welcomeWall;
  }
  if (fixtureText && !list.some((turn) => turn.speaker === 'customer' || turn.speaker === 'user')) {
    list.push({ speaker: 'customer', text: fixtureText, at: submittedWall, direction: 'inbound' });
  }
  return list;
}

async function submitTurn(page, { token, tripId, text, voice }) {
  return page.evaluate(async ({ token: session, tripId: id, text: message, voice: voiceMode }) => {
    const send = async (body) => {
      const res = await fetch(`/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data.ok !== false, status: res.status, data };
    };
    const first = await send({
      tripId: id,
      text: message,
      attachments: [],
      voiceMode: voiceMode === true,
      browserTranscription: voiceMode === true,
    });
    if (!first.ok || first.data?.status !== 'interim') return first;
    return send({ action: 'finish-rewrite', tripId: id });
  }, { token, tripId, text, voice });
}

async function shot(page, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

async function shotLatest(page, file) {
  await page.setViewport({ width: 1280, height: 1400 });
  await page.evaluate(() => {
    const nodes = document.querySelectorAll('#messages article.bubble');
    nodes[nodes.length - 1]?.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  return shot(page, file);
}

async function createFreshTrip(env, owner, title) {
  const [{ sql }, { buildOnboardingFromCoupon }] = await Promise.all([
    import('../../../../src/vacation/db.mjs'),
    import('../../../../src/vacation/onboarding.mjs'),
  ]);
  const stagingEnv = { ...env, TIMESYNCHER_SITE_BASE_URL: STAGING, DATABASE_URL: env.DATABASE_URL || process.env.DATABASE_URL };
  return buildOnboardingFromCoupon({
    db: sql(stagingEnv),
    contact: owner,
    plan: 'single',
    metadata: { trip_title: title, source: 'verify-onboarding-welcome' },
    env: stagingEnv,
  });
}

async function driveOwnerTrip(browser, env, owner, spec, artifactsDir) {
  const onboarding = await createFreshTrip(env, owner, spec.title);
  const page = await openSession(browser, onboarding.vacationAppUrl, env);
  const welcomeFile = path.join(artifactsDir, `${spec.id}-welcome.png`);
  const replyFile = path.join(artifactsDir, `${spec.id}-reply.png`);
  try {
    await page.waitForSelector('#eulaScreen', { timeout: 30000 });
    const eulaAccepting = waitForEulaAccept(page);
    const domWelcome = await agreeThenReadWelcome(pageWelcomeDriver(page), { name: owner.displayName });
    const welcomeShown = domWelcome?.shown === true;
    const eulaAcceptedAt = await eulaAccepting;
    const welcomeWall = new Date().toISOString();
    await shot(page, welcomeFile);
    const opened = await readSession(page, onboarding.token);
    const tripId = opened.data?.session?.currentTripId || onboarding.tripId;
    const submittedWall = new Date().toISOString();
    const posted = await submitTurn(page, {
      token: onboarding.token,
      tripId,
      text: spec.text,
      voice: spec.voice === true,
    });
    const after = await readSession(page, onboarding.token);
    const turns = withObservedWelcome(after.data?.turns, domWelcome?.prior, welcomeWall, submittedWall, spec.text);
    const replyText = String(posted?.data?.reply || '').trim();
    const customerIndex = turns.findIndex((turn) => turn.speaker === 'customer' || turn.speaker === 'user');
    const hasReply = customerIndex >= 0 && turns.slice(customerIndex + 1).some((turn) => turn.speaker === 'app' && turn.text);
    if (replyText && !hasReply) {
      turns.push({ speaker: 'app', text: replyText, at: new Date().toISOString(), direction: 'outbound' });
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForSelector('#messages[data-screen="onboarding"]', { timeout: 20000 }).catch(() => {});
    await shotLatest(page, replyFile);
    const domBuilds = await readPageDomShas(page);
    return {
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      tripId: onboarding.tripId,
      customerId: onboarding.customerId,
      turns,
      postedOk: posted?.ok === true,
      postedStatus: posted?.status || null,
      postedError: posted?.ok === false ? redactWelcomeSecrets(posted?.data?.error || '') : '',
      screenshots: [welcomeFile, replyFile],
      observedWelcomeWall: welcomeWall,
      submittedWall,
      eulaAcceptedAt,
      publicUrl: onboarding.publicUrl || '',
      welcomeShown,
      domBuilds,
    };
  } catch (error) {
    const failure = path.join(artifactsDir, `${spec.id}-failure.png`);
    await shot(page, failure).catch(() => {});
    return {
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      tripId: onboarding.tripId,
      customerId: onboarding.customerId,
      turns: [],
      postedOk: false,
      postedError: redactWelcomeSecrets(error?.message || error),
      screenshots: [failure],
      publicUrl: onboarding.publicUrl || '',
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function readOpenDropdown(page) {
  const frames = page.frames();
  for (const frame of frames) {
    const area = await frame.evaluate(() => {
      const select = [...document.querySelectorAll('select')].find((node) => /^area\b/i.test((node.closest('label')?.innerText || '').trim()));
      if (!select) return null;
      const options = [...select.options].map((option) => (option.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      select.size = Math.max(options.length, 1);
      select.focus();
      select.scrollIntoView({ block: 'center' });
      const selected = (select.options[select.selectedIndex]?.textContent || '').replace(/\s+/g, ' ').trim();
      return { selected, options };
    }).catch(() => null);
    if (area) return { opened: true, control: 'area-select', ...area };
  }
  const menu = await page.evaluate(() => {
    const root = document.querySelector('#tripMenu.open .trip-list, .trip-menu.open .trip-list');
    if (!root) return null;
    const options = [...root.querySelectorAll('.trip-option, [role="option"]')].map((node) => (node.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const selectedNode = root.querySelector('[aria-selected="true"]');
    const selected = selectedNode ? (selectedNode.innerText || '').replace(/\s+/g, ' ').trim() : '';
    return { selected, options };
  }).catch(() => null);
  if (menu) return { opened: true, control: 'trip-menu', ...menu };
  return { opened: false, control: '', selected: '', options: [] };
}

async function clickOpenSelector(page) {
  const clickedChrome = await page.evaluate(() => {
    const button = document.querySelector('#tripButton');
    if (!button) return false;
    button.click();
    const menu = document.querySelector('#tripMenu');
    menu?.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    return true;
  }).catch(() => false);
  let clickedSelect = false;
  for (const frame of page.frames()) {
    const did = await frame.evaluate(() => {
      const select = [...document.querySelectorAll('select')].find((node) => /^area\b/i.test((node.closest('label')?.innerText || node.getAttribute('aria-label') || '').trim()));
      if (!select) return false;
      select.focus();
      select.click();
      select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      select.size = Math.max(select.options.length, 2);
      select.scrollIntoView({ block: 'center' });
      return true;
    }).catch(() => false);
    if (did) clickedSelect = true;
  }
  const opened = await readOpenDropdown(page);
  const visibleText = await readSelectorVisibleText(page);
  return {
    ...opened,
    opened: (clickedChrome || clickedSelect) && opened.opened === true,
    visibleText,
  };
}

async function readSelectorVisibleText(page) {
  const parts = [];
  const chrome = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#tripLabel, #tripButton, #tripMenu.open .trip-list, .trip-menu.open .trip-list')];
    return nodes.map((node) => (node.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  }).catch(() => '');
  if (chrome) parts.push(chrome);
  for (const frame of page.frames()) {
    const text = await frame.evaluate(() => {
      const select = [...document.querySelectorAll('select')].find((node) => /^area\b/i.test((node.closest('label')?.innerText || node.getAttribute('aria-label') || '').trim()));
      if (!select) return '';
      return [...select.options].map((option) => (option.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    }).catch(() => '');
    if (text) parts.push(text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function readPageDomShas(page) {
  const rows = [];
  for (const frame of page.frames()) {
    const url = frame.url();
    if (!url || url === 'about:blank') continue;
    const sha = await frame.evaluate(() => {
      const meta = document.querySelector('meta[name="timesyncher-build"]')?.getAttribute('content') || '';
      const data = document.documentElement?.getAttribute('data-build-sha') || '';
      return meta || data || '';
    }).catch(() => '');
    rows.push({ target: url.split('?')[0], sha: normalizeBuildSha(sha) });
  }
  return rows;
}

async function driveNoVacation(browser, env, account, artifactsDir) {
  const onboarding = await createFreshTrip(env, account, account.title);
  const page = await openSession(browser, onboarding.vacationAppUrl, env);
  const file = path.join(artifactsDir, 'no-vacations-dropdown.png');
  try {
    await page.waitForSelector('#eulaScreen', { timeout: 30000 });
    const eulaAccepting = waitForEulaAccept(page);
    await agreeThenReadWelcome(pageWelcomeDriver(page), { name: account.displayName });
    const eulaAcceptedAt = await eulaAccepting;
    const opened = await readSession(page, onboarding.token);
    const vacations = opened.data?.vacations || [];
    await page.waitForSelector('iframe, #tripButton, #tripLabel', { timeout: 15000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const label = await page.$eval('#tripLabel, #tripButton', (node) => (node.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
    await page.$eval('#tripLabel, #tripButton', (node) => node.scrollIntoView({ block: 'center' })).catch(() => {});
    let observation = await clickOpenSelector(page);
    const domBuilds = await readPageDomShas(page);
    await shot(page, file);
    if (!observation.opened && onboarding.publicUrl) {
      await page.goto(onboarding.publicUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 800));
      const again = await clickOpenSelector(page);
      domBuilds.push(...await readPageDomShas(page));
      if (again.opened || again.visibleText) observation = again;
      await shot(page, file);
    }
    return {
      vacationCount: countRealVacations(vacations),
      opened: observation.opened === true,
      control: observation.control || '',
      selected: observation.selected || '',
      options: observation.options || [],
      visibleText: observation.visibleText || '',
      screenshot: file,
      eulaAcceptedAt,
      label,
      publicUrl: onboarding.publicUrl || '',
      shellCount: Array.isArray(vacations) ? vacations.length : 0,
      domBuilds,
    };
  } catch (error) {
    await shot(page, file).catch(() => {});
    return {
      vacationCount: null,
      opened: false,
      control: '',
      selected: '',
      options: [],
      screenshot: file,
      eulaAcceptedAt: null,
      error: redactWelcomeSecrets(error?.message || error),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function driveCollaborator(browser, env, fixture, ownerTrip, artifactsDir) {
  if (!ownerTrip?.customerId || !ownerTrip?.tripId) {
    return { error: 'owner trip missing', turns: [], screenshots: [] };
  }
  if (!env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS && !process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS) {
    return { error: 'collaborator price config unset', turns: [], screenshots: [] };
  }
  const [{ sql }, { createCollaboratorInvite }, { joinCollaboratorAppSession }] = await Promise.all([
    import('../../../../src/vacation/db.mjs'),
    import('../../../../src/vacation/collaborators.mjs'),
    import('../../../../src/vacation/collaborator-app-seat.mjs'),
  ]);
  const stagingEnv = { ...env, TIMESYNCHER_SITE_BASE_URL: STAGING, DATABASE_URL: env.DATABASE_URL || process.env.DATABASE_URL };
  const db = sql(stagingEnv);
  const invited = await createCollaboratorInvite(db, {
    ownerCustomerId: ownerTrip.customerId,
    tripId: ownerTrip.tripId,
    planCode: 'telegram_collaborators_single_trip',
    requestedFor: fixture.collaborator.displayName,
    metadata: { email: fixture.collaborator.email, displayName: fixture.collaborator.displayName, channel: 'vacation-app' },
    env: stagingEnv,
  });
  const joined = await joinCollaboratorAppSession(db, {
    invite: invited.invite,
    contact: fixture.collaborator,
    env: stagingEnv,
  });
  const page = await openSession(browser, joined.vacationAppUrl, stagingEnv);
  const file = path.join(artifactsDir, 'collaborator-before-first.png');
  try {
    await page.waitForSelector('#eulaScreen', { timeout: 30000 });
    const eulaAccepting = waitForEulaAccept(page);
    const domWelcome = await agreeThenReadWelcome(pageWelcomeDriver(page), { name: fixture.collaborator.displayName }).catch((error) => {
      if (String(error?.message || '') !== WELCOME_ONBOARDING_TIMEOUT) throw error;
      return { shown: false, prior: [] };
    });
    const eulaAcceptedAt = await eulaAccepting;
    const observedAt = new Date().toISOString();
    await shotLatest(page, file);
    const opened = await readSession(page, joined.token);
    const bubbles = await page.evaluate(() => [...document.querySelectorAll('#messages article.bubble')].filter((node) => node.id !== 'tsTyping').map((node) => {
      const label = (node.querySelector('small')?.textContent || '').replace(/\s+/g, ' ').trim();
      const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const text = label ? raw.replace(label, '').replace(/\s+/g, ' ').trim() : raw;
      return { label, text, user: node.classList.contains('user') };
    }).filter((row) => row.text));
    const turns = withObservedWelcome(opened.data?.turns, domWelcome?.prior, observedAt, null, '');
    const domBuilds = await readPageDomShas(page);
    return {
      error: '',
      turns,
      bubbles,
      domBuilds,
      screenshots: [file],
      observedAt,
      eulaAcceptedAt,
      firstMessageSent: false,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function shippedTemplateSources() {
  const files = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(mjs|js|html)$/.test(entry.name)) files.push(full);
    }
  }
  await walk(path.join(root, 'src/vacation'));
  await walk(path.join(root, 'routes'));
  for (const file of ['vacation-app.html', 'scripts/vacation-app-reply-rules.mjs']) {
    files.push(path.join(root, file));
  }
  const sources = [];
  for (const file of files) {
    try {
      sources.push({ file: path.relative(root, file), text: await readFile(file, 'utf8') });
    } catch {
      /* missing optional file */
    }
  }
  return sources;
}

function collaboratorStamp(collaborator, ownerTurns) {
  const welcome = collaboratorWelcomeTurn(collaborator);
  const customer = collaboratorOwnFirstMessage(collaborator, ownerTurns);
  const welcomeAt = welcome?.at || null;
  const firstCustomerAt = customer?.at || null;
  const welcomeMs = Date.parse(welcomeAt || '');
  const customerMs = Date.parse(firstCustomerAt || '');
  return {
    id: 'collaborator',
    welcomeAt,
    firstCustomerAt,
    eulaAcceptedAt: collaborator?.eulaAcceptedAt || null,
    welcomeBeforeCustomer: Boolean(turnText(welcome)) && (!customer || (Number.isFinite(welcomeMs) && Number.isFinite(customerMs) && welcomeMs < customerMs)),
  };
}

function timestampRows(trips) {
  return (trips || []).map((trip) => {
    const welcome = (trip.turns || []).find((turn) => turn.speaker === 'app' && turn.text);
    const customer = (trip.turns || []).find((turn) => turn.speaker === 'customer' || turn.speaker === 'user');
    const welcomeAt = welcome?.at || null;
    const firstCustomerAt = customer?.at || null;
    const welcomeMs = Date.parse(welcomeAt || '');
    const customerMs = Date.parse(firstCustomerAt || '');
    return {
      id: trip.id,
      welcomeAt,
      firstCustomerAt,
      eulaAcceptedAt: trip.eulaAcceptedAt || null,
      welcomeBeforeCustomer: Number.isFinite(welcomeMs) && Number.isFinite(customerMs) && welcomeMs < customerMs,
    };
  });
}

function includesAncestor(sha, ancestor) {
  if (!normalizeBuildSha(sha)) return null;
  const seen = spawnSync('git', ['cat-file', '-t', sha], { cwd: root, encoding: 'utf8' });
  if (seen.status !== 0) {
    spawnSync('git', ['fetch', 'origin', sha, '--depth=40'], { cwd: root, encoding: 'utf8' });
  }
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, sha], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  return null;
}

function newRunId() {
  return `welcome-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function judgeRawDocument({ runId, buildSha, judge, writtenAt }) {
  return {
    runId: String(runId || ''),
    buildSha: normalizeBuildSha(buildSha),
    writtenAt: writtenAt || new Date().toISOString(),
    judge: judge && typeof judge === 'object' ? judge : { graded: false, source: 'external' },
  };
}

async function writeJudgeRaw(artifactsDir, raw) {
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(path.join(artifactsDir, 'judge-raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
}

async function readJudgeRaw(artifactsDir) {
  try {
    return JSON.parse(await readFile(path.join(artifactsDir, 'judge-raw.json'), 'utf8'));
  } catch {
    return null;
  }
}

function urlsInText(text) {
  return [...String(text || '').matchAll(/https?:\/\/[^\s<>"')]+/g)].map((match) => match[0].replace(/[.,]+$/, ''));
}

async function readResponsePrefix(response, limit = 4000) {
  const stream = response?.body;
  if (!stream || typeof stream.getReader !== 'function') {
    const text = typeof response?.text === 'function' ? await response.text() : '';
    return String(text).slice(0, limit);
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  try {
    while (out.length < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out.slice(0, limit);
}

export async function fetchTripSite(url, env = process.env) {
  const headers = { accept: 'text/html' };
  const bypass = bypassHeaders(env);
  if (bypass) headers['x-vercel-protection-bypass'] = bypass['x-vercel-protection-bypass'];
  try {
    const response = await fetch(url, { headers, redirect: 'follow' });
    const html = await readResponsePrefix(response);
    const apiUrl = sharedTripApiUrl(response?.url || url);
    let apiStatus = null;
    let apiBody = '';
    if (apiUrl) {
      const apiResponse = await fetch(apiUrl, {
        headers: { ...headers, accept: 'application/json' },
        redirect: 'follow',
      });
      apiStatus = Number.isInteger(apiResponse?.status) ? apiResponse.status : null;
      apiBody = await readResponsePrefix(apiResponse);
    }
    const body = [html, apiBody].filter(Boolean).join('\n');
    return { url, status: response?.status ?? null, apiStatus, body };
  } catch {
    return { url, status: null, apiStatus: null, body: '' };
  }
}

function documentBuildPages(stamp) {
  return (stamp?.checked || [])
    .filter((row) => row?.kind === 'document')
    .map((row) => ({ target: row.target, sha: row.domSha || '' }));
}

export function buildJudgePacket({ fixtures, trips, collaborator, precheck, judge, screenshots, build, noVacation, eulaAccepts, runId, runStartedAt, buildPages, tripSites, judgeRaw }) {
  const verdict = onboardingVerdict({ precheck, judge });
  const startSha = build?.start?.sha || 'UNKNOWN';
  return {
    result: verdict.result,
    pass: verdict.pass,
    reason: verdict.reason,
    runId: runId || '',
    runStartedAt: runStartedAt || null,
    staging: STAGING,
    generatedAt: new Date().toISOString(),
    build: {
      ...(build || {}),
      pr97: {
        merge: 'c8bd92b8321dff632da7d4135d8d97ed9bcea708',
        includedAtStart: includesAncestor(startSha, 'c8bd92b8321dff632da7d4135d8d97ed9bcea708'),
        includedAtEnd: includesAncestor(build?.end?.sha, 'c8bd92b8321dff632da7d4135d8d97ed9bcea708'),
      },
    },
    eulaAccepts: eulaAccepts || [],
    buildPages: buildPages || [],
    tripSites: (tripSites || []).map((site) => ({
      url: site.url,
      status: site.status ?? null,
      apiStatus: Number.isInteger(site.apiStatus) ? site.apiStatus : null,
      expired: tripSiteLooksExpired(site.body),
    })),
    judgeRaw: judgeRaw || null,
    noVacation: noVacation || null,
    fixtures,
    requirements: onboardingBars().map((bar) => ({ ...bar, status: 'ungraded' })),
    precheck,
    judge: judge || { graded: false, pass: false, source: 'external' },
    timestamps: [...timestampRows(trips), collaboratorStamp(collaborator, (trips || []).flatMap((trip) => trip.turns || []))],
    trips: (trips || []).map((trip) => ({
      id: trip.id,
      kind: trip.kind,
      title: trip.title,
      tripId: trip.tripId || null,
      turns: trip.turns || [],
      postedOk: trip.postedOk === true,
      postedError: trip.postedError || '',
      observedWelcomeWall: trip.observedWelcomeWall || null,
      submittedWall: trip.submittedWall || null,
    })),
    collaborator: collaborator || { error: 'not captured', turns: [] },
    screenshots: screenshots || [],
  };
}

async function writePacket(artifactsDir, packet) {
  await mkdir(artifactsDir, { recursive: true });
  const json = `${JSON.stringify(packet, null, 2)}\n`;
  const markdown = renderJudgePacketMarkdown(packet);
  await writeFile(path.join(artifactsDir, 'packet.json'), json);
  await writeFile(path.join(artifactsDir, 'packet.md'), markdown);
}

export async function runWelcomeAfterIntake({
  env = process.env,
  shotDir,
  artifactsDir = DEFAULT_ARTIFACTS,
  random = Math.random,
  judge = null,
} = {}) {
  try {
    return await runWelcomeAfterIntakeUnchecked({ env, shotDir, artifactsDir, random, judge });
  } catch (error) {
    throw redactWelcomeError(error);
  }
}

async function runWelcomeAfterIntakeUnchecked({ env, shotDir, artifactsDir, random, judge }) {
  await ensureWelcomeDatabase({ env });
  const fixtures = generateOnboardingFixtures(random);
  const runId = newRunId();
  const runStartedAt = new Date().toISOString();
  await mkdir(artifactsDir, { recursive: true });
  const buildStart = await readBuildStamp({ env });
  await writeJudgeRaw(artifactsDir, judgeRawDocument({
    runId,
    buildSha: buildStart.sha,
    judge,
    writtenAt: new Date().toISOString(),
  }));
  const browser = await launchBrowser().catch((error) => {
    throw fail(`FAIL welcome-after-intake: browser unavailable (${redactWelcomeSecrets(error?.message || error)})`);
  });
  const trips = [];
  let collaborator = { error: 'not captured', turns: [], screenshots: [], userTexts: [] };
  let noVacation = { vacationCount: null, opened: false, selected: '', options: [], eulaAcceptedAt: null };
  try {
    try {
      noVacation = await driveNoVacation(browser, env, fixtures.emptyAccount, artifactsDir);
    } catch (error) {
      noVacation = {
        vacationCount: null,
        opened: false,
        selected: '',
        options: [],
        eulaAcceptedAt: null,
        error: redactWelcomeSecrets(error?.message || error),
      };
    }
    for (const spec of fixtures.trips) {
      try {
        trips.push(await driveOwnerTrip(browser, env, fixtures.owner, spec, artifactsDir));
      } catch (error) {
        trips.push({
          id: spec.id,
          kind: spec.kind,
          title: spec.title,
          turns: [],
          postedOk: false,
          postedError: redactWelcomeSecrets(error?.message || error),
          screenshots: [],
        });
      }
    }
    try {
      await ensureCollaboratorPrice({ env });
      collaborator = await driveCollaborator(browser, env, fixtures, trips.find((trip) => trip.id === 'f1'), artifactsDir);
    } catch (error) {
      collaborator = { error: redactWelcomeSecrets(error?.message || error), turns: [], screenshots: [] };
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const buildEnd = await readBuildStamp({ env });
  const sources = await shippedTemplateSources();
  const ownerTrip = trips.find((trip) => trip.id === 'f1');
  for (const trip of trips) {
    trip.welcomePlaceholders = {
      firstName: fixtures.owner.firstName,
      tripSiteUrl: trip.publicUrl || '',
    };
  }
  collaborator.welcomePlaceholders = {
    collabFirstName: fixtures.collaborator.firstName,
    ownerFirstName: fixtures.owner.firstName,
    tripTitle: ownerTrip?.title || '',
    tripSiteUrl: ownerTrip?.publicUrl || '',
  };
  const eulaAccepts = [
    { id: 'no-vacation', at: noVacation?.eulaAcceptedAt || null },
    ...trips.map((trip) => ({ id: trip.id, at: trip.eulaAcceptedAt || null })),
    { id: 'collaborator', at: collaborator?.eulaAcceptedAt || null },
  ];
  const buildPages = [
    ...documentBuildPages(buildStart),
    ...documentBuildPages(buildEnd),
    ...(noVacation?.domBuilds || []),
    ...trips.flatMap((trip) => trip.domBuilds || []),
    ...(collaborator?.domBuilds || []),
  ];
  const siteUrls = [...new Set([
    ...trips.flatMap((trip) => [trip.publicUrl, ...urlsInText(trip.welcomePlaceholders?.tripSiteUrl), ... (trip.turns || []).flatMap((turn) => urlsInText(turn.text))]),
    ownerTrip?.publicUrl,
    ...urlsInText(collaborator.welcomePlaceholders?.tripSiteUrl),
    ...(collaborator.turns || []).flatMap((turn) => urlsInText(turn.text)),
  ].map((url) => String(url || '').trim()).filter((url) => url.startsWith('http')))];
  const tripSites = [];
  for (const url of siteUrls) tripSites.push(await fetchTripSite(url, env));
  await writeJudgeRaw(artifactsDir, judgeRawDocument({
    runId,
    buildSha: buildStart.sha,
    judge,
    writtenAt: new Date().toISOString(),
  }));
  const judgeRaw = await readJudgeRaw(artifactsDir);
  const precheck = precheckOnboardingRun({
    trips,
    literals: fixtures.literals,
    sources,
    collaborator,
    noVacation,
    eulaAccepts,
    checkDialog: true,
    runId,
    runStartedAt,
    versionSha: buildStart.sha,
    buildPages,
    judgeRaw,
    tripSites,
  });
  const screenshots = [
    noVacation?.screenshot,
    ...trips.flatMap((trip) => trip.screenshots || []),
    ...(collaborator.screenshots || []),
  ].filter(Boolean);
  const packet = buildJudgePacket({
    fixtures,
    trips,
    collaborator,
    precheck,
    judge: judge || { graded: false, pass: false, source: 'external' },
    screenshots,
    build: { start: buildStart, end: buildEnd },
    noVacation,
    eulaAccepts,
    runId,
    runStartedAt,
    buildPages,
    tripSites,
    judgeRaw,
  });
  await writePacket(artifactsDir, packet);
  let screenshot = '';
  const welcomeShot = trips.find((trip) => trip.id === 'f1')?.screenshots?.[0];
  if (shotDir && welcomeShot) {
    screenshot = path.join(shotDir, 'verify-welcome-after-intake.png');
    await mkdir(shotDir, { recursive: true });
    await copyFile(welcomeShot, screenshot);
  }
  return {
    ok: packet.pass === true,
    result: packet.result,
    reason: packet.reason,
    artifactsDir,
    screenshot,
    precheck,
    turns: trips.reduce((sum, trip) => sum + (trip.turns?.length || 0), 0),
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

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

async function main() {
  if (process.argv.includes('--self-test-missing-env')) {
    selfTestMissingWelcomeDatabase();
    process.stdout.write('welcome-after-intake missing-env self-test passed\n');
    return;
  }
  const artifactsDir = path.resolve(argValue('--artifacts') || DEFAULT_ARTIFACTS);
  if (process.argv.includes('--apply-judge')) {
    const grade = JSON.parse(await readFile(argValue('--apply-judge'), 'utf8'));
    const current = JSON.parse(await readFile(path.join(artifactsDir, 'packet.json'), 'utf8'));
    const versionSha = current.build?.start?.sha || '';
    if ((grade?.runId && grade.runId !== current.runId) || (grade?.id && grade.id !== current.runId && !grade.runId) || (grade?.buildSha && normalizeBuildSha(grade.buildSha) !== normalizeBuildSha(versionSha))) {
      throw fail('FAIL welcome-after-intake: judge raw is stale');
    }
    const judgeRaw = judgeRawDocument({
      runId: current.runId,
      buildSha: versionSha,
      judge: grade.judge || grade,
      writtenAt: new Date().toISOString(),
    });
    const stale = gradeJudgeRaw(judgeRaw, {
      runId: current.runId,
      buildSha: versionSha,
      runStartedAt: current.runStartedAt,
    });
    if (!stale.ok) throw fail('FAIL welcome-after-intake: judge raw is stale');
    await writeJudgeRaw(artifactsDir, judgeRaw);
    const packet = applyJudgeGrade({ ...current, judgeRaw }, grade);
    await writePacket(artifactsDir, packet);
    process.stdout.write(`${JSON.stringify({ result: packet.result, reason: packet.reason, artifactsDir })}\n`);
    if (packet.pass !== true) process.exit(1);
    return;
  }
  const outDir = path.resolve(path.join(root, '.cursor/skills/verify-timesyncher-vacation/output/verify'));
  try {
    const result = await runWelcomeAfterIntake({ shotDir: outDir, artifactsDir });
    const line = `${redactWelcomeSecrets(JSON.stringify({ ok: result.ok, result: result.result, reason: result.reason, artifactsDir: result.artifactsDir }))}\n`;
    if (!result.ok) {
      process.stderr.write(`${WELCOME_VERIFY_FAILED}\n`);
      process.stdout.write(line);
      process.exit(1);
    }
    process.stdout.write(line);
  } catch (error) {
    process.stderr.write(`${error?.message || WELCOME_DATABASE_FETCH_FAILED}\n`);
    process.exit(error?.exitCode || 1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  main();
}
