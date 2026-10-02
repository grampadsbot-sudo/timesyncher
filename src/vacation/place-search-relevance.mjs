import { jevRelevanceMinimum } from './keepsake-list-minimums.mjs';
import { jevRelevanceScore } from './poi-search.mjs';

function relevanceRejectionReason(jevScore, minimum) {
  if (jevScore === null) return 'relevance_judge_unavailable';
  const score = Number(jevScore);
  if (!Number.isFinite(score)) return 'relevance_judge_unavailable';
  if (score < minimum) return `relevance_below_minimum_${score.toFixed(2)}`;
  return 'relevance_rejected';
}

export async function attachPlaceRelevance(rows, fetchImpl, env, relevanceContext = {}, { requireOpenRouterKey } = {}) {
  const apiKey = requireOpenRouterKey(env);
  const minimum = jevRelevanceMinimum(env);
  const target = String(relevanceContext.target || '').trim();
  const area = String(relevanceContext.area || relevanceContext.locationText || '').trim();
  const scored = [];
  const rejections = [];
  for (const row of rows) {
    if (row.source === 'prior_db') {
      scored.push({ ...row, jevScore: 5 });
      continue;
    }
    const jevScore = await jevRelevanceScore({
      id: row.externalId || row.url || row.title,
      name: row.title,
      url: row.url || '',
      category: row.category,
      address: row.address || '',
    }, { fetchImpl, apiKey, target, area });
    if (Number(jevScore) >= minimum) {
      scored.push({ ...row, jevScore: Number(jevScore) });
      continue;
    }
    if (rejections.length < 10) {
      rejections.push({
        title: String(row.title || '').trim(),
        address: String(row.address || '').trim(),
        reason: relevanceRejectionReason(jevScore, minimum),
      });
    }
  }
  return { places: scored, rejections };
}
