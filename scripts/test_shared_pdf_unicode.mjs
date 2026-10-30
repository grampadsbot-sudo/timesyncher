import assert from 'node:assert/strict';

import { extractMinimalPdfText, renderMinimalTextPdf } from '../src/vacation/minimal-text-pdf.mjs';

const pdf = renderMinimalTextPdf({
  title: 'Shared report',
  lines: ['American Airlines LAS → JFK', 'Café', 'Hawaiʻi'],
});

assert.ok(Buffer.isBuffer(pdf));
assert.match(pdf.subarray(0, 5).toString('utf8'), /^%PDF-/);

const text = extractMinimalPdfText(pdf);
assert.match(text, /→/);
assert.match(text, /é/);
assert.match(text, /ʻ/);
assert.match(text, /LAS → JFK/);

console.log('shared pdf unicode tests passed');
