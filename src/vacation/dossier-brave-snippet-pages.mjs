import { createHash } from 'node:crypto';

function dossierPageId(index) {
  return `p${index + 1}`;
}

export function dossierPageIdForUrl(dossier = {}, url = '') {
  const target = String(url || '').trim();
  if (!target) return null;
  const idx = (dossier.pages || []).findIndex((page) => String(page.url || '').trim() === target);
  return idx >= 0 ? dossierPageId(idx) : null;
}

export function ensureBraveSnippetCitationPages(dossier = {}) {
  const pages = [...(dossier.pages || [])];
  const existing = new Set(pages.map((page) => String(page.url || '').trim()).filter(Boolean));
  let changed = false;
  for (const row of dossier.braveResults || []) {
    const url = String(row.url || '').trim();
    if (!url || existing.has(url)) continue;
    const snippetText = [row.title, ...(row.snippets || []), row.snippet].filter(Boolean).join('\n').trim();
    const text = (snippetText || String(row.description || '')).slice(0, 12000);
    if (!text) continue;
    pages.push({
      url,
      fetchedAt: row.fetchedAt || new Date().toISOString(),
      text,
      via: 'brave-snippet',
      braveSnippet: true,
      sha256: createHash('sha256').update(text).digest('hex'),
    });
    existing.add(url);
    changed = true;
  }
  return changed ? { ...dossier, pages } : dossier;
}
