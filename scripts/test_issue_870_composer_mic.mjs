import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

setTimeout(() => {
  console.error('test_issue_870 timeout');
  process.exit(1);
}, 20_000).unref();

class MockNode {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.textContent = '';
    this.value = '';
    this.title = '';
    this.disabled = false;
    this.className = '';
    this.listeners = {};
  }

  get classList() {
    const self = this;
    return {
      add: (name) => {
        if (!self.className.split(/\s+/).includes(name)) {
          self.className = self.className ? `${self.className} ${name}` : name;
        }
      },
      remove: (name) => {
        self.className = self.className.split(/\s+/).filter((part) => part && part !== name).join(' ');
      },
      contains: (name) => self.className.split(/\s+/).includes(name),
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  async click() {
    const handler = this.listeners.click;
    if (handler) await handler();
  }

  focus() {}
}

function installFakeTimers(sandbox) {
  let clock = 1;
  const intervals = new Map();
  let nextId = 1;
  sandbox.setInterval = (fn, delay) => {
    const id = nextId++;
    intervals.set(id, { fn, delay });
    return id;
  };
  sandbox.clearInterval = (id) => intervals.delete(id);
  sandbox.Date = { now: () => clock };
  return {
    advance(ms) {
      clock += ms;
      for (const { fn, delay } of intervals.values()) {
        const ticks = Math.floor(ms / delay);
        for (let i = 0; i < ticks; i += 1) fn();
      }
    },
    clear() {
      intervals.clear();
    },
  };
}

function buildHarness({ userAgent = 'Mozilla/5.0 (Macintosh)', getUserMediaImpl, fakeTimers = false }) {
  const nodes = {
    composerStatus: new MockNode('composerStatus'),
    voiceButton: new MockNode('voiceButton'),
    messageText: new MockNode('messageText'),
    voiceElapsed: new MockNode('voiceElapsed'),
  };
  let getUserMediaCalls = 0;
  const recognitionLog = [];

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

    emitResult(text) {
      const event = { results: [[{ transcript: text }]] };
      this.onresult?.(event);
    }

    emitError(code) {
      this.onerror?.({ error: code });
    }

    end() {
      queueMicrotask(() => this.onend?.({}));
    }
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    navigator: {
      userAgent,
      mediaDevices: {
        getUserMedia: async (...args) => {
          getUserMediaCalls += 1;
          if (getUserMediaImpl) return getUserMediaImpl(...args);
          return { getTracks: () => [{ stop() {} }] };
        },
      },
    },
    document: {
      getElementById: (id) => nodes[id] || null,
    },
    window: {},
    SpeechRecognition: MockSpeechRecognition,
    webkitSpeechRecognition: MockSpeechRecognition,
    globalThis: null,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const timers = fakeTimers ? installFakeTimers(sandbox) : null;
  if (!fakeTimers) {
    sandbox.setInterval = setInterval;
    sandbox.clearInterval = clearInterval;
    sandbox.Date = Date;
  }
  return {
    sandbox,
    nodes,
    recognitionLog,
    timers,
    getGetUserMediaCalls: () => getUserMediaCalls,
  };
}

async function loadBindVoice(sandbox) {
  const source = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const state = { voiceMode: false, voiceArmed: false };
  const getState = () => state;
  sandbox.tsVacationAppChrome.bindVoice(getState);
  return { state, getState };
}

async function microtaskDrain(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => queueMicrotask(resolve));
  }
}

const blockedCopy = 'Microphone access is blocked. Allow microphone for this site in your browser settings, then try again.';
const iphoneBlockedPrefix = 'Microphone access is blocked. On iPhone, open Settings › Brave › Microphone';
const retryCopy = "Didn't catch that — tap the mic and try again.";

{
  const { sandbox, nodes, recognitionLog, getGetUserMediaCalls } = buildHarness({});
  await loadBindVoice(sandbox);
  for (let i = 0; i < 3; i += 1) {
    await nodes.voiceButton.click();
    await microtaskDrain();
    assert.equal(recognitionLog.length, i + 1, `recognition instance ${i + 1}`);
    assert.equal(nodes.voiceButton.classList.contains('recording'), true);
    recognitionLog[i].emitResult(`take ${i + 1}`);
    recognitionLog[i].end();
    await microtaskDrain();
    assert.equal(nodes.messageText.value, `take ${i + 1}`);
    assert.equal(nodes.voiceButton.classList.contains('recording'), false);
  }
  assert.equal(getGetUserMediaCalls(), 1, 'getUserMedia should run once per page session');
}

{
  const { sandbox, nodes, recognitionLog, timers } = buildHarness({ fakeTimers: true });
  await loadBindVoice(sandbox);
  await nodes.voiceButton.click();
  await microtaskDrain();
  assert.equal(nodes.voiceElapsed.hidden, false);
  assert.equal(nodes.voiceElapsed.textContent, '0:00');
  timers.advance(1000);
  assert.equal(nodes.voiceElapsed.textContent, '0:01');
  recognitionLog[0].end();
  await microtaskDrain();
  assert.equal(nodes.voiceElapsed.hidden, true);
  timers.clear();
}

{
  const { sandbox, nodes } = buildHarness({
    getUserMediaImpl: async () => {
      const error = new Error('denied');
      error.name = 'NotAllowedError';
      throw error;
    },
  });
  await loadBindVoice(sandbox);
  await nodes.voiceButton.click();
  await microtaskDrain();
  assert.match(nodes.composerStatus.textContent, /Microphone access is blocked/);
  assert.equal(nodes.composerStatus.hidden, false);
  assert.match(nodes.composerStatus.textContent, new RegExp(blockedCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

{
  const { sandbox, nodes, recognitionLog } = buildHarness({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Brave/1.0' });
  await loadBindVoice(sandbox);
  recognitionLog.length = 0;
  await nodes.voiceButton.click();
  await microtaskDrain();
  recognitionLog[0].emitError('not-allowed');
  assert.match(nodes.composerStatus.textContent, new RegExp(iphoneBlockedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  recognitionLog[0].end();
  await microtaskDrain();
}

{
  const { sandbox, nodes, recognitionLog } = buildHarness({});
  await loadBindVoice(sandbox);
  await nodes.voiceButton.click();
  await microtaskDrain();
  recognitionLog[0].emitError('no-speech');
  assert.equal(nodes.composerStatus.textContent, retryCopy);
  recognitionLog[0].end();
  await microtaskDrain();
}

{
  const h = buildHarness({});
  delete h.sandbox.SpeechRecognition;
  delete h.sandbox.webkitSpeechRecognition;
  await loadBindVoice(h.sandbox);
  assert.equal(h.nodes.voiceButton.hidden, true);
  assert.equal(h.nodes.composerStatus.textContent, '');
}

{
  const h = buildHarness({});
  delete h.sandbox.navigator.mediaDevices;
  await loadBindVoice(h.sandbox);
  await h.nodes.voiceButton.click();
  await microtaskDrain();
  assert.match(h.nodes.composerStatus.textContent, /not available in this browser/);
}

console.log('issue 870 composer mic passed');
