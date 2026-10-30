import assert from 'node:assert/strict';

import { buildGateBApprovedSharedTrip, GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';
import keepsakeStyle2Handler from '../src/vacation/keepsake-style2-handler.mjs';
import {
  placeNamesForReport,
  renderSharedTripReportPdf,
} from '../src/vacation/shared-trip-report-pdf.mjs';

const shared = buildGateBApprovedSharedTrip();

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: Buffer.alloc(0) };
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.end = (body) => {
    res.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  };
  return res;
}

function pdfText(buffer) {
  return buffer.toString('latin1');
}

const slugs = [
  { slug: 'restaurants', needle: 'Carbone', category: 'restaurant' },
  { slug: 'stores', needle: "Zabar's", category: 'store' },
  { slug: 'rest', needle: 'Statue of Liberty walking tour', category: 'rest' },
  { slug: 'complete-list', needle: 'Carbone', category: 'complete' },
];

for (const { slug, needle } of slugs) {
  const pdf = renderSharedTripReportPdf(shared, { report: slug });
  assert.ok(Buffer.isBuffer(pdf), slug);
  assert.match(pdf.subarray(0, 5).toString('utf8'), /^%PDF-/);
  assert.match(pdfText(pdf), new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const names = placeNamesForReport(shared, { report: slug });
  assert.ok(names.some((name) => name.includes(needle.split(' ')[0]) || name === needle), slug);
}

const dailyPdf = renderSharedTripReportPdf(shared, { report: 'daily', dayNumber: 1 });
assert.match(dailyPdf.subarray(0, 5).toString('utf8'), /^%PDF-/);
assert.match(pdfText(dailyPdf), /Carbone|Zabar/);

for (const slug of ['restaurants', 'stores', 'rest', 'complete-list']) {
  const res = mockRes();
  await keepsakeStyle2Handler({
    url: `/api/vacation-itinerary?keepsakePdf=1&pdfPath=${encodeURIComponent(GATE_B_APPROVED_SHARED_SLUG)}/report/${slug}.pdf`,
    headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' },
  }, res);
  assert.equal(res.statusCode, 200, slug);
  assert.match(res.headers['content-type'], /application\/pdf/, slug);
  assert.match(res.body.subarray(0, 5).toString('utf8'), /^%PDF-/, slug);
}

{
  const res = mockRes();
  await keepsakeStyle2Handler({
    url: `/api/vacation-itinerary?keepsakePdf=1&pdfPath=${encodeURIComponent(GATE_B_APPROVED_SHARED_SLUG)}/daily/1.pdf`,
    headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/pdf/);
  assert.match(pdfText(res.body), /Day 1|TBD|Carbone/);
}

{
  const res = mockRes();
  await keepsakeStyle2Handler({
    url: '/api/vacation-itinerary?keepsakePdf=1&pdfPath=missing-token-xyz/report/restaurants.pdf',
    headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' },
  }, res);
  assert.equal(res.statusCode, 404);
  assert.match(res.body.toString('utf8'), /not found/i);
}

{
  const res = mockRes();
  await keepsakeStyle2Handler({
    url: `/api/vacation-itinerary?keepsakePdf=1&pdfPath=${encodeURIComponent(GATE_B_APPROVED_SHARED_SLUG)}/report/not-a-slug.pdf`,
    headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' },
  }, res);
  assert.equal(res.statusCode, 400);
}

console.log('shared trip report pdf tests passed');
