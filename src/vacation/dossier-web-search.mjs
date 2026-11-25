import { createHash } from 'node:crypto';
import { dossierTavilySearch } from './dossier-tavily-search.mjs';

export async function runDossierWebQueries(queries = [], options = {}) {
  const pages = [];
  const attempts = [];
  const webResults = [];
  const seen = new Set();
  for (const row of Array.isArray(queries) ? queries : []) {
    if (options.deadline > 0 && Date.now() >= options.deadline) break;
    const query = typeof row === 'string' ? row : row?.query;
    if (!String(query || '').trim()) continue;
    const { results, attempts: att } = await dossierTavilySearch(query, options);
    if (row?.stage) {
      for (const attempt of att) attempt.searchStage = row.stage;
    }
    attempts.push(...att);
    for (const hit of results) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      webResults.push(hit);
      const snippetText = [hit.title, ...(Array.isArray(hit.snippets) ? hit.snippets : [])]
        .filter(Boolean)
        .join('\n')
        .slice(0, 12000);
      if (snippetText.trim()) {
        pages.push({
          url: hit.url,
          fetchedAt: new Date().toISOString(),
          text: snippetText,
          via: 'tavily-search',
          sha256: createHash('sha256').update(snippetText).digest('hex'),
        });
      }
    }
    if (options.onProgress) {
      await options.onProgress({ pages: [...pages], attempts: [...attempts], webResults: [...webResults] });
    }
  }
  return { pages, attempts, webResults };
}
