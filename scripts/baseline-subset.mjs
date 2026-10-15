import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function rowId(entry) {
  return [entry.file || '', entry.rule || '', entry.symbol_or_pattern || entry.symbol || '', entry.inventory_id || ''].join('\0');
}

function rowText(entry) {
  return [entry.file || '', entry.rule || '', entry.symbol_or_pattern || entry.symbol || '', entry.inventory_id || ''].join('|');
}

function cmp(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function symbolOf(entry) {
  return entry.symbol_or_pattern || entry.symbol || '';
}

function ruleId(entry) {
  return entry.rule || entry.inventory_id || '';
}

function findingSymbol(finding) {
  return finding.symbol_or_pattern || finding.symbol || '';
}

function entryMatchesFinding(entry, finding) {
  return entry.file === finding.file
    && ruleId(entry) === finding.rule
    && symbolOf(entry) === findingSymbol(finding);
}

function capOf(entries, file) {
  const row = (entries || []).find((entry) => ruleId(entry) === 'FILE-SIZE-500' && entry.file === file);
  if (!row) return null;
  const value = Number(String(symbolOf(row)).slice('lines:'.length));
  return Number.isFinite(value) ? value : null;
}

export function allowedFileSize(baseline, baseEntries, baseFindings, file, limit = 500) {
  const own = capOf(baseline, file);
  const cap = own == null ? limit : own;
  const recorded = capOf(baseEntries, file);
  if (recorded != null) return Math.min(cap, recorded);
  const prior = (baseFindings || []).find((finding) => finding.rule === 'FILE-SIZE-500' && finding.file === file);
  if (prior) {
    const lines = Number(String(findingSymbol(prior)).slice('lines:'.length));
    if (Number.isFinite(lines)) return Math.min(cap, lines);
  }
  if (baseEntries || baseFindings) return Math.min(cap, limit);
  return cap;
}

export function growthFails(baseline, base, findings = null, baseFindings = null) {
  if (!base || base.status === 'skip' || base.status === 'missing') return [];
  if (base.status !== 'ok') return [base.error || 'baseline ceiling unavailable'];
  const baseRows = base.entries || base.rows || [];
  const known = new Set(baseRows.map(rowId));
  const baseRules = new Set(baseRows.map(ruleId));
  const allowNewRules = baseRows.length > 0;
  const liveFindings = Array.isArray(findings) ? findings : null;
  const priorFindings = Array.isArray(baseFindings) ? baseFindings : null;
  return baseline.filter((entry) => {
    if (known.has(rowId(entry))) return false;
    if (priorFindings && priorFindings.some((finding) => entryMatchesFinding(entry, finding))) return false;
    if (allowNewRules && !baseRules.has(ruleId(entry))) {
      if (!liveFindings) return false;
      return !liveFindings.some((finding) => entryMatchesFinding(entry, finding));
    }
    return true;
  }).map(rowText);
}

export function scanAtRef(cwd, ref, scan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-base-'));
  const tarPath = path.join(dir, 'base.tar');
  const tree = path.join(dir, 'tree');
  try {
    const archived = spawnSync('git', ['archive', '--format=tar', '-o', tarPath, ref], { cwd, encoding: 'utf8' });
    if (archived.status !== 0) return { status: 'error', error: (archived.stderr || '').trim() || 'base tree unavailable' };
    fs.mkdirSync(tree);
    const extracted = spawnSync('tar', ['-xf', tarPath, '-C', tree], { encoding: 'utf8' });
    if (extracted.status !== 0) return { status: 'error', error: (extracted.stderr || '').trim() || 'base tree extract failed' };
    return { status: 'ok', findings: scan(tree) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function sortRows(rows) {
  return [...rows].sort((a, b) => cmp(a.file || '', b.file || '') || cmp(a.rule || '', b.rule || '') || cmp(symbolOf(a), symbolOf(b)) || cmp(a.inventory_id || '', b.inventory_id || ''));
}

export function pruneBaseline(cwd, rel, load, scan, matches) {
  const baselinePath = path.join(cwd, rel);
  if (!fs.existsSync(baselinePath)) return;
  const baseline = load(baselinePath);
  const findings = scan(cwd);
  const kept = [];
  for (const entry of baseline) {
    if (matches(entry, findings)) kept.push(entry);
    else process.stdout.write(`STALE\t${entry.rule || ''}\t${entry.file}\t${symbolOf(entry)}\t${entry.inventory_id || ''}\n`);
  }
  fs.writeFileSync(baselinePath, `${JSON.stringify(sortRows(kept), null, 2)}\n`);
}
