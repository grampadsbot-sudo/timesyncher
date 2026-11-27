import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { STAGING_HARNESS_ORIGIN } from './env.mjs';
import { resolvePlaywright } from './live-outputs.mjs';
import { assertThrowaway, isHarnessTag } from './protected.mjs';
import { saveReviewArtifact, saveReviewResults } from '../../src/vacation/vk-admin-review-storage.mjs';

export function createAdminArtifactWriter({ origin, login, fetchImpl, harnessVacation }) {
  if (origin !== STAGING_HARNESS_ORIGIN) throw new Error('admin artifact uploads require the staging admin host');
  let session;

  function httpError(operation, status) {
    return Object.assign(new Error(`admin artifact ${operation} returned HTTP ${status}`), { operation, status });
  }

  async function signIn() {
    if (!login) throw new Error('VK_ADMIN_LOGIN is required to upload admin artifacts');
    const response = await fetchImpl(new URL('/api/admin/session', origin), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login }), redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw httpError('sign-in', response.status);
    const cookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') || ''];
    const cookie = cookies.find((value) => value.startsWith('vk_admin='))?.split(';')[0];
    if (!cookie) throw new Error('admin artifact sign-in returned no session cookie');
    return cookie;
  }

  return async (tripId, artifact, bytes) => {
    assertThrowaway({ tripId });
    if (harnessVacation && tripId !== harnessVacation.tripId) throw new Error('artifact upload left the harness vacation');
    if (!login && harnessVacation) {
      const { db, tag, openStore } = harnessVacation;
      if (!isHarnessTag(tag)) throw new Error('artifact upload requires a harness tag');
      const [owned] = await db`select id from trips where id = ${tripId} and metadata->>'harnessTag' = ${tag}`;
      if (!owned) throw new Error('artifact upload requires the current harness vacation');
      const saved = artifact === 'review' ? await saveReviewResults(openStore(), tripId, bytes)
        : await saveReviewArtifact(openStore(), tripId, artifact, bytes.toString('base64'));
      if (!saved) throw new Error('invalid admin artifact');
      return;
    }
    const cookie = await (session ??= signIn().catch((error) => {
      session = undefined;
      throw error;
    }));
    const endpoint = new URL(`/api/admin/customers/${encodeURIComponent(tripId)}/artifacts/${artifact}`, origin);
    const response = await fetchImpl(endpoint, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(
        artifact === 'review' || artifact === 'feedback' ? bytes : { data: bytes.toString('base64') },
      ),
      redirect: 'manual', signal: AbortSignal.timeout(30000),
    });
    if (response.status === 401) session = undefined;
    if (!response.ok) throw httpError('put', response.status);
    const saved = await response.json().catch(() => null);
    if (saved?.ok !== true) throw httpError('put', response.status);
  };
}

export async function waitForTurnCapture(page, { turn, text, timeout = 20000 }) {
  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  const expected = normalize(text);
  await page.waitForFunction(() => document.querySelectorAll('#messages article.bubble').length, null, { timeout });
  if (turn === 1) {
    await page.waitForFunction(() => document.querySelectorAll('#messages article.bubble:not(.user)').length, null, { timeout });
  }
  await page.waitForFunction((needle) => {
    const users = document.querySelectorAll('#messages article.bubble.user');
    return [...users].some((bubble) => normalize(bubble.textContent).includes(needle));
  }, expected, { timeout });
  await page.waitForFunction((n) => {
    const users = document.querySelectorAll('#messages article.bubble.user');
    const apps = document.querySelectorAll('#messages article.bubble:not(.user)');
    return users.length >= n && apps.length >= n + 1;
  }, turn, { timeout });
  await page.locator('#messages').evaluate((messages, n) => {
    const users = messages.querySelectorAll('article.bubble.user');
    const target = users[n - 1];
  const apps = messages.querySelectorAll('article.bubble:not(.user)');
    const reply = apps[n] || apps[apps.length - 1];
    if (!target || !reply) {
      messages.scrollTop = messages.scrollHeight;
      return;
    }
    const top = Math.min(target.offsetTop, reply.offsetTop);
    const bottom = Math.max(target.offsetTop + target.offsetHeight, reply.offsetTop + reply.offsetHeight);
    messages.scrollTop = Math.max(0, top - 8);
    if (bottom - messages.scrollTop > messages.clientHeight) messages.scrollTop = Math.max(0, bottom - messages.clientHeight + 8);
  }, turn);
}

export async function shotTurnCapture(page, { turn, text, outFile }) {
  await waitForTurnCapture(page, { turn, text });
  const chatOnly = await page.locator('#workspace.chat-only').count();
  if (chatOnly) return page.locator('.chat-pane').screenshot({ path: outFile });
  const iframe = page.locator('.site-pane iframe');
  if (await iframe.count()) {
    await iframe.first().waitFor({ state: 'attached', timeout: 15000 });
    const frame = await iframe.first().contentFrame();
    if (frame) {
      const title = frame.locator('[data-ts-timeline-title], h1, header h1').first();
      await title.waitFor({ timeout: 12000 }).catch((error) => {
        if (!String(error?.message || error).includes('Timeout')) throw error;
      });
    }
    return page.locator('#workspace').screenshot({ path: outFile });
  }
  return page.locator('.chat-pane').screenshot({ path: outFile });
}

async function openCapturePage() {
  const playwright = resolvePlaywright();
  if (playwright.missing) throw new Error('Playwright is required for first-five-turn captures');
  const browser = await playwright.module.webkit.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    return { page: await context.newPage(), context, close: () => browser.close() };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export function firstFiveTurnCapture({ origin, token, outDir, put, openPage = openCapturePage }) {
  let opened;
  const numbers = new Set();
  const pending = new Map();
  const dir = path.join(outDir, 'first-5-turns');
  async function upload(turn) {
    const { tripId, bytes } = pending.get(turn);
    await put(tripId, `turn-${turn}`, bytes);
    pending.delete(turn);
  }
  return {
    async capture({ tripId, turn, text, webAccessToken }) {
      if (!Number.isInteger(turn) || turn < 1 || turn > 5 || numbers.has(turn)) return false;
      opened ??= await openPage();
      if (webAccessToken && opened.context) {
        await opened.context.addCookies([{ name: 'ts_vacation_web_access', value: webAccessToken, url: origin }]);
      }
      const url = new URL('/vacation-app.html', origin);
      url.search = new URLSearchParams({ session: token, tripId });
      const page = opened.page;
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `turn-${turn}.png`);
      const bytes = await shotTurnCapture(page, { turn, text, outFile: file });
      numbers.add(turn);
      pending.set(turn, { tripId, bytes });
      await upload(turn);
      return true;
    },
    async flush(onResult) {
      for (const turn of pending.keys()) {
        try {
          await upload(turn);
          onResult(turn);
        } catch (error) {
          onResult(turn, error);
        }
      }
    },
    async close() {
      await opened?.close();
    },
  };
}

export async function storeDialogPdf(put, tripId, dialog) {
  return storePdf(put, tripId, 'dialog-pdf', dialog?.ok && dialog.out);
}

export async function storePdf(put, tripId, artifact, file) {
  if (!file) return false;
  await put(tripId, artifact, await readFile(file));
  return true;
}
