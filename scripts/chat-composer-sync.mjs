#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_FILES = [
  'public/chat-composer/chat-composer.js',
  'public/chat-composer/chat-composer.css',
  'scripts/chat-composer-sync.mjs',
];
export const MANIFEST = 'public/chat-composer/SHA256SUMS';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(here);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function manifestText(root = defaultRoot) {
  return SHARED_FILES.map((rel) => `${sha256(fs.readFileSync(path.join(root, rel)))}  ${rel}\n`).join('');
}

function parseManifest(text) {
  const rows = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^([0-9a-f]{64}) {2}(\S+)$/);
    if (m) rows.set(m[2], m[1]);
  }
  return rows;
}

export function checkLocal(root = defaultRoot) {
  const problems = [];
  const manifestPath = path.join(root, MANIFEST);
  if (!fs.existsSync(manifestPath)) return [`missing ${MANIFEST}`];
  const rows = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
  for (const rel of SHARED_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { problems.push(`missing ${rel}`); continue; }
    const want = rows.get(rel);
    if (!want) problems.push(`${rel} not listed in ${MANIFEST}`);
    else if (want !== sha256(fs.readFileSync(abs))) problems.push(`${rel} differs from ${MANIFEST}`);
  }
  for (const rel of rows.keys()) if (!SHARED_FILES.includes(rel)) problems.push(`${MANIFEST} lists unknown ${rel}`);
  return problems;
}

async function readOther(base, rel) {
  if (/^https?:\/\//.test(base)) {
    const res = await fetch(`${base.replace(/\/+$/, '')}/${rel}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`fetch ${rel}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const abs = path.join(base, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
}

export async function compareWith(base, root = defaultRoot) {
  const problems = [];
  const other = await readOther(base, MANIFEST);
  if (!other) return { found: false, problems: [`no ${MANIFEST} at the other copy`] };
  for (const rel of [...SHARED_FILES, MANIFEST]) {
    const theirs = rel === MANIFEST ? other : await readOther(base, rel);
    const ours = fs.readFileSync(path.join(root, rel));
    if (!theirs) problems.push(`other copy is missing ${rel}`);
    else if (!theirs.equals(ours)) problems.push(`${rel} differs from the other copy`);
  }
  return { found: true, problems };
}

export function copyTo(target, root = defaultRoot) {
  for (const rel of [...SHARED_FILES, MANIFEST]) {
    const dest = path.join(target, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
}

async function main(argv) {
  const [cmd = 'check', arg = ''] = argv;
  if (cmd === 'manifest') {
    fs.writeFileSync(path.join(defaultRoot, MANIFEST), manifestText());
    process.stdout.write(`wrote ${MANIFEST}\n`);
    return 0;
  }
  const local = checkLocal();
  if (local.length) {
    for (const p of local) process.stderr.write(`chat-composer drift: ${p}\n`);
    process.stderr.write('Edit the shared composer in timesyncher, run `node scripts/chat-composer-sync.mjs manifest`, then `node scripts/chat-composer-sync.mjs copy <business-signal-ai checkout>`.\n');
    return 1;
  }
  if (cmd === 'check') {
    process.stdout.write(`chat-composer copy matches ${MANIFEST} (${SHARED_FILES.length} files)\n`);
    return 0;
  }
  if (cmd === 'copy') {
    if (!arg) throw new Error('usage: chat-composer-sync.mjs copy <other repo root>');
    copyTo(path.resolve(arg));
    process.stdout.write(`copied ${SHARED_FILES.length + 1} files to ${arg}\n`);
    return 0;
  }
  if (cmd === 'compare') {
    const bases = arg ? arg.split(',') : [];
    if (!bases.length) throw new Error('usage: chat-composer-sync.mjs compare <dir-or-raw-url>[,<fallback>...]');
    for (const base of bases) {
      const { found, problems } = await compareWith(base);
      if (!found) { process.stdout.write(`no shared composer at ${base}; trying next\n`); continue; }
      if (problems.length) {
        for (const p of problems) process.stderr.write(`chat-composer drift vs ${base}: ${p}\n`);
        return 1;
      }
      process.stdout.write(`chat-composer copy is byte-identical to ${base}\n`);
      return 0;
    }
    process.stderr.write('chat-composer: no other copy found to compare\n');
    return 1;
  }
  throw new Error(`unknown command ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
