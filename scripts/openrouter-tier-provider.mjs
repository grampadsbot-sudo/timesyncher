import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENROUTER_T1_MAX_PRICE = { prompt: 0.15, completion: 0.40 };

let cachedTierOneModelId = '';

export function openRouterTier1BakeoffModelId() {
  if (!cachedTierOneModelId) {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dialog-runners/tier_models.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    cachedTierOneModelId = String(parsed?.models?.['1'] ?? parsed?.models?.[1] ?? '').trim();
  }
  return cachedTierOneModelId;
}

export function openRouterProviderForTier(modelTier) {
  return Number(modelTier) === 1 ? { max_price: OPENROUTER_T1_MAX_PRICE } : undefined;
}

export function openRouterProviderSpread(modelTier) {
  const provider = openRouterProviderForTier(modelTier);
  return provider ? { provider } : {};
}

/** Tier-1 calls that need a short or structured answer (not long draft replies). */
export function openRouterTier1CompactReasoningSpread(modelTier) {
  if (Number(modelTier) !== 1) return {};
  return { reasoning: { enabled: false, effort: 'low' } };
}

export function openRouterTier1CompactCallSpread(modelTier) {
  return {
    ...openRouterProviderSpread(modelTier),
    ...openRouterTier1CompactReasoningSpread(modelTier),
  };
}
