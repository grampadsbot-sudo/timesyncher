import { cleanText, headerValue, sendJson } from './http.mjs';

const TRAVEL_TREK = 'https://travel.timesyncher.com';

function productTrekPublic() {
  const fromEnv = String(process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (/^https:\/\/travel\.timesyncher\.com$/i.test(fromEnv)) return fromEnv;
  return TRAVEL_TREK;
}

export const PRODUCT_TREK_PUBLIC = productTrekPublic();

/** Sole SoT. CoS dated twin is the same rules. */
export const PRODUCT_SOT = 'bot-admin/messages/time-syncher/style-2-journey-book-standard';
export const PRODUCT_SOT_TWIN = 'bot-admin/messages/time-syncher/style-2-journey-book-product-standard-20260910';

export const PRODUCT_STYLE_TWO_REPORT = 'keepsake-style-2';

function sendRedirect(res, location) {
  res.statusCode = 302;
  res.setHeader('location', location);
  res.setHeader('cache-control', 'no-store');
  res.end();
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

export function wantsStyleTwoView({ report = '', view = '' } = {}) {
  return /^journey$/i.test(String(report || '').replace(/\.pdf$/i, ''))
    || view === '1'
    || view === 'true';
}

export function productStyleTwoViewUrl({ shareToken, search = '' } = {}) {
  const extra = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  extra.set('printMode', 'report');
  extra.set('pdfReport', PRODUCT_STYLE_TWO_REPORT);
  return `${PRODUCT_TREK_PUBLIC}/shared/${encodeURIComponent(shareToken)}/?${extra.toString()}`;
}

export function productPdfUrl({
  shareToken,
  report = PRODUCT_STYLE_TWO_REPORT,
  pdfPath = '',
  search = '',
} = {}) {
  const token = encodeURIComponent(shareToken);
  if (isDailyReport(report, pdfPath)) {
    const day = dailyDayFromPdfPath(pdfPath) || String(report).replace(/^[^\d]*/, '') || '';
    const suffix = day ? `/daily/${encodeURIComponent(day)}.pdf` : '/daily.pdf';
    return `${PRODUCT_TREK_PUBLIC}/api/pdf/shared/${token}${suffix}${search}`;
  }
  const name = normalizeReportName(report);
  return `${PRODUCT_TREK_PUBLIC}/api/pdf/shared/${token}/report/${encodeURIComponent(name)}.pdf${search}`;
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

/** @deprecated Cursor HTML book is not the product path. Kept so old imports fail closed. */
export function isJourneyBookReport(name = '') {
  return isProductStyleTwo(name);
}

export function journeyBookGate({ pdfPath = '', report = '' } = {}) {
  if (isDailyReport(report, pdfPath)) {
    return { ok: true, status: 200, kind: 'daily' };
  }
  return { ok: true, status: 200, kind: isProductStyleTwo(report) ? 'style-two' : 'trek-report' };
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const pdfPath = cleanText(url.searchParams.get('pdfPath'), 240);
  const shareToken = cleanText(
    url.searchParams.get('shareToken') || shareTokenFromPdfPath(pdfPath),
    180,
  );
  const reportName = cleanText(
    url.searchParams.get('report') || (pdfPath.split('/')[2] || PRODUCT_STYLE_TWO_REPORT),
    80,
  ) || PRODUCT_STYLE_TWO_REPORT;

  if (!shareToken) {
    return sendJson(res, 400, { ok: false, error: 'shareToken is required for Style two export.' });
  }

  const search = forwardedKeepsakeSearch(url);
  const location = wantsStyleTwoView({
    report: reportName,
    view: url.searchParams.get('view') || '',
  })
    ? productStyleTwoViewUrl({ shareToken, search })
    : productPdfUrl({
      shareToken,
      report: reportName,
      pdfPath,
      search,
    });

  if (location.startsWith(originFromReq(req))) {
    return sendJson(res, 500, { ok: false, error: 'Refusing to redirect Style two onto this host.' });
  }

  return sendRedirect(res, location);
}
