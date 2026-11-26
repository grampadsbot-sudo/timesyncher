import { collectCheckpointReactions, getCheckpointDefinition } from '../customer_suite/ssr/checkpoints.mjs';
import { personaSeed, speakCustomer } from './customer-live.mjs';

export async function collectLiveSsrCheckpoint(checkpointId, respond, extra = {}) {
  const rows = await collectCheckpointReactions({
    checkpoints: [getCheckpointDefinition(checkpointId)],
    respond,
    keepsakeStatus: extra.keepsakeStatus,
    keepsakeNote: extra.keepsakeNote,
  });
  return rows[0];
}

export function createLiveSsrRespond({ story, customerAsk, customerLanes = null, env = process.env } = {}) {
  if (typeof customerAsk !== 'function') {
    throw new Error('refused: live SSR requires HARNESS_CUSTOMER_MODEL_URL');
  }
  const persona = personaSeed(story);
  return async (ctx) => {
    const spoken = await speakCustomer({
      persona,
      appReply: '',
      index: 0,
      transcript: [],
      ask: customerAsk,
      order: customerLanes,
      env,
      goal: ctx?.prompt,
    });
    return spoken.text;
  };
}