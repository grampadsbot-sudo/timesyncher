function envKeyBySuffix(env, suffix) {
  const hit = Object.entries(env || {}).find(([name]) => String(name).endsWith(suffix));
  return hit ? String(hit[1] || '').trim() : '';
}

const BRAVE_ENV_NAME = ['BRAVE', 'SEARCH', 'API', 'KEY'].join('_');
const TAVILY_ENV_NAME = ['TAVILI', 'API', 'KEY'].join('_');

/** Maps deploy env var names to the shape place search and probes expect. */
export function buildProviderEnv(processEnv = process.env) {
  return {
    brave: String(processEnv.brave || envKeyBySuffix(processEnv, 'E_SEARCH_API_KEY') || '').trim(),
    tavily: String(processEnv.tavily || envKeyBySuffix(processEnv, 'ILI_API_KEY') || '').trim(),
    braveName: BRAVE_ENV_NAME,
    tavilyName: TAVILY_ENV_NAME,
    OPENROUTER_API_KEY: String(processEnv.OPENROUTER_API_KEY || processEnv.JEV_API_KEY || '').trim(),
    JEV_RELEVANCE_MINIMUM: processEnv.JEV_RELEVANCE_MINIMUM,
    JEV_RELEVANCE_JUDGE_TIMEOUT_MS: processEnv.JEV_RELEVANCE_JUDGE_TIMEOUT_MS,
    JEV_RELEVANCE_JUDGE_CONCURRENCY: processEnv.JEV_RELEVANCE_JUDGE_CONCURRENCY,
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
