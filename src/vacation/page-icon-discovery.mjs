function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? match[1] ?? match[2] ?? match[3] ?? '' : '';
}

export function isPlaceWebsite(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol)
      && !/(^|\.)(wikipedia\.org|wikimedia\.org|openstreetmap\.org|brave\.com|tavily\.com|yelp\.com|tripadvisor\.[a-z.]+|booking\.com|google\.[a-z.]+)$/.test(url.hostname);
  } catch { return false; }
}

export async function fetchPageIconUrl(pageUrl, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!isPlaceWebsite(pageUrl)) return { reason: 'no_verified_place_website' };
  let page;
  try { page = await fetchImpl(pageUrl, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'text/html' } }); }
  catch { return { reason: 'page_fetch_failed' }; }
  const canonical = page.url || pageUrl;
  if (!isPlaceWebsite(canonical)) return { reason: 'redirect_not_place_website' };
  if (!page.ok) return { reason: `page_http_${page.status}` };
  let html;
  try { html = await page.text(); } catch { return { reason: 'page_read_failed' }; }
  const candidates = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(attribute(tag, 'rel'))) continue;
    try {
      const url = new URL(attribute(tag, 'href'), canonical);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const size = Number(attribute(tag, 'sizes').match(/(\d+)x\d+/i)?.[1] || 0);
      candidates.push({ url: url.href, size });
    } catch { continue; }
  }
  candidates.sort((a, b) => b.size - a.size);
  candidates.push({ url: new URL('/favicon.ico', canonical).href, size: 0 });
  for (const url of new Set(candidates.map(candidate => candidate.url))) {
    try {
      const image = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'image/*' } });
      const type = image.headers?.get?.('content-type') || '';
      await image.body?.cancel?.();
      if (!image.ok || !/^image\//i.test(type)) continue;
      return { logoUrl: image.url || url, pageUrl: canonical };
    } catch { continue; }
  }
  return { reason: 'no_icon_answered_with_image' };
}
