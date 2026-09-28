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

export function growthFails(baseline, base) {
  if (!base || base.status === 'skip' || base.status === 'missing') return [];
  if (base.status !== 'ok') return [base.error || 'baseline ceiling unavailable'];
  const known = new Set((base.entries || []).map(rowId));
  return baseline.filter((entry) => !known.has(rowId(entry))).map(rowText);
}

function sortRows(rows) {
  return [...rows].sort((a, b) => cmp(a.file || '', b.file || '') || cmp(a.rule || '', b.rule || '') || cmp(symbolOf(a), symbolOf(b)) || cmp(a.inventory_id || '', b.inventory_id || ''));
}

// --prune rewrites the baseline to rows that still match a finding and never adds rows.
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
