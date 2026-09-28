import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecretHits, scanRoots } from './check-evidence-secrets.mjs';

const script = fileURLToPath(new URL('./check-evidence-secrets.mjs', import.meta.url));

assert.deepEqual(findSecretHits('vacation-app-reply-rules'), []);
assert.deepEqual(findSecretHits('post-purchase-email-eula'), []);
assert.deepEqual(findSecretHits('81d853c764095b05d8d4477f3186549ca28441fa'), []);
assert.deepEqual(findSecretHits('"sessionToken": null'), []);
assert.deepEqual(findSecretHits('"sessionToken": "[redacted]"'), []);
assert.ok(findSecretHits('token Aa1bbCcdEe2ffGgHh3iJjK4L end').includes('session-token'));
assert.ok(findSecretHits('"sessionToken": "Aa1bbCcdEe2ffGgHh3iJjK4L"').includes('session-token-field'));
assert.ok(findSecretHits('sk_live_51HabcDEF123456').includes('secret-key'));
assert.ok(findSecretHits('Authorization: Bearer abcdefghijk').includes('bearer'));
assert.ok(findSecretHits('postgres://user:secret@host/db').includes('postgres-url'));
assert.ok(findSecretHits('sk-abcdefghijklmnopqrst').includes('openai-key'));
assert.ok(findSecretHits('pk_live_51HabcDEF123456').includes('publishable-key'));
assert.ok(findSecretHits('pk_test_51HabcDEF123456').includes('publishable-key'));
assert.ok(findSecretHits('ghp_abcdefghijklmnopqrstuvwxyz123456').includes('github-token'));
assert.ok(findSecretHits('gho_abcdefghijklmnopqrstuvwxyz123456').includes('github-token'));
assert.ok(findSecretHits('github_pat_abcdefghijklmnopqrstuvwxyz123456').includes('github-token'));
assert.ok(findSecretHits('xoxb-1234567890-abcdefghij').includes('slack-token'));
assert.ok(findSecretHits('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature').includes('jwt'));
assert.ok(findSecretHits('api_key: "0123456789abcdef0123456789abcdef"').includes('named-hex'));
assert.ok(findSecretHits('secret: "abcdEFGHijklMNOPqrstUVWXyz0123456789+/AB"').includes('named-base64'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-secrets-'));
const evidence = path.join(dir, 'evidence');
fs.mkdirSync(evidence);
fs.writeFileSync(path.join(evidence, 'clean.jsonl'), '{"sessionToken": null}\n');
assert.equal(scanRoots(dir).length, 0);
fs.writeFileSync(path.join(evidence, 'dirty.jsonl'), '{"sessionToken": "Aa1bbCcdEe2ffGgHh3iJjK4L"}\n');
assert.ok(scanRoots(dir).some((hit) => hit.rule === 'session-token'));

const proof = path.join(dir, 'features', 'proof');
fs.mkdirSync(proof, { recursive: true });
fs.writeFileSync(path.join(proof, 'note.md'), 'postgres://user:secret@host/db\n');
assert.ok(scanRoots(dir).some((hit) => hit.file.startsWith('features/proof') && hit.rule === 'postgres-url'));

const hook = fs.readFileSync(new URL('./hooks/pre-commit', import.meta.url), 'utf8');
assert.match(hook, /check-evidence-secrets\.mjs/);
const workflow = fs.readFileSync(new URL('../.github/workflows/evidence-secrets.yml', import.meta.url), 'utf8');
assert.match(workflow, /check-evidence-secrets\.mjs/);

const ran = spawnSync(process.execPath, [script], { encoding: 'utf8' });
assert.equal(ran.status, 0, ran.stderr || ran.stdout);
assert.match(ran.stdout, /evidence secret check passed/);

process.stdout.write('evidence secret check test passed\n');
