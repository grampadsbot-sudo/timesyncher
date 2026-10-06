import { jevRelevanceJudgeConcurrency, jevRelevanceMinimum } from './keepsake-list-minimums.mjs';
import { jevRelevanceScore } from './place-relevance-judge.mjs';

function relevanceRejectionReason(jevScore, minimum) {
  const score = Number(jevScore);
  return `relevance_below_minimum_${score.toFixed(2)}`;
}

async function scoreRowsWithConcurrency(rows, scoreRow, concurrency) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];
  let cursor = 0;
  let failure = null;
  const judged = new Array(list.length);
  const workers = Math.min(Math.max(1, concurrency), list.length);
  async function worker() {
    while (cursor < list.length) {
      if (failure) return;
      const index = cursor;
      cursor += 1;
      try {
        judged[index] = await scoreRow(list[index], index);
      } catch (error) {
        failure = error;
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (failure) throw failure;
  return judged;
}

export async function attachPlaceRelevance(rows, fetchImpl, env, relevanceContext = {}, { requireOpenRouterKey } = {}) {
  const apiKey = requireOpenRouterKey(env);
  const minimum = jevRelevanceMinimum(env);
  const concurrency = jevRelevanceJudgeConcurrency(env);
  const target = String(relevanceContext.target || '').trim();
  const area = String(relevanceContext.area || relevanceContext.locationText || '').trim();
  const judged = await scoreRowsWithConcurrency(rows, async (row) => {
    const jevScore = await jevRelevanceScore({
      id: row.externalId || row.url || row.title,
      name: row.title,
      url: row.url || '',
      category: row.category,
      address: row.address || '',
      description: row.description || '',
      target,
      area,
    }, { fetchImpl, apiKey, target, area, env });
    return { row, jevScore: Number(jevScore) };
  }, concurrency);
  const scored = [];
  const rejections = [];
  for (const { row, jevScore } of judged) {
    if (jevScore >= minimum) {
      scored.push({ ...row, jevScore });
      continue;
    }
    if (rejections.length < 10) {
      rejections.push({
        title: String(row.title || '').trim(),
        address: String(row.address || '').trim(),
        source: String(row.source || '').trim(),
        score: jevScore,
        reason: relevanceRejectionReason(jevScore, minimum),
      });
    }
  }
  return { places: scored, rejections };
}
