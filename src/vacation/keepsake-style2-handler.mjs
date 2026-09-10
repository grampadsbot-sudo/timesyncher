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

export function isJourneyBookReport(name = '') {
  const cleaned = String(name || '').replace(/\.pdf$/i, '').trim();
  if (!cleaned) return true;
  return !/^daily$/i.test(cleaned);
}

export function journeyBookGate({ pdfPath = '', report = '' } = {}) {
  if (/\/daily(?:\/|\.pdf|$)/i.test(pdfPath) || !isJourneyBookReport(report)) {
    return {
      ok: false,
      status: 404,
      error: isJourneyBookReport(report)
        ? 'Daily PDF remains on the TREK host. Use the style-2 Journey Book.'
        : `No TimeSyncher Journey Book report named ${report}.`,
    };
  }
  return { ok: true, status: 200 };
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
  const gate = journeyBookGate({ pdfPath, report: reportName });
  if (!gate.ok) {
    return sendJson(res, gate.status, { ok: false, error: gate.error });
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
