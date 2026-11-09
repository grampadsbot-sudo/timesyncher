#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const html = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../vacation-app.html'), 'utf8');
assert.match(html, /function tripOptionSub\(item\)/);
assert.match(html, /\$\{safe\(tripOptionSub\(item\)\)\}/);
assert.doesNotMatch(html, /item\.status \|\| 'Vacation'/);
assert.doesNotMatch(html, /shared_ready/);
console.log('PASS test_vacation_app_trip_option_sub');
