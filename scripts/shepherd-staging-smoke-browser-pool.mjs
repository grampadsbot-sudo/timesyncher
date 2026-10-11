/** Cap concurrent Puppeteer pages on the shared smoke browser. */

let activePages = 0;
const waiters = [];

function releasePageSlot() {
  activePages = Math.max(0, activePages - 1);
  const next = waiters.shift();
  if (next) next();
}

function acquirePageSlot(maxConcurrent = 3) {
  if (activePages < maxConcurrent) {
    activePages += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      activePages += 1;
      resolve();
    });
  });
}

/**
 * @param {import('puppeteer-core').Browser} browser
 * @param {(page: import('puppeteer-core').Page) => Promise<T>} fn
 * @param {{ maxConcurrent?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withBrowserPageSlot(browser, fn, opts = {}) {
  const maxConcurrent = opts.maxConcurrent ?? 3;
  await acquirePageSlot(maxConcurrent);
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch((closeErr) => {
      void closeErr;
    });
    releasePageSlot();
  }
}

export async function withConnectionClosedRetry(fn, { retries = 1 } = {}) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message || err);
    if (retries > 0 && /connection closed/i.test(msg)) {
      return withConnectionClosedRetry(fn, { retries: retries - 1 });
    }
    throw err;
  }
}

export async function waitForSelector(page, selector, timeoutMs = 120000) {
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs, visible: true });
  } catch (err) {
    const wrapped = new Error(`waitForSelector ${selector}: ${err?.message || err}`);
    wrapped.selector = selector;
    wrapped.cause = err;
    throw wrapped;
  }
}
