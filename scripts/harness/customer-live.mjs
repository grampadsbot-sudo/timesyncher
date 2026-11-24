import { hostIsBanned, loadBannedHosts } from './fetch-guard.mjs';

const CUSTOMER_LANE_ORDER = ['gemini', 'claude', 'codex'];

export function personaSeed(story) {
  const turns = Array.isArray(story?.turns) ? story.turns : [];
  return {
    name: String(story?.customer?.name || '').trim() || 'Customer',
    destination: String(story?.destination || '').trim(),
    goals: turns.map((turn) => String(turn?.text || '').trim()).filter(Boolean),
  };
}

export function customerLane(order = CUSTOMER_LANE_ORDER) {
  const list = Array.isArray(order) && order.length ? order.map((name) => String(name || '').trim()).filter(Boolean) : CUSTOMER_LANE_ORDER;
  if (list[0] !== 'gemini') throw new Error('refused: customer lane must start with gemini');
  if (list.some((name) => name.toLowerCase().includes('openrouter'))) throw new Error('refused: customer lane banned');
  return list[0];
}

function oddCustomerTurn(index) {
  const kinds = ['change-mind', 'off-topic', 'impossible', 'nonsense'];
  const kind = kinds[index % kinds.length];
  const lines = {
    'change-mind': 'Wait, forget that. I want the opposite of what I just said.',
    'off-topic': 'Unrelated: what is the weather on Mars next Tuesday?',
    impossible: 'Book the flights, charge a card, and email the hotel for me.',
    nonsense: 'Purple seventy bicycle.',
  };
  return { kind, text: lines[kind] };
}

export async function speakCustomer({ persona, appReply = '', index = 0, ask, order } = {}) {
  const lane = customerLane(order);
  if (index % 4 === 2) return { ...oddCustomerTurn(index), lane: 'host', model: lane, cost: null };
  if (typeof ask !== 'function') throw new Error('harness preflight missing HARNESS_CUSTOMER_MODEL_URL');
  const goal = persona?.goals?.[index] || persona?.goals?.[0] || persona?.destination || '';
  const spoken = await ask({ lane, persona, appReply: String(appReply || ''), goal, index });
  const text = String(spoken?.text || '').trim();
  if (!text) throw new Error('refused: customer model returned no line');
  if (spoken?.url && hostIsBanned(spoken.url, loadBannedHosts())) throw new Error('refused: harness blocked a model host');
  if (persona?.goals?.includes(text)) throw new Error('refused: customer line replayed a seed');
  return { kind: 'goal', text, lane, model: spoken.model || lane, cost: spoken.cost || null };
}

export function customerAskFromEnv(env, hosts) {
  const url = String(env?.HARNESS_CUSTOMER_MODEL_URL || '').trim();
  return async ({ lane, persona, appReply, goal }) => {
    if (!url) throw new Error('harness preflight missing HARNESS_CUSTOMER_MODEL_URL');
    if (hostIsBanned(url, hosts)) throw new Error('refused: harness blocked a model host');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        lane,
        persona: persona?.name,
        destination: persona?.destination,
        goal,
        appReply,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.json().catch(() => ({}));
    return { text: body.text || body.reply || '', model: body.model || lane, cost: body.cost || null, url };
  };
}

export function tripSurvey(persona, turns) {
  const heard = (turns || []).filter((turn) => turn.role === 'app').map((turn) => turn.text).filter(Boolean);
  return {
    questions: ['Did the plan match what you asked?', 'What should change next time?'],
    answers: [
      heard.length ? 'It answered some of it.' : 'I did not get a plan.',
      persona?.destination ? `Keep ${persona.destination} lighter.` : 'Keep the days lighter.',
    ],
  };
}
