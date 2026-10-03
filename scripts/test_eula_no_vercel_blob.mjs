import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const blobNeedle = ['@vercel', '/blob'].join('');

function isEulaReceiptPath(rel) {
  const base = path.basename(rel);
  if (base === 'test_eula_no_vercel_blob.mjs') return false;
  if (/^eula/i.test(base) || /receipt/i.test(base)) return true;
  if (rel === 'routes/eula.mjs') return true;
  if (rel === 'src/onboarding/eula-persistent-store.mjs') return true;
  if (rel === 'src/vacation/collaborator-eula-accept.mjs') return true;
  if (rel.startsWith('scripts/') && (/eula/i.test(base) || /receipt/i.test(base))) return true;
  return false;
}

async function walk(dir, rel = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...await walk(path.join(dir, entry.name), nextRel));
      continue;
    }
    if (!entry.name.endsWith('.mjs') && !entry.name.endsWith('.js')) continue;
    files.push(nextRel);
  }
  return files;
}

const candidates = (await walk(root)).filter(isEulaReceiptPath);
assert.ok(candidates.length > 0, 'expected at least one EULA/receipt source file');

const offenders = [];
for (const rel of candidates) {
  const text = await readFile(path.join(root, rel), 'utf8');
  if (text.includes(blobNeedle)) offenders.push(rel);
}

assert.deepEqual(offenders, [], `EULA/receipt code must not import ${blobNeedle}: ${offenders.join(', ')}`);
process.stdout.write('eula no vercel blob static check passed\n');
