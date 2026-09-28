import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = path.join(root, 'scripts/vacation-app-reply-rules.mjs');
const turnPath = path.join(root, 'src/vacation/live-app-turn.mjs');
const pricePath = path.join(root, 'src/vacation/seat-price.mjs');

const TRIP_LITERALS = [
  ['Big Island', /big island/i],
  ['Kailua-Kona', /kailua-kona/i],
  ['Kimberly', /\bkimberly\b/i],
  ['Tyler', /\btyler\b/i],
  ['Lauren', /\blauren\b/i],
  ['Craig', /\bcraig\b/i],
  ['Vegas', /\bvegas\b/i],
  ['April', /\bapril\b/i],
  ['Waikiki', /\bwaikiki\b/i],
];

function extractFunction(source, name) {
  const start = source.search(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function ${name}\\s*\\(`, 'm'));
  if (start < 0) throw new Error(`missing function ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(|^export const /m);
  return source.slice(start, next < 0 ? source.length : start + 1 + next);
}

function hits(source, patterns) {
  return patterns.filter(([, re]) => re.test(source)).map(([name]) => name);
}

const failures = [];
const rules = fs.readFileSync(rulesPath, 'utf8');
const turn = fs.readFileSync(turnPath, 'utf8');
const price = fs.readFileSync(pricePath, 'utf8');

if (/function seatWelcomeLine\s*\(/.test(rules)) {
  failures.push('scripts/vacation-app-reply-rules.mjs still defines seatWelcomeLine');
}

const replyRules = extractFunction(rules, 'replyRulesSystem');
const replyHits = hits(replyRules, TRIP_LITERALS);
if (replyHits.length) failures.push(`replyRulesSystem trip literals: ${replyHits.join(', ')}`);
if (/welcome aboard/i.test(replyRules)) failures.push('replyRulesSystem dictates a welcome sentence');
if (/\$27\b|[:=]\s*27\b|\|\|\s*27\b/.test(replyRules)) failures.push('replyRulesSystem still falls back to $27');

for (const name of ['produceLiveAppReply', 'interimFromTierOne', 'finishTierRewrite']) {
  const body = extractFunction(turn, name);
  const found = hits(body, TRIP_LITERALS);
  if (found.length) failures.push(`${name} trip literals: ${found.join(', ')}`);
  if (/welcome aboard/i.test(body)) failures.push(`${name} dictates a welcome sentence`);
}

if (/\$27\b|[:=]\s*27\b|\|\|\s*27\b/.test(price)) {
  failures.push('src/vacation/seat-price.mjs still falls back to $27');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('trip literal ban g2a passed');
