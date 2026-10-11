import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '0123456789abcdef0123456789abcdef01234567',
      },
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`))));
  });
}

async function checkBuildStamp(page, pageName) {
  return page.evaluate((name) => {
    const footer = document.querySelector('footer[data-build-stamp="1"]');
    if (!footer) return { ok: false, reason: 'missing footer' };
    const stampText = (footer.textContent || '').trim();
    if (footer.getAttribute('data-build-stamp') !== '1' || stampText.length < 7) {
      return { ok: false, reason: 'stamp text or attribute missing', stampText };
    }
    const style = window.getComputedStyle(footer);
    const rect = footer.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const visibleInViewport = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.bottom > 0
      && rect.top < vh
      && rect.right > 0
      && rect.left < vw;

    if (name === 'vacation-app.html') {
      const appShell = document.querySelector('main.app');
      const domOnlyHidden = style.visibility === 'hidden' || footer.getClientRects().length === 0;
      return {
        ok: Boolean(appShell) && domOnlyHidden && stampText.length >= 7,
        mode: 'dom-stamp-hidden',
        stampText,
        domOnlyHidden,
        visibleInViewport,
      };
    }

    return {
      ok: visibleInViewport,
      mode: 'viewport-visible',
      stampText,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      viewport: { w: vw, h: vh },
    };
  }, pageName);
}

await build();

const pages = ['index.html', 'terms.html', 'vacation-app.html'];
const viewports = [
  { width: 1280, height: 800, label: '1280x800' },
  { width: 390, height: 844, label: '390x844' },
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  let filePath = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
  if (!filePath.startsWith(dist)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  try {
    const body = await readFile(filePath);
    const type = filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('content-type', type);
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    for (const name of pages) {
      await page.goto(`http://127.0.0.1:${port}/${name}`, { waitUntil: 'domcontentloaded' });
      if (name === 'vacation-app.html') {
        await page.waitForSelector('main.app', { timeout: 20000 });
      }
      const check = await checkBuildStamp(page, name);
      assert.equal(check.ok, true, `${name} @ ${viewport.label}: ${JSON.stringify(check)}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('build stamp viewport passed');
