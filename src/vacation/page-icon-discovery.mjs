/**
 * Find a place's logo from its own page: follow redirects to the canonical host,
 * read the icon the page declares (<link rel="icon" | "apple-touch-icon">), and
 * only accept a candidate that actually answers with an image.
 *
 * Guessing `${origin}/favicon.ico` fails for sites that declare their icon in HTML
 * (or redirect to another host), so this replaces the guess for fetched logos.
 */

const ICON_REL_RE = /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i;

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function sizeOf(tag) {
  const match = attr(tag, 'sizes').match(/(\d+)\s*x\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

/** Icon hrefs declared in the page head, largest declared size first, resolved against the page URL. */
export function iconCandidatesFromHtml(html = '', pageUrl = '') {
  const found = [];
  for (const tag of String(html).match(/<link\b[^>]*>/gi) || []) {
    if (!ICON_REL_RE.test(attr(tag, 'rel'))) continue;
    const href = attr(tag, 'href').trim();
    if (!href) continue;
    let resolved;
    try {
      resolved = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(resolved)) continue;
    found.push({ href: resolved, size: sizeOf(tag) });
  }
  found.sort((a, b) => b.size - a.size);
  return [...new Set(found.map((row) => row.href))];
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

/**
 * Fetch a page and return `{ logoUrl, pageUrl, reason }`.
 * `logoUrl` is '' when no declared icon answers with an image; `reason` says why.
 * `fetchImpl` is injectable so tests run offline.
 */
export async function fetchPageIconUrl(pageUrl, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!isHttpUrl(pageUrl)) return { logoUrl: '', pageUrl: '', reason: 'no_usable_page_url' };
  const signal = () => AbortSignal.timeout(timeoutMs);

  let page;
  try {
    page = await fetchImpl(pageUrl, { redirect: 'follow', signal: signal(), headers: { accept: 'text/html' } });
  } catch {
    return { logoUrl: '', pageUrl, reason: 'page_fetch_failed' };
  }
  const finalUrl = page.url || pageUrl;
  if (!page.ok) return { logoUrl: '', pageUrl: finalUrl, reason: `page_http_${page.status}` };

  const html = await page.text().catch(() => '');
  const candidates = iconCandidatesFromHtml(html, finalUrl);
  // Last resort: the conventional path on the canonical origin, accepted only if it answers.
  candidates.push(new URL('/favicon.ico', finalUrl).href);

  for (const candidate of candidates) {
    try {
      const res = await fetchImpl(candidate, { redirect: 'follow', signal: signal(), method: 'GET' });
      const type = res.headers?.get?.('content-type') || '';
      await res.body?.cancel?.();
      if (res.ok && /^image\//i.test(type)) return { logoUrl: res.url || candidate, pageUrl: finalUrl, reason: '' };
    } catch {
      // Try the next declared icon.
    }
  }
  return { logoUrl: '', pageUrl: finalUrl, reason: 'no_icon_answered_with_image' };
}
