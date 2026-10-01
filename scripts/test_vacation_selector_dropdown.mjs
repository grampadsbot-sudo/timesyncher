import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const selectorBlock = page.slice(page.indexOf('function vacationSelector'), page.indexOf('function realVacations'));

assert.match(selectorBlock, /if \(!trips\.length\)/);
assert.match(selectorBlock, /role="listbox"><\/div><\/div>`/);
assert.doesNotMatch(selectorBlock, /trips\.length < 2/);
assert.doesNotMatch(selectorBlock, /trip-label/);
assert.match(selectorBlock, /trips\.map\(\(item\)/);

console.log('vacation selector dropdown passed');
