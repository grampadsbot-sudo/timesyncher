#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const VIEWPORTS = [
  { width: 390, name: 'iphone-390' },
  { width: 430, name: 'iphone-430' },
];

setTimeout(() => {
  console.error('test_acceptance_997_voice_continuous timeout');
  process.exit(1);
}, 180_000).unref();

function dataAttrToCamel(name) {
  return name.replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function parseSimpleHtml(html, parent) {
  const re = /<(\/?)([\w-]+)([^>]*)>|([^<]+)/g;
  const stack = [parent];
  let match;
  while ((match = re.exec(html))) {
    const [, closing, tag, attrs, text] = match;
    if (text?.trim()) {
      const cur = stack[stack.length - 1];
      cur.textContent = (cur.textContent || '') + text.trim();
      continue;
    }
    if (closing) {
      stack.pop();
      continue;
    }
    const el = new MockElement(tag);
    const attrRe = /([\w-]+)(?:="([^"]*)")?/g;
    let attrMatch;
    while ((attrMatch = attrRe.exec(attrs || ''))) {
      const [, key, val] = attrMatch;
      if (key === 'class') el.className = val || '';
      else if (key === 'type') el.type = val;
      else if (key.startsWith('data-')) el.dataset[dataAttrToCamel(key)] = val ?? '1';
      else if (key === 'aria-hidden') el.ariaHidden = val;
      else if (key === 'aria-label') el.ariaLabel = val;
      else if (key === 'placeholder') el.placeholder = val;
      else el.attributes[key] = val ?? '';
    }
    stack[stack.length - 1].appendChild(el);
    stack.push(el);
  }
}

class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.hidden = false;
    this.textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.disabled = false;
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = {};
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    parseSimpleHtml(html, this);
  }

  get classList() {
    const self = this;
    return {
      add: (name) => {
        const parts = self.className.split(/\s+/).filter(Boolean);
        if (!parts.includes(name)) self.className = [...parts, name].join(' ');
      },
      remove: (name) => {
        self.className = self.className.split(/\s+/).filter(Boolean).filter((p) => p !== name).join(' ');
      },
      contains: (name) => self.className.split(/\s+/).includes(name),
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'aria-label') this.ariaLabel = value;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelector(sel) {
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.matches?.(sel)) return node;
        const nested = walk(node.children || []);
        if (nested) return nested;
      }
      return null;
    };
    return walk(this.children);
  }

  matches(sel) {
    if (sel.startsWith('[')) {
      const attr = sel.slice(1, -1);
      if (attr.startsWith('data-')) {
        return this.dataset[dataAttrToCamel(attr)] != null;
      }
    }
  if (sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1));
    return false;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.matches?.(sel)) out.push(node);
        walk(node.children || []);
      }
    };
    walk(this.children);
    return out;
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    }
  }

  focus() {}

  async click() {
    await this.listeners.click?.({ currentTarget: this });
  }
}

function buildDomTree(html) {
  const root = new MockElement('div');
  const tokens = html.match(/<[^>]+>|[^<]+/g) || [];
  let current = root;
  const stack = [root];
  for (const token of tokens) {
    if (token.startsWith('<button')) {
      const el = new MockElement('button');
      const dataMatch = token.match(/data-([\w-]+)/g) || [];
      for (const attr of dataMatch) {
        const bare = attr.replace('data-', '');
        const camel = bare.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        el.dataset[camel] = el.dataset[camel] || '1';
        if (bare === 'ts-shared-audio') el.dataset.tsSharedAudio = '1';
      }
      if (token.includes('data-ts-voice-send')) el.dataset.tsVoiceSend = '1';
      if (token.includes('data-ts-voice-stop')) el.dataset.tsVoiceStop = '1';
      if (token.includes('data-ts-voice-cancel')) el.dataset.tsVoiceCancel = '1';
      if (token.includes('data-ts-voice-elapsed')) el.dataset.tsVoiceElapsed = '1';
      current.appendChild(el);
      stack.push(el);
      current = el;
    } else if (token.startsWith('</button>')) {
      stack.pop();
      current = stack[stack.length - 1] || root;
    }
  }
  return root;
}

function installFakeTimers(sandbox) {
  let now = 1_700_000_000_000;
  const timers = new Map();
  let nextId = 1;
  sandbox.Date = class extends Date {
    constructor(...args) {
      if (!args.length) super(now);
      else super(...args);
    }
    static now() {
      return now;
    }
  };
  const setIntervalShim = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms, type: 'interval', last: now });
    return id;
  };
  const setTimeoutShim = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, ms, type: 'timeout', at: now + ms });
    return id;
  };
  sandbox.setInterval = setIntervalShim;
  sandbox.clearInterval = (id) => timers.delete(id);
  sandbox.setTimeout = setTimeoutShim;
  sandbox.clearTimeout = (id) => timers.delete(id);
  sandbox.window.setInterval = setIntervalShim;
  sandbox.window.setTimeout = setTimeoutShim;
  sandbox.window.clearInterval = (id) => timers.delete(id);
  sandbox.window.clearTimeout = (id) => timers.delete(id);
  return {
    advance(ms) {
      now += ms;
      for (const [id, row] of [...timers.entries()]) {
        if (row.type === 'timeout' && now >= row.at) {
          timers.delete(id);
          row.fn();
        }
        if (row.type === 'interval' && now - row.last >= row.ms) {
          row.last = now;
          row.fn();
        }
      }
    },
  };
}

function createHarness(viewportWidth) {
  const micButton = new MockElement('button');
  micButton.dataset.tsSharedAudio = '1';
  const body = new MockElement('body');
  body.appendChild(micButton);

  const recognitionLog = [];
  let recorderInstance = null;

  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.onstart = null;
      this.onend = null;
      this.onresult = null;
      this.onerror = null;
      recognitionLog.push(this);
    }

    start() {
      queueMicrotask(() => this.onstart?.({}));
    }

    stop() {}

    emitResult(text, { final = true, resultIndex = 0 } = {}) {
      const result = { 0: { transcript: text }, length: 1, isFinal: final };
      const event = { results: [result], resultIndex };
      this.onresult?.(event);
    }

    emitEnd() {
      queueMicrotask(() => this.onend?.({}));
    }
  }

  class MockMediaRecorder {
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = options?.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.listeners = {};
      recorderInstance = this;
    }

    static isTypeSupported() {
      return true;
    }

    addEventListener(type, handler, opts) {
      this.listeners[type] = handler;
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      queueMicrotask(() => this.listeners.stop?.({}));
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = 'running';
    }
    createAnalyser() {
      return { fftSize: 256, smoothingTimeConstant: 0.65, frequencyBinCount: 8, getByteFrequencyData() {}, connect() {}, disconnect() {} };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }

  const sandbox = {
    innerWidth: viewportWidth,
    devicePixelRatio: 2,
    location: { pathname: '/shared/demo-nyc-99-snapshot-20261110/' },
    console,
    queueMicrotask,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    FileReader: class {
      readAsDataURL() {
        queueMicrotask(() => this.onload?.({ target: { result: 'data:audio/webm;base64,AAA' } }));
      }
    },
    Blob: class {
      constructor(parts, opts) {
        this.size = 1200;
        this.type = opts?.type || 'audio/webm';
      }
    },
    requestAnimationFrame: (fn) => {
      queueMicrotask(fn);
      return 1;
    },
    cancelAnimationFrame() {},
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    },
    MutationObserver: class {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {}
      disconnect() {}
    },
    document: {
      body,
      documentElement: body,
      querySelector(sel) {
        if (sel === '[data-ts-shared-audio]') return micButton;
        const walk = (nodes) => {
          for (const node of nodes) {
            if (node.matches?.(sel)) return node;
            const nested = walk(node.children || []);
            if (nested) return nested;
          }
          return null;
        };
        return walk(body.children) || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (nodes) => {
          for (const node of nodes) {
            if (node.matches?.(sel)) out.push(node);
            if (node.children) walk(node.children);
          }
        };
        walk([micButton, ...body.children]);
        return out;
      },
      createElement(tag) {
        return new MockElement(tag);
      },
    },
    SpeechRecognition: MockSpeechRecognition,
    webkitSpeechRecognition: MockSpeechRecognition,
    MediaRecorder: MockMediaRecorder,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    addEventListener() {},
  };
  sandbox.window = sandbox;
  const clocks = installFakeTimers(sandbox);
  return { sandbox, micButton, recognitionLog, clocks, getRecorder: () => recorderInstance, body };
}

async function loadRecorder(sandbox) {
  const source = await readFile(new URL('../public/ts-shared-audio-recorder.js', import.meta.url), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
}

async function drainMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => queueMicrotask(resolve));
  }
}

for (const viewport of VIEWPORTS) {
  const { sandbox, micButton, recognitionLog, clocks, getRecorder, body } = createHarness(viewport.width);
  await loadRecorder(sandbox);
  await micButton.click();
  await drainMicrotasks();

  const recorder = getRecorder();
  assert.equal(recorder?.state, 'recording', `${viewport.name}: recording should be active after mic tap`);
  assert.equal(micButton.classList.contains('is-recording'), true, `${viewport.name}: mic button shows recording`);

  const recordingBar = body.children.find((c) => c.className?.includes('ts-shared-audio-recording-bar'));
  assert.ok(recordingBar?.classList.contains('is-active'), `${viewport.name}: recording bar visible`);

  const elapsedEl = recordingBar?.children.find((c) => c.dataset?.tsVoiceElapsed)
    || recordingBar?.querySelector?.('[data-ts-voice-elapsed]');
  assert.equal(elapsedEl?.textContent, '0:00', `${viewport.name}: timer starts at 0:00`);

  recognitionLog[0].emitResult('Hello from the voice note', { final: true });
  clocks.advance(1200);
  await drainMicrotasks();
  assert.match(elapsedEl?.textContent || '', /^0:0[12]$/, `${viewport.name}: timer grows during recording`);

  recognitionLog[0].emitEnd();
  await drainMicrotasks();
  clocks.advance(80);
  await drainMicrotasks();
  assert.ok(recognitionLog.length >= 2, `${viewport.name}: recognition restarts after onend`);
  clocks.advance(5100);
  await drainMicrotasks(12);

  assert.equal(recorder?.state, 'recording', `${viewport.name}: still recording after 5s silence and engine onend`);
  assert.equal(recordingBar?.classList.contains('is-active'), true, `${viewport.name}: recording bar stays active`);
  clocks.advance(2000);
  await drainMicrotasks();
  assert.match(elapsedEl?.textContent || '', /^0:0[3-9]/, `${viewport.name}: timer keeps growing through silence`);

  const stopBtn = recordingBar.querySelector('[data-ts-voice-stop]');
  const sendBtn = recordingBar.querySelector('[data-ts-voice-send]');
  assert.ok(stopBtn, `${viewport.name}: stop control present`);
  assert.ok(sendBtn, `${viewport.name}: send control present`);

  stopBtn.click();
  await drainMicrotasks();
  assert.equal(recorder?.state, 'inactive', `${viewport.name}: Stop ends recording`);
  assert.equal(recordingBar?.classList.contains('is-active'), false, `${viewport.name}: bar hidden after Stop`);

  recognitionLog.length = 0;
  await micButton.click();
  await drainMicrotasks();
  assert.equal(getRecorder()?.state, 'recording', `${viewport.name}: second session recording`);
  recognitionLog[0].emitResult('Send path phrase', { final: true });
  recognitionLog.at(-1).emitEnd();
  await drainMicrotasks();
  clocks.advance(5200);
  await drainMicrotasks(12);
  const bar2 = body.children.find((c) => c.className?.includes('ts-shared-audio-recording-bar') && c.classList.contains('is-active'));
  const send2 = bar2?.querySelector('[data-ts-voice-send]');
  send2?.click();
  await drainMicrotasks();
  assert.equal(getRecorder()?.state, 'inactive', `${viewport.name}: Send ends recording`);
}

console.log('test_acceptance_997_voice_continuous: ok (390 and 430)');