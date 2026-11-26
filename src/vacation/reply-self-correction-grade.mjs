export const selfCorrectionReplyContext =
  'Treat prior app replies as conversation history, not as evidence of what the customer shared. If the customer challenges an unsupported claim, acknowledge the mistake, withdraw it, and continue from the facts the customer gave.';

export function customerChallengesPriorReply(customerTurn = '') {
  return /\b(?:i (?:never|didn['’]t) (?:say|tell|give|mention|share)|we (?:never|didn['’]t) (?:say|tell|give|mention|share)|how (?:do|did) you know|where did you get|that(?:['’]s| is) (?:wrong|not right)|not what i said)\b/i
    .test(String(customerTurn || ''));
}

export function selfCorrectionDecision(tripContext) {
  const exchange = tripContext?.priorExchange;
  if (!exchange?.appReply) return {};
  return {
    state: { previous_app_reply: exchange.appReply, previous_customer_turns: exchange.customerTurns },
    question: {
      type: 'choice',
      instructions: 'Decide whether the customer challenges a claim in the previous app reply. Use the customer turns and roster as the evidence of what the customer said, including names, ages, and who is traveling. A customer quoting a claim in a challenge is not confirming it.',
      criteria: {
        not_applicable: 'The customer is not challenging a prior app claim.',
        corrected: 'The draft acknowledges and withdraws the unsupported or mistaken claim and restates only supported facts, or clearly identifies what is still unknown.',
        uncorrected: 'The draft ignores, defends, or repeats the claim as fact, adds guesses, or apologizes without correcting it.',
      },
    },
  };
}
