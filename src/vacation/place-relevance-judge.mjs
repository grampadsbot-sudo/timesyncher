import { postJevDecisions } from '../../scripts/vacation-app-reply-rules.mjs';
import { PlaceSearchError } from './place-search-error.mjs';
import { parseJevRelevanceScoreAnswer } from './place-relevance-score-parse.mjs';

export { parseJevRelevanceScoreAnswer } from './place-relevance-score-parse.mjs';

function capSnippet(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function throwRelevanceJudgeFailed(message, extra = {}) {
  throw new PlaceSearchError(message, 'relevance_judge_failed', extra);
}

export async function jevRelevanceScore(poi, { fetchImpl = fetch, apiKey = '', target = '', area = '' } = {}) {
  if (!apiKey || !fetchImpl) {
    throwRelevanceJudgeFailed('Jev relevance judge refused to run. Missing OPENROUTER_API_KEY.');
  }
  const searchTarget = String(target || poi.target || '').trim();
  const searchArea = String(area || poi.area || '').trim();
  const description = String(poi.description || '').trim();
  const payload = {
    model: 'typesafe/jev-1.13',
    state: {
      channel: 'vacation-search',
      poiId: poi.id,
      name: poi.name,
      url: poi.url,
      category: poi.category,
      address: String(poi.address || '').trim(),
      ...(description ? { description } : {}),
      searchTarget,
      searchArea,
    },
    questions: {
      relevance: {
        type: 'score',
        instructions: 'Score whether this candidate is a specific place that fits searchTarget and searchArea in state. searchTarget is the cuisine or category they want (for example tacos). searchArea is the neighborhood or anchor they named. Use address text when coordinates are missing. Never require the place name to contain the target words literally. Criterion 1 is worst. Criterion 5 is best.',
        criteria: [
          '1 not a specific place or completely wrong kind for the target',
          '2 poor fit for the target or clearly outside the search area',
          '3 borderline fit',
          '4 good fit for the target in the search area',
          '5 excellent specific place for the target in the area',
        ],
      },
    },
  };
  let response;
  let responseText = '';
  try {
    response = await postJevDecisions({ payload, apiKey, fetchImpl, title: 'TimeSyncher Vacation POI' });
    responseText = typeof response.text === 'function' ? await response.text() : '';
  } catch (error) {
    throwRelevanceJudgeFailed(`Jev relevance judge request failed: ${capSnippet(error?.message || error)}`);
  }
  if (!response?.ok) {
    throwRelevanceJudgeFailed(
      `Jev relevance judge HTTP ${response?.status || 'no status'}: ${capSnippet(responseText)}`,
      { judgeHttpStatus: Number(response?.status) || null, judgeBodySnippet: capSnippet(responseText) },
    );
  }
  let body;
  try {
    body = responseText ? JSON.parse(responseText) : await response.json();
  } catch (error) {
    throwRelevanceJudgeFailed(
      `Jev relevance judge returned invalid JSON: ${capSnippet(responseText)}`,
      { judgeHttpStatus: Number(response?.status) || null, judgeBodySnippet: capSnippet(responseText) },
    );
  }
  return parseJevRelevanceScoreAnswer(body?.answers?.relevance);
}
