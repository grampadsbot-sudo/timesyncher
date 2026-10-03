import { readFile } from 'node:fs/promises';

export const JUDGE_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const JUDGE_MODEL = 'typesafe/jev-1.13';

/**
 * One vision call per screenshot. Same OpenRouter chat path as
 * scripts/vacation-app-reply-rules.mjs (OPENROUTER_CHAT_COMPLETIONS_URL).
 * The key is OPENROUTER_API_KEY. A missing key, timeout, or bad verdict is a failure.
 */
export async function judgeScreenshot({
  pngPath,
  specText,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 45000,
} = {}) {
  if (!pngPath) return { ok: false, error: 'screenshot-missing', verdict: null, mismatches: [] };
  if (!specText) return { ok: false, error: 'no spec', verdict: null, mismatches: [] };
  const apiKey = env.OPENROUTER_API_KEY || '';
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY missing', verdict: null, mismatches: [] };
  let bytes;
  try {
    bytes = await readFile(pngPath);
  } catch {
    return { ok: false, error: 'screenshot-missing', verdict: null, mismatches: [] };
  }
  const prompt = [
    'Does this screenshot match the screen spec?',
    'Reply with JSON only: {"verdict":"yes"|"no","mismatches":["..."]}.',
    'verdict is yes only when the screen matches. List each mismatch.',
    '',
    'Spec:',
    specText,
  ].join('\n');
  const payload = {
    model: env.TIMESYNCHER_VERIFY_JUDGE_MODEL || JUDGE_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } },
        ],
      },
    ],
  };
  try {
    const response = await fetchImpl(JUDGE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'HTTP-Referer': 'https://timesyncher.com',
        'X-Title': 'TimeSyncher Vacation layout judge',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `judge HTTP ${response.status}`, verdict: null, mismatches: [], body: text.slice(0, 300) };
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, error: 'judge returned no verdict', verdict: null, mismatches: [] };
    }
    const content = body?.choices?.[0]?.message?.content || '';
    const parsed = parseVerdict(content);
    if (!parsed) return { ok: false, error: 'judge returned no verdict', verdict: null, mismatches: [], body: String(content).slice(0, 300) };
    return { ok: true, error: null, verdict: parsed.verdict, mismatches: parsed.mismatches, model: body.model || payload.model };
  } catch (error) {
    const name = error?.name || '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      ok: false,
      error: timedOut ? 'judge timeout' : String(error?.message || error).slice(0, 300),
      verdict: null,
      mismatches: [],
    };
  }
}

export function parseVerdict(content) {
  const text = String(content || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const body = JSON.parse(text.slice(start, end + 1));
    const verdict = String(body.verdict || '').toLowerCase();
    if (verdict !== 'yes' && verdict !== 'no') return null;
    const mismatches = Array.isArray(body.mismatches) ? body.mismatches.map((item) => String(item)) : [];
    return { verdict, mismatches };
  } catch {
    return null;
  }
}
