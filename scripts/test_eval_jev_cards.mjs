import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jevCardFindings, receiptMatches, cardRecords } from './jev-cards.mjs';

const script = fileURLToPath(new URL('./eval-jev-cards.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

function writeCard(dir, literal) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'evals/jev/sample'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/card.mjs'), `function sampleCard() {\n  const questions = ${literal};\n  return questions;\n}\n`);
  fs.writeFileSync(path.join(dir, 'evals/jev/registry.json'), `${JSON.stringify({
    cards: [{ id: 'sample', file: 'src/card.mjs', anchor: 'function sampleCard', extract: 'questions' }],
  }, null, 2)}\n`);
  const labeled = '{"id":"a","state":{"current_turn":"hello"},"expect":{"ready":"yes"}}\n';
  fs.writeFileSync(path.join(dir, 'evals/jev/sample/labeled.jsonl'), labeled);
  fs.writeFileSync(path.join(dir, 'scripts/hardcoded-content-baseline.json'), '[]\n');
  return labeled;
}

const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-missing-'));
writeCard(missing, '{ ready: { type: "choice", instructions: "Pick yes.", criteria: { yes: "Yes." } } }');
const missingHits = jevCardFindings(missing);
assert.equal(missingHits.length, 1);
assert.equal(missingHits[0].rule, 'JEV-CARD-EVAL');
assert.match(missingHits[0].symbol_or_pattern, /^sample [0-9a-f]{12} [0-9a-f]{12}$/);

const record = cardRecords(missing)[0];
assert.equal(receiptMatches(record), false);
const receipt = {
  cardHash: record.cardHash,
  labeledSetHash: record.labeledSetHash,
  model: 'typesafe/jev-1.13',
  passed: true,
  score: 1,
  threshold: 0.8,
  ranAt: '2026-09-28T00:00:00.000Z',
  gitSha: 'abc',
};
fs.writeFileSync(path.join(missing, 'evals/jev/sample/receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
assert.equal(receiptMatches(cardRecords(missing)[0]), true);
assert.equal(jevCardFindings(missing).length, 0);

receipt.cardHash = 'different';
fs.writeFileSync(path.join(missing, 'evals/jev/sample/receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
assert.equal(jevCardFindings(missing).length, 1);

const gateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-gate-'));
writeCard(gateDir, '{ ready: { type: "choice", instructions: "Pick yes.", criteria: { yes: "Yes." } } }');
const gate = spawnSync(process.execPath, [script, '--gate'], {
  cwd: gateDir,
  encoding: 'utf8',
  env: { ...process.env, OPENROUTER_API_KEY: '', TIMESYNCHER_JEV_CLASSIFY_URL: '' },
});
assert.equal(gate.status, 1, gate.stdout + gate.stderr);
assert.match(gate.stderr, /JEV-CARD-EVAL/);
assert.match(`${gate.stdout}\n${gate.stderr}`, /receipt check is the gate/);
assert.equal(fs.existsSync(path.join(gateDir, 'evals/jev/sample/receipt.json')), false);

const repoRun = spawnSync(process.execPath, [script, '--gate'], {
  cwd: repo,
  encoding: 'utf8',
  env: { ...process.env, OPENROUTER_API_KEY: '', JEV_OPENROUTER_API_KEY: '', TIMESYNCHER_JEV_CLASSIFY_TOKEN: '', TIMESYNCHER_OPENROUTER_API_KEY: '', TIMESYNCHER_JEV_OPENROUTER_API_KEY: '', TIMESYNCHER_JEV_CLASSIFY_URL: '' },
});
assert.equal(repoRun.status, 0, repoRun.stderr);
assert.match(repoRun.stdout, /jev card eval gate passed/);
assert.match(repoRun.stdout, /jev live eval skipped/);
assert.equal(fs.readdirSync(path.join(repo, 'evals/jev')).some((name) => name === 'receipt.json'), false);

process.stdout.write('jev card eval gate test passed\n');
