import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classify, loadBaselineFile } from './check-hardcoded-content.mjs';
import { cardRecords, jevCardFindings, questionsFrom, receiptMatches } from './jev-cards.mjs';
import { parseJevRelevanceScoreAnswer } from '../src/vacation/place-relevance-score-parse.mjs';

const THRESHOLD = 0.8;
const KEY_NAMES = [
  'OPENROUTER_API_KEY',
  'JEV_OPENROUTER_API_KEY',
  'TIMESYNCHER_JEV_CLASSIFY_TOKEN',
  'TIMESYNCHER_OPENROUTER_API_KEY',
  'TIMESYNCHER_JEV_OPENROUTER_API_KEY',
];

function apiKey() {
  for (const name of KEY_NAMES) {
    const value = process.env[name];
    if (value) return value;
  }
  return '';
}

function gitSha(cwd) {
  const shown = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return shown.status === 0 ? shown.stdout.trim() : 'unknown';
}

function labeledRows(cwd, record) {
  const abs = path.join(cwd, record.labeledRel);
  if (!fs.existsSync(abs)) return [];
  return fs.readFileSync(abs, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

function questionMap(record) {
  try {
    const value = questionsFrom(record);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const usable = Object.values(value).every((item) => item && typeof item === 'object' && (item.type || item.instructions));
    return usable ? value : null;
  } catch {
    return null;
  }
}

export function liveGaps(cwd, record) {
  const gaps = [];
  if (!questionMap(record)) gaps.push('no usable questions');
  if (!labeledRows(cwd, record).length) gaps.push('no labeled rows');
  if (!(process.env.JEV_EVAL_MODEL || record.modelHint)) gaps.push('no model');
  return gaps;
}

function scoreForEval(recordId, question, answer) {
  if (recordId === 'poi-relevance' && question === 'relevance') {
    try {
      return parseJevRelevanceScoreAnswer(answer);
    } catch {
      return NaN;
    }
  }
  return Number(answer.score ?? answer.noul ?? answer.probability ?? answer.choice ?? answer.value);
}

function casePasses(expect, answers, recordId = '') {
  for (const [question, wanted] of Object.entries(expect || {})) {
    const answer = answers && answers[question] ? answers[question] : {};
    if (typeof wanted === 'string') {
      if (String(answer.choice || '') !== wanted) return false;
      continue;
    }
    const score = scoreForEval(recordId, question, answer);
    if (wanted.choice && String(answer.choice || '') !== wanted.choice) return false;
    if (wanted.min != null && !(score >= wanted.min)) return false;
    if (wanted.max != null && !(score <= wanted.max)) return false;
  }
  return true;
}

export async function runLive(cwd, record) {
  const url = process.env.TIMESYNCHER_JEV_CLASSIFY_URL || '';
  const token = apiKey();
  const questions = questionMap(record);
  const rows = labeledRows(cwd, record);
  const model = process.env.JEV_EVAL_MODEL || record.modelHint || '';
  const gaps = liveGaps(cwd, record);
  if (!url || !token || gaps.length) return { passed: false, wrote: false, gaps };
  let passedCases = 0;
  for (const row of rows) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ model, state: row.state || {}, questions }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && casePasses(row.expect, body.answers || {}, record.id)) passedCases += 1;
  }
  const score = passedCases / rows.length;
  const passed = score >= THRESHOLD;
  const verdict = passed ? 'pass' : 'fail';
  process.stdout.write(`RECEIPT\t${record.id}\t${model}\t${verdict}\n`);
  if (!passed) return { passed: false, score, wrote: false, verdict };
  const receipt = {
    card: record.id,
    model,
    verdict,
    cardHash: record.cardHash,
    labeledSetHash: record.labeledSetHash,
    passed: true,
    score,
    threshold: THRESHOLD,
    ranAt: new Date().toISOString(),
    gitSha: gitSha(cwd),
  };
  const dest = path.join(cwd, 'evals/jev', record.id, 'receipt.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  return { passed: true, score, wrote: true, receipt, verdict };
}

async function main() {
  const cwd = process.cwd();
  const key = apiKey();
  const liveGapsFound = [];
  if (key) {
    if (!process.env.TIMESYNCHER_JEV_CLASSIFY_URL) {
      liveGapsFound.push('live\tno classify URL');
    } else {
      for (const record of cardRecords(cwd)) {
        if (receiptMatches(record)) continue;
        const gaps = liveGaps(cwd, record);
        if (gaps.length) {
          liveGapsFound.push(`${record.id}\t${gaps.join(', ')}`);
          continue;
        }
        await runLive(cwd, record);
      }
    }
  }
  for (const gap of liveGapsFound) process.stderr.write(`FAIL\tJEV-CARD-EVAL\t${gap}\n`);
  const findings = jevCardFindings(cwd);
  const baselinePath = path.join(cwd, 'scripts/hardcoded-content-baseline.json');
  const baseline = fs.existsSync(baselinePath) ? loadBaselineFile(baselinePath) : [];
  const judged = classify(findings, baseline);
  for (const finding of judged.report) {
    process.stdout.write(`REPORT\t${finding.rule}\t${finding.file}:${finding.line}\t${finding.symbol_or_pattern}\n`);
  }
  for (const finding of judged.fail) {
    process.stderr.write(`FAIL\t${finding.rule}\t${finding.file}:${finding.line}\t${finding.symbol_or_pattern}\n`);
  }
  const failed = judged.fail.length + liveGapsFound.length;
  const summary = `jev card eval gate ${failed ? 'failed' : 'passed'} (${judged.report.length} report, ${failed} fail)\n`;
  (failed ? process.stderr : process.stdout).write(summary);
  if (!key) process.stdout.write('jev live eval skipped (no Jev API secret or classify URL); receipt check is the gate\n');
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
