import { cleanText, headerValue, sendJson } from './http.mjs';
import { loadSharedTripPayload } from './shared-trip-handler.mjs';
import {
  isSharedListReportSlug,
  normalizeSharedListReportSlug,
  renderSharedTripReportPdf,
} from './shared-trip-report-pdf.mjs';

function productTrekPublic() {
  const fromEnv = String(
    process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL
    || process.env.TIMESYNCHER_TRAVEL_BASE_URL
    || process.env.TIMESYNCHER_PUBLIC_TRAVEL_BASE_URL
    || '',
  ).replace(/\/+$/, '');
  if (!fromEnv) throw new Error('TIMESYNCHER_TREK_PUBLIC_BASE_URL is missing');
  return fromEnv;
}

let cachedProductTrekPublic;
export function getProductTrekPublic() {
  if (!cachedProductTrekPublic) cachedProductTrekPublic = productTrekPublic();
  return cachedProductTrekPublic;
}

export const PRODUCT_SOT = 'bot-admin/messages/time-syncher/style-2-journey-book-standard';
export const PRODUCT_SOT_TWIN = 'bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910';

export const PRODUCT_STYLE_TWO_REPORT = 'keepsake-style-2';
export const PRODUCT_STYLE_ONE_REPORT = 'keepsake';

function sendRedirect(res, location, extraHeaders = {}) {
  res.statusCode = 302;
  res.setHeader('location', location);
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end();
}

export function styleTwoLocationStaysOnStaging(location = '', origin = '') {
  const value = String(location || '');
  if (!value || /travel\.timesyncher\.com/i.test(value)) return false;
  if (!/pdfReport=keepsake-style-2/i.test(value)) return false;
  const host = String(origin || '').replace(/\/+$/, '');
  if (host && value.startsWith(host)) return true;
  return /vacation-staging\.timesyncher\.com/i.test(value);
}

export function styleOneLocationStaysOnStaging(location = '', origin = '') {
  const value = String(location || '');
  if (!value || /travel\.timesyncher\.com/i.test(value)) return false;
  if (!/pdfReport=keepsake(?:&|$)/i.test(value) || /pdfReport=keepsake-style-2/i.test(value)) return false;
  const host = String(origin || '').replace(/\/+$/, '');
  if (host && value.startsWith(host)) return true;
  return /vacation-staging\.timesyncher\.com/i.test(value);
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

function dailyDayFromPdfPath(pdfPath = '') {
  const match = String(pdfPath || '').match(/\/daily\/(\d+)(?:\.pdf)?/i);
  return match ? match[1] : '';
}

function reportFromPdfPath(pdfPath = '') {
  const parts = String(pdfPath || '').split('/').filter(Boolean);
  if (parts[1] === 'report') {
    return String(parts[2] || '').replace(/\.pdf$/i, '').trim();
  }
  if (parts[1] === 'daily') return 'daily';
  return '';
}

export function normalizeReportName(name = '') {
  const cleaned = String(name || '').replace(/\.pdf$/i, '').trim();
  if (!cleaned || /^(style-?2|journey|layout-?2)$/i.test(cleaned)) {
    return PRODUCT_STYLE_TWO_REPORT;
  }
  return cleaned;
}

export function isDailyReport(name = '', pdfPath = '') {
  return /^daily$/i.test(String(name || '').replace(/\.pdf$/i, ''))
    || /\/daily(?:\/|\.pdf|$)/i.test(pdfPath);
}

export function isProductStyleTwo(name = '') {
  return normalizeReportName(name) === PRODUCT_STYLE_TWO_REPORT;
}

export function isProductStyleOne(name = '') {
  const cleaned = String(name || '').replace(/\.pdf$/i, '').trim();
  return /^keepsake$/i.test(cleaned) && !isProductStyleTwo(cleaned);
}

export function wantsStyleTwoView({ report = '', view = '' } = {}) {
  return /^journey$/i.test(String(report || '').replace(/\.pdf$/i, ''))
    || view === '1'
    || view === 'true';
}

export function productStyleOneViewUrl({
  shareToken,
  origin = 'https://vacation-staging.timesyncher.com',
  search = '',
} = {}) {
  const extra = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  extra.set('style', extra.get('style') || '1');
  extra.set('printMode', 'report');
  extra.set('pdfReport', PRODUCT_STYLE_ONE_REPORT);
  return `${String(origin || '').replace(/\/+$/, '')}/shared/${encodeURIComponent(shareToken)}/journey?${extra.toString()}`;
}

export function productStyleTwoViewUrl({
  shareToken,
  origin = 'https://vacation-staging.timesyncher.com',
  search = '',
} = {}) {
  const extra = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  extra.set('style', extra.get('style') || '2');
  extra.set('printMode', 'report');
  extra.set('pdfReport', PRODUCT_STYLE_TWO_REPORT);
  return `${String(origin || '').replace(/\/+$/, '')}/shared/${encodeURIComponent(shareToken)}/journey?${extra.toString()}`;
}

export function productPdfUrl({
  shareToken,
  report = PRODUCT_STYLE_TWO_REPORT,
  pdfPath = '',
  search = '',
  origin = '',
} = {}) {
  const host = String(origin || 'https://vacation-staging.timesyncher.com').replace(/\/+$/, '');
  const token = encodeURIComponent(shareToken);
  if (isDailyReport(report, pdfPath)) {
    const day = dailyDayFromPdfPath(pdfPath) || String(report).replace(/^[^\d]*/, '') || '';
    const suffix = day ? `/daily/${encodeURIComponent(day)}.pdf` : '/daily.pdf';
    return `${host}/api/pdf/shared/${token}${suffix}${search}`;
  }
  const name = normalizeReportName(report);
  if (name === PRODUCT_STYLE_TWO_REPORT) {
    return productStyleTwoViewUrl({
      shareToken,
      origin: host,
      search,
    });
  }
  if (isProductStyleOne(name) || isProductStyleOne(report)) {
    return productStyleOneViewUrl({
      shareToken,
      origin: host,
      search,
    });
  }
  return `${host}/api/pdf/shared/${token}/report/${encodeURIComponent(name)}.pdf${search}`;
}

export function forwardedKeepsakeSearch(url) {
  const out = new URLSearchParams();
  for (const key of [
    'ksLogo',
    'ksSummary',
    'ksEventSummary',
    'ksStories',
    'ksRestaurants',
    'ksRest',
    'ksStores',
    'ksMapOff',
  ]) {
    const value = url.searchParams.get(key);
    if (value != null && value !== '') out.set(key, value);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

export function isJourneyBookReport(name = '') {
  return isProductStyleTwo(name);
}

export function journeyBookGate({ pdfPath = '', report = '' } = {}) {
  if (isDailyReport(report, pdfPath)) {
    return { ok: true, status: 200, kind: 'daily' };
  }
  return { ok: true, status: 200, kind: isProductStyleTwo(report) ? 'style-two' : 'trek-report' };
}

function sendPdf(res, buffer) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('cache-control', 'no-store');
  res.end(buffer);
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const pdfPath = cleanText(url.searchParams.get('pdfPath'), 240);
  const shareToken = cleanText(
    url.searchParams.get('shareToken') || shareTokenFromPdfPath(pdfPath),
    180,
  );
  const reportName = cleanText(
    url.searchParams.get('report')
    || reportFromPdfPath(pdfPath)
    || (pdfPath.split('/')[2] || PRODUCT_STYLE_TWO_REPORT),
    80,
  ) || PRODUCT_STYLE_TWO_REPORT;

  if (!shareToken) {
    return sendJson(res, 400, { ok: false, error: 'shareToken is required for Style two export.' });
  }

  const search = forwardedKeepsakeSearch(url);
  const origin = originFromReq(req);
  const wantsView = wantsStyleTwoView({
    report: reportName,
    view: url.searchParams.get('view') || '',
  });

  const daily = isDailyReport(reportName, pdfPath);
  const listSlug = normalizeSharedListReportSlug(reportName);
  const inAppPdf = daily || isSharedListReportSlug(listSlug);

  if (inAppPdf) {
    const payload = await loadSharedTripPayload(shareToken, req);
    if (!payload) {
      return sendJson(res, 404, { ok: false, error: 'shared trip not found', shareToken });
    }
    if (!daily && !isSharedListReportSlug(listSlug)) {
      return sendJson(res, 400, { ok: false, error: 'unknown report slug', report: reportName });
    }
    const dayNumber = daily ? Number(dailyDayFromPdfPath(pdfPath) || reportName.replace(/\D/g, '') || 0) : 0;
    if (daily && (!Number.isFinite(dayNumber) || dayNumber <= 0)) {
      return sendJson(res, 400, { ok: false, error: 'daily day_number is required' });
    }
    const pdf = renderSharedTripReportPdf(payload, {
      report: daily ? 'daily' : listSlug,
      dayNumber,
    });
    if (!pdf) {
      return sendJson(res, 400, { ok: false, error: 'unknown report slug', report: reportName });
    }
    return sendPdf(res, pdf);
  }

  if (isProductStyleTwo(reportName) || wantsView) {
    const location = productStyleTwoViewUrl({ shareToken, origin, search });
    if (!styleTwoLocationStaysOnStaging(location, origin)) {
      return sendJson(res, 500, {
        ok: false,
        error: 'Refusing Style two PDF redirect onto travel (zu() / unpatched keepsake.pdf). Stay on staging Ae().',
      });
    }
    return sendRedirect(res, location, { 'x-timesyncher-style2': 'staging-ae' });
  }

  if (isProductStyleOne(reportName)) {
    const location = productStyleOneViewUrl({ shareToken, origin, search });
    if (!styleOneLocationStaysOnStaging(location, origin)) {
      return sendJson(res, 500, {
        ok: false,
        error: 'Refusing Style one PDF redirect onto travel. Stay on staging Ae() left itinerary.',
      });
    }
    return sendRedirect(res, location, { 'x-timesyncher-style1': 'staging-ae' });
  }

  return sendJson(res, 400, { ok: false, error: 'unknown report slug', report: reportName });
}
