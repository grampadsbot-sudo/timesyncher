const ICON_REL_RE = /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i;

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function sizeOf(tag) {
  const match = attr(tag, 'sizes').match(/(\d+)\s*x\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

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
  candidates.push(new URL('/favicon.ico', finalUrl).href);

  for (const candidate of candidates) {
    try {
      const res = await fetchImpl(candidate, { redirect: 'follow', signal: signal(), method: 'GET' });
      const type = res.headers?.get?.('content-type') || '';
      await res.body?.cancel?.();
      if (res.ok && /^image\//i.test(type)) return { logoUrl: res.url || candidate, pageUrl: finalUrl, reason: '' };
    } catch {
      continue;
    }
  }
  return { logoUrl: '', pageUrl: finalUrl, reason: 'no_icon_answered_with_image' };
}
