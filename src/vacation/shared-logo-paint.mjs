import { resolveThingLogoUrl } from './thing-logo-capture.mjs';

const MAX_LOGO_BYTES = 32768;

function asBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  return Buffer.from(bytes || []);
}

/** png/jpeg/gif/webp paint cross-origin. svg and ico often do not. */
export function logoBodyKind(bytes, contentType = '') {
  const type = String(contentType || '').toLowerCase().split(';')[0].trim();
  const buf = asBuffer(bytes);
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  const head = buf.subarray(0, 240).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  const svgBody = head.startsWith('<svg') || (head.startsWith('<?xml') && buf.includes(Buffer.from('<svg')));
  if (type === 'image/svg+xml' || svgBody) return 'svg';
  if ((buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) || type === 'image/x-icon' || type === 'image/vnd.microsoft.icon') return 'ico';
  return 'other';
}

/** Same-origin bytes for a logo response Chrome may refuse to decode cross-origin. */
export function unpaintableLogoEmbed(bytes, contentType = '') {
  const kind = logoBodyKind(bytes, contentType);
  if (kind !== 'svg' && kind !== 'ico') return null;
  const buf = asBuffer(bytes);
  if (!buf.length || buf.length > MAX_LOGO_BYTES) return null;
  return {
    bytesAttr: buf.toString('base64'),
    typeAttr: kind === 'svg' ? 'image/svg+xml' : 'image/x-icon',
    kind,
  };
}

export function logoEmbedAttrs(logoUrl, logoBodies) {
  const embed = logoBodies?.get?.(logoUrl);
  if (!embed?.bytesAttr) return '';
  const type = embed.typeAttr === 'image/x-icon' ? 'image/x-icon' : 'image/svg+xml';
  return ` data-logo-bytes="${embed.bytesAttr}" data-logo-type="${type}"`;
}

function publicLogoUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host === '::1') return '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    const privateV4 = a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    if (privateV4) return '';
  }
  return parsed.href;
}

async function fetchUnpaintableEmbed(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return unpaintableLogoEmbed(bytes, response.headers.get('content-type') || '');
  } catch {
    return null;
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  if (!workers) return out;
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/** Fetch logo URLs once while building the shared payload. Bitmap responses stay remote. */
export async function collectUnpaintableLogoEmbeds(shared = {}) {
  const urls = new Set();
  for (const place of shared.places || []) {
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    const safe = publicLogoUrl(resolveThingLogoUrl(place, override));
    if (safe) urls.add(safe);
  }
  const map = new Map();
  const found = await mapPool([...urls], 6, fetchUnpaintableEmbed);
  [...urls].forEach((url, index) => {
    const embed = found[index];
    if (embed?.bytesAttr) map.set(url, embed);
  });
  return map;
}
