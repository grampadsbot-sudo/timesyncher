import { condenseText } from './dossier-cost.mjs';

export function dossierTextEvidencePages(dossier = {}, budget = 16000) {
  const pages = dossier.pages || [];
  const total = pages.reduce((sum, page) => sum + String(page.text || '').length, 0);
  const perPage = total <= budget ? budget : Math.floor(budget / Math.max(1, pages.length));
  return (dossier.pages || []).map(({ braveReviews, ...page }, index) => {
    const raw = String(page.text || '');
    const prefix = raw.slice(0, Math.floor(perPage / 2));
    const text = raw.length <= perPage ? raw : `${prefix}\n${condenseText(raw, dossier.thing, { maxChars: Math.max(0, perPage - prefix.length - 1) })}`.slice(0, perPage);
    return { ...page, id: `p${index + 1}`, text };
  });
}

