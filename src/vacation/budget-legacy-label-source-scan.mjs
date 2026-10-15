import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VACATION_SRC_ROOT = fileURLToPath(new URL('.', import.meta.url));

const ADJACENT_LITERAL_CONCAT_RE =
  /(['"])(?:\\.|(?!\1)[^\\])*\1\s*\+\s*(['"])(?:\\.|(?!\2)[^\\])*\2/g;

function unquoteLiteral(literal) {
  const quote = literal[0];
  const body = literal.slice(1, -1);
  return body.replace(new RegExp(`\\\\${quote}|\\\\.`, 'g'), (esc) => (esc.length === 2 ? esc[1] : esc));
}

export function mergeAdjacentStringLiterals(source = '') {
  let text = String(source);
  for (let pass = 0; pass < 32; pass++) {
    const next = text.replace(ADJACENT_LITERAL_CONCAT_RE, (segment) => {
      const parts = segment.match(/(['"])(?:\\.|(?!\1)[^\\])*\1/g);
      if (!parts || parts.length < 2) return segment;
      const quote = parts[0][0];
      const merged = parts.map(unquoteLiteral).join('');
      const escaped = merged.replace(new RegExp(`\\\\|${quote}`, 'g'), (ch) => `\\${ch}`);
      return `${quote}${escaped}${quote}`;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

function walkMjsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkMjsFiles(path, out);
      continue;
    }
    if (name.endsWith('.mjs')) out.push(path);
  }
  return out;
}

export function findLegacyMiscBucketLabelInVacationSource(legacyLabel) {
  const label = String(legacyLabel ?? '').trim();
  if (!label) return [];
  const hits = [];
  for (const file of walkMjsFiles(VACATION_SRC_ROOT)) {
    const raw = readFileSync(file, 'utf8');
    const normalized = mergeAdjacentStringLiterals(raw);
    if (normalized.includes(label)) {
      hits.push(file.slice(VACATION_SRC_ROOT.length));
    }
  }
  return hits;
}
