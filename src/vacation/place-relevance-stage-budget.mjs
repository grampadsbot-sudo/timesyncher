import { firstPassSearchLimit } from './keepsake-list-minimums.mjs';
import { PlaceSearchError } from './place-search-error.mjs';

/** Matches `vercel.json` `api/[...route].mjs` maxDuration (seconds). */
export const VACATION_ITINERARY_ROUTE_MAX_MS = 60_000;

/** Brave/OSM/Nominatim, reply, and gates before/after relevance inside one POST. */
const PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS = 35_000;

const DEFAULT_PER_CALL_TIMEOUT_MS = 20_000;
const DEFAULT_JUDGE_CONCURRENCY = 3;

function envTrimmed(env, key) {
  const raw = env?.[key];
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

function parsePositiveIntEnv(env, key, { defaultValue, label }) {
  const text = envTrimmed(env, key);
  if (!text) return defaultValue;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer; got ${JSON.stringify(text)}`);
  }
  return parsed;
}

export function jevRelevanceStageBudgetMs(env = process.env) {
  const routeMax = parsePositiveIntEnv(env, 'VACATION_ITINERARY_ROUTE_MAX_MS', {
    defaultValue: VACATION_ITINERARY_ROUTE_MAX_MS,
    label: 'VACATION_ITINERARY_ROUTE_MAX_MS',
  });
  const reserve = parsePositiveIntEnv(env, 'PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS', {
    defaultValue: PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS,
    label: 'PLACE_SEARCH_NON_RELEVANCE_RESERVE_MS',
  });
  const budget = routeMax - reserve;
  if (budget < 5_000) {
    throw new Error(`relevance stage budget ${budget}ms is too small (route ${routeMax}ms minus reserve ${reserve}ms)`);
  }
  return budget;
}

export function jevRelevanceJudgeTimeoutMs(env = process.env) {
  return parsePositiveIntEnv(env, 'JEV_RELEVANCE_JUDGE_TIMEOUT_MS', {
    defaultValue: DEFAULT_PER_CALL_TIMEOUT_MS,
    label: 'JEV_RELEVANCE_JUDGE_TIMEOUT_MS',
  });
}

export function jevRelevanceJudgeConcurrency(env = process.env) {
  return parsePositiveIntEnv(env, 'JEV_RELEVANCE_JUDGE_CONCURRENCY', {
    defaultValue: DEFAULT_JUDGE_CONCURRENCY,
    label: 'JEV_RELEVANCE_JUDGE_CONCURRENCY',
  });
}

export function capRowsForRelevanceJudge(rows = [], category = '') {
  const list = Array.isArray(rows) ? rows : [];
  const cap = firstPassSearchLimit(category);
  const toJudge = list.slice(0, cap);
  return {
    toJudge,
    judgedCap: cap,
    totalRows: list.length,
    skipped: Math.max(0, list.length - toJudge.length),
  };
}

export function throwRelevanceStageBudgetExceeded({ elapsedMs, budgetMs, judged, remaining }) {
  throw new PlaceSearchError(
    `Jev relevance stage exceeded ${budgetMs}ms budget after ${elapsedMs}ms (${judged} scored, ${remaining} remaining)`,
    'relevance_judge_failed',
    { judgeTimedOut: true, judgeStageBudgetMs: budgetMs, relevanceStageMs: elapsedMs },
  );
}
