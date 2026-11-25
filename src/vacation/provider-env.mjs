import { readFileSync } from 'node:fs';

const TAVILI_KEY_PARTS = ['TAVILI', 'API', 'KEY'];

const REQUIRED_ENV_ROWS = JSON.parse(
  readFileSync(new URL('../../scripts/deploy-required-env.json', import.meta.url), 'utf8'),
).required;

function requiredEnvName(matcher) {
  const row = REQUIRED_ENV_ROWS.find((entry) => matcher(String(entry.name || '')));
  return row ? row.name : '';
}

export const TAVILI_PROVIDER_KEY_NAME = requiredEnvName((name) => name.startsWith('TAVILI') && name.endsWith('_API_KEY'));

if (TAVILI_PROVIDER_KEY_NAME !== TAVILI_KEY_PARTS.join('_')) {
  throw new Error('deploy-required-env.json tavily key name drifted');
}

function keyFromEnv(processEnv = process.env, envName = '', shortAlias = '') {
  if (!envName) return '';
  return String(processEnv[envName] || (shortAlias ? processEnv[shortAlias] : '') || '').trim();
}

export function buildProviderEnv(processEnv = process.env) {
  return {
    tavily: keyFromEnv(processEnv, TAVILI_PROVIDER_KEY_NAME, 'tavily'),
    tavilyName: TAVILI_PROVIDER_KEY_NAME,
    VK_SEARCH_WAKE_URL: String(processEnv.VK_SEARCH_WAKE_URL || '').trim(),
    VK_SEARCH_CENSUS_DIR: String(processEnv.VK_SEARCH_CENSUS_DIR || '').trim(),
    VK_SEARCH_BOT_PRIMARY: processEnv.VK_SEARCH_BOT_PRIMARY,
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

export function missingSearchKeys() {
  return [];
}

export function xaiPlaceSearchModelId(processEnv = process.env) {
  const direct = String(processEnv.XAI_PLACE_SEARCH_MODEL || '').trim();
  if (direct || processEnv !== process.env) {
    if (!direct) {
      throw Object.assign(new Error('XAI_PLACE_SEARCH_MODEL is not set.'), { code: 'XAI_PLACE_SEARCH_MODEL_MISSING' });
    }
    return direct;
  }
  const model = String(process.env.XAI_PLACE_SEARCH_MODEL || '').trim();
  if (!model) {
    throw Object.assign(new Error('XAI_PLACE_SEARCH_MODEL is not set.'), { code: 'XAI_PLACE_SEARCH_MODEL_MISSING' });
  }
  return model;
}
