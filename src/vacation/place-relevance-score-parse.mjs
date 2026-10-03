import { PlaceSearchError } from './place-search-error.mjs';

const JEV_RELEVANCE_INDEX_MAX = 4;

function throwRelevanceJudgeFailed(message, extra = {}) {
  throw new PlaceSearchError(message, 'relevance_judge_failed', extra);
}

/** OpenRouter decisions type score: `answers.relevance.score` is the weighted mean of criterion indices 0–4 (see legend keys). Map to rubric 1–5 as indexMean + 1. */
export function parseJevRelevanceScoreAnswer(answer) {
  if (!answer || typeof answer !== 'object') {
    throwRelevanceJudgeFailed('Jev relevance judge returned no answer object.');
  }
  const choice = Number(answer.choice ?? answer.value);
  if (Number.isInteger(choice) && choice >= 1 && choice <= 5) return choice;
  if (String(answer.type || '') !== 'score') {
    throwRelevanceJudgeFailed(`Jev relevance judge returned unexpected answer type ${String(answer.type || 'missing')}.`);
  }
  const raw = Number(answer.score);
  if (!Number.isFinite(raw)) {
    throwRelevanceJudgeFailed('Jev relevance judge returned a non-numeric score.');
  }
  if (raw < 0 || raw > JEV_RELEVANCE_INDEX_MAX) {
    throwRelevanceJudgeFailed(
      `Jev relevance judge score ${raw} is outside the documented 0–${JEV_RELEVANCE_INDEX_MAX} index mean range.`,
    );
  }
  return raw + 1;
}
