import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  agreeThenReadWelcome,
  ensureWelcomeDatabase,
  priorWelcomeTexts,
  redactWelcomeSecrets,
  welcomeShownFromBubbles,
  WELCOME_DATABASE_EMPTY,
  WELCOME_DATABASE_FETCH_FAILED,
  WELCOME_ONBOARDING_TIMEOUT,
  WELCOME_VERCEL_TOKEN_MISSING,
} from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs';

const SENTINEL = 'sentinel-welcome-db-url-7c2e';
const TOKEN = 'unit-test-token';
const STAGING_URL = 'https://api.vercel.com/v1/projects/timesyncher-vacation-staging/env/A9IvKmyFpAfVBLQx?decrypt=true';
const scriptPath = fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));
const selfPath = fileURLToPath(import.meta.url);

function leaked(text) {
  const raw = Buffer.isBuffer(text) ? text : Buffer.from(String(text ?? ''));
  return raw.includes(Buffer.from(SENTINEL))
    || raw.includes(Buffer.from(TOKEN))
    || raw.includes(Buffer.from('postgres://'))
    || raw.includes(Buffer.from('postgresql://'));
}

function assertNoLeak(text, label) {
  if (leaked(text)) throw new Error(`${label} leaked`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function assertDirClean(dir) {
  const files = walk(dir);
  assert.ok(files.length > 0, `${path.basename(dir)} has no files`);
  for (const file of files) {
    if (leaked(fs.readFileSync(file))) throw new Error(`${path.basename(file)} leaked`);
  }
}

function makeRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'welcome-db-url-'));
  fs.mkdirSync(path.join(rootDir, 'artifacts'));
  fs.mkdirSync(path.join(rootDir, 'evidence'));
  fs.mkdirSync(path.join(rootDir, 'harness'));
  return rootDir;
}

function baseEnv() {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.NEON_DATABASE_URL;
  delete env.VERCEL_TOKEN;
  return env;
}

function writePreload(rootDir, source) {
  const file = path.join(rootDir, 'harness', 'preload.mjs');
  fs.writeFileSync(file, source);
  return file;
}

function runCli(rootDir, { preload, token = true } = {}) {
  const env = baseEnv();
  if (token) env.VERCEL_TOKEN = TOKEN;
  const args = [];
  if (preload) args.push('--import', pathToFileURL(preload).href);
  args.push(scriptPath, '--check');
  const result = spawnSync(process.execPath, args, { cwd: repo, env, encoding: 'utf8' });
  for (const name of ['artifacts', 'evidence']) {
    fs.writeFileSync(path.join(rootDir, name, 'stdout.txt'), result.stdout || '');
    fs.writeFileSync(path.join(rootDir, name, 'stderr.txt'), result.stderr || '');
  }
  assertNoLeak(result.stdout, 'stdout');
  assertNoLeak(result.stderr, 'stderr');
  assertDirClean(path.join(rootDir, 'artifacts'));
  assertDirClean(path.join(rootDir, 'evidence'));
  return result;
}

async function runChildResolve(rootDir) {
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.NEON_DATABASE_URL;
  env.VERCEL_TOKEN = TOKEN;
  let sawUrl = false;
  let sawAuth = false;
  try {
    await ensureWelcomeDatabase({
      env,
      fetchImpl: async (url, init) => {
        sawUrl = url === STAGING_URL;
        const method = String(init?.method || 'GET').toUpperCase();
        const auth = init?.headers?.Authorization || '';
        sawAuth = method === 'GET' && auth === `Bearer ${TOKEN}`;
        if (!sawUrl || !sawAuth) return { ok: false, status: 400, json: async () => ({ value: SENTINEL }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ key: 'DATABASE_URL', value: SENTINEL, contentHint: SENTINEL }),
          text: async () => SENTINEL,
        };
      },
    });
  } catch (error) {
    process.stderr.write(`${error?.message || WELCOME_DATABASE_FETCH_FAILED}\n`);
    process.exit(error?.exitCode || 1);
  }
  if (!sawUrl || !sawAuth || process.env.DATABASE_URL !== SENTINEL || env.DATABASE_URL !== SENTINEL) {
    process.stderr.write(`${WELCOME_DATABASE_EMPTY}\n`);
    process.exit(1);
  }
  const body = `${redactWelcomeSecrets(JSON.stringify({ loaded: true, database: process.env.DATABASE_URL }))}\n`;
  fs.writeFileSync(path.join(rootDir, 'artifacts', 'database-load.json'), body);
  fs.writeFileSync(path.join(rootDir, 'evidence', 'database-load.json'), body);
  process.stdout.write('resolved\n');
}

if (process.argv[2] === '--child-resolve') {
  await runChildResolve(process.argv[3]);
} else {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(source.includes(STAGING_URL), true);
  assert.equal(source.includes('timesyncher-vacation-staging'), true);

  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    let called = false;
    const preset = { DATABASE_URL: 'preset-welcome-db', VERCEL_TOKEN: TOKEN };
    await ensureWelcomeDatabase({
      env: preset,
      fetchImpl: async () => {
        called = true;
        throw new Error('fetch should not run');
      },
    });
    assert.equal(called, false);
    assert.equal(preset.DATABASE_URL, 'preset-welcome-db');
    assert.equal(process.env.DATABASE_URL, undefined);

    await assert.rejects(
      () => ensureWelcomeDatabase({ env: {}, fetchImpl: async () => { throw new Error(SENTINEL); } }),
      (error) => {
        assert.equal(error.message, WELCOME_VERCEL_TOKEN_MISSING);
        assert.equal(String(error.stack || '').includes(SENTINEL), false);
        return true;
      },
    );

    await assert.rejects(
      () => ensureWelcomeDatabase({
        env: { VERCEL_TOKEN: TOKEN },
        fetchImpl: async () => { throw new Error(SENTINEL); },
      }),
      (error) => {
        assert.equal(error.message, WELCOME_DATABASE_FETCH_FAILED);
        assert.equal(error.exitCode, 1);
        assert.equal(String(error.message).includes(SENTINEL), false);
        assert.equal(String(error.stack || '').includes(SENTINEL), false);
        return true;
      },
    );

    const redacted = redactWelcomeSecrets('connect postgres://user:secret@host/db failed', 'postgres://user:secret@host/db');
    assert.equal(redacted.includes('postgres://'), false);
    assert.equal(redacted.includes('secret'), false);
    assert.equal(redacted.includes('[redacted]'), true);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }

  const missing = runCli(makeRoot(), { token: false });
  assert.notEqual(missing.status, 0);
  assert.equal(missing.stderr.includes(WELCOME_VERCEL_TOKEN_MISSING), true);

  const httpFail = runCli(makeRoot(), {
    preload: writePreload(makeRoot(), `globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => ${JSON.stringify(SENTINEL)},
      json: async () => ({ value: ${JSON.stringify(SENTINEL)} }),
    });
`),
  });
  assert.notEqual(httpFail.status, 0);
  assert.equal(httpFail.stderr.includes(`${WELCOME_DATABASE_FETCH_FAILED} (HTTP 500)`), true);

  const thrown = runCli(makeRoot(), {
    preload: writePreload(makeRoot(), `globalThis.fetch = async () => { throw new Error(${JSON.stringify(SENTINEL)}); };
`),
  });
  assert.notEqual(thrown.status, 0);
  assert.equal(thrown.stderr.includes(WELCOME_DATABASE_FETCH_FAILED), true);
  assert.equal(thrown.stderr.includes('HTTP'), false);

  const empty = runCli(makeRoot(), {
    preload: writePreload(makeRoot(), `globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ key: 'DATABASE_URL', value: '   ', note: ${JSON.stringify(SENTINEL)} }),
    });
`),
  });
  assert.notEqual(empty.status, 0);
  assert.equal(empty.stderr.includes(WELCOME_DATABASE_EMPTY), true);

  const wrongKey = runCli(makeRoot(), {
    preload: writePreload(makeRoot(), `globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ key: 'NOT_DATABASE_URL', value: ${JSON.stringify(SENTINEL)} }),
    });
`),
  });
  assert.notEqual(wrongKey.status, 0);
  assert.equal(wrongKey.stderr.includes(WELCOME_DATABASE_FETCH_FAILED), true);
  assert.equal(wrongKey.stderr.includes(WELCOME_DATABASE_EMPTY), false);

  const resolvedRoot = makeRoot();
  const resolved = spawnSync(process.execPath, [selfPath, '--child-resolve', resolvedRoot], {
    cwd: resolvedRoot,
    env: baseEnv(),
    encoding: 'utf8',
  });
  for (const name of ['artifacts', 'evidence']) {
    fs.writeFileSync(path.join(resolvedRoot, name, 'stdout.txt'), resolved.stdout || '');
    fs.writeFileSync(path.join(resolvedRoot, name, 'stderr.txt'), resolved.stderr || '');
  }
  assert.equal(resolved.status, 0);
  assert.equal(resolved.stdout, 'resolved\n');
  assert.equal(resolved.stderr, '');
  assertNoLeak(resolved.stdout, 'resolve stdout');
  assertNoLeak(resolved.stderr, 'resolve stderr');
  assertDirClean(path.join(resolvedRoot, 'artifacts'));
  assertDirClean(path.join(resolvedRoot, 'evidence'));
  for (const name of ['artifacts', 'evidence']) {
    const body = fs.readFileSync(path.join(resolvedRoot, name, 'database-load.json'), 'utf8');
    assert.equal(body.includes('"loaded":true'), true);
    assert.equal(body.includes('[redacted]'), true);
    assertNoLeak(body, `${name} database-load`);
  }
  assert.equal(process.env.DATABASE_URL, previous);

  const self = spawnSync(process.execPath, [scriptPath, '--self-test-missing-env'], {
    cwd: repo,
    env: baseEnv(),
    encoding: 'utf8',
  });
  assert.equal(self.status, 0, 'missing-env self-test');
  assertNoLeak(self.stdout, 'self-test stdout');
  assertNoLeak(self.stderr, 'self-test stderr');
  assert.match(self.stdout, /missing-env self-test passed/);

  const steps = [];
  const welcome = await agreeThenReadWelcome({
    async fill(selector) { steps.push(['fill', selector]); },
    async check(selector) { steps.push(['check', selector]); },
    async click(selector) { steps.push(['click', selector]); },
    async waitFor(selector) { steps.push(['wait', selector]); return true; },
    async readWelcome() {
      steps.push(['assert']);
      const bubbles = [{ user: false, text: 'Welcome aboard' }, { user: true, text: 'Hello' }];
      return { shown: welcomeShownFromBubbles(bubbles), prior: priorWelcomeTexts(bubbles) };
    },
  });
  assert.deepEqual(steps, [
    ['fill', '#eulaName'],
    ['check', '#eulaAgree'],
    ['click', '#eulaAgreeButton'],
    ['wait', '#messages[data-screen="onboarding"]'],
    ['assert'],
  ]);
  assert.equal(welcome.shown, true);
  assert.deepEqual(welcome.prior, ['Welcome aboard']);
  assert.equal(welcomeShownFromBubbles([{ user: true, text: 'Hello' }]), false);
  assert.equal(welcomeShownFromBubbles([{ user: false, text: '   ' }]), false);
  assert.equal(welcomeShownFromBubbles([{ user: false, text: 'Welcome aboard' }, { user: true, text: 'Hello' }]), true);

  const timed = [];
  await assert.rejects(
    () => agreeThenReadWelcome({
      async fill(selector) { timed.push(selector); },
      async check(selector) { timed.push(selector); },
      async click(selector) { timed.push(selector); },
      async waitFor() { throw new Error('https://example.test/session-secret-token'); },
      async readWelcome() { timed.push('assert'); return { shown: true, prior: [] }; },
    }),
    (error) => {
      assert.equal(error.message, WELCOME_ONBOARDING_TIMEOUT);
      assert.equal(String(error.message).includes('session-secret'), false);
      assert.equal(String(error.stack || '').includes('session-secret'), false);
      return true;
    },
  );
  assert.deepEqual(timed, ['#eulaName', '#eulaAgree', '#eulaAgreeButton']);
  const drive = fs.readFileSync(scriptPath, 'utf8');
  const agreeAt = drive.indexOf('agreeThenReadWelcome(');
  const sessionWelcomeAt = drive.indexOf('const welcomeShown');
  assert.ok(agreeAt > 0 && sessionWelcomeAt > agreeAt);

  process.stdout.write('welcome database url test passed\n');
}
