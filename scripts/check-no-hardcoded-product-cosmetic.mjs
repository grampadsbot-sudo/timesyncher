import fs from 'node:fs';
import path from 'node:path';

/**
 * G3 cosmetic hard-code guard. Fails if a removed literal returns.
 * A19 name→logo map, A21 Vegas/brand icon rules, A22 city placeholder,
 * C13 vegas-anniversary placeholder, D9 Attraction default, D10 null budget.
 */
export const RULES = [
  {
    id: 'A19',
    file: 'src/vacation/thing-logo-capture.mjs',
    pattern: /NAMED_THING_LOGOS|BRAND_LOGOS|\/ts-thing-logos\/|\bBellagio\b|\bCarbone\b|Shake Shack|Eggslut|Lotus of Siam/,
  },
  {
    id: 'A21',
    file: 'src/vacation/timeline-icons.mjs',
    pattern: /\b(las vegas|vegas|bellagio|marriott|hyatt|hilton|sheraton|carbone|eggslut|shake shack|lotus of siam|conservatory)\b/i,
  },
  {
    id: 'A21',
    file: 'public/ts-timeline-icon-patch.js',
    pattern: /\b(las vegas|vegas|bellagio|marriott|hyatt|hilton|sheraton|carbone|eggslut|shake shack|lotus of siam|conservatory)\b/i,
  },
  {
    id: 'A22',
    file: 'index.html',
    pattern: /placeholder\s*=\s*["']Las Vegas["']/,
  },
  {
    id: 'A22',
    file: 'order-test.html',
    pattern: /placeholder\s*=\s*["']Las Vegas["']/,
  },
  {
    id: 'C13',
    file: 'vacation-app.html',
    pattern: /vegas anniversary/i,
  },
  {
    id: 'D9',
    file: 'src/vacation/intake-shared-trip.mjs',
    pattern: /category_name:\s*['"]Attraction['"]|category_icon:\s*['"]🏛️['"]\s*,\s*category:\s*['"]other['"]/,
  },
  {
    id: 'D10',
    file: 'src/vacation/intake-shared-trip.mjs',
    pattern: /total_price:\s*null|share_budget:\s*true/,
  },
];

export function hitsInFile(relPath, text) {
  const hits = [];
  const source = String(text ?? '');
  for (const rule of RULES) {
    if (rule.file !== relPath) continue;
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let match = pattern.exec(source);
    while (match) {
      hits.push({
        id: rule.id,
        file: relPath,
        line: source.slice(0, match.index).split('\n').length,
        excerpt: match[0],
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
      match = pattern.exec(source);
    }
  }
  return hits;
}

export function scanRepo(cwd = process.cwd()) {
  const hits = [];
  for (const rel of [...new Set(RULES.map((rule) => rule.file))]) {
    const abs = path.join(cwd, rel);
    if (!fs.existsSync(abs)) {
      hits.push({ id: 'missing', file: rel, line: 0, excerpt: 'file missing' });
      continue;
    }
    hits.push(...hitsInFile(rel, fs.readFileSync(abs, 'utf8')));
  }
  return hits;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  const hits = scanRepo();
  if (hits.length) {
    for (const hit of hits) console.error(`${hit.id} ${hit.file}:${hit.line} ${hit.excerpt}`);
    process.exit(1);
  }
  console.log('product cosmetic hard-code check passed');
}
