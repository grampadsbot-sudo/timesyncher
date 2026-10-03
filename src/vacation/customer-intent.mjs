/** Model extraction. Missing key or bad JSON throws. No keyword fallback. */

function parseJson(value) {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(slice);
}

export function seatsFromModel(seats) {
  const seen = new Set();
  return (Array.isArray(seats) ? seats : []).flatMap((seat) => {
    const name = String(seat?.name || '').trim();
    const payer = String(seat?.payer || '').trim();
    if (!name || !payer || seen.has(name)) return [];
    seen.add(name);
    return [{ name, payer }];
  });
}

export const emptyIntent = () => ({ asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: true });

async function askModelJson(instructions, state, { fetchImpl = fetch, env = process.env, signal } = {}) {
  const key = env.OPENROUTER_API_KEY || env.TIMESYNCHER_OPENROUTER_API_KEY || env.JEV_OPENROUTER_API_KEY || '';
  if (!key) throw Object.assign(new Error('OPENROUTER_API_KEY missing'), { code: 'model_unavailable' });
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.TIMESYNCHER_INTENT_MODEL || 'google/gemini-2.5-flash-lite',
      temperature: 0,
      messages: [
        { role: 'system', content: 'Return one JSON object. Do not write a customer reply.' },
        { role: 'user', content: `${instructions}\n\n${JSON.stringify(state)}` },
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error?.message || `intent model HTTP ${response.status}`);
  return parseJson(json?.choices?.[0]?.message?.content || '');
}

export async function customerIntent(text, options) {
  const body = await askModelJson(
    'asksPrice, asksAccess, and pullsAccess are true only when the turn asks that. Otherwise false or []. ask is true when you cannot tell.',
    { customerTurn: String(text || '').slice(0, 4000) },
    options,
  );
  return {
    asksPrice: body.asksPrice === true,
    asksAccess: body.asksAccess === true,
    pullsAccess: body.pullsAccess === true,
    seats: seatsFromModel(body.seats),
    ask: body.ask === true,
  };
}

export async function activityCommits(sentences, options) {
  const list = (Array.isArray(sentences) ? sentences : []).map((sentence) => String(sentence || '').trim()).filter(Boolean);
  if (!list.length) return {};
  const body = await askModelJson(
    'For each sentence, commits is true only when the customer is putting that activity on the plan. Otherwise commits is false and ask is true. Return {"sentences":[{"text":"","commits":false,"ask":true}]}.',
    { sentences: list },
    options,
  );
  const decisions = {};
  for (const sentence of list) decisions[sentence] = { commits: false, ask: true };
  for (const row of Array.isArray(body.sentences) ? body.sentences : []) {
    const text = String(row?.text || '').trim();
    if (decisions[text]) decisions[text] = { commits: row.commits === true, ask: row.commits !== true };
  }
  return decisions;
}

export async function contentTags(text, allowed, options) {
  const names = Array.isArray(allowed) ? allowed : [];
  const body = await askModelJson(
    'Choose tags from the allowed list only. If none apply, tags [] and ask true.',
    { allowed: names, customerTurn: String(text || '').slice(0, 4000) },
    options,
  );
  const allowedSet = new Set(names);
  const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).map((tag) => String(tag || '').trim()).filter((tag) => allowedSet.has(tag)))];
  return { tags, ask: body.ask === true || tags.length === 0 };
}
