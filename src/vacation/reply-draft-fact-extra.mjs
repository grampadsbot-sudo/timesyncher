export function pushPlanAndStyleDraftErrors(body, errors, pushError, facts = {}) {
  const yearPlan = String(facts.purchased_plan || '').trim();
  if (yearPlan !== 'unlimited' && /you'?re currently on the timesyncher vacation unlimited plan|timesyncher vacation unlimited plan|you(?:'|’)re all set (?:with|for) the\b[^.]{0,120}unlimited|you are all set (?:with|for) the\b[^.]{0,120}unlimited|already (?:own|have|set up)[^.]{0,60}unlimited|\bunlimited plan\b/i.test(body)) {
    pushError(errors, 'the unlimited plan is not owned yet');
  }
  if (/\b\d{1,3}\s*(?:-|\u2013)?\s*minute\s+walk\b/i.test(body)) {
    pushError(errors, 'walk time is not in saved trip facts or search results');
  }
  if (/\b[\p{Lu}][\p{L}]+,\s*you,\s*[\p{Lu}][\p{L}]+/u.test(body) && /\b(?:are|is)\s+(?:set|locked)\b/i.test(body)) {
    pushError(errors, 'do not use a formulaic roster opener');
  }
}
