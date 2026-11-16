import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

setTimeout(() => {
  console.error('test_issue_997_composer_mic_continuous timeout');
  process.exit(1);
}, 30_000).unref();

class MockNode {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.textContent = '';
    this.value = '';
    this.className = '';
    this.listeners = {};
    this.form = null;
  }
  get classList() {
    const self = this;
    return {
      add: (n) => { if (!self.className.split(/\s+/).includes(n)) self.className = `${self.className} ${n}`.trim(); },
      remove: (n) => { self.className = self.className.split(/\s+/).filter((p) => p && p !== n).join(' '); },
      contains: (n) => self.className.split(/\s+/).includes(n),
    };
  }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  async dispatch(type) { for (const h of this.listeners[type] || []) await h({ type, preventDefault() {} }); }
  async click() { await this.dispatch('click'); }
  focus() {}
}

function harness() {
  let clock = 1_000;
  const timeouts = [];
  const intervals = new Map();
  let nextId = 1;
  const nodes = {
    composerStatus: new MockNode('composerStatus'),
    voiceButton: new MockNode('voiceButton'),
    messageText: new MockNode('messageText'),
    voiceElapsed: new MockNode('voiceElapsed'),
    composer: new MockNode('composer'),
  };
  nodes.messageText.form = nodes.composer;
  const recognitions = [];
  class MockSpeechRecognition {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.started = false;
      this.stopCalls = 0;
      recognitions.push(this);
    }
    start() { this.started = true; queueMicrotask(() => this.onstart?.({})); }
    stop() { this.stopCalls += 1; queueMicrotask(() => this.onend?.({})); }
    abort() { this.stop(); }
    say(...chunks) { this.onresult?.({ results: chunks.map((t) => [{ transcript: t }]) }); }
    browserEnds(error) { if (error) this.onerror?.({ error }); this.onend?.({}); }
  }
  const sandbox = {
    console,
    queueMicrotask,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    addEventListener() {},
    removeEventListener() {},
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
    document: { getElementById: (id) => nodes[id] || null, querySelector: () => null },
    SpeechRecognition: undefined,
    webkitSpeechRecognition: MockSpeechRecognition,
    Date: { now: () => clock },
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.push({ id, at: clock + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = timeouts.findIndex((t) => t.id === id); if (i >= 0) timeouts.splice(i, 1); },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms, next: clock + ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const drain = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => queueMicrotask(r)); };
  const advance = async (ms) => {
    const end = clock + ms;
    while (true) {
      timeouts.sort((a, b) => a.at - b.at);
      const t = timeouts[0];
      if (!t || t.at > end) break;
      timeouts.shift();
      clock = t.at;
      for (const iv of intervals.values()) while (iv.next <= clock) { iv.fn(); iv.next += iv.ms; }
      t.fn();
      await drain();
    }
    clock = end;
    for (const iv of intervals.values()) while (iv.next <= clock) { iv.fn(); iv.next += iv.ms; }
    await drain();
  };
  return { sandbox, nodes, recognitions, advance, drain };
}

async function boot() {
  const h = harness();
  const source = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
  vm.createContext(h.sandbox);
  vm.runInContext(source, h.sandbox);
  const state = { voiceMode: false, voiceArmed: false };
  h.sandbox.tsVacationAppChrome.bindVoice(() => state);
  return { ...h, state };
}

const isRecording = (nodes) => nodes.voiceButton.classList.contains('recording');
const retryCopy = "Didn't catch that";

{
  const { nodes, recognitions, advance, drain, state } = await boot();
  await nodes.voiceButton.click();
  await drain();
  assert.equal(recognitions.length, 1);
  assert.equal(recognitions[0].continuous, true, 'composer recognition must be continuous');
  assert.equal(isRecording(nodes), true);
  recognitions[0].say('book a hotel');
  assert.equal(nodes.messageText.value, 'book a hotel');

  await advance(8_500);
  recognitions[0].browserEnds('no-speech');
  await drain();
  for (let s = 0; s < 12; s += 1) {
    await advance(1_000);
    const live = recognitions[recognitions.length - 1];
    if (s === 4 || s === 9) live.browserEnds('no-speech');
    await drain();
  }
  assert.equal(isRecording(nodes), true, 'still recording after >20 s total, >10 s of silence');
  assert.equal(state.voiceMode, true);
  assert.ok(recognitions.length >= 3, `recognition restarted on onend (instances=${recognitions.length})`);
  assert.ok(recognitions.every((r) => r.continuous === true));
  assert.equal(nodes.voiceElapsed.hidden, false, 'elapsed timer keeps showing');
  assert.equal(nodes.voiceElapsed.textContent, '0:20', 'timer is not reset by restarts');
  assert.ok(!String(nodes.composerStatus.textContent).includes(retryCopy), 'no "Didn\'t catch that" during silence');
  assert.equal(nodes.messageText.value, 'book a hotel', 'captured text kept across restarts');

  const live = recognitions[recognitions.length - 1];
  live.say('near Central Park');
  assert.equal(nodes.messageText.value, 'book a hotel near Central Park');

  await nodes.voiceButton.click();
  await drain();
  assert.equal(live.stopCalls, 1);
  assert.equal(isRecording(nodes), false);
  assert.equal(state.voiceMode, false);
  assert.equal(nodes.voiceElapsed.hidden, true);
  assert.equal(nodes.messageText.value, 'book a hotel near Central Park');
  const count = recognitions.length;
  await advance(5_000);
  assert.equal(recognitions.length, count, 'no restart after Stop');
}

{
  const { nodes, recognitions, advance, drain } = await boot();
  await nodes.voiceButton.click();
  await drain();
  recognitions[0].say('dinner at eight');
  await advance(11_000);
  assert.equal(isRecording(nodes), true);
  await nodes.composer.dispatch('submit');
  nodes.messageText.value = '';
  recognitions[0].say('dinner at eight late result');
  await drain();
  assert.equal(isRecording(nodes), false);
  assert.equal(nodes.messageText.value, '', 'late result after Send is dropped');
  const count = recognitions.length;
  await advance(3_000);
  assert.equal(recognitions.length, count, 'no restart after Send');
}

{
  const { nodes, recognitions, drain, advance } = await boot();
  nodes.messageText.value = 'Day 2:';
  await nodes.voiceButton.click();
  await drain();
  recognitions[0].say('museum');
  recognitions[0].browserEnds();
  await advance(500);
  recognitions[recognitions.length - 1].say('then lunch');
  assert.equal(nodes.messageText.value, 'Day 2: museum then lunch');
}

{
  const { nodes, recognitions, drain, advance } = await boot();
  await nodes.voiceButton.click();
  await drain();
  recognitions[0].browserEnds('not-allowed');
  await advance(2_000);
  assert.equal(isRecording(nodes), false);
  assert.match(nodes.composerStatus.textContent, /Microphone access is blocked/);
  assert.equal(recognitions.length, 1);
}

{
  const { nodes, recognitions, drain, advance } = await boot();
  await nodes.voiceButton.click();
  await drain();
  for (let i = 0; i < 20 && isRecording(nodes); i += 1) {
    recognitions[recognitions.length - 1].browserEnds('network');
    await advance(200);
  }
  assert.equal(isRecording(nodes), false);
  assert.ok(recognitions.length <= 8, `bounded restarts (${recognitions.length})`);
}

{
  const { nodes, recognitions, drain, advance } = await boot();
  await nodes.voiceButton.click();
  await drain();
  for (let i = 0; i < 24; i += 1) {
    recognitions[recognitions.length - 1].browserEnds(i % 2 ? 'no-speech' : undefined);
    await advance(500);
  }
  assert.equal(isRecording(nodes), true, 'empty composer stays recording past 10s of repeated silent endings');
  assert.equal(nodes.voiceElapsed.textContent, '0:12');
  assert.equal(nodes.messageText.value, '');
  assert.ok(recognitions.length > 20, 'silent restarts do not exhaust the network-error budget');
  assert.ok(!String(nodes.composerStatus.textContent).includes(retryCopy));
  await nodes.voiceButton.click();
  await drain();
  assert.equal(isRecording(nodes), false);
}

console.log('test_issue_997_composer_mic_continuous: ok');
