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

const JEV_COFFEE_PLACE_ROW = {
  questionKey: 'real_coffee_place',
  instructions: 'Is this a real coffee shop or cafe where customers can buy coffee?',
  criteria: {
    true: 'The place is a cafe, coffee shop, espresso bar, roaster, or similar venue associated with serving coffee.',
    false: 'The place is not a coffee venue (for example a generic restaurant, grocery, hotel, or unrelated business).',
  },
  passWhenYes: true,
};

const JEV_INV_CLAIM_FIRST = {
  questionKey: 'inv_claim_first_reply',
  instructions: 'Does the first trip-intake reply avoid promising an invite and ask exactly one needed question?',
  criteria: {
    true: 'The reply does not say an invite was already sent, does not promise to send or add a collaborator, and asks exactly one question the customer must answer (for example dates, lodging, or who to invite).',
    false: 'The reply claims an invite was sent, promises to invite or add someone, asks zero questions, or asks more than one distinct question.',
  },
  passWhenYes: true,
};

const JEV_INV_CLAIM_AFTER_LODGING = {
  questionKey: 'inv_claim_after_lodging',
  instructions: 'After the customer answered where they are staying, does the reply ask for the wife companion name and/or email to invite?',
  criteria: {
    true: 'The reply asks for the wife or companion name, email address, or contact details so she can be invited to the trip.',
    false: 'The reply does not ask for the companion name or email, or only repeats lodging questions without asking for invite contact info.',
  },
  passWhenYes: true,
};

export async function gradeCoffeePlaceRowByJev(row = {}, opts = {}) {
  const name = String(row.name || row.title || row.placeName || row.displayName || '').trim();
  const hint = [name, row.description, row.address].filter(Boolean).join(' — ').slice(0, 800);
  const graded = await gradeSmokeReplyJev({
    ...JEV_COFFEE_PLACE_ROW,
    replyText: hint || name,
    customerTurn: opts.customerTurn || 'coffee shops near Kihei',
    judgeFn: opts.judgeFn,
    env: opts.env,
    fetchImpl: opts.fetchImpl,
  });
  if (!name) {
    return { pass: false, jev: jevBlockFromResult(graded.jev, { questionKey: JEV_COFFEE_PLACE_ROW.questionKey }), harnessMissing: true };
  }
  if (!graded.jev?.ok || graded.jev?.yes == null) {
    return { pass: false, jev: jevBlockFromResult(graded.jev, { questionKey: JEV_COFFEE_PLACE_ROW.questionKey, customerTurn: opts.customerTurn, replyExcerpt: name }), harnessMissing: false };
  }
  return {
    pass: graded.pass,
    jev: jevBlockFromResult(graded.jev, { questionKey: JEV_COFFEE_PLACE_ROW.questionKey, customerTurn: opts.customerTurn, replyExcerpt: name }),
    harnessMissing: false,
  };
}

export function jevBlockFromResult(jev = {}, meta = {}) {
  const customerTurn = meta.customerTurn != null ? String(meta.customerTurn) : '';
  const replyExcerpt = meta.replyExcerpt != null ? String(meta.replyExcerpt) : '';
  return {
    verdict: jev.verdict ?? null,
    rationale: String(jev.rationale || '').slice(0, 2000),
    model: jev.model || JEV_QUALITY_MODEL,
    ...(meta.questionKey ? { questionKey: String(meta.questionKey) } : {}),
    ...(customerTurn ? { customerTurn: customerTurn.slice(0, 500) } : {}),
    ...(replyExcerpt ? { replyExcerpt: replyExcerpt.slice(0, 800) } : {}),
    ...(jev.score != null ? { noul: jev.score } : {}),
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
  return {
    pass: graded.pass,
    jev: jevBlockFromResult(graded.jev, {
      questionKey: JEV_D2_UNSCHED.questionKey,
      customerTurn,
      replyExcerpt: replyText,
    }),
  };
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
  return {
    pass: graded.pass,
    jev: jevBlockFromResult(graded.jev, {
      questionKey: JEV_ASK_D2.questionKey,
      customerTurn,
      replyExcerpt: replyText,
    }),
  };
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

export async function gradeInvClaimFirstReply(replyText, opts = {}) {
  const {
    customerTurn = 'Maui March 10-17 2027 with my wife',
    judgeFn,
    env,
    fetchImpl,
  } = opts;
  const graded = await gradeSmokeReplyJev({
    ...JEV_INV_CLAIM_FIRST,
    replyText,
    customerTurn,
    judgeFn,
    env,
    fetchImpl,
  });
  const jevError = !graded.jev?.ok || graded.jev?.yes == null;
  return {
    pass: jevError ? false : graded.pass,
    jev: jevBlockFromResult(graded.jev, {
      questionKey: JEV_INV_CLAIM_FIRST.questionKey,
      customerTurn,
      replyExcerpt: replyText,
    }),
    jevError,
  };
}

export async function gradeInvClaimAfterLodgingReply(replyText, opts = {}) {
  const {
    customerTurn = "We're staying at the Hyatt Regency Maui in Kaanapali.",
    judgeFn,
    env,
    fetchImpl,
  } = opts;
  const graded = await gradeSmokeReplyJev({
    ...JEV_INV_CLAIM_AFTER_LODGING,
    replyText,
    customerTurn,
    judgeFn,
    env,
    fetchImpl,
  });
  const jevError = !graded.jev?.ok || graded.jev?.yes == null;
  return {
    pass: jevError ? false : graded.pass,
    jev: jevBlockFromResult(graded.jev, {
      questionKey: JEV_INV_CLAIM_AFTER_LODGING.questionKey,
      customerTurn,
      replyExcerpt: replyText,
    }),
    jevError,
  };
}
