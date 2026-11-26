export function customerAskedAccessCollabOrPlan(customerTurn = '') {
  const source = String(customerTurn || '').toLowerCase();
  if (!source.trim()) return false;
  const planAsk = /\b(household plan|family plan|year[- ]round|subscription|membership|unlimited plan)\b/.test(source);
  const accessAsk = /\b(view access|edit access|full access|collaborator|collaborate|collaboration|invite|sharing|share (?:the |this )?vacation|who can (?:see|edit)|access for)\b/.test(source);
  const pricedAccess = /\b(how much|cost|price|pricing|charge|fee|pay|purchase|buy)\b/.test(source)
    && /\b(access|collaborator|collaborate|edit|family|spouse|wife|husband|assistant)\b/.test(source);
  return planAsk || accessAsk || pricedAccess;
}