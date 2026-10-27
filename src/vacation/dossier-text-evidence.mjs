import { condenseText } from './dossier-cost.mjs';

export function dossierTextEvidencePages(dossier = {}, budget = 16000) {
  const perPage = Math.min(1200, Math.floor(budget / Math.max(1, dossier.pages?.length || 0)));
  return (dossier.pages || []).map(({ braveReviews, ...page }, index) => {
    const raw = String(page.text || '');
    const prefix = raw.slice(0, Math.floor(perPage / 2));
    const text = raw.length <= perPage ? raw : `${prefix}\n${condenseText(raw, dossier.thing, { maxChars: Math.max(0, perPage - prefix.length - 1) })}`.slice(0, perPage);
    return { ...page, id: `p${index + 1}`, text };
  });
}

