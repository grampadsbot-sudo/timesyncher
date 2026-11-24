import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { loadPuppeteer, sessions, startServer, viewports } from './layout-shell-harness.mjs';

setTimeout(() => {
  console.error('test_issue_1068_composer_autogrow timeout');
  process.exit(1);
}, 60_000).unref();

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const pwDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(pwDir)) {
    for (const entry of fs.readdirSync(pwDir)) {
      if (!entry.startsWith('chromium-')) continue;
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const found = path.join(pwDir, entry, sub);
        if (fs.existsSync(found)) return found;
      }
    }
  }
  return '';
}

async function runStaticAndUnitChecks() {
  const html = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8') + await readFile(new URL('../public/chat-composer/chat-composer.js', import.meta.url), 'utf8') + await readFile(new URL('../public/chat-composer/chat-composer.css', import.meta.url), 'utf8');
  assert.match(html, /bindComposerAutosize\s*\(\s*\)/);
  assert.match(html, /resizeComposer\s*\(\s*textarea\s*\)/);
  assert.match(html, /resize:\s*none/);
  assert.doesNotMatch(html, /textarea\s*\{[^}]*resize:\s*vertical/);

  const source = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
  const listeners = {};
  const winListeners = {};
  const textarea = {
    id: 'messageText',
    value: '',
    isConnected: true,
    scrollTop: 0,
    clientHeight: 40,
    selectionStart: 0,
    selectionEnd: 0,
    style: { height: '', overflowY: 'hidden' },
    get scrollHeight() {
      const lines = Math.max(1, String(this.value || '').split('\n').length);
      return 20 + lines * 20;
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    focus() {},
    form: { addEventListener(type, fn) { (listeners[`form:${type}`] ||= []).push(fn); } },
  };
  const nodes = {
    messageText: textarea,
    voiceButton: { id: 'voiceButton', hidden: false, classList: { add() {}, remove() {} }, addEventListener() {} },
    composerStatus: { id: 'composerStatus', hidden: true, textContent: '' },
    voiceElapsed: { id: 'voiceElapsed', hidden: true, textContent: '' },
  };
  const sandbox = {
    console,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter((item) => item !== fn);
    },
    getComputedStyle: () => ({ minHeight: '42px', maxHeight: '150px', borderTopWidth: '1px', borderBottomWidth: '1px' }),
    navigator: { userAgent: 'Mozilla/5.0' },
    document: { activeElement: textarea, getElementById: (id) => nodes[id] || null, querySelector: () => null },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  vm.runInContext(await readFile(new URL('../public/chat-composer/chat-composer.js', import.meta.url), 'utf8'), sandbox);

  sandbox.tsChatComposer.bindComposerAutosize();
  assert.equal(textarea.style.height, '42px');
  assert.equal(textarea.style.overflowY, 'hidden');

  textarea.value = 'Line 1\nLine 2\nLine 3';
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
  for (const fn of listeners.input || []) fn();
  assert.equal(textarea.style.height, '82px');
  assert.equal(textarea.style.overflowY, 'hidden');

  textarea.value = Array.from({ length: 12 }, (_, idx) => `Line ${idx + 1}`).join('\n');
  textarea.selectionStart = textarea.value.length;
  textarea.selectionEnd = textarea.value.length;
  for (const fn of listeners.input || []) fn();
  assert.equal(textarea.style.height, '150px');
  assert.equal(textarea.style.overflowY, 'auto');

  textarea.value = '';
  for (const fn of listeners.input || []) fn();
  assert.equal(textarea.style.height, '42px');
  assert.equal(textarea.style.overflowY, 'hidden');

  const voiceRecs = [];
  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      voiceRecs.push(this);
    }
    start() { queueMicrotask(() => this.onstart?.({})); }
    stop() { queueMicrotask(() => this.onend?.({})); }
    say(text) { this.onresult?.({ results: [[{ transcript: text }]] }); }
  }
  sandbox.SpeechRecognition = MockSpeechRecognition;
  sandbox.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [] }) };
  const voiceState = { voiceMode: false, voiceArmed: false };
  const voiceClick = [];
  nodes.voiceButton.addEventListener = (type, fn) => { if (type === 'click') voiceClick.push(fn); };
  sandbox.tsVacationAppChrome.bindVoice(() => voiceState);
  await voiceClick[0]();
  await new Promise((resolve) => queueMicrotask(resolve));
  voiceRecs[0].say('Line 1\nLine 2\nLine 3\nLine 4');
  assert.equal(textarea.style.height, '102px');
  assert.equal(textarea.style.overflowY, 'hidden');
  await voiceClick[0]();
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(voiceState.voiceMode, false);
  assert.equal(textarea.style.height, '102px');
}

async function measureComposer(page) {
  return page.evaluate(() => {
    const ta = document.getElementById('messageText');
    const attach = document.getElementById('attachButton');
    const voice = document.getElementById('voiceButton');
    const send = document.getElementById('sendButton');
    const messages = document.getElementById('messages');
    const composer = document.getElementById('composer');
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const hittable = (el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(hit && (hit === el || el.contains(hit)));
    };
    const cs = getComputedStyle(ta);
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      ta: rect(ta),
      taScrollHeight: ta.scrollHeight,
      taClientHeight: ta.clientHeight,
      taScrollTop: ta.scrollTop,
      taOverflowY: cs.overflowY,
      taResize: cs.resize,
      taHittable: hittable(ta),
      attach: rect(attach),
      attachHittable: hittable(attach),
      voice: rect(voice),
      voiceHittable: hittable(voice),
      send: rect(send),
      sendHittable: hittable(send),
      messages: rect(messages),
      composer: rect(composer),
    };
  });
}

function assertAnchored(snap, baseline, label) {
  assert.ok(snap.docScrollWidth <= snap.vw + 1, `${label}: horizontal overflow ${snap.docScrollWidth} > ${snap.vw}`);
  for (const key of ['attach', 'voice', 'send']) {
    const b = snap[key];
    const base = baseline[key];
    assert.ok(snap[`${key}Hittable`], `${label}: ${key} not hittable`);
    assert.ok(b.left >= -1 && b.right <= snap.vw + 1, `${label}: ${key} off-screen horizontally`);
    assert.ok(b.top >= -1 && b.bottom <= snap.vh + 1, `${label}: ${key} off-screen vertically`);
    assert.ok(Math.abs(b.height - base.height) <= 1.5, `${label}: ${key} height changed ${b.height} vs ${base.height}`);
    assert.ok(Math.abs(b.width - base.width) <= 1.5, `${label}: ${key} width changed ${b.width} vs ${base.width}`);
    assert.ok(Math.abs(b.left - base.left) <= 1.5, `${label}: ${key} drifted horizontally ${b.left} vs ${base.left}`);
    assert.ok(Math.abs(b.bottom - base.bottom) <= 2, `${label}: ${key} bottom shifted ${b.bottom} vs ${base.bottom}`);
    assert.ok(Math.abs(b.bottom - snap.ta.bottom) <= 2, `${label}: ${key} not bottom-aligned with textarea`);
  }
  assert.ok(snap.taHittable, `${label}: textarea not hittable`);
  assert.ok(snap.attach.right <= snap.ta.left + 1, `${label}: attach overlaps textarea`);
  assert.ok(snap.ta.right <= snap.voice.left + 1, `${label}: textarea overlaps voice`);
  assert.ok(snap.voice.right <= snap.send.left + 1, `${label}: voice overlaps send`);
}

async function runBrowserChecks() {
  const executablePath = resolveChromeExecutable();
  assert.ok(executablePath, 'Chrome/Chromium executable not found for composer autogrow browser test');
  const server = await startServer();
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath,
  });
  try {
    for (const viewport of viewports) {
      const stateKeys = viewport.tag === '390' ? ['NONE', 'SITE', 'MANY_SITE'] : ['NONE', 'MANY_SITE'];
      for (const stateKey of stateKeys) {
        const mobile = viewport.tag === '390';
        const page = await browser.newPage();
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          isMobile: mobile,
          hasTouch: mobile,
        });
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const url = request.url();
          if (url.startsWith(server.origin) || url.startsWith('data:')) request.continue();
          else request.abort().catch((error) => { console.error(error); });
        });
        try {
          await page.goto(`${server.origin}/vacation-app.html?session=${sessions[stateKey]}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });
          await page.waitForSelector('#messageText', { timeout: 15_000 });
          const label = `${viewport.tag}-${stateKey}`;

          const initial = await measureComposer(page);
          assert.equal(initial.taResize, 'none', `${label}: resize should be none`);
          assert.ok(initial.ta.height >= 40 && initial.ta.height <= 46, `${label}: initial height ${initial.ta.height}`);
          assert.equal(initial.taOverflowY, 'hidden', `${label}: initial overflowY should be hidden`);
          assertAnchored(initial, initial, `${label}-initial`);

          await page.click('#messageText');
          const wrappedSentence = 'We want a hotel near Central Park with a quiet room, great breakfast nearby, easy subway access to museums, and time to walk across the Brooklyn Bridge before dinner in Tribeca on Friday evening.';
          await page.evaluate((text) => {
            const ta = document.getElementById('messageText');
            ta.value = text;
            ta.selectionStart = ta.value.length;
            ta.selectionEnd = ta.value.length;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          }, wrappedSentence + (viewport.tag === '1280' ? ` ${wrappedSentence}` : ''));
          const wrapped = await measureComposer(page);
          assert.ok(wrapped.ta.height > initial.ta.height + 15, `${label}: expected auto-grow on wrapped text (${wrapped.ta.height} vs ${initial.ta.height})`);
          assert.ok(wrapped.ta.height <= 151, `${label}: wrapped height exceeded max (${wrapped.ta.height})`);
          assertAnchored(wrapped, initial, `${label}-wrapped`);

          await page.evaluate(() => {
            const ta = document.getElementById('messageText');
            ta.value = '';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.click('#messageText');
          await page.keyboard.type('First line of our trip plan');
          await page.keyboard.down('Shift');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Shift');
          await page.keyboard.type('Second line with dinner ideas');
          await page.keyboard.down('Shift');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Shift');
          await page.keyboard.type('Third line for museum tickets');

          const grown = await measureComposer(page);
          assert.ok(grown.ta.height > initial.ta.height + 25, `${label}: expected grow (${grown.ta.height} vs ${initial.ta.height})`);
          assert.ok(grown.ta.height <= 151, `${label}: grown height exceeded max (${grown.ta.height})`);
          assert.equal(grown.taOverflowY, 'hidden', `${label}: mid-growth overflowY should be hidden`);
          assertAnchored(grown, initial, `${label}-grown`);

          await page.evaluate(() => {
            const ta = document.getElementById('messageText');
            ta.value = Array.from({ length: 16 }, (_, i) => `Day ${i + 1}: Visit landmark, grab lunch, walk through the park`).join('\n');
            ta.selectionStart = ta.value.length;
            ta.selectionEnd = ta.value.length;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          });

          const maxed = await measureComposer(page);
          assert.ok(maxed.ta.height >= 148 && maxed.ta.height <= 151, `${label}: expected max height ~150px, got ${maxed.ta.height}`);
          assert.equal(maxed.taOverflowY, 'auto', `${label}: expected overflowY auto at max height`);
          assert.ok(maxed.taScrollHeight > maxed.taClientHeight + 20, `${label}: expected internal scroll area`);
          assert.ok(maxed.messages.height >= 120, `${label}: transcript shrunk too much (${maxed.messages.height}px)`);
          assertAnchored(maxed, initial, `${label}-maxed`);

          const scrollProof = await page.evaluate(() => {
            const ta = document.getElementById('messageText');
            ta.scrollTop = 0;
            const atTop = ta.scrollTop;
            ta.scrollTop = ta.scrollHeight;
            const atBottom = ta.scrollTop;
            return { atTop, atBottom };
          });
          assert.equal(scrollProof.atTop, 0, `${label}: textarea should scroll to top`);
          assert.ok(scrollProof.atBottom > 20, `${label}: textarea should scroll internally (atBottom=${scrollProof.atBottom})`);

          await page.evaluate(() => {
            const ta = document.getElementById('messageText');
            ta.value = 'Short reply';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          });
          const shrunk = await measureComposer(page);
          assert.ok(Math.abs(shrunk.ta.height - initial.ta.height) <= 2, `${label}: expected shrink back (${shrunk.ta.height} vs ${initial.ta.height})`);
          assert.equal(shrunk.taOverflowY, 'hidden', `${label}: shrunk overflowY should be hidden`);
          assertAnchored(shrunk, initial, `${label}-shrunk`);

          await page.evaluate(() => {
            const ta = document.getElementById('messageText');
            ta.value = 'Line 1\nLine 2\nLine 3\nLine 4';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          });
          const beforeSend = await measureComposer(page);
          assert.ok(beforeSend.ta.height > initial.ta.height + 30, `${label}: expected grown before send`);
          await page.click('#sendButton');
          await page.waitForFunction(() => document.getElementById('messageText')?.value === '', { timeout: 5_000 });
          const afterSend = await measureComposer(page);
          assert.ok(Math.abs(afterSend.ta.height - initial.ta.height) <= 2, `${label}: expected reset to single line after send (${afterSend.ta.height})`);
          assertAnchored(afterSend, initial, `${label}-after-send`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await runStaticAndUnitChecks();
await runBrowserChecks();
console.log('issue 1068 composer autogrow passed');
