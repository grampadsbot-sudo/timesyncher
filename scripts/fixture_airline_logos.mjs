import { setTimeout as sleep } from 'node:timers/promises';

export const AIRLINE_SITES = Object.freeze({
  Southwest: 'https://www.southwest.com/',
  JetBlue: 'https://www.jetblue.com/',
  Delta: 'https://www.delta.com/',
  American: 'https://www.aa.com/',
});

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+(airlines|airways|air lines)$/, '');
const domain = (url) => new URL(url).hostname.replace(/^www\./, '');

function webUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    if (/(^|\.)(google\.com|gstatic\.com|timesyncher\.com|vercel\.app)$/.test(url.hostname)) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

function officialSite(input) {
  for (const [name, site] of Object.entries(AIRLINE_SITES)) {
    if (normalize(input) === normalize(name)) return site;
  }
  const value = String(input ?? '').trim();
  const url = webUrl(value.includes('://') ? value : `https://${value}`);
  return url && Object.values(AIRLINE_SITES).find((site) => domain(site) === domain(url)) || '';
}

function decode(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = entity.slice(2, -1);
    const point = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    values[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return values;
}

export async function resolveAirlineLogo(input, {
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  retryDelayMs = 1000,
  timeoutMs = 15000,
} = {}) {
  const site = officialSite(input);
  const blank = (reason, source = site) => ({ logo: '', source, verified: false, reason: `airline_logo_unverified:${reason}` });
  if (!site) return blank('unknown_airline');
  const ownSite = (url) => {
    const host = new URL(url).hostname;
    return host === domain(site) || host.endsWith(`.${domain(site)}`);
  };

  async function request(url, accept, officialOnly = false) {
    let retried = false;
    for (let redirects = 0; redirects <= 5;) {
      if (!webUrl(url) || (officialOnly && !ownSite(url))) throw new Error('disallowed_url');
      const response = await fetchImpl(url, {
        headers: { accept, 'user-agent': USER_AGENT },
        redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      });
      if ([403, 429].includes(response.status) && !retried) {
        retried = true;
        await response.body?.cancel();
        await sleepImpl(retryDelayMs);
        continue;
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = webUrl(response.headers.get('location'), url);
        await response.body?.cancel();
        if (!next) throw new Error('invalid_redirect');
        url = next;
        redirects += 1;
        continue;
      }
      return { response, url };
    }
    throw new Error('redirect_limit');
  }

  let page;
  try { page = await request(site, 'text/html', true); }
  catch (error) { return blank(`page_fetch_failed:${error?.cause?.code || error?.code || error?.message || 'unknown'}`); }
  if (page.response.status !== 200) return blank(`page_http_${page.response.status}`, page.url);
  let html;
  try { html = await page.response.text(); }
  catch { return blank('page_body_failed', page.url); }
  html = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const baseTag = html.match(/<base\b(?:[^>"']|"[^"]*"|'[^']*')*>/i);
  const base = (baseTag && webUrl(attributes(baseTag[0]).href, page.url)) || page.url;
  const icons = [];
  const manifests = [];
  for (const tag of html.match(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || []) {
    const attrs = attributes(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    const url = attrs.href && webUrl(attrs.href, base);
    if (!url) continue;
    if (rel.some((token) => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'].includes(token))) icons.push(url);
    if (rel.includes('manifest')) manifests.push(url);
  }
  let reason = 'no_declared_icon';
  let source = page.url;
  const tried = new Set();
  async function verify(url, declaringDocument) {
    if (tried.has(url)) return null;
    tried.add(url);
    source = declaringDocument;
    try {
      const image = await request(url, 'image/*');
      const type = (image.response.headers.get('content-type') || '').trim();
      await image.response.body?.cancel();
      if (image.response.status !== 200) reason = `icon_http_${image.response.status}`;
      else if (!/^image\/[a-z0-9.+-]+(?:\s*;|$)/i.test(type)) reason = 'icon_non_image_content_type';
      else return { logo: image.url, source, verified: true, reason: '' };
    } catch (error) { reason = `icon_fetch_failed:${error?.cause?.code || error?.code || error?.message || 'unknown'}`; }
    return null;
  }
  for (const url of new Set(icons)) {
    const result = await verify(url, page.url);
    if (result) return result;
  }
  for (const url of new Set(manifests)) {
    source = url;
    try {
      const manifest = await request(url, 'application/manifest+json, application/json');
      source = manifest.url;
      if (manifest.response.status !== 200) {
        reason = `manifest_http_${manifest.response.status}`;
        await manifest.response.body?.cancel();
        continue;
      }
      const data = await manifest.response.json();
      for (const icon of Array.isArray(data.icons) ? data.icons : []) {
        const candidate = typeof icon?.src === 'string' && icon.src.trim() && webUrl(icon.src, manifest.url);
        if (!candidate) continue;
        const result = await verify(candidate, manifest.url);
        if (result) return result;
      }
    } catch { reason = 'manifest_fetch_or_parse_failed'; }
  }
  return blank(reason, source);
}
