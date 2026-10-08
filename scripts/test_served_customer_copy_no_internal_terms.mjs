#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const CUSTOMER_HTML = [
  'shared-app.html',
  'vacation-app.html',
  'index.html',
  'login.html',
  'terms.html',
  'privacy.html',
  'order-success.html',
];

const LEGAL_DISCLOSURE_PAGES = new Set(['terms.html', 'privacy.html']);

const FORBIDDEN_PROSE = [
  { id: 'gbrain', re: /\bGBrain\b/i },
  { id: 'coming-soon', re: /\bcoming soon\b/i },
  { id: 'jev', re: /\bJev\b/ },
  { id: 'openrouter', re: /\bOpenRouter\b/i },
  { id: 'openclaw', re: /\bOpenClaw\b/i },
  { id: 'grok', re: /\bGrok\b/i },
  { id: 'shepherd', re: /\bShepherd\b/ },
  { id: 'workflow-promise', re: /compare-and-summarize workflow/i },
  { id: 'composer-model', re: /\bcomposer-2/i },
  { id: 'mcp-cursor-product', re: /Claude Web[,、] Cursor|Claude Web وCursor/ },
  { id: 'ai-assisted', re: /AI-assisted/i, allowOnLegal: true, allowedFooters: ['AI-assisted itinerary planning', 'AI-assisted vacation itinerary planning'] },
];

function stripNonProse(html = '') {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/\bplaceholder="[^"]*"/gi, ' ')
    .replace(/\bcursor\s*:/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scanText(rel, text) {
  const hits = [];
  for (const rule of FORBIDDEN_PROSE) {
    if (rule.allowOnLegal && LEGAL_DISCLOSURE_PAGES.has(rel)) continue;
    const match = text.match(rule.re);
    if (match) {
      const idx = text.search(rule.re);
      if (rule.allowedFooters?.some((phrase) => text.slice(idx, idx + phrase.length) === phrase)) continue;
      hits.push({ file: rel, rule: rule.id, sample: match[0] });
    }
  }
  return hits;
}

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const renderedBundle = renderServedTrekBundle(raw.toString('utf8'));
const committedBundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(renderedBundle, committedBundle, 'committed served bundle must match renderServedTrekBundle');

const hits = [];
hits.push(...scanText('public/assets/index-BKun7ofk.js', renderedBundle));
for (const rel of CUSTOMER_HTML) {
  const source = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
  hits.push(...scanText(rel, stripNonProse(source)));
}

assert.equal(hits.length, 0, `customer-visible served copy contains internal terms: ${JSON.stringify(hits, null, 2)}`);

console.log('served customer copy no internal terms tests passed');
