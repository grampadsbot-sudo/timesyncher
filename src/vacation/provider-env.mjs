export const BRAVE_SEARCH_API_KEY_NAME = 'BRAVE_SEARCH_API_KEY';
export const TAVILI_API_KEY_NAME = 'TAVILI_API_KEY';

function braveSearchApiKey(processEnv = process.env) {
  const direct = String(processEnv.BRAVE_SEARCH_API_KEY || processEnv.brave || '').trim();
  if (direct || processEnv !== process.env) return direct;
  return String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
}

function tavilyApiKeyFromEnv(processEnv = process.env) {
  const direct = String(processEnv.TAVILI_API_KEY || processEnv.tavily || '').trim();
  if (direct || processEnv !== process.env) return direct;
  return String(process.env.TAVILI_API_KEY || '').trim();
}

export function buildProviderEnv(processEnv = process.env) {
  return {
    brave: braveSearchApiKey(processEnv),
    tavily: tavilyApiKeyFromEnv(processEnv),
    braveName: 'BRAVE_SEARCH_API_KEY',
    tavilyName: 'TAVILI_API_KEY',
    OPENROUTER_API_KEY: String(processEnv.OPENROUTER_API_KEY || processEnv.JEV_API_KEY || '').trim(),
    JEV_RELEVANCE_MINIMUM: processEnv.JEV_RELEVANCE_MINIMUM,
    JEV_RELEVANCE_JUDGE_TIMEOUT_MS: processEnv.JEV_RELEVANCE_JUDGE_TIMEOUT_MS,
    JEV_RELEVANCE_JUDGE_CONCURRENCY: processEnv.JEV_RELEVANCE_JUDGE_CONCURRENCY,
    VACATION_ITINERARY_ROUTE_MAX_MS: processEnv.VACATION_ITINERARY_ROUTE_MAX_MS,
    PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS: processEnv.PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS,
    DATABASE_URL: String(processEnv.DATABASE_URL || '').trim(),
    NEON_DATABASE_URL: String(processEnv.NEON_DATABASE_URL || '').trim(),
  };
}

export function missingSearchKeys(processEnv = process.env) {
  const providerEnv = buildProviderEnv(processEnv);
  const missing = [];
  if (!String(providerEnv.brave || '').trim()) missing.push(String(providerEnv.braveName || 'brave'));
  return missing;
}
