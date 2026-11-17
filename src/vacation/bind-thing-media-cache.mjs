import crypto from 'node:crypto';

import { headerValue } from './http.mjs';

export const IMMUTABLE_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable';

export function strongContentEtag(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return `"${crypto.createHash('sha256').update(buf).digest('hex')}"`;
}

export function ifNoneMatchSatisfied(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader || !etag) return false;
  const tokens = String(ifNoneMatchHeader)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return tokens.some((token) => token === '*' || token === etag || token === `W/${etag}`);
}

export function parseByteRange(rangeHeader, totalSize) {
  const raw = String(rangeHeader || '').trim();
  if (!/^bytes=/i.test(raw)) return null;
  const spec = raw.replace(/^bytes=/i, '').trim();
  const [startPart, endPart] = spec.split('-');
  const total = Math.max(0, Number(totalSize) || 0);
  if (!total) return null;
  if (startPart === '' && endPart !== '') {
    const suffix = Number(endPart);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, total - suffix);
    return { start, end: total - 1 };
  }
  const start = Number(startPart);
  if (!Number.isFinite(start) || start < 0) return null;
  let end = endPart === '' || endPart == null ? total - 1 : Number(endPart);
  if (!Number.isFinite(end)) end = total - 1;
  end = Math.min(total - 1, Math.max(start, end));
  if (start >= total) return null;
  return { start, end };
}

export function sendCachedBindingMedia(res, req, { bytes, mimeType, originalName }, options = {}) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const total = buf.length;
  const etag = strongContentEtag(buf);
  const ifNoneMatch = headerValue(req, 'if-none-match');
  const headOnly = options.headOnly === true || String(req.method || 'GET').toUpperCase() === 'HEAD';
  const safeName = String(originalName || 'media').replace(/"/g, '');

  res.setHeader('cache-control', IMMUTABLE_MEDIA_CACHE_CONTROL);
  res.setHeader('etag', etag);
  res.setHeader('accept-ranges', 'bytes');
  res.setHeader('content-type', mimeType || 'application/octet-stream');
  res.setHeader('content-disposition', `inline; filename="${safeName}"`);

  if (ifNoneMatchSatisfied(ifNoneMatch, etag)) {
    res.statusCode = 304;
    res.end('');
    return { statusCode: 304, etag, body: '' };
  }

  const range = parseByteRange(headerValue(req, 'range'), total);
  if (range) {
    const slice = buf.subarray(range.start, range.end + 1);
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${range.start}-${range.end}/${total}`);
    res.setHeader('content-length', String(slice.length));
    if (headOnly) {
      res.end('');
      return { statusCode: 206, etag, body: slice };
    }
    res.end(slice);
    return { statusCode: 206, etag, body: slice };
  }

  res.statusCode = 200;
  res.setHeader('content-length', String(total));
  if (headOnly) {
    res.end('');
    return { statusCode: 200, etag, body: buf };
  }
  res.end(buf);
  return { statusCode: 200, etag, body: buf };
}
