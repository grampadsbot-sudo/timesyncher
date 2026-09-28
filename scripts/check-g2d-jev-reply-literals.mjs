#!/usr/bin/env node
// G2-d: the Jev score, fact-check, interim upsell, and same-tier rewrite
// cannot hard-code a trip or dictate a reply sentence. Other inventory
// items in these files belong to parallel PRs, so this check reads only
// the functions this change owns.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const liveTurn = fs.readFileSync(path.join(root, 'src/vacation/live-app-turn.mjs'), 'utf8');
const replyRules = fs.readFileSync(path.join(root, 'scripts/vacation-app-reply-rules.mjs'), 'utf8');

const TRIP_LITERALS = [
  /\bBig Island\b/i,
  /\bKailua-Kona\b/i,
  /\bKimberly\b/,
  /\bTyler\b/,
  /\bLauren\b/,
  /\bCraig\b/,
  /\bVegas\b/,
  /\bApril\b/,
  /\bWaikiki\b/,
];

const DICTATED_SENTENCES = [
  'I am building the itinerary from that now',
  'View access lets them see the days',
  'Edit access lets them add notes after you approve an email invite',
  'Welcome aboard',
  'Include these sentences',
];

function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\b`));
  assert.notEqual(start, -1, `missing function ${name}`);
  let cursor = source.indexOf('(', start);
  let parens = 0;
  for (; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === '(') parens += 1;
    else if (char === ')') {
      parens -= 1;
      if (parens === 0) {
        cursor += 1;
        break;
      }
    }
  }
  const brace = source.indexOf('{', cursor);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

const owned = [
  'verifiedRewriteChange',
  'draftFactErrors',
  'withoutNegatedDays',
  'rangeEndRe',
  'calendarMonths',
  'upsellFactsForTurn',
  'interimFromTierOne',
  'sameTierRewriteRequest',
].map((name) => functionBody(liveTurn, name)).join('\n');

for (const pattern of TRIP_LITERALS) {
  assert.doesNotMatch(owned, pattern, `G2-d path still has trip literal ${pattern}`);
}
for (const sentence of DICTATED_SENTENCES) {
  assert.equal(owned.includes(sentence), false, `G2-d path still dictates: ${sentence}`);
}
assert.doesNotMatch(functionBody(liveTurn, 'verifiedRewriteChange'), /whole crew|\\bmoved\\b/);
assert.doesNotMatch(replyRules, /JEV_QUALITY_COMMENTS|NOTE_RUBRIC/);
assert.doesNotMatch(replyRules, /Clear day shape that stays with the customer words/);
assert.doesNotMatch(functionBody(replyRules, 'qualityFromDecisions'), /extractJevFreeNote|jevNote: rawNote|text field/);
assert.match(functionBody(replyRules, 'jevQualityRewrite'), /Return a score only/);
assert.match(functionBody(liveTurn, 'sameTierRewriteRequest'), /Fact-check flags/);
assert.match(functionBody(liveTurn, 'sameTierRewriteRequest'), /WHAT_I_CHANGED/);

console.log('g2d jev reply literals: ok');
