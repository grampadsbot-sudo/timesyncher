import { stat } from 'node:fs/promises';
import path from 'node:path';

export function requestPathToRel(pathname) {
  const decoded = decodeURIComponent(String(pathname || '/'));
  if (decoded === '/') return 'index.html';
  return decoded.replace(/^\/+/, '');
}

/** Vercel serves repo-root files and merges `public/` onto the site root. */
export async function resolveServedStaticPath(root, rel) {
  const normalized = String(rel || '').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  for (const candidate of [path.join(root, normalized), path.join(root, 'public', normalized)]) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) return candidate;
  }
  return null;
}

export function staticContentType(filePath) {
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}
