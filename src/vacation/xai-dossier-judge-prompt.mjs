import { dossierForModel } from './dossier-cost.mjs';
import { dossierPageById } from './thing-dossier-fields.mjs';

export function collectDossierClaims(findings = {}) {
  const items = [];
  const add = (claim) => { if (claim && typeof claim === 'object') items.push(claim); };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'happyHourDays', 'happyHourTimes', 'happyHourDeals', 'itineraryNote']) {
    (findings[key]?.claims || []).forEach((claim) => {
      if (claim && typeof claim === 'object') {
        if (['hours', 'happyHourDays', 'happyHourTimes', 'happyHourDeals'].includes(key)) claim.kind = key;
        add(claim);
      }
    });
  }
  for (const row of findings.hoursCandidates || []) (row?.claims || []).forEach((claim) => {
    if (claim && typeof claim === 'object') { claim.kind = 'hours'; add(claim); }
  });
  for (const item of findings.knownFor || []) (item?.claims || []).forEach((claim) => { if (claim && typeof claim === 'object') { claim.kind = 'knownFor'; claim.item = item.item; add(claim); } });
  for (const review of findings.reviews || []) (review?.claims || []).forEach(add);
  return items;
}

export function dossierJudgePrompt(dossier, items) {
  const ids = [...new Set(items.flatMap((item) => item.pages || []))];
  const slim = dossierForModel(dossier, { perPage: 1800, total: 24000 });
  const pages = ids.map((id) => ({ id, page: dossierPageById(slim, id) })).filter((row) => row.page)
    .map(({ id, page }) => ({ id, url: page.url, fetchedAt: page.fetchedAt, sha256: page.sha256, text: page.text }));
  return [
    'You are an independent fact checker. You did not write these claims.',
    'Field text and claims are summaries in the writer\'s own words, not quotations. For each claim, read ONLY the saved page text of the page ids it cites.',
    'supported:true when those pages support the claim\'s meaning (paraphrase and synonyms are fine). supported:false for facts not on the cited pages, wrong numbers, times, names, or contradictions—not because the claim uses different words than the page.',
    'Anything not backed by the cited pages (outside knowledge, other pages, exaggeration, invented numbers or details) is supported:false.',
    'Claims with kind "knownFor": supported:true ONLY when a cited page names that item as a signature, specialty, famous or best-known thing of THIS place. A page that merely lists it (an on-site bar, an amenity, a tenant or neighbouring restaurant) is supported:false.',
    'Claims with kind "knownFor" are also supported:false when the item is a broad phrase (dining, location, atmosphere, experience) rather than one specific dish, drink, service or product.',
    'Claims with kind hours, happyHourDays, happyHourTimes, or happyHourDeals: supported:false when cited pages state different days, times, or offers than the claim, even if both mention happy hour or hours.',
    'Return JSON {"results":[{"id":"c1","supported":true,"reason":"..."}]} with one result per claim.',
    JSON.stringify({ claims: items.map((item, index) => ({ id: `c${index + 1}`, text: item.text, pages: item.pages, ...(item.kind ? { kind: item.kind, item: item.item } : {}) })), pages }),
  ].join('\n');
}
