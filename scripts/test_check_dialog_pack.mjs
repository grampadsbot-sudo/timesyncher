import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-dialog-pack.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/dialog-pack/', import.meta.url));

function run(name, extra = []) {
  return spawnSync(process.execPath, [script, path.join(fixtures, name), ...extra], { encoding: 'utf8' });
}

function summary(stdout, bar) {
  const line = stdout.split('\n').find((item) => item.startsWith(`SUMMARY\t${bar}\t`));
  assert.ok(line, stdout);
  return line.split('\t')[2];
}

const clean = run('pass-owner.json');
assert.equal(clean.status, 0, clean.stdout + clean.stderr);
assert.match(clean.stdout, /^dialog-pack 1 [0-9a-f]{40}\n/);
for (const bar of ['BAR-RESERVATION-PAYMENT', 'BAR-SPLIT-PAYER', 'BAR-UNLIMITED-WORDING', 'BAR-THING-CUSTOMER', 'BAR-NOTES-WHERE', 'BAR-COLLAB-URL']) {
  assert.equal(summary(clean.stdout, bar), 'PASS', clean.stdout);
}

const payment = run('fail-payment.json');
assert.equal(payment.status, 1);
assert.equal(summary(payment.stdout, 'BAR-RESERVATION-PAYMENT'), 'FAIL');
assert.match(payment.stdout, /HIT\t2\tapp\talex\tBAR-RESERVATION-PAYMENT\t/);

const note = run('fail-note-thing.json');
assert.equal(note.status, 1);
assert.equal(summary(note.stdout, 'BAR-NOTES-WHERE'), 'FAIL');
assert.equal(summary(note.stdout, 'BAR-THING-CUSTOMER'), 'FAIL');
assert.match(note.stdout, /HIT\t2\tapp\talex\tBAR-THING-CUSTOMER\t/);

const unlimited = run('fail-unlimited.json');
assert.equal(unlimited.status, 1);
assert.equal(summary(unlimited.stdout, 'BAR-UNLIMITED-WORDING'), 'FAIL');
assert.match(unlimited.stdout, /three vacations|several trips/);

const stripe = run('pass-stripe.json');
assert.equal(stripe.status, 0, stripe.stdout);
assert.equal(summary(stripe.stdout, 'BAR-RESERVATION-PAYMENT'), 'PASS');

const collab = run('fail-collab-url.json');
assert.equal(collab.status, 1);
assert.equal(summary(collab.stdout, 'BAR-COLLAB-URL'), 'FAIL');
assert.match(collab.stdout, /HIT\t2\tapp\tBlair Guest\tBAR-COLLAB-URL\t/);

const asked = run('pass-url-asked.json');
assert.equal(asked.status, 0, asked.stdout);
assert.equal(summary(asked.stdout, 'BAR-COLLAB-URL'), 'PASS');

const split = run('fail-split.json');
assert.equal(split.status, 1);
assert.equal(summary(split.stdout, 'BAR-SPLIT-PAYER'), 'FAIL');

const json = run('fail-payment.json', ['--json']);
assert.equal(json.status, 1);
const body = JSON.parse(json.stdout);
assert.equal(body.version, '1');
assert.equal(body.ok, false);
assert.equal(body.summary['BAR-RESERVATION-PAYMENT'].status, 'FAIL');
assert.equal(body.hits.some((hit) => hit.bar === 'BAR-RESERVATION-PAYMENT' && hit.turn === 2), true);

const usage = spawnSync(process.execPath, [script], { encoding: 'utf8' });
assert.equal(usage.status, 2);
assert.match(usage.stderr, /usage: node scripts\/check-dialog-pack\.mjs <pack\.json> \[--json\] \[--terms <file>\]/);

process.stdout.write('dialog pack check test passed\n');
