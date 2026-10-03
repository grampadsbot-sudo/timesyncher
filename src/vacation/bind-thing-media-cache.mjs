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

export function sendCachedBindingMedia(res, req, { bytes, mimeType, originalName }) {
  const etag = strongContentEtag(bytes);
  const ifNoneMatch = headerValue(req, 'if-none-match');
  res.setHeader('cache-control', IMMUTABLE_MEDIA_CACHE_CONTROL);
  res.setHeader('etag', etag);
  if (ifNoneMatchSatisfied(ifNoneMatch, etag)) {
    res.statusCode = 304;
    res.end('');
    return { statusCode: 304, etag, body: '' };
  }
  const safeName = String(originalName || 'media').replace(/"/g, '');
  res.statusCode = 200;
  res.setHeader('content-type', mimeType);
  res.setHeader('content-disposition', `inline; filename="${safeName}"`);
  res.end(bytes);
  return { statusCode: 200, etag, body: bytes };
}
