import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TRIP_LITERALS = [
  'Big Island',
  'Kailua-Kona',
  'Kimberly',
  'Tyler',
  'Lauren',
  'Craig',
  'Vegas',
  'April',
  'Waikiki',
];

const BANNED_SENTENCES = [
  'seatJoinCustomerText',
  'I accepted the EULA terms and clicked join',
  'Keep us on the Big Island',
  'Craig paid for this seat',
  'paid for my own seat with the coupon',
  'the Vegas vacation',
  'Welcome aboard, Kimberly',
  'Welcome aboard, Tyler',
  'Welcome aboard, Lauren',
  'The first sentence is',
];

const SENTENCE_ROOTS = [
  'src/vacation',
  'scripts/vacation-app-reply-rules.mjs',
  'routes/vacation-telegram-turn.mjs',
  'routes/vacation-itinerary.mjs',
  'vacation-app.html',
];

const REPLY_FUNCTIONS = ['supportReplyFacts', 'modelSupportReply', 'vacationSupportReply'];

function walk(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [rel];
  const out = [];
  for (const entry of fs.readdirSync(abs)) {
    const child = path.join(rel, entry);
    if (fs.statSync(path.join(root, child)).isDirectory()) out.push(...walk(child));
    else if (/\.(mjs|js|html)$/.test(entry)) out.push(child);
  }
  return out;
}

export function sentenceHits(source) {
  return BANNED_SENTENCES.filter((sentence) => source.includes(sentence));
}

export function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (start < 0) return '';
  const params = source.indexOf('(', start);
  let depth = 0;
  let body = -1;
  for (let i = params; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        body = source.indexOf('{', i);
        break;
      }
    }
  }
  if (body < 0) return '';
  depth = 0;
  for (let i = body; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

export function tripLiteralHits(source) {
  return TRIP_LITERALS.filter((literal) => new RegExp(`\\b${literal.replace(/[-]/g, '\\$&')}\\b`, 'i').test(source));
}

export function g2bViolations(read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')) {
  const violations = [];
  for (const file of SENTENCE_ROOTS.flatMap(walk)) {
    for (const hit of sentenceHits(read(file))) violations.push(`${file}: banned reply sentence ${hit}`);
  }
  for (const hit of tripLiteralHits(read('src/vacation/collaborator-app-seat.mjs'))) {
    violations.push(`src/vacation/collaborator-app-seat.mjs: trip literal ${hit}`);
  }
  const telegram = read('routes/vacation-telegram-turn.mjs');
  for (const name of REPLY_FUNCTIONS) {
    const fn = extractFunction(telegram, name);
    if (!fn) {
      violations.push(`routes/vacation-telegram-turn.mjs: missing ${name}`);
      continue;
    }
    if (/return\s+['"`]/.test(fn)) violations.push(`routes/vacation-telegram-turn.mjs: ${name} returns a literal reply`);
    for (const hit of tripLiteralHits(fn)) violations.push(`routes/vacation-telegram-turn.mjs: ${name} trip literal ${hit}`);
  }
  const replyFn = extractFunction(telegram, 'vacationSupportReply');
  if (replyFn && !replyFn.includes('modelSupportReply')) {
    violations.push('routes/vacation-telegram-turn.mjs: vacationSupportReply is not model-generated');
  }
  return violations;
}

assert.ok(sentenceHits('return "Keep us on the Big Island"; seatJoinCustomerText').length >= 2);
assert.ok(tripLiteralHits('const place = "Waikiki";').includes('Waikiki'));
assert.deepEqual(tripLiteralHits('function supportReplyFacts(){ return facts; }'), []);
const sampleFn = extractFunction('export async function vacationSupportReply() {\n  return "the Vegas vacation";\n}\n', 'vacationSupportReply');
assert.match(sampleFn, /return "the Vegas vacation"/);
assert.ok(/return\s+['"`]/.test(sampleFn));

const violations = g2bViolations();
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('g2b reply literal check passed');
