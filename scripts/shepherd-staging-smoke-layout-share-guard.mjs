/** LAYOUT APP guard: share URL shown to customer before /api/shared/ returns 200. */

function shareSlugPathNeedle(shareSlug = '') {
  const slug = String(shareSlug || '').replace(/\/+$/, '');
  if (!slug) return '';
  return `/shared/${slug}`;
}

function transcriptBlobContainsShareUrl(blob, shareSlug) {
  const needle = shareSlugPathNeedle(shareSlug);
  if (!needle || !blob) return false;
  return String(blob).includes(needle);
}

export async function earliestCustomerShareUrlSeenMs(db, customerId, shareSlug) {
  if (!db || !customerId || !shareSlug) return null;
  const rows = await db`
    select created_at, body, payload from transcript_turns
    where customer_id=${customerId}
    order by created_at asc`;
  for (const row of rows) {
    const blob = `${row.body || ''}\n${JSON.stringify(row.payload || {})}`;
    if (transcriptBlobContainsShareUrl(blob, shareSlug)) {
      const ms = new Date(row.created_at).getTime();
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
}

export async function scanChatDomShareUrlVisible(page, shareSlug) {
  const needle = shareSlugPathNeedle(shareSlug);
  if (!needle || !page) return false;
  return page.evaluate((pathNeedle) => {
    const anchors = Array.from(document.querySelectorAll('a[href], [data-href]'));
    for (const node of anchors) {
      const href = node.getAttribute('href') || node.getAttribute('data-href') || '';
      if (href.includes(pathNeedle)) return true;
    }
    const text = document.body?.innerText || '';
    return text.includes(pathNeedle);
  }, needle);
}

export function layoutAppFailShareUrlBeforeApi({
  customerShareUrlSeenMs,
  sharedApiFirst200Ms,
  shareSlug,
} = {}) {
  if (!Number.isFinite(customerShareUrlSeenMs) || !Number.isFinite(sharedApiFirst200Ms)) return null;
  if (customerShareUrlSeenMs >= sharedApiFirst200Ms) return null;
  const slug = shareSlug || 'unknown';
  return {
    selector: 'share-url-timing',
    rule: 'app_share_url_before_api',
    detail: `APP FAIL: customer saw share URL for ${slug} before /api/shared/ returned 200 (customerMs=${customerShareUrlSeenMs}; api200Ms=${sharedApiFirst200Ms})`,
    viewport: {},
    rects: {},
  };
}
