import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agreeThenReadWelcome,
  ensureWelcomeDatabase,
  priorWelcomeTexts,
  redactWelcomeSecrets,
  welcomeShownFromBubbles,
  WELCOME_DATABASE_MISSING,
  WELCOME_ONBOARDING_TIMEOUT,
} from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs';

const SENTINEL = 'sentinel-welcome-db-url-7c2e';
const scriptPath = fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

function leaked(text) {
  const raw = Buffer.isBuffer(text) ? text : Buffer.from(String(text ?? ''));
  return raw.includes(Buffer.from(SENTINEL))
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
  return env;
}

function runCli(rootDir) {
  const env = baseEnv();
  const args = [scriptPath, '--check'];
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

const previous = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
try {
  const preset = { DATABASE_URL: 'preset-welcome-db' };
  await ensureWelcomeDatabase({ env: preset });
  assert.equal(preset.DATABASE_URL, 'preset-welcome-db');
  assert.equal(process.env.DATABASE_URL, undefined);

  await assert.rejects(
    () => ensureWelcomeDatabase({ env: {} }),
    (error) => {
      assert.equal(error.message, WELCOME_DATABASE_MISSING);
      assert.equal(error.exitCode, 1);
      return true;
    },
  );
  await assert.rejects(
    () => ensureWelcomeDatabase({ env: { DATABASE_URL: '   ' } }),
    (error) => error.message === WELCOME_DATABASE_MISSING,
  );

  const redacted = redactWelcomeSecrets('connect postgres://user:secret@host/db failed', 'postgres://user:secret@host/db');
  assert.equal(redacted.includes('postgres://'), false);
  assert.equal(redacted.includes('secret'), false);
  assert.equal(redacted.includes('[redacted]'), true);
} finally {
  if (previous === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previous;
}

const missing = runCli(makeRoot());
assert.notEqual(missing.status, 0);
assert.equal(missing.stderr.includes(WELCOME_DATABASE_MISSING), true);
assert.equal(missing.stderr.includes('api.vercel.com'), false);

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
