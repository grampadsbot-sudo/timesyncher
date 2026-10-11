import { openRouterTier1BakeoffModelId, openRouterTier1CompactCallSpread } from '../../scripts/openrouter-tier-provider.mjs';

const NONE = /^(none|missing|unknown)$/i;
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DESTINATION_ASK = 'No destination is saved and none was extracted from the chat. Ask the customer where the trip is. Do not invent a place.';

export function destinationFromSavedTrip(record = {}) {
  if (!record || typeof record !== 'object') return '';
  return String(record.destination || '').trim().slice(0, 160);
}

export function parseExtractedDestination(raw) {
  const line = String(raw || '').split('\n').map((part) => part.trim()).find(Boolean) || '';
  if (!line || NONE.test(line)) return '';
  return line.replace(/\s+/g, ' ').trim().slice(0, 160);
}

export async function extractDestinationFromChat(texts, { complete } = {}) {
  const corpus = (Array.isArray(texts) ? texts : [texts]).map((item) => String(item || '').trim()).filter(Boolean).join('\n').trim();
  if (!corpus) return '';
  if (typeof complete !== 'function') {
    throw new Error('destination_extraction_unavailable');
  }
  let raw;
  try {
    raw = await complete(corpus);
  } catch (error) {
    throw new Error(`destination_extraction_failed: ${error?.message || error}`);
  }
  if (raw && typeof raw === 'object') {
    if (raw.ok === false || raw.called === false) {
      throw new Error(raw.reason || 'destination_extraction_failed');
    }
    return parseExtractedDestination(raw.text ?? raw.destination ?? '');
  }
  if (raw == null) throw new Error('destination_extraction_failed');
  return parseExtractedDestination(raw);
}

export async function resolveTripDestination({ saved = '', texts = [], complete } = {}) {
  const fromTrip = destinationFromSavedTrip({ destination: saved });
  if (fromTrip) return { destination: fromTrip, ask: false, source: 'saved-trip' };
  const extracted = await extractDestinationFromChat(texts, { complete });
  if (extracted) return { destination: extracted, ask: false, source: 'chat' };
  return { destination: '', ask: true, source: '' };
}

export function destinationExtractionChatRequest(corpus) {
  return {
    model: openRouterTier1BakeoffModelId(),
    ...openRouterTier1CompactCallSpread(1),
    temperature: 0,
    max_tokens: 40,
    messages: [
      {
        role: 'system',
        content: 'Read the customer chat. If they named where the trip is, reply with only that place in their words. If they did not name a place, reply none. Do not invent a place.',
      },
      { role: 'user', content: String(corpus || '') },
    ],
  };
}

export async function openRouterDestinationComplete(corpus, env = process.env) {
  const key = String(env?.OPENROUTER_API_KEY || env?.TIMESYNCHER_OPENROUTER_API_KEY || '').trim();
  if (!key) throw new Error('destination_extraction_unavailable');
  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(destinationExtractionChatRequest(corpus)),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`destination_extraction_failed: ${body.error?.message || body.error || response.status}`);
  }
  const text = body.choices?.[0]?.message?.content;
  if (text == null || !String(text).trim()) throw new Error('destination_extraction_failed');
  return String(text);
}
