import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/', import.meta.url));

const rules = [
  { label: 'api.vercel.com', hit: (text) => text.includes('api.vercel.com') },
  { label: 'vercel cli', hit: (text) => text.includes('vercel ') },
  { label: 'VERCEL_TOKEN', hit: (text) => text.includes('VERCEL_TOKEN') },
];

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'output') continue;
      out.push(...await files(full));
    } else out.push(full);
  }
  return out;
}

const hits = [];
for (const file of await files(skillDir)) {
  const text = await readFile(file, 'utf8');
  for (const rule of rules) {
    if (rule.hit(text)) hits.push(`${path.relative(skillDir, file)}: ${rule.label}`);
  }
}
assert.deepEqual(hits, [], hits.join('\n'));
process.stdout.write('verify skill has no vercel api or cli references\n');
