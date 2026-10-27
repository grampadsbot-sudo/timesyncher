import { createHash } from 'node:crypto';

const text = (value) => String(value ?? '').trim();

function rewritePageToken(id, remap) {
  const token = text(id);
  if (!/^p\d+$/.test(token)) return token;
  return remap.get(token) || '';
}

function rewritePageList(ids, remap) {
  const next = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const mapped = rewritePageToken(id, remap);
    if (mapped) next.push(mapped);
  }
  return next;
}

function rewriteCitedNode(node, remap) {
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  if (Array.isArray(node.pages)) next.pages = rewritePageList(node.pages, remap);
  if (Array.isArray(node.claims)) next.claims = node.claims.map((claim) => rewriteCitedNode(claim, remap));
  if (typeof node.page === 'string') {
    const mapped = rewritePageToken(node.page, remap);
    if (mapped) next.page = mapped;
    else if (/^p\d+$/.test(text(node.page))) delete next.page;
  }
  return next;
}

export function rewriteDossierCitations(dossier, remap) {
  const fields = {};
  for (const [key, field] of Object.entries(dossier.fields || {})) fields[key] = rewriteCitedNode(field, remap);
  const next = { ...dossier, fields };
  for (const key of ['reviews', 'reviewSet', 'reviewExcerpts', 'knownFor']) {
    if (Array.isArray(dossier[key])) next[key] = dossier[key].map((row) => rewriteCitedNode(row, remap));
  }
  return next;
}

export function dossierPageFailure(page = {}) {
  if (!page || typeof page !== 'object') return 'invalid_page';
  if (!/^https?:\/\//.test(page.url || '')) return 'invalid_url';
  if (!Number.isFinite(Date.parse(page.fetchedAt))) return 'invalid_fetched_at';
  if (typeof page.text !== 'string' || !page.text.trim()) return 'empty_text';
  if (createHash('sha256').update(page.text).digest('hex') !== page.sha256) return 'sha256_mismatch';
  return null;
}

export function sanitizeDossierPages(dossier = {}, trace) {
  const original = Array.isArray(dossier.pages) ? dossier.pages : [];
  const kept = [], remap = new Map();
  original.forEach((page, index) => {
    const reason = dossierPageFailure(page);
    if (reason && trace) {
      trace.firstFailingPage ||= { index, reason };
      const repair = { index, reason, action: reason === 'sha256_mismatch' ? 'rehashed' : 'excluded' };
      if (!trace.pageRepairs.some((row) => JSON.stringify(row) === JSON.stringify(repair))) trace.pageRepairs.push(repair);
    }
    if (reason && reason !== 'sha256_mismatch') return;
    remap.set(`p${index + 1}`, `p${kept.length + 1}`);
    kept.push(reason ? { ...page, sha256: createHash('sha256').update(page.text).digest('hex') } : page);
  });
  const next = { ...dossier, pages: kept };
  return kept.length === original.length ? next : rewriteDossierCitations(next, remap);
}
