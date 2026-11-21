export const SSR_CHECKPOINTS = [
  {
    id: 'after_setup',
    label: 'After setup (signed-in / vacation created)',
    constructs: ['satisfaction'],
    prompt:
      'You just signed in and created your AI-assisted vacation plan. In your own words, how did getting set up feel so far, and what stood out to you?',
  },
  {
    id: 'after_keepsake',
    label: 'After keepsake (PDF/keepsake shown or skipped)',
    constructs: ['satisfaction', 'recommend'],
    prompt:
      'Now that you have experienced the vacation planner and its keepsake output, share your honest reaction in your own words. How happy are you with it, and how would you talk about it to friends or family planning a vacation?',
  },
  {
    id: 'pricing_10',
    label: 'Pricing check ($10)',
    price_usd: 10,
    constructs: ['intent-to-pay'],
    prompt:
      'If this AI vacation planner cost $10 for your vacation, would you pay for it? Answer naturally in your own words and explain why or why not.',
  },
  {
    id: 'pricing_17',
    label: 'Pricing check ($17)',
    price_usd: 17,
    constructs: ['intent-to-pay'],
    prompt:
      'If this AI vacation planner cost $17 for your vacation, would you pay for it? Answer naturally in your own words and explain why or why not.',
  },
];

const BANNED_NUMERIC_PROMPT_PATTERNS = [
  /\brate\b[^.?!]{0,40}\b1\b[^.?!]{0,12}\b5\b/i,
  /\b1\s*(?:to|-|–|through)\s*5\b/i,
  /\bout\s+of\s+(?:5|10)\b/i,
  /\bscale\s+of\s+1\b/i,
  /\bgive\s+(?:this\s+|it\s+|me\s+)?a\s+(?:number|score|rating)\b/i,
  /\b(?:give|pick|choose|enter|provide)\s+(?:a\s+)?(?:numeric(?:al)?|integer|likert)\b/i,
  /\blikert\b/i,
  /\bnumeric(?:al)?\s+(?:score|rating|value)\b/i,
  /\bscore\s+from\s+\d/i,
];

const BANNED_COPY_PATTERNS = [/\btrips?\b/i];

export function assertFreeTextPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) throw new Error('refused: checkpoint prompt is empty');
  for (const pattern of BANNED_NUMERIC_PROMPT_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`refused: checkpoint prompt asks for a numeric rating (${pattern})`);
    }
  }
  for (const pattern of BANNED_COPY_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error('refused: checkpoint prompt must say vacation, never trip');
    }
  }
  return text;
}

export function assertFreeTextReply(reply, checkpointId = '') {
  const text = String(reply || '').trim();
  if (!text) throw new Error(`refused: empty free-text reply at checkpoint ${checkpointId || 'unknown'}`);
  if (/^[1-5](?:\s*\/\s*5)?$/.test(text)) {
    throw new Error(`refused: bare Likert integer reply is not allowed at checkpoint ${checkpointId || 'unknown'}`);
  }
  return text;
}

export function getCheckpointDefinition(id) {
  const found = SSR_CHECKPOINTS.find((item) => item.id === id);
  if (!found) throw new Error(`refused: unknown SSR checkpoint ${id}`);
  return found;
}

export async function collectCheckpointReactions({
  checkpoints = SSR_CHECKPOINTS,
  respond,
  keepsakeStatus = 'shown',
  keepsakeNote = '',
} = {}) {
  if (typeof respond !== 'function') {
    throw new Error('refused: collectCheckpointReactions requires a respond function');
  }
  const receipt = [];
  for (const checkpoint of checkpoints) {
    const prompt = assertFreeTextPrompt(checkpoint.prompt);
    const context = {
      checkpoint: checkpoint.id,
      label: checkpoint.label,
      constructs: [...checkpoint.constructs],
      prompt,
      ...(checkpoint.price_usd != null ? { price_usd: checkpoint.price_usd } : {}),
      ...(checkpoint.id === 'after_keepsake' ? { keepsake_status: keepsakeStatus, keepsake_note: keepsakeNote } : {}),
    };
    const rawReply = await respond(context);
    const replyText = typeof rawReply === 'string' ? rawReply : rawReply?.reply ?? rawReply?.text ?? '';
    const reply = assertFreeTextReply(replyText, checkpoint.id);
    receipt.push({
      checkpoint: checkpoint.id,
      label: checkpoint.label,
      constructs: [...checkpoint.constructs],
      prompt,
      reply,
      ...(checkpoint.price_usd != null ? { price_usd: checkpoint.price_usd } : {}),
      ...(checkpoint.id === 'after_keepsake'
        ? {
            keepsake_status: keepsakeStatus === 'skipped' ? 'skipped' : 'shown',
            keepsake_note: String(keepsakeNote || (keepsakeStatus === 'skipped' ? 'keepsake skipped and recorded' : 'keepsake shown')),
          }
        : {}),
    });
  }
  return receipt;
}
