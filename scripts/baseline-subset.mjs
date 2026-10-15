import fs from 'node:fs';
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

export function growthFails(baseline, base, findings = null) {
  if (!base || base.status === 'skip' || base.status === 'missing') return [];
  if (base.status !== 'ok') return [base.error || 'baseline ceiling unavailable'];
  const baseRows = base.entries || base.rows || [];
  const known = new Set(baseRows.map(rowId));
  const baseRules = new Set(baseRows.map(ruleId));
  const allowNewRules = baseRows.length > 0;
  const liveFindings = Array.isArray(findings) ? findings : null;
  return baseline.filter((entry) => {
    if (known.has(rowId(entry))) return false;
    if (allowNewRules && !baseRules.has(ruleId(entry))) {
      if (!liveFindings) return false;
      return !liveFindings.some((finding) => entryMatchesFinding(entry, finding));
    }
    return true;
  }).map(rowText);
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
