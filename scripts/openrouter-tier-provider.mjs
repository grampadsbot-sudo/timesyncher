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
const OPENROUTER_TIER4_TIMEOUT_MS = 35000;
const COMPACT_RETRY_REASON_RE = /abort|timeout|timed out|tiered model returned an empty reply/i;
const OPENROUTER_NO_TEMPERATURE_MODELS = new Set(['anthropic/claude-haiku-5.5']);
const OPENROUTER_CANONICAL_SLUGS = { 'anthropic/claude-haiku-5.5': 'anthropic/claude-haiku-5.5-20261007' };

export function openRouterTierReplyTimeoutMs(modelTier, requestedTimeoutMs = 0, defaultTimeoutMs = 20000) {
  const explicit = Number(requestedTimeoutMs);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const base = Number.isFinite(Number(defaultTimeoutMs)) && Number(defaultTimeoutMs) > 0 ? Number(defaultTimeoutMs) : 20000;
  return Number(modelTier) >= 4 ? Math.max(base, OPENROUTER_TIER4_TIMEOUT_MS) : base;
}

export function openRouterShouldCompactRetry({ modelTier, tier1CompactReasoning = false, result = null } = {}) {
  if (tier1CompactReasoning === true || Number(modelTier) < 3) return false;
  if (!result || result.called === true) return false;
  return COMPACT_RETRY_REASON_RE.test(String(result.reason || ''));
}

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
    .map((part) => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.text?.value === 'string') return part.text.value;
      if (typeof part?.value === 'string') return part.value;
      return '';
    })
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
