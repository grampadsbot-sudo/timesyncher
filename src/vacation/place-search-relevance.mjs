import { jevRelevanceMinimum } from './keepsake-list-minimums.mjs';
import { jevRelevanceScore } from './place-relevance-judge.mjs';

function relevanceRejectionReason(jevScore, minimum) {
  const score = Number(jevScore);
  return `relevance_below_minimum_${score.toFixed(2)}`;
}

export async function attachPlaceRelevance(rows, fetchImpl, env, relevanceContext = {}, { requireOpenRouterKey } = {}) {
  const apiKey = requireOpenRouterKey(env);
  const minimum = jevRelevanceMinimum(env);
  const target = String(relevanceContext.target || '').trim();
  const area = String(relevanceContext.area || relevanceContext.locationText || '').trim();
  const scored = [];
  const rejections = [];
  for (const row of rows) {
    const jevScore = await jevRelevanceScore({
      id: row.externalId || row.url || row.title,
      name: row.title,
      url: row.url || '',
      category: row.category,
      address: row.address || '',
      description: row.description || '',
    }, { fetchImpl, apiKey, target, area });
    if (Number(jevScore) >= minimum) {
      scored.push({ ...row, jevScore: Number(jevScore) });
      continue;
    }
    if (rejections.length < 10) {
      rejections.push({
        title: String(row.title || '').trim(),
        address: String(row.address || '').trim(),
        source: String(row.source || '').trim(),
        score: Number(jevScore),
        reason: relevanceRejectionReason(jevScore, minimum),
      });
    }
  }
  return { places: scored, rejections };
}
