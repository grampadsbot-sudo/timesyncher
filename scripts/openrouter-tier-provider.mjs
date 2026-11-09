import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENROUTER_T1_MAX_PRICE = { prompt: 0.15, completion: 0.60 };
const OPENROUTER_TIER_REASONING = {
  1: { enabled: false, effort: 'low' },
  2: { effort: 'low' },
  3: { effort: 'medium' },
  4: { effort: 'high' },
};
const OPENROUTER_TIER_REQUEST_MAX_TOKENS = {
  1: 0,
  2: 3072,
  3: 4608,
  4: 6144,
};
const OPENROUTER_NO_TEMPERATURE_MODELS = new Set(['anthropic/claude-haiku-5.5']);
const OPENROUTER_CANONICAL_SLUGS = { 'anthropic/claude-haiku-5.5': 'anthropic/claude-haiku-5.5-20261007' };

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

export function openRouterTierReasoningSpread(modelTier) {
  const reasoning = OPENROUTER_TIER_REASONING[Number(modelTier)];
  return reasoning ? { reasoning: { ...reasoning } } : {};
}

export function openRouterTierRequestMaxTokens(modelTier, visibleMaxTokens) {
  const tier = Number(modelTier);
  const floor = OPENROUTER_TIER_REQUEST_MAX_TOKENS[tier];
  if (!floor) return visibleMaxTokens;
  return Math.max(visibleMaxTokens, floor);
}

export function openRouterChatVisibleText(content) {
  if (typeof content === 'string') return String(content);
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => {
      if (typeof part === 'string') return true;
      const kind = String(part?.type || 'text').toLowerCase();
      return kind === 'text' || kind === 'output_text';
    })
    .map((part) => (typeof part === 'string' ? part : String(part?.text || '')))
    .join('');
}

export function openRouterTemperatureSpread(modelId, temperature) {
  return OPENROUTER_NO_TEMPERATURE_MODELS.has(modelId) ? {} : { temperature };
}

export function openRouterReturnedModelMatches(requestedModel, returnedModel) {
  return returnedModel === requestedModel || returnedModel === OPENROUTER_CANONICAL_SLUGS[requestedModel];
}

export function openRouterTier1CompactReasoningSpread(modelTier) {
  if (Number(modelTier) !== 1) return {};
  return openRouterTierReasoningSpread(1);
}

export function openRouterTier1CompactCallSpread(modelTier) {
  return {
    ...openRouterProviderSpread(modelTier),
    ...openRouterTier1CompactReasoningSpread(modelTier),
  };
}
