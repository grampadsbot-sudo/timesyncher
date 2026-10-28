import { searchTavily, tavilyApiKey } from './poi-search.mjs';

export async function dossierTavilySearch(query, options = {}, attempts = []) {
  const { env, fetchImpl, deadline = 0 } = options;
  const startedAt = new Date().toISOString();
  const attempt = { kind: 'page', provider: 'Tavily', stage: 'search', step: 'web_search', query, startedAt, results: 0 };
  attempts.push(attempt);
  if (!tavilyApiKey(env)) {
    Object.assign(attempt, { status: 'missing_key', error: 'tavily_missing_key' });
    return { results: [], attempts };
  }
  if (deadline && Date.now() >= deadline) {
    Object.assign(attempt, { status: 'failed', error: 'tavily_deadline' });
    return { results: [], attempts };
  }
  try {
    const response = await searchTavily(query, {
      env, fetchImpl, maxResults: Math.min(8, options.count || 8), searchDepth: 'basic',
      timeoutMs: deadline ? Math.max(1, Math.min(8000, deadline - Date.now())) : 8000,
    });
    const results = response.results.map((row) => ({
      url: row.url, title: row.title, snippets: [row.content].filter(Boolean), query, provider: 'Tavily',
    }));
    Object.assign(attempt, { status: 'ok', httpStatus: 200, results: results.length });
    return { results, attempts };
  } catch (error) {
    const status = Number(error?.status) || null;
    const reason = status ? `tavily_http_${status}` : {
      TAVILI_API_KEY_MISSING: 'tavily_missing_key', TAVILY_TIMEOUT: 'tavily_timeout', TAVILY_ABORTED: 'tavily_aborted',
    }[error?.code] || 'tavily_request_failed';
    Object.assign(attempt, { status: 'failed', httpStatus: status, error: reason });
    return { results: [], attempts };
  }
}
