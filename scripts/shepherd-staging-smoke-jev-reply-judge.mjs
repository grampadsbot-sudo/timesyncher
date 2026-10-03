import {
  postJevDecisions,
  JEV_QUALITY_MODEL,
  openRouterAppKey,
} from './vacation-app-reply-rules.mjs';

export function parseJevNoulAnswer(answer) {
  if (!answer || typeof answer !== 'object') return { yes: null, score: null, rationale: '' };
  const scoreRaw = Number(answer.noul ?? answer.probability ?? answer.score);
  if (Number.isFinite(scoreRaw)) {
    const score = Math.max(0, Math.min(1, scoreRaw));
    const rationale = String(answer.rationale || answer.explanation || '').trim()
      || `noul=${score.toFixed(3)}`;
    return { yes: score >= 0.5, score, rationale };
  }
  const choice = String(answer.choice || '').toLowerCase();
  if (choice === 'true' || choice === 'yes') {
    return { yes: true, score: 1, rationale: String(answer.rationale || 'choice=yes').trim() };
  }
  if (choice === 'false' || choice === 'no') {
    return { yes: false, score: 0, rationale: String(answer.rationale || 'choice=no').trim() };
  }
  return { yes: null, score: null, rationale: '' };
}

/**
 * @param {object} opts
 * @param {string} opts.questionKey
 * @param {string} opts.instructions
 * @param {{ true: string, false: string }} opts.criteria
 * @param {string} opts.replyText
 * @param {string} [opts.customerTurn]
 * @param {object} [opts.env]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 */
async function jevSmokeReplyYesNo({
  questionKey,
  instructions,
  criteria,
  replyText,
  customerTurn = '',
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20000,
}) {
  const model = JEV_QUALITY_MODEL;
  const apiKey = openRouterAppKey(env);
  if (!apiKey) {
    return {
      ok: false,
      error: 'Jev reply judge needs OPENROUTER_API_KEY or TIMESYNCHER_OPENROUTER_API_KEY',
      verdict: null,
      yes: null,
      rationale: '',
      model,
    };
  }
  const payload = {
    model,
    state: {
      channel: 'shepherd-staging-smoke',
      customer_turn: String(customerTurn || '').slice(0, 4000),
      app_reply: String(replyText || '').slice(0, 8000),
    },
    questions: {
      [questionKey]: {
        type: 'noul',
        instructions: String(instructions || '').slice(0, 2000),
        criteria,
      },
    },
  };
  const started = Date.now();
  try {
    const response = await postJevDecisions({
      payload,
      apiKey,
      fetchImpl,
      title: 'TimeSyncher Shepherd Smoke Reply Judge',
    });
    const text = typeof response.text === 'function' ? await response.text() : '';
    let body = {};
    try {
      body = text ? JSON.parse(text) : await response.json();
    } catch {
      return {
        ok: false,
        error: `Jev reply judge invalid JSON HTTP ${response.status}`,
        verdict: null,
        yes: null,
        rationale: String(text || '').slice(0, 200),
        model,
        latencyMs: Date.now() - started,
      };
    }
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: String(body.error?.message || body.error || `Jev HTTP ${response.status}`).slice(0, 300),
        verdict: null,
        yes: null,
        rationale: String(text || '').slice(0, 200),
        model: body.model || model,
        latencyMs: Date.now() - started,
      };
    }
    const answer = body?.answers?.[questionKey];
    const parsed = parseJevNoulAnswer(answer);
    if (parsed.yes == null) {
      return {
        ok: false,
        error: 'Jev reply judge returned no yes/no score',
        verdict: null,
        yes: null,
        rationale: parsed.rationale,
        model: body.model || model,
        latencyMs: Date.now() - started,
      };
    }
    return {
      ok: true,
      error: null,
      verdict: parsed.yes ? 'yes' : 'no',
      yes: parsed.yes,
      score: parsed.score,
      rationale: parsed.rationale,
      model: body.model || model,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err).slice(0, 300),
      verdict: null,
      yes: null,
      rationale: '',
      model,
      latencyMs: Date.now() - started,
    };
  }
}

async function gradeSmokeReplyJev({
  questionKey,
  instructions,
  criteria,
  replyText,
  customerTurn = '',
  passWhenYes,
  env,
  fetchImpl,
  judgeFn = jevSmokeReplyYesNo,
}) {
  const jev = await judgeFn({
    questionKey,
    instructions,
    criteria,
    replyText,
    customerTurn,
    env,
    fetchImpl,
  });
  if (!jev.ok || jev.yes == null) {
    return { pass: false, jev };
  }
  const pass = passWhenYes ? jev.yes === true : jev.yes === false;
  return { pass, jev };
}

const JEV_D2_UNSCHED = {
  questionKey: 'saved_not_on_day',
  instructions: 'Does the reply say the place is saved but not yet on a specific day?',
  criteria: {
    true: 'The reply states the place is saved, on the list, or noted, and that it is not on a day, not scheduled, or not assigned to a specific day yet.',
    false: 'The reply does not convey both saved and not-yet-on-a-day meaning.',
  },
  passWhenYes: true,
};

const JEV_ASK_D2 = {
  questionKey: 'asks_customer_input',
  instructions: 'Does the reply ask for something the customer must answer?',
  criteria: {
    true: 'The reply requests lodging, a day, a time, a location choice, confirmation, or any other input only the customer can provide.',
    false: 'The reply only states facts or next steps and does not solicit customer input.',
  },
  passWhenYes: false,
};

const JEV_ASK_LODGING_REPLY = {
  questionKey: 'asks_where_staying',
  instructions: 'Does the reply ask the customer where they are staying?',
  criteria: {
    true: 'The reply asks about lodging, hotel, resort, accommodation, or where they will stay.',
    false: 'The reply does not ask where they are staying.',
  },
  passWhenYes: true,
};

export function jevBlockFromResult(jev = {}) {
  return {
    verdict: jev.verdict ?? null,
    rationale: String(jev.rationale || '').slice(0, 2000),
    model: jev.model || JEV_QUALITY_MODEL,
    ...(jev.error ? { error: String(jev.error).slice(0, 300) } : {}),
  };
}

export async function gradeD2UnschedReply(replyText, opts = {}) {
  const {
    customerTurn = 'save Paia Fish Market',
    judgeFn,
    env,
    fetchImpl,
  } = opts;
  const graded = await gradeSmokeReplyJev({
    ...JEV_D2_UNSCHED,
    replyText,
    customerTurn,
    judgeFn,
    env,
    fetchImpl,
  });
  return { pass: graded.pass, jev: jevBlockFromResult(graded.jev) };
}

export async function gradeAskD2Reply(replyText, opts = {}) {
  const {
    customerTurn = 'save Paia Fish Market',
    judgeFn,
    env,
    fetchImpl,
  } = opts;
  const graded = await gradeSmokeReplyJev({
    ...JEV_ASK_D2,
    replyText,
    customerTurn,
    judgeFn,
    env,
    fetchImpl,
  });
  return { pass: graded.pass, jev: jevBlockFromResult(graded.jev) };
}

export async function gradeAskLodgingReplyQuestion(replyText, opts = {}) {
  const {
    customerTurn = '',
    judgeFn,
    env,
    fetchImpl,
  } = opts;
  return gradeSmokeReplyJev({
    ...JEV_ASK_LODGING_REPLY,
    replyText,
    customerTurn,
    judgeFn,
    env,
    fetchImpl,
  });
}
