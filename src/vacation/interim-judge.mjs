import { fetchOpenRouterJson } from './openrouter-call-ledger.mjs';
import { INTERIM_MODEL, OPENROUTER_CHAT_COMPLETIONS_URL, openRouterChatVisibleText, openRouterTemperatureSpread } from '../../scripts/vacation-app-reply-rules.mjs';
import { openRouterTier1CompactCallSpread } from '../../scripts/openrouter-tier-provider.mjs';

function interimJudgeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function readInterimJudge(result) {
  if (!result || result.judged !== true || typeof result.template !== 'boolean') return null;
  return { judged: true, template: result.template === true, canShip: result.canShip === true && result.template !== true };
}

function verdictFromText(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (typeof json?.template !== 'boolean' || typeof json?.canShip !== 'boolean') return null;
    return readInterimJudge({ ...json, judged: true });
  } catch (error) {
    return error ? null : null;
  }
}

function verdictFromBody(body) {
  const message = body?.choices?.[0]?.message || {};
  for (const chunk of [message.content, message.reasoning, message.reasoning_content]) {
    const parsed = verdictFromText(openRouterChatVisibleText(chunk));
    if (parsed) return parsed;
  }
  return null;
}

async function judgeInterimReplyOnce({ text, customerTurn, facts = {}, env = process.env, judge = null, fetchImpl = null } = {}) {
  const value = String(text || '').trim();
  if (!value) return { judged: true, template: true, canShip: false, reason: 'empty' };
  if (typeof judge === 'function') {
    const verdict = await judge({ text: value, customerTurn, facts });
    const parsed = readInterimJudge(verdict?.judged === true ? verdict : { ...verdict, judged: true });
    if (!parsed) throw interimJudgeError('INTERIM_JUDGE_UNUSABLE');
    return { ...parsed, reason: '' };
  }
  const key = String(env?.TIMESYNCHER_JEV_CLASSIFY_TOKEN || env?.TIMESYNCHER_OPENROUTER_API_KEY || env?.OPENROUTER_API_KEY || '').trim();
  if (!key) throw interimJudgeError('INTERIM_JUDGE_CREDENTIALS_MISSING');
  const { response, body } = await fetchOpenRouterJson(OPENROUTER_CHAT_COMPLETIONS_URL, {
    fetchImpl: fetchImpl || fetch, key, purpose: 'interim_judge',
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
    payload: {
      model: INTERIM_MODEL,
      ...openRouterTemperatureSpread(INTERIM_MODEL, 0),
      ...openRouterTier1CompactCallSpread(1),
      max_tokens: 256,
      messages: [
        { role: 'system', content: 'Return only JSON {"template":boolean,"canShip":boolean}. template means a stock acknowledgement or a reply that misses the customer. canShip means it answers this turn. Do not write a reply.' },
        { role: 'user', content: JSON.stringify({ customer: String(customerTurn || '').slice(0, 4000), reply: value.slice(0, 2000) }) },
      ],
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response?.ok) throw interimJudgeError('INTERIM_JUDGE_HTTP');
  const parsed = verdictFromBody(body);
  if (!parsed) throw interimJudgeError('INTERIM_JUDGE_UNUSABLE');
  return { ...parsed, reason: '' };
}

export async function judgeInterimReply(args = {}) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await judgeInterimReplyOnce(args);
    } catch (error) {
      last = error;
      if (error?.code === 'INTERIM_JUDGE_CREDENTIALS_MISSING') throw error;
    }
  }
  throw last || interimJudgeError('INTERIM_JUDGE_UNUSABLE');
}

export async function judgedInterimOrNull(args = {}) {
  try {
    return await judgeInterimReply(args);
  } catch (error) {
    return error ? null : null;
  }
}
