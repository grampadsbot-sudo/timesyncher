#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(path.join(root, 'apps/vacation-client/src/styles.css'), 'utf8');

const mobileBlocks = [...css.matchAll(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{([\s\S]*?)\n\}/g)].map(
  (match) => match[1],
);
const listMobile = mobileBlocks.find((block) => block.includes('.tsv-row-main'));
assert.ok(listMobile, 'expected list-row @media (max-width: 480px) block in vacation-client styles');
const budgetMobile = mobileBlocks.find((block) => block.includes('.tsv-budget-line-name'));
assert.ok(budgetMobile, 'expected budget-line @media (max-width: 480px) block after base budget styles');

const budgetBaseIdx = css.indexOf('.tsv-budget-line-name {');
const budgetMobileIdx = css.indexOf('@media (max-width: 480px)', budgetBaseIdx);
assert.ok(budgetBaseIdx >= 0 && budgetMobileIdx > budgetBaseIdx, 'budget mobile wrap must follow base budget-line-name');

assert.match(listMobile, /\.tsv-row-main:not\(\.tsv-row-flight-main\)\s+\.tsv-row-name[\s\S]*white-space:\s*normal/);
for (const selector of ['.tsv-row-desc', '.tsv-row-hotel-note', '.tsv-row-car-desc']) {
  assert.match(listMobile, new RegExp(`${selector.replace('.', '\\.')}[\\s\\S]*white-space:\\s*normal`));
}
assert.match(budgetMobile, /\.tsv-budget-line-name[\s\S]*white-space:\s*normal/);

assert.match(css, /\.tsv-row-desc[\s\S]*white-space:\s*nowrap/);
assert.match(css, /\.tsv-row-name[\s\S]*white-space:\s*nowrap/);
assert.match(css, /\.tsv-budget-line-name[\s\S]*white-space:\s*nowrap/);

console.log('vacation-client list row 390px text wrap CSS contract OK');
