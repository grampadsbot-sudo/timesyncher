import { qrSvg } from './qr-svg.mjs';

export const PDF_QR_SIZE = 182;
const MAX_QR_CHARS = 2048;

export function qrPayloadFromUrl(reqUrl = '') {
  const url = new URL(reqUrl || '/', 'https://vacation-staging.timesyncher.com');
  return String(url.searchParams.get('data') || url.searchParams.get('url') || '');
}

export function allowedQrPayload(value = '') {
  const text = String(value || '');
  if (!text || text.length > MAX_QR_CHARS) return false;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return false;
  return /^(https?:\/\/|\/api\/bind-thing-media\b|\/shared\/)/i.test(text);
}

export default function handlePdfQrSvg(req, res) {
  const payload = qrPayloadFromUrl(req.url);
  if (!allowedQrPayload(payload)) {
    res.statusCode = 400;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end('QR data must be an http(s) or bind-media playback URL.');
    return true;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(qrSvg(payload, { size: PDF_QR_SIZE }));
  return true;
}
