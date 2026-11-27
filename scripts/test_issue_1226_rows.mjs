#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readme = fs.readFileSync(new URL('../features/README.md', import.meta.url), 'utf8');
assert.equal(readme.includes('<<<<<<<'), false, 'features/README.md still has a conflict start marker');
assert.equal(readme.includes('>>>>>>>'), false, 'features/README.md still has a conflict end marker');
assert.equal(readme.includes('\n=======\n'), false, 'features/README.md still has a conflict separator');
assert.match(readme, /Show test customers/);
assert.match(readme, /\.admin-view-note/);
assert.match(
  readme,
  /Choose a customer to drill down into their trips, chat and QA\./,
);
assert.match(
  readme,
  /The same dropdown is the only top-level entry point for view actions such as Dialog PDF, Keepsake PDF, and Generate\./,
);
console.log('test_issue_1226_rows: ok');