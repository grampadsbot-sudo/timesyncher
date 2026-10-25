#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { lineageRows } from './lib/pr336-stored-narrative-lineage-lib.mjs';

function readGateBTemplateRePattern(restoreCheckPath) {
  const src = readFileSync(restoreCheckPath, 'utf8');
  const match = src.match(/^TEMPLATE_RE\s*=\s*re\.compile\((r"[^"]+"|r'[^']+')/m);
  if (!match) throw new Error(`TEMPLATE_RE not found in ${restoreCheckPath}`);
  const raw = match[1].slice(2, -1);
  return new RegExp(raw.replace(/\\\\/g, '\\'), 'i');
}

const restoreCheck = process.env.GATEB_RESTORE_CHECK
  || '/home/ubishere9995/tsv-gateb/restore_check.py';

const rows = lineageRows();
let exitCode = 0;
console.log('PR336 stored narrative lineage probe (zero provider calls)');
console.log('rows:', rows.map((row) => row.rowId).join(', '));
for (const row of rows) {
  console.log('');
  console.log(`row ${row.rowId} ${row.gateBName}`);
  console.log('  ccabKey:', row.ccabKey);
  console.log('  branch:', row.providerBranch);
  console.log('  overlayCommit:', row.overlayIntroCommit);
  console.log('  structuredPrice:', row.structuredPrice);
  console.log('  priceSuffixTemplate:', row.hasPriceSuffixTemplate);
  console.log('  aligned overlay/build/snapshot:', row.descriptionsAligned);
  if (!row.descriptionsAligned) exitCode = 1;
}

try {
  const checkerBytes = readFileSync(restoreCheck);
  const checkerSha = createHash('sha256').update(checkerBytes).digest('hex');
  const templateRe = readGateBTemplateRePattern(restoreCheck);
  const sample = rows[0]?.builtDescription || '';
  const templateHit = templateRe.exec(sample);
  console.log('');
  console.log('Gate B checker:', restoreCheck);
  console.log('checker sha256:', checkerSha);
  console.log('TEMPLATE_RE pattern:', templateRe.source);
  console.log('row 602 full narrative matches TEMPLATE_RE:', Boolean(templateHit), templateHit ? templateHit[0] : '');
} catch (err) {
  console.error('checker read skipped:', err.message);
}

if (exitCode) {
  console.error('PROBE FAIL: lineage invariants broken');
  process.exit(1);
}
console.log('PROBE PASS: six rows trace overlay/build/snapshot descriptions through stored fixture literals');
