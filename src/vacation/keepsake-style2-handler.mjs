import { cleanText, headerValue, sendJson } from './http.mjs';
import { TREK_SHARED_API_BASE, mergeBindingsIntoShared } from './thing-media-bind.mjs';
import { listBindings } from './thing-media-store.mjs';
import { renderStyle2Html } from './keepsake-style2.mjs';

const TREK_PUBLIC = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || TREK_SHARED_API_BASE).replace(/\/+$/, '');

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(html);
}

function originFromReq(req) {
  const proto = headerValue(req, 'x-forwarded-proto') || 'https';
  const host = headerValue(req, 'x-forwarded-host') || headerValue(req, 'host') || 'vacation-staging.timesyncher.com';
  return `${proto}://${host}`;
}

function shareTokenFromPdfPath(pdfPath = '') {
  const [token] = String(pdfPath || '').split('/').filter(Boolean);
  try {
    return decodeURIComponent(token || '').trim();
  } catch {
    return String(token || '').trim();
  }
}

function isStyle2Report(name = '') {
  return /^(keepsake|style-?2|journey|journey-book)$/i.test(String(name || '').replace(/\.pdf$/i, ''));
}

async function fetchShared(shareToken) {
  const url = `${TREK_PUBLIC}/api/shared/${encodeURIComponent(shareToken)}/?_=${Date.now()}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(json.error || `Shared trip ${response.status}`), { statusCode: response.status });
  }
  return json;
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const pdfPath = cleanText(url.searchParams.get('pdfPath'), 240);
  const shareToken = cleanText(
    url.searchParams.get('shareToken') || shareTokenFromPdfPath(pdfPath),
    180,
  );
  const reportName = cleanText(
    url.searchParams.get('report') || (pdfPath.split('/')[2] || 'style-2'),
    80,
  ) || 'style-2';

  if (!shareToken) {
    return sendJson(res, 400, { ok: false, error: 'shareToken is required for style-2 Journey Book.' });
  }
  if (pdfPath && /\/daily\//.test(pdfPath)) {
    return sendJson(res, 404, { ok: false, error: 'Daily PDF remains on the TREK host. Use report/keepsake or report/style-2.' });
  }
  if (pdfPath && !isStyle2Report(reportName) && /\/report\//.test(pdfPath)) {
    return sendJson(res, 404, { ok: false, error: `No TimeSyncher style-2 report named ${reportName}.` });
  }

  try {
    const shared = await fetchShared(shareToken);
    const bindings = await listBindings(shareToken, process.env);
    const merged = mergeBindingsIntoShared(shared, bindings);
    const html = renderStyle2Html(merged, bindings, {
      origin: originFromReq(req),
      shareToken,
    });
    return sendHtml(res, 200, html);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, error: error.message || 'Unable to render style-2 Journey Book.' });
  }
}
