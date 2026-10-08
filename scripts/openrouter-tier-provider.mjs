const OPENROUTER_T1_MAX_PRICE = { prompt: 0.15, completion: 0.40 };

export function openRouterProviderForTier(modelTier) {
  return Number(modelTier) === 1 ? { max_price: OPENROUTER_T1_MAX_PRICE } : undefined;
}

export function openRouterProviderSpread(modelTier) {
  const provider = openRouterProviderForTier(modelTier);
  return provider ? { provider } : {};
}
