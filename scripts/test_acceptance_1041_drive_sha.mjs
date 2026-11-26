#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireMediaBindAuth } from '../src/vacation/auth.mjs';
import { ensurePostIntakeCollabCopy } from '../src/vacation/post-intake-collab-copy.mjs';
import { driveShaFromTranscript } from './build-used-vs-tip.mjs';
import { resolveDriveSha, stampMissingDriveSha } from './harness/drive-build.mjs';
import { renderDialog } from './harness/live-outputs.mjs';

const drive = 'a'.repeat(40);
const other = 'b'.repeat(40);
const raw = { turns: [{ role: 'customer', buildSha: null }, { role: 'app', buildSha: '' }], buildSha: null, driveBuildEnd: null, buildMismatch: false };
assert.throws(() => driveShaFromTranscript(raw), /untrusted: drive build sha is missing/);
assert.equal(stampMissingDriveSha(raw, 'not-a-sha'), raw);
const stamped = stampMissingDriveSha(raw, drive);
assert.equal(driveShaFromTranscript(stamped), drive);
assert.equal(stamped.turns.every((turn) => turn.buildSha === drive), true);
const kept = stampMissingDriveSha({ turns: [{ buildSha: other }, { buildSha: '' }], buildMismatch: false }, drive);
assert.equal(kept.turns[0].buildSha, other);
assert.equal(kept.turns[1].buildSha, drive);
assert.throws(() => driveShaFromTranscript(kept), /does not match/);
const fromVersion = await resolveDriveSha('', 'https://vacation-staging.timesyncher.com', async () => ({ json: async () => ({ sha: drive }) }));
assert.equal(fromVersion, drive);
assert.equal(await resolveDriveSha(other, 'https://vacation-staging.timesyncher.com', async () => { throw new Error('should not fetch'); }), other);
assert.equal(await resolveDriveSha('', 'https://vacation-staging.timesyncher.com', async () => { throw new Error('down'); }), '');

const renderer = fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.equal(renderer.includes('transcript.buildSha ='), false);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-sha-'));
const spawned = [];
const rendered = await renderDialog({
  token: 'fixture-session',
  outDir: dir,
  secrets: ['fixture-session'],
  buildSha: '',
  origin: 'https://vacation-staging.timesyncher.com',
  fetchImpl: async (url) => {
    assert.equal(String(url), 'https://vacation-staging.timesyncher.com/api/version');
    return { json: async () => ({ sha: drive }) };
  },
  loadTranscript: async () => raw,
  spawnImpl: (cmd, args) => {
    spawned.push(args);
    return { status: 2, stdout: '', stderr: 'untrusted: drive build sha is missing\n' };
  },
});
assert.equal(rendered.ok, false);
assert.match(spawned[0].join(' '), /--transcript /);
assert.equal(spawned[0].includes('--session'), false);
const written = JSON.parse(fs.readFileSync(path.join(dir, 'dialog-transcript.json'), 'utf8'));
assert.equal(driveShaFromTranscript(written), drive);
assert.equal(JSON.stringify(written).includes('fixture-session'), false);

const hiloPlain = ensurePostIntakeCollabCopy('Hilo from March 4 to March 8 can stay light.', '');
assert.doesNotMatch(hiloPlain, /\bview access\b/i);
const hilo = ensurePostIntakeCollabCopy('Hilo from March 4 to March 8 can stay light.', 'Can my family get view access or edit access?');
assert.match(hilo, /build(?:ing)? (?:the|your) itinerary/i);
assert.match(hilo, /\bview access\b/i);
assert.match(hilo, /\bedit access\b/i);
assert.match(hilo, /email invite/i);
assert.match(hilo, /covers the family's vacations for the whole year/i);
assert.doesNotMatch(hilo, /you also have unlimited/i);

const bindToken = 'mb_fixture_token';
assert.deepEqual(
  requireMediaBindAuth({ headers: { host: 'vacation-staging.timesyncher.com', 'x-timesyncher-media-bind-token': bindToken } }, {
    TIMESYNCHER_MEDIA_BIND_TOKEN: bindToken,
    TIMESYNCHER_ADMIN_TOKEN: 'admin-secret',
    TIMESYNCHER_WORKER_TOKEN: 'worker-secret',
  }),
  { mode: 'token' },
);
assert.throws(
  () => requireMediaBindAuth({ headers: { host: 'vacation-staging.timesyncher.com' } }, { TIMESYNCHER_ADMIN_TOKEN: 'admin-secret' }),
  (error) => error.statusCode === 401 && /Unauthorized media bind request/.test(error.message),
);

fs.rmSync(dir, { recursive: true, force: true });
console.log('test_acceptance_1041_drive_sha: ok');
