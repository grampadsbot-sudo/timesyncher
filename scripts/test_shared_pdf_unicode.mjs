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

{
  const { renderMinimalTextPdf: render } = await import('../src/vacation/minimal-text-pdf.mjs');
  const raw = render({ title: 'Widths', lines: ['Kennedy', ''] }).toString('latin1');
  const widths = raw.match(/\/W \[([^\]]*(?:\][^\]]*)*?)\] \/CIDToGIDMap/);
  if (!widths) throw new Error('W array missing');
  const body = widths[1];
  if (!/^\s*(\d+ \[\d+\]\s*)+$/.test(body)) throw new Error(`W array must use "cid [width]" entries: ${body.slice(0, 80)}`);
  for (const match of body.matchAll(/\d+ \[(\d+)\]/g)) {
    if (Number(match[1]) < 200) throw new Error(`glyph width too small: ${match[1]}`);
  }
  console.log('PASS W array widths');
}
