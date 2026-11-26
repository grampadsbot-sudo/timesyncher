import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { STAGING_HARNESS_ORIGIN } from './env.mjs';
import { resolvePlaywright } from './live-outputs.mjs';

export function createAdminArtifactWriter({ origin, login, fetchImpl }) {
  if (origin !== STAGING_HARNESS_ORIGIN) throw new Error('admin artifact uploads require the staging admin host');
  let session;

  async function signIn() {
    if (!login) throw new Error('VK_ADMIN_LOGIN is required to upload admin artifacts');
    const response = await fetchImpl(new URL('/api/admin/session', origin), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login }), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const cookies = response.headers.getSetCookie?.() || [];
    const cookie = cookies.find((value) => value.startsWith('vk_admin='))?.split(';')[0];
    if (!response.ok || !cookie) throw new Error(`admin artifact sign-in returned HTTP ${response.status}`);
    return cookie;
  }

  return async (tripId, artifact, bytes) => {
    const cookie = await (session ??= signIn());
    const endpoint = new URL(`/api/admin/customers/${encodeURIComponent(tripId)}/artifacts/${artifact}`, origin);
    const response = await fetchImpl(endpoint, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(artifact === 'review' ? bytes : { data: bytes.toString('base64') }),
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`admin artifact upload returned HTTP ${response.status}`);
  };
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
  const dir = path.join(outDir, 'first-5-turns');
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
      await page.waitForFunction((expected) => {
        const normalize = (value) => value.replace(/\s+/g, ' ').trim();
        const bubbles = document.querySelectorAll('#messages article.bubble.user');
        return bubbles.length && normalize(bubbles[bubbles.length - 1].textContent).includes(normalize(expected));
      }, text, { timeout: 15000 });
      await page.locator('#messages').evaluate((messages) => { messages.scrollTop = messages.scrollHeight; });
      await mkdir(dir, { recursive: true });
      const bytes = await page.screenshot({ path: path.join(dir, `turn-${turn}.png`) });
      numbers.add(turn);
      await put(tripId, `turn-${turn}`, bytes);
      return true;
    },
    async close() {
      await opened?.close();
    },
  };
}

export async function storeDialogPdf(put, tripId, dialog) {
  if (!dialog?.ok || !dialog.out) return false;
  await put(tripId, 'dialog-pdf', await readFile(dialog.out));
  return true;
}
