export const jevQualitySelfCorrectionInstructions =
  'Rate this draft as the customer-facing vacation reply. The customer is challenging a prior mistake. Use criterion 1 or 2 when the draft ignores the challenge, repeats the mistake, or does not acknowledge and correct. Use criterion 4 or 5 when it clearly acknowledges the error and gives an accurate correction. Return a score only.';

export function customerChallengesPriorReply(customerTurn = '') {
  const text = String(customerTurn || '').trim();
  if (!text) return false;
  return /\b(?:that(?:'s| is) (?:wrong|not)|you(?:'ve| have)? (?:said|told me|named|called)|we never|i never said|never said that|why did you|isn'?t right|mixed up|not what i|didn'?t say)\b/i.test(text);
}

export function selfCorrectionGrade(customerTurn = '', draft = '', { priorSnippet = '' } = {}) {
  if (!customerChallengesPriorReply(customerTurn)) return null;
  const body = String(draft || '').trim();
  if (!body) return { pass: false, reason: 'empty_reply' };
  const acknowledges = /\b(?:sorry|you(?:'re| are) right|good catch|my mistake|i misspoke|let me correct|thanks for (?:flagging|catching)|you(?:'re| are) correct|i (?:had|got) that wrong)\b/i.test(body);
  const snippet = String(priorSnippet || '').trim().slice(0, 80);
  const retractsPrior = /\b(?:shouldn'?t|should not|not have|didn'?t mean|instead|actually|meant|correction|my mistake)\b/i.test(body);
  const corrects = acknowledges && (!snippet || retractsPrior || !new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(body));
  return {
    pass: corrects,
    reason: corrects ? 'acknowledged_and_corrected' : (acknowledges ? 'no_correction' : 'ignored_challenge'),
  };
}