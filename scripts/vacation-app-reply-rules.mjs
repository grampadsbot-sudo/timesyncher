import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { payerPriceLine } from '../src/vacation/seat-price.mjs';

export const REPLY_RULES_SLUG = 'bot-admin/skills/time-syncher/vacation-app-reply-rules';
export const DIALOG_TEST_FINGERPRINT = 'TS-DIALOG-FINGERPRINT-20260924-bar2';
export const SHARED_REPLY_PIPELINE = 'jev_precall_then_tiered_model';

const OPENROUTER_HOST = /openrouter\.ai/i;
const JEV_DECISIONS_PATH = /\/api\/alpha\/decisions\/?$/i;
const OPENROUTER_CHAT_PATH = /\/api\/v1\/chat\/completions\/?$/i;
export const DEFAULT_JEV_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const JEV_QUALITY_MODEL = 'typesafe/jev-1.13';
const JEV_DECISIONS_MODEL = JEV_QUALITY_MODEL;

// Bake-off map only. dialog-runners/tier_models.json must match these four ids.
// A drifted file, a tier outside 1-4, or any gpt-*mini model refuses the reply.
const BAKEOFF_TIER_MODELS = {
  1: 'google/gemini-2.5-flash-lite',
  2: 'qwen/qwen3-235b-a22b-2507',
  3: 'deepseek/deepseek-v3.2',
  4: 'qwen/qwen3-max',
};
const BAKEOFF_MODEL_IDS = new Set(Object.values(BAKEOFF_TIER_MODELS));
const BANNED_GPT_MINI = /gpt-.*mini/i;
const TIER_MODELS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dialog-runners/tier_models.json');

function bakeoffMapFromFile(parsed) {
  const models = parsed?.models && typeof parsed.models === 'object' ? parsed.models : parsed;
  const out = {};
  for (const tier of [1, 2, 3, 4]) {
    out[tier] = text(models?.[tier] ?? models?.[String(tier)], 120);
  }
  return out;
}

export function assertBakeoffMap(map) {
  for (const tier of [1, 2, 3, 4]) {
    const model = text(map?.[tier] ?? map?.[String(tier)], 120);
    if (model !== BAKEOFF_TIER_MODELS[tier]) {
      throw new Error(`refused: tier_models.json drifted at tier ${tier}`);
    }
    if (BANNED_GPT_MINI.test(model)) throw new Error(`refused: tier ${tier} is a banned gpt mini model`);
  }
  return true;
}

function loadBakeoffMap() {
  const parsed = JSON.parse(fs.readFileSync(TIER_MODELS_FILE, 'utf8'));
  if (parsed?.no_gpt5mini !== true) throw new Error('refused: tier_models.json drifted (no_gpt5mini)');
  const map = bakeoffMapFromFile(parsed);
  assertBakeoffMap(map);
  return map;
}

const OPENROUTER_TIER_CHAT_MODELS = loadBakeoffMap();

export function isBakeoffModelId(modelId) {
  const model = text(modelId, 120);
  if (!model || BANNED_GPT_MINI.test(model)) return false;
  return BAKEOFF_MODEL_IDS.has(model);
}

export function bakeoffTierModels() {
  return { ...OPENROUTER_TIER_CHAT_MODELS };
}

// Decisions score is the 0-based weighted index of this list, so index 0 is tier 1.
const JEV_MODEL_TIER_CRITERIA = [
  '1 cheapest model that can still answer this vacation-app turn adequately',
  '2 light inexpensive reasoning',
  '3 balanced quality for a normal itinerary, richer banter, or a multi-day plan',
  '4 stronger writing or judgment, including the one collab assessment when the customer asks about price or joining',
];

function text(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function isOpenRouterReplyUrl(value) {
  const url = text(value, 500);
  if (!url || !OPENROUTER_HOST.test(url)) return false;
  return !JEV_DECISIONS_PATH.test(url);
}

function isExplicitTieredOpenRouterChatUrl(value) {
  const url = text(value, 500);
  return Boolean(url) && OPENROUTER_HOST.test(url) && OPENROUTER_CHAT_PATH.test(url);
}

export function assertSharedReplyTargetAllowed(value, label = 'reply target', options = {}) {
  if (!isOpenRouterReplyUrl(value)) return;
  if (options.allowTieredOpenRouterChat && isExplicitTieredOpenRouterChatUrl(value)) return;
  const error = new Error(`refused: shared reply path will not call OpenRouter for customer replies (${label})`);
  error.code = 'OPENROUTER_REPLY_REFUSED';
  throw error;
}

function appOpenRouterKey(env) {
  return text(
    env.TIMESYNCHER_JEV_CLASSIFY_TOKEN
      || env.JEV_OPENROUTER_API_KEY
      || env.TIMESYNCHER_JEV_OPENROUTER_API_KEY
      || env.TIMESYNCHER_OPENROUTER_API_KEY
      || env.OPENROUTER_API_KEY,
    500,
  );
}

export function openRouterAppKey(env = process.env) {
  return appOpenRouterKey(env);
}

function openRouterChatModelForTier(tier) {
  return OPENROUTER_TIER_CHAT_MODELS[tier] || '';
}

function parseMachineContract(source) {
  const match = String(source || '').match(/```yaml\s*\n([\s\S]*?)```/i);
  const out = {};
  if (!match) return out;
  for (const line of match[1].split('\n')) {
    const found = line.match(/^([A-Za-z0-9_]+):\s*(.*?)\s*$/);
    if (found) out[found[1]] = found[2];
  }
  return out;
}

function pageFromPayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') {
    return { compiled_truth: payload, frontmatter: parseMachineContract(payload), slug: REPLY_RULES_SLUG };
  }
  const page = payload.page && typeof payload.page === 'object' ? payload.page : payload;
  if (!page || typeof page !== 'object') return null;
  const frontmatter = page.frontmatter && typeof page.frontmatter === 'object' ? page.frontmatter : {};
  const compiled = page.compiled_truth || page.content || page.body || '';
  return {
    slug: page.slug || REPLY_RULES_SLUG,
    frontmatter,
    compiled_truth: String(compiled || ''),
    content_hash: page.content_hash || null,
  };
}

function contractFromPage(page, via) {
  const machine = parseMachineContract(page.compiled_truth);
  const frontmatter = page.frontmatter || {};
  const phrase = text(frontmatter.smoke_bar_phrase || machine.smoke_bar_phrase, 200);
  const id = text(frontmatter.smoke_bar_id || machine.smoke_bar_id, 120);
  if (!phrase) {
    return { ok: false, via, slug: page.slug || REPLY_RULES_SLUG, error: 'reply rules page is missing smoke_bar_phrase' };
  }
  return {
    ok: true,
    via,
    slug: page.slug || REPLY_RULES_SLUG,
    pipeline: text(frontmatter.pipeline || machine.pipeline || SHARED_REPLY_PIPELINE, 80),
    smoke_bar_id: id,
    smoke_bar_phrase: phrase,
    access_pricing_language: text(frontmatter.access_pricing_language || machine.access_pricing_language, 200),
    notes_where: text(frontmatter.notes_where || machine.notes_where, 80),
    content_hash: page.content_hash || null,
  };
}

async function loadViaHttp(env) {
  const explicit = text(env.TIMESYNCHER_GBRAIN_GET_PAGE_URL, 500);
  const base = text(env.TIMESYNCHER_GBRAIN_HTTP_BASE || env.GBRAIN_HTTP_BASE, 500).replace(/\/+$/, '');
  const targets = [];
  if (explicit) targets.push(explicit);
  if (base) {
    targets.push(`${base}/page?slug=${encodeURIComponent(REPLY_RULES_SLUG)}`);
    targets.push(`${base}/get_page?slug=${encodeURIComponent(REPLY_RULES_SLUG)}`);
  }
  for (const url of targets) {
    assertSharedReplyTargetAllowed(url, 'rules get_page');
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) continue;
      const body = await response.json();
      const page = pageFromPayload(body);
      if (page) return contractFromPage(page, 'http-get_page');
    } catch (error) {
      if (error?.code === 'OPENROUTER_REPLY_REFUSED') throw error;
    }
  }
  return null;
}

function loadViaCli() {
  const attempts = [
    ['get-page', '--slug', REPLY_RULES_SLUG],
    ['page', 'get', REPLY_RULES_SLUG],
    ['get', REPLY_RULES_SLUG],
  ];
  for (const args of attempts) {
    const result = spawnSync('gbrain', args, { encoding: 'utf8', timeout: 2500 });
    if (result.error || result.status !== 0 || !text(result.stdout, 20)) continue;
    try {
      const page = pageFromPayload(JSON.parse(result.stdout));
      if (page) return contractFromPage(page, 'gbrain-cli-get_page');
    } catch {
      const page = pageFromPayload(result.stdout);
      if (page?.compiled_truth) return contractFromPage(page, 'gbrain-cli-get_page');
    }
  }
  return null;
}

function pageFromMarkdown(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const frontmatter = {};
  let body = String(markdown || '');
  if (match) {
    body = match[2];
    for (const line of match[1].split('\n')) {
      const found = line.match(/^([A-Za-z0-9_]+):\s*(.*?)\s*$/);
      if (!found) continue;
      frontmatter[found[1]] = found[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { slug: REPLY_RULES_SLUG, frontmatter, compiled_truth: body };
}

function loadViaBrainFile(env) {
  const roots = [env.TIMESYNCHER_PRODUCT_GBRAIN_ROOT, env.TIMESYNCHER_PRIVATE_GBRAIN, '/home/ubishere9995/gbrain'].filter(Boolean);
  for (const root of roots) {
    const file = path.join(root, `${REPLY_RULES_SLUG}.md`);
    if (!fs.existsSync(file)) continue;
    try {
      return contractFromPage(pageFromMarkdown(fs.readFileSync(file, 'utf8')), 'gbrain-file-get_page');
    } catch (error) {
      return { ok: false, via: 'gbrain-file-get_page', slug: REPLY_RULES_SLUG, error: text(error?.message || error, 300) };
    }
  }
  return null;
}

function loadViaEnvCache(env) {
  const file = text(env.TIMESYNCHER_REPLY_RULES_PAGE_JSON, 500);
  if (!file) return null;
  try {
    const page = pageFromPayload(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!page) return { ok: false, via: 'env-cached-get_page', slug: REPLY_RULES_SLUG, error: 'cached get_page payload was empty' };
    return contractFromPage(page, 'env-cached-get_page');
  } catch (error) {
    return { ok: false, via: 'env-cached-get_page', slug: REPLY_RULES_SLUG, error: text(error?.message || error, 300) };
  }
}

function loadViaBundledSnapshot() {
  try {
    const file = new URL('./vacation-app-reply-rules-snapshot.json', import.meta.url);
    const page = pageFromPayload(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!page?.compiled_truth) return null;
    return contractFromPage(page, 'bundled-get_page');
  } catch {
    return null;
  }
}

export async function loadVacationAppReplyRules(env = process.env) {
  const http = await loadViaHttp(env);
  if (http?.ok) return http;
  const cli = loadViaCli();
  if (cli?.ok) return cli;
  const brainFile = loadViaBrainFile(env);
  if (brainFile?.ok) return brainFile;
  const cached = loadViaEnvCache(env);
  if (cached) return cached;
  const bundled = loadViaBundledSnapshot();
  if (bundled?.ok) return bundled;
  return {
    ok: false,
    via: 'unloaded',
    slug: REPLY_RULES_SLUG,
    pipeline: SHARED_REPLY_PIPELINE,
    error: `get_page failed for ${REPLY_RULES_SLUG}. Set TIMESYNCHER_GBRAIN_HTTP_BASE or TIMESYNCHER_REPLY_RULES_PAGE_JSON to the get_page document. Do not invent smoke_bar_phrase.`,
  };
}

export function stampSharedReply(reply, rules) {
  const phrase = text(rules?.smoke_bar_phrase, 200);
  const id = text(rules?.smoke_bar_id, 120);
  if (!phrase) throw new Error('cannot stamp a shared reply without smoke_bar_phrase from the rules page');
  let body = text(reply, 8000);
  if (body.startsWith(DIALOG_TEST_FINGERPRINT)) {
    body = body.slice(DIALOG_TEST_FINGERPRINT.length).trim();
  }
  const footerLines = [id, phrase].filter(Boolean);
  for (const line of footerLines) {
    const pattern = new RegExp(`(?:^|\\n)${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\n|$)`, 'g');
    body = body.replace(pattern, '').trim();
  }
  const footer = footerLines.join('\n');
  const max = 3900;
  const overhead = DIALOG_TEST_FINGERPRINT.length + footer.length + 4;
  const trimmed = body.slice(0, Math.max(0, max - overhead));
  const stamped = [DIALOG_TEST_FINGERPRINT, trimmed, footer].filter(Boolean).join('\n');
  if (!stamped.includes(phrase) || !stamped.includes(DIALOG_TEST_FINGERPRINT)) {
    throw new Error('shared reply stamp dropped the rules phrase or fingerprint');
  }
  return stamped;
}

export function isAccessPricingTurn(value) {
  const source = text(value, 2000).toLowerCase();
  if (!source.includes('?') && !/\b(how much|cost|price|pricing)\b/.test(source)) return false;
  const asksPrice = /\b(how much|cost|costs|price|pricing|charge|fee|pay|purchase|buy)\b/.test(source);
  const accessTarget = /\b(access|full access|collaborator|collaborate|edit|editing|change|modify|telegram|photo|photos|pic|pics|video|videos|media|upload|wife|spouse|family|assistant|kim)\b/.test(source);
  return asksPrice && accessTarget;
}

function tierModel(tier) {
  const map = {
    1: 'grok-tier-1',
    2: 'grok-tier-2',
    3: 'grok-tier-3',
    4: 'grok-tier-4',
    5: 'grok-tier-5',
  };
  return map[tier] || '';
}

function normalizeJev(body, via) {
  const source = body?.decision && typeof body.decision === 'object' ? body.decision : body;
  const tierValue = Number(source?.model_tier ?? source?.modelTier ?? source?.price_tier ?? source?.recommended_model_tier ?? source?.tier);
  const modelTier = Number.isInteger(tierValue) && tierValue >= 1 && tierValue <= 5 ? tierValue : null;
  const responseModel = text(source?.response_model || source?.responseModel || source?.recommended_model || source?.model, 120) || tierModel(modelTier);
  if (!modelTier && !responseModel) {
    return { jevRan: false, via, error: 'jev response missing model tier', modelTier: null, responseModel: null, extraContext: null };
  }
  return {
    jevRan: true,
    via,
    modelTier,
    responseModel: responseModel || tierModel(modelTier) || openRouterChatModelForTier(modelTier),
    routeType: text(source?.route_type || source?.routeType, 80) || null,
    extraContext: source?.extra_context || source?.extraContext || source?.context || null,
  };
}

function probabilityValue(answer) {
  const value = Number(answer?.noul ?? answer?.probability ?? answer?.score);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function shortSession(session) {
  if (!session || typeof session !== 'object') return {};
  const out = {};
  for (const key of ['seed_id', 'seedId', 'vacationName', 'stage', 'gate', 'screen']) {
    if (session[key]) out[key] = text(session[key], 120);
  }
  return out;
}

function vacationAppContext({ customerTurn, stage, gate, screen, session }) {
  return {
    channel: 'vacation-app',
    stage: text(stage, 80) || 'vacation-app',
    gate: text(gate, 80) || null,
    screen: text(screen, 80) || 'vacation-app',
    current_turn: text(customerTurn, 6000),
    session: shortSession(session),
    pipeline: SHARED_REPLY_PIPELINE,
    rules_slug: REPLY_RULES_SLUG,
  };
}

function decisionsPayload(context) {
  return {
    model: JEV_DECISIONS_MODEL,
    state: context,
    questions: {
      model_tier: {
        type: 'score',
        instructions: 'Pick the model tier this vacation-app turn needs. Criterion 1 is cheapest and criterion 4 is strongest. Use 1 or 2 for a simple acknowledgment. Use 3 or 4 when the reply needs richer banter, a multi-day plan, or a judgment call. Do not pin every turn to tier 1. A family mention is not by itself a collaborator welcome. There is no tier 5.',
        criteria: JEV_MODEL_TIER_CRITERIA,
      },
      route_type: {
        type: 'choice',
        instructions: 'Which vacation-app reply route should the generator follow?',
        criteria: {
          itinerary_advice: 'Day-by-day plan, weather backup, activities, or where to go.',
          notes_where: 'Customer wants to save a note. Day is required and place is optional. Never say Thing.',
          access_pricing: 'The customer asked about price, access, or joining as collaborators. Not a day plan that only names family.',
          collab_upsell: 'The one collab assessment, only when the customer asked to join and it has not been given. Do not use this for day advice.',
          product_boundary: 'Reservations, payments, split-payer, or other language the reply rules ban.',
          general: 'Other vacation-app help that still follows the shared reply rules.',
        },
      },
      needs_day_for_note: {
        type: 'noul',
        instructions: 'Does a good reply need to name which day a note belongs to?',
        criteria: {
          true: 'The customer is saving a note, asking where it goes, or the answer depends on a day.',
          false: 'The turn does not need a day to place a note.',
        },
      },
    },
  };
}

function normalizeDecisions(body) {
  const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};
  const tierAnswer = answers.model_tier || answers.modelTier || {};
  const score = Number(tierAnswer.score);
  let modelTier = null;
  if (Number.isFinite(score)) {
    modelTier = Math.round(score) + 1;
  } else {
    const direct = Number(tierAnswer.choice ?? tierAnswer.value ?? body?.model_tier ?? body?.modelTier);
    if (Number.isInteger(direct)) modelTier = direct;
  }
  const routeType = text(answers.route_type?.choice || answers.routeType?.choice, 80) || null;
  const extraContext = {
    routeType,
    needsDayForNote: probabilityValue(answers.needs_day_for_note),
    modelTierScore: Number.isFinite(score) ? score : null,
    modelTierConfidence: Number.isFinite(Number(tierAnswer.confidence)) ? Number(tierAnswer.confidence) : null,
  };
  if (!Number.isInteger(modelTier) || modelTier < 1 || modelTier > 4 || !openRouterChatModelForTier(modelTier)) {
    return {
      jevRan: false,
      via: 'openrouter-decisions',
      modelTier: null,
      responseModel: null,
      extraContext,
      error: 'tier_outside_bakeoff_map',
    };
  }
  if (!modelTier) {
    return {
      jevRan: false,
      via: 'openrouter-decisions',
      modelTier: null,
      responseModel: null,
      extraContext,
      error: 'jev decisions response missing model_tier score',
    };
  }
  return {
    jevRan: true,
    via: 'openrouter-decisions',
    modelTier,
    responseModel: openRouterChatModelForTier(modelTier),
    routeType,
    extraContext,
  };
}

export async function jevPrecall({ customerTurn, stage, gate, screen, session, env = process.env } = {}) {
  const context = vacationAppContext({ customerTurn, stage, gate, screen, session });
  const gbrainPayload = {
    current_turn: context.current_turn,
    context,
  };
  const url = text(env.TIMESYNCHER_JEV_CLASSIFY_URL, 500) || DEFAULT_JEV_DECISIONS_URL;
  const decisions = JEV_DECISIONS_PATH.test(url);
  const payload = decisions ? decisionsPayload(context) : gbrainPayload;
  if (isOpenRouterReplyUrl(url)) {
    return {
      jevRan: false,
      via: 'refused-openrouter-reply',
      modelTier: null,
      responseModel: null,
      extraContext: null,
      error: 'refused: Jev pre-call URL points at an OpenRouter reply endpoint. Only /api/alpha/decisions is allowed for Jev.',
      request: payload,
    };
  }
  const key = appOpenRouterKey(env);
  if (decisions && !key) {
    return {
      jevRan: false,
      via: 'openrouter-decisions',
      modelTier: null,
      responseModel: null,
      extraContext: null,
      error: 'Jev pre-call needs an app/server OpenRouter key. Set OPENROUTER_API_KEY or TIMESYNCHER_OPENROUTER_API_KEY. Also accepted: TIMESYNCHER_JEV_CLASSIFY_TOKEN, JEV_OPENROUTER_API_KEY, TIMESYNCHER_JEV_OPENROUTER_API_KEY. Do not copy Dialog bot secrets. gbrain jev_classify_turn is not required.',
      request: payload,
    };
  }
  try {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(decisions && key ? { authorization: `Bearer ${key}` } : {}),
      ...(decisions ? { 'HTTP-Referer': 'https://timesyncher.com', 'X-Title': 'TimeSyncher Vacation App Jev' } : {}),
    };
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    const via = decisions ? 'openrouter-decisions' : 'http-jev';
    if (!response.ok || body.ok === false) {
      return {
        jevRan: false,
        via,
        modelTier: null,
        responseModel: null,
        extraContext: null,
        error: text(body.error?.message || body.error || `Jev HTTP ${response.status}`, 300),
        request: payload,
      };
    }
    return { ...(decisions ? normalizeDecisions(body) : normalizeJev(body, via)), request: payload };
  } catch (error) {
    return {
      jevRan: false,
      via: decisions ? 'openrouter-decisions' : 'http-jev',
      modelTier: null,
      responseModel: null,
      extraContext: null,
      error: text(error?.message || error, 300),
      request: payload,
    };
  }
}

function grokReplyUrl(env) {
  const explicit = text(env.TIMESYNCHER_TIERED_MODEL_URL, 500);
  if (explicit) return explicit;
  const host = text(env.TIMESYNCHER_GROK_ROUTER_HOST, 200);
  if (!host || !text(env.TIMESYNCHER_GROK_ROUTER_TOKEN, 20)) return '';
  const port = text(env.TIMESYNCHER_GROK_ROUTER_PORT || '39217', 20);
  const routePath = text(env.TIMESYNCHER_GROK_SHARED_REPLY_PATH || env.TIMESYNCHER_GROK_RENDER_PATH || '/render', 80) || '/render';
  return /^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') + routePath : `http://${host}:${port}${routePath}`;
}

function replyRequestBody({ rules, jev, customerTurn, stage, screen, modelTier, responseModel, destination, memory, upsell, tripContext = null, planTable = null }) {
  return {
    destination_lock: text(destination, 160) || null,
    single_upsell: upsell === 'allow-once' ? 'allow-once' : 'forbidden',
    trip_context: tripContext && typeof tripContext === 'object' ? tripContext : null,
    plan_table: planTable && typeof planTable === 'object' ? planTable : null,
    recent_turns: Array.isArray(memory) ? memory.slice(-12) : [],
    pipeline: rules?.pipeline || SHARED_REPLY_PIPELINE,
    rules_slug: rules?.slug || REPLY_RULES_SLUG,
    rules: {
      smoke_bar_id: rules?.smoke_bar_id || null,
      access_pricing_language: rules?.access_pricing_language || null,
      notes_where: rules?.notes_where || null,
    },
    jev: {
      modelTier,
      responseModel,
      routeType: jev?.routeType || jev?.extraContext?.routeType || null,
      extraContext: jev?.extraContext || null,
    },
    customer_turn: text(customerTurn, 12000),
    stage: text(stage, 80),
    screen: text(screen, 80),
  };
}

function chatReplyText(content) {
  if (typeof content === 'string') return text(content, 3500);
  if (!Array.isArray(content)) return '';
  return text(content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join(''), 3500);
}

export function replyRulesSystem(rules, destination, upsell, postIntake, customerTurn = '', context = {}) {
  const lock = text(destination, 160);
  const phrase = rules?.access_pricing_language || 'unlimited vacations for the whole year';
  const priceAsk = /\b(price|pricing|how much|what(?:'s| is) (?:the )?(?:price|cost))\b/i.test(String(customerTurn || ''));
  const planLine = String(context.planLine || '').trim();
  const configuredSeat = Number(context.seatDollars);
  const seatDollars = Number.isFinite(configuredSeat) && configuredSeat > 0 ? configuredSeat : null;
  const tripRaw = context.tripContext && typeof context.tripContext === 'object' ? context.tripContext : null;
  const itinerary = Array.isArray(tripRaw?.itinerary) ? tripRaw.itinerary.filter(Boolean).slice(0, 12) : [];
  const dates = String(tripRaw?.dates || '').trim();
  const roster = String(tripRaw?.roster || '').trim();
  const rule = String(tripRaw?.rule || '').trim();
  const trip = itinerary.length || dates || roster || rule ? { itinerary, dates, roster, rule } : null;
  const seatName = String(context.seat?.name || context.seat?.displayName || '').trim();
  const seat = seatName ? { name: seatName, payer: String(context.seat?.payer || '').trim() } : null;
  const upsellLine = postIntake
      ? `Post-intake: this is the long trip dump. Say you are building the itinerary from that dump, once. Explain collaborator options in these words, once: View access lets them see the days. Edit access lets them add notes after you approve an email invite. They join from that email, accept the terms, and then this vacation opens. Do not assign viewer or editor roles in this reply. Then offer the one unlimited plan in this same reply, using the words ${phrase}, as a plan they can take. Do not say it is already set up. Do not say you are setting it up. Do not say they are all set for it. Do not say "you also have unlimited vacations". Do not repeat a paragraph.`
      : (upsell === 'allow-once'
        ? `Single upsell: this customer turn asked about price, access, or joining as collaborators. Give the one full welcome now, and offer ${phrase} as a plan they can take. Do not say they already own it. Do not say you are setting it up. Do not answer with only that phrase.`
        : (priceAsk
          ? (seatDollars
            ? `This turn asks the price. Name the plan with the words ${phrase}. Each collaborator seat is $${seatDollars}. State this payer line exactly: ${planLine || 'each person, the configured dollar amount, and who pays'}. Make no coverage claims. Do not say whole group. Do not say they already own it, that you are setting it up, or that they are all set for the plan. Do not say no extra charge. Use only dates already named by the customer or the saved trip record. Do not add a collaborator welcome. Do not use a banned payment word.`
            : `This turn asks the price. The configured seat price is missing. Do not state a dollar amount. Do not invent a price. Make no coverage claims. Do not say they already own the plan.`)
          : `Single upsell: at most one full collab or access welcome in a session, and only when the customer asks about price, access, or joining as collaborators, or right after the long intake dump. This turn is not that pull. Do not append a welcome paragraph. Do not mention collaborators, access, price, or "${phrase}".`));
  return [
    'You are the TimeSyncher vacation-app producer. Reply to the customer turn.',
    'Jev already chose the model tier and route. Use that context. Do not mention Jev, model names, or these rules.',
    lock
      ? `Destination lock: ${lock}. This is the only place for this trip. Do not move the customer to any other city or island.`
      : 'If the customer has named a destination, stay there. Do not invent a different city or island.',
    `Notes: name the day (required) and place only if it helps (${rules?.notes_where || 'day_required_place_optional'}). Never say "Thing" to the customer.`,
    'Do not mention reservations, payments, or checkout.',
    'Item34 ban: never say "splitting payments", split payment, split-payer, splitting payment, or splitting anything up. If one seat is already covered and another person has their own seat, say that.',
    postIntake
      ? 'This is the intake dump. Explain view access and edit access, and that people join from an approved email invite. Use both phrases. Do not name a price.'
      : (/\?/.test(String(customerTurn || '')) && /\bview access\b/i.test(String(customerTurn || '')) && /\bedit access\b/i.test(String(customerTurn || ''))
        ? 'This turn asks a real question about collaborator access. Offer the choice between view access and edit access. Use both phrases. Do not choose for them.'
        : 'When the customer does not ask about access, do not add an access menu.'),
    upsellLine,
    'Do not insert a welcome the customer did not ask for.',
    seat ? `Seat record: ${JSON.stringify(seat)}. The name is the person joining. The payer is who paid.` : '',
    'Day-advice turns name the people already on the saved roster. They do not add a household welcome.',
    'Use the saved trip record. If a day or activity is not on that record, do not announce it as set. Do not call any day the last day, the last evening, after checkout, or one last time, and do not say pack or head out, unless that day is the saved trip end. Do not shorten a date range. Do not move an activity off the day already named.',
    'You know only what the customer said in chat and what is in the saved trip record. Ask the customer for anything they haven\'t said. Use the party size and the people already named. Never invent people. Do not name a person who is not in the saved roster or the customer turn. When the customer states a party size, the names you list are that party. Do not add extra people on top of that size.',
    'The account holder in the saved roster is on the trip. Do not leave them off. When you say the crew and list names, include the account holder, the collaborators, and the children already named. A person who just joined is a collaborator, not the account holder. Do not say just the crew or the whole crew unless the account holder is in that list.',
    'When the customer asks for a later activity and does not name a day, use only a day that is already on the saved trip record. Do not invent a day. Do not dodge the question with "it sounds like", "wonderful trip", "I can help you", or "coming together".',
    'Address the person who is speaking. Do not give that person an activity the saved trip record assigns to someone else.',
    'Do not say we have corrected that, or I have corrected that, unless the customer asked for a correction.',
    'Do not put an activity on a day that is not already that activity on the saved trip record.',
    'When the customer asks to add a place, name the matches and ask "add these?" The chat box is the search. There is no separate search screen.',
    'On the long trip dump, use the words "building the itinerary".',
    'Viewers and editors are not on the trip. Do not put them in the house, the crew, or the group for a day. A saved preference rule stays as saved. Do not call it locked in and do not rename it.',
    'When the customer asks for two options on a day, offer only activities already saved on that day or named in the question. Do not repeat a paragraph.',
    'Do not invent an activity the customer did not name.',
    'Write plain sentences. Do not use markdown asterisks.',
    'Do not say the customer already has unlimited vacations. Do not say you are setting that plan up. Do not say you also have unlimited vacations. Do not say a plan covers people the customer did not name as covered.',
    'The customer URL owns vacations. Do not push vacation URLs onto collaborator seats.',
    trip ? `Saved trip record: ${JSON.stringify(trip)}` : '',
    'Write at least four sentences of real banter, about sixty words. Notice who is coming, the days, and what they care about, then do the useful thing. Do not answer in one clipped sentence.',
    'End with one final line that starts with BEAT: and a three-to-six word label of only what this reply actually did. Do not say the reply set, saved, added, or offered something it did not do. Do not put BEAT anywhere else.',
  ].filter(Boolean).join('\n');
}

function splitBeat(answer) {
  const lines = String(answer || '').split('\n');
  const beats = [];
  const kept = [];
  for (const line of lines) {
    const match = line.trim().match(/^BEAT:\s*(.+)$/i);
    if (match) beats.push(text(match[1], 80));
    else kept.push(line);
  }
  const visible = kept.join('\n').replace(/(?:^|\s)BEAT:\s*[^\n]*/gi, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: visible, beats: beats.filter(Boolean) };
}

export const JEV_QUALITY_COMMENTS = {
  clear_day: 'Clear day shape that stays with the customer words.',
  thin_reply: 'Too thin. Say more about the people and the day.',
  invented_place: 'Do not invent a place the customer did not name.',
  off_brief: 'The reply misses what the customer asked.',
  strong_welcome: 'The itinerary acknowledgment and collaborator welcome are in place.',
  garden_words: 'Use the customer word gardens. Do not name a garden they did not name.',
  split_language: 'Remove the banned payment wording.',
  destination_lock: 'Stay on the destination the customer named.',
};

const NOTE_RUBRIC = {
  holds_named_days: 'The draft holds the named days and does not add a place.',
  thin_draft: 'The draft is too thin to carry the day.',
  invented_place: 'The draft names a place that was not already named.',
  misses_ask: 'The draft misses what was asked.',
  skips_price: 'The draft skips the plan dollar amount and who pays.',
  payment_word: 'The draft uses a banned payment word.',
  garden_word: 'The draft should say gardens and not name a garden.',
  welcome_present: 'The itinerary acknowledgment and collaborator welcome are in the draft.',
  access_choice: 'The draft offers view access and edit access.',
  strong_day: 'The draft is a strong day plan.',
  price_line: 'The draft names each seat and who pays from the plan table.',
  off_destination: 'The draft leaves the named destination.',
};

const TEMPLATE_SHAPE = /the reply (covers|misses) this turn\b|the reply adds a place the customer did not name|banned payment word while covering|skips the dollar amount for who pays|who pays in:|^(?:answers?|name the price|take out the place|name the seats|keep the reply)\b|stays with that wording|in the customer's own words/i;

const CANNED_NOTES = new Set(Object.values(JEV_QUALITY_COMMENTS).concat([
  'Remove any split-payment wording.',
]));

export function extractJevFreeNote(body) {
  const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};
  for (const answer of Object.values(answers)) {
    if (!answer || typeof answer !== 'object') continue;
    for (const key of ['text', 'note', 'rationale', 'explanation']) {
      const value = answer[key];
      if (typeof value !== 'string') continue;
      const line = value.replace(/\s+/g, ' ').trim();
      if (!line || line === String(answer.choice || '').trim()) continue;
      return line;
    }
  }
  return '';
}

export function noteContradictsDraft(note, draft) {
  const line = String(note || '');
  const body = String(draft || '');
  if (!line.trim() || !body.trim()) return false;
  if (/who pays is missing/i.test(line) && /paid by/i.test(body)) return true;
  if (/friday garden/i.test(line) && !(/friday/i.test(body) && /garden/i.test(body))) return true;
  if (/wednesday/.test(line.toLowerCase()) && /walk/i.test(line) && !(/wednesday/i.test(body) && /walk/i.test(body))) return true;
  if (/welcome/.test(line.toLowerCase()) && /unclear/i.test(line) && /welcome (?:aboard|to the trip)/i.test(body)) return true;
  return false;
}

const FIXED_NOTE_STEMS = Object.values(NOTE_RUBRIC)
  .concat(Object.values(JEV_QUALITY_COMMENTS))
  .concat(['draft marker', 'jev score', 'the itinerary acknowledgment and collaborator welcome']);

function hasFixedStem(note) {
  const low = String(note || '').toLowerCase();
  return FIXED_NOTE_STEMS.some((stem) => {
    const words = String(stem || '').toLowerCase().replace(/[.]+$/g, '').trim().split(/\s+/);
    const prefix = words.slice(0, Math.min(words.length, 6)).join(' ');
    return prefix.length >= 10 && low.includes(prefix);
  });
}

export function noteEchoesCustomer(note, customerTurn) {
  const value = String(note || '').toLowerCase().replace(/\s+/g, ' ');
  const ask = String(customerTurn || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!value || !ask) return false;
  if (ask.length >= 12 && value.includes(ask)) return true;
  if (ask.length < 16) return false;
  for (let index = 0; index + 16 <= ask.length; index += 1) {
    if (value.includes(ask.slice(index, index + 16))) return true;
  }
  return false;
}

export function isTemplateNote(note, customerTurn) {
  const value = String(note || '').trim();
  if (!value || CANNED_NOTES.has(value) || TEMPLATE_SHAPE.test(value) || hasFixedStem(value) || noteEchoesCustomer(value, customerTurn)) return true;
  return false;
}

export function labeledJevScore(scoreRaw) {
  const raw = Number(scoreRaw);
  if (!Number.isFinite(raw)) return null;
  const labeled = Math.round((raw + 1) * 1000) / 1000;
  if (labeled < 1) return 1;
  if (labeled > 5) return 5;
  return labeled;
}

export function qualityFromDecisions(body, _criteria = null, customerTurn = '', draft = '') {
  const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};
  const scoreRaw = Number(answers.overall_quality?.score);
  if (!Number.isFinite(scoreRaw)) return { judged: false, reason: 'quality_score_missing', model: JEV_DECISIONS_MODEL };
  const score = labeledJevScore(scoreRaw);
  const disposition = text(answers.disposition?.choice, 40);
  const jevFocus = text(answers.fix_focus?.choice, 40);
  const rawNote = extractJevFreeNote(body);
  const contradicts = Boolean(rawNote) && noteContradictsDraft(rawNote, draft);
  const template = Boolean(rawNote) && isTemplateNote(rawNote, customerTurn);
  const wantsRewrite = score <= 2;
  return {
    judged: true,
    score,
    scoreRaw,
    disposition,
    comment: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    noteUnusable: contradicts || template,
    noteUnusableReason: contradicts ? 'note_contradicts_draft' : (template ? 'template_note' : null),
    jevFocus,
    rewrite: '',
    rewritten: false,
    wantsRewrite,
    model: JEV_DECISIONS_MODEL,
  };
}

export async function jevQualityRewrite({ customerTurn, draft, tripContext = null, planLine = '', env = process.env } = {}) {
  const key = appOpenRouterKey(env);
  const url = text(env.TIMESYNCHER_JEV_CLASSIFY_URL, 500) || DEFAULT_JEV_DECISIONS_URL;
  if (!JEV_DECISIONS_PATH.test(url)) return { judged: false, reason: 'quality_decisions_url_required', model: JEV_DECISIONS_MODEL };
  if (!key) return { judged: false, reason: 'quality_credentials_missing', model: JEV_DECISIONS_MODEL };
  const requiredLine = text(planLine || payerPriceLine(customerTurn, env), 400);
  const itinerary = Array.isArray(tripContext?.itinerary) ? text(tripContext.itinerary.filter(Boolean).join('; '), 1500) : '';
  const payload = {
    model: JEV_DECISIONS_MODEL,
    state: {
      customer_turn: text(customerTurn, 6000),
      draft: text(draft, 3500),
      ...(itinerary ? { itinerary } : {}),
      ...(tripContext?.roster ? { roster: text(tripContext.roster, 400) } : {}),
      ...(tripContext?.dates ? { dates: text(tripContext.dates, 400) } : {}),
      ...(requiredLine ? { required_payer_line: requiredLine } : {}),
    },
    questions: {
      overall_quality: {
        type: 'score',
        instructions: 'Rate this draft as the customer-facing vacation reply. Criterion 1 is weak. Criterion 5 is excellent. Use criterion 1 or 2 when it misses the ask, names a place or activity the customer did not name, skips a price they asked for, says no extra fees instead of the price, says the plan is already owned, moves a swim or garden off the itinerary, or uses a banned payment word. A price question that does not include required_payer_line, when that line is in the state, is criterion 3 or lower. Days and places listed in the itinerary state are already named. If you can, put a one-line reason in any text, note, rationale, or explanation field.',
        criteria: ['1 weak or off-brief', '2 thin', '3 adequate', '4 strong', '5 excellent'],
      },
      disposition: {
        type: 'choice',
        instructions: 'Choose keep or rewrite. If you can explain, put one line in a text field.',
        criteria: {
          keep: 'The draft should stand. It answers this turn and names only places and activities already in the conversation.',
          rewrite: 'Replace the draft. It misses this turn, names a place the customer did not name, skips the price, or uses a banned payment word.',
        },
      },
      fix_focus: {
        type: 'choice',
        instructions: 'Jev scores only. Pick the one-line fix this draft needs. Do not write a replacement reply and do not quote the customer.',
        criteria: {
          missing_price: 'Name each seat, the plan dollar amount, and who pays.',
          unnamed_place: 'Take out the place that was not already named.',
          payment_wording: 'Name each seat and who pays without a banned payment word.',
          misses_ask: 'Answer the ask and keep the days already named.',
          keep: 'Keep the draft. It answers without adding a place.',
        },
      },
    },
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'HTTP-Referer': 'https://timesyncher.com',
        'X-Title': 'TimeSyncher Vacation App Jev Quality',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return { judged: false, reason: text(body.error?.message || body.error || `quality HTTP ${response.status}`, 300), model: JEV_DECISIONS_MODEL };
    }
    return qualityFromDecisions(body, null, customerTurn, draft);
  } catch (error) {
    return { judged: false, reason: text(error?.message || error, 300), model: JEV_DECISIONS_MODEL };
  }
}

export async function jevChooseRewrite({ customerTurn, draft, options, env = process.env } = {}) {
  const choices = [...new Set((Array.isArray(options) ? options : []).map((item) => text(item, 1500)).filter(Boolean))];
  if (!choices.length) return { ok: false, text: '', reason: 'jev_rewrite_missing', model: JEV_DECISIONS_MODEL };
  const key = appOpenRouterKey(env);
  const url = text(env.TIMESYNCHER_JEV_CLASSIFY_URL, 500) || DEFAULT_JEV_DECISIONS_URL;
  if (!JEV_DECISIONS_PATH.test(url)) return { ok: false, text: '', reason: 'quality_decisions_url_required', model: JEV_DECISIONS_MODEL };
  if (!key) return { ok: false, text: '', reason: 'quality_credentials_missing', model: JEV_DECISIONS_MODEL };
  const criteria = {};
  choices.forEach((item, index) => {
    criteria[`r${index + 1}`] = item;
  });
  const payload = {
    model: JEV_DECISIONS_MODEL,
    state: {
      customer_turn: text(customerTurn, 6000),
      draft: text(draft, 3500),
    },
    questions: {
      replacement: {
        type: 'choice',
        instructions: 'Pick the full customer-facing replacement. It must replace the draft. Do not keep the draft and add a paragraph.',
        criteria,
      },
    },
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'HTTP-Referer': 'https://timesyncher.com',
        'X-Title': 'TimeSyncher Vacation App Jev Quality',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return { ok: false, text: '', reason: text(body.error?.message || body.error || `quality HTTP ${response.status}`, 300), model: JEV_DECISIONS_MODEL };
    }
    const choice = text(body?.answers?.replacement?.choice, 40);
    const picked = criteria[choice] || '';
    if (!picked) return { ok: false, text: '', reason: 'jev_rewrite_missing', model: JEV_DECISIONS_MODEL };
    return { ok: true, text: picked, reason: '', model: JEV_DECISIONS_MODEL };
  } catch (error) {
    return { ok: false, text: '', reason: text(error?.message || error, 300), model: JEV_DECISIONS_MODEL };
  }
}

export const INTERIM_MODEL = BAKEOFF_TIER_MODELS[1];

export async function callTieredModel({ rules, jev, customerTurn, stage, screen, destination, memory, upsell, postIntake = false, env = process.env, forceModel = '', timeoutMs = 0, systemExtra = '', tripContext = null, planTable = null, planLine = '', seatDollars = 0, seat = null } = {}) {
  const modelTier = Number(jev?.modelTier);
  const responseModel = forceModel || openRouterChatModelForTier(modelTier);
  if ((!forceModel && !jev?.jevRan) || !isBakeoffModelId(responseModel)) {
    return { called: false, via: null, modelTier: Number.isInteger(modelTier) ? modelTier : null, responseModel: responseModel || null, reason: 'model_not_in_bakeoff_map' };
  }
  return callOpenRouterTieredChat({
    rules,
    jev,
    customerTurn,
    stage,
    screen,
    modelTier: forceModel ? (Number.isInteger(modelTier) ? modelTier : 1) : modelTier,
    responseModel,
    destination,
    memory,
    upsell,
    postIntake,
    env,
    timeoutMs,
    systemExtra,
    tripContext,
    planTable,
    planLine,
    seatDollars,
    seat,
  });
}

async function callGrokTieredModel({ url, rules, jev, customerTurn, stage, screen, modelTier, responseModel, env }) {
  assertSharedReplyTargetAllowed(url, 'tiered model');
  const token = text(env.TIMESYNCHER_GROK_ROUTER_TOKEN || env.TIMESYNCHER_TIERED_MODEL_TOKEN, 500);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(replyRequestBody({ rules, jev, customerTurn, stage, screen, modelTier, responseModel })),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return { called: false, via: 'grok-router', modelTier, responseModel, reason: text(body.error || `tiered model HTTP ${response.status}`, 300) };
    }
    const answer = text(body.answer || body.reply || body.customerResponse || body.text, 3500);
    if (!answer) return { called: false, via: 'grok-router', modelTier, responseModel, reason: 'tiered model returned an empty reply' };
    return { called: true, via: 'grok-router', modelTier, responseModel: text(body.model || responseModel, 120), text: answer };
  } catch (error) {
    return { called: false, via: 'grok-router', modelTier, responseModel, reason: text(error?.message || error, 300) };
  }
}

async function callOpenRouterTieredChat({ rules, jev, customerTurn, stage, screen, modelTier, responseModel, destination, memory, upsell, postIntake = false, env, timeoutMs = 0, systemExtra = '', tripContext = null, planTable = null, planLine = '', seatDollars = 0, seat = null }) {
  const key = appOpenRouterKey(env);
  if (!key) {
    return {
      called: false,
      via: 'openrouter-chat',
      modelTier,
      responseModel,
      reason: 'tiered_model_credentials_missing: set OPENROUTER_API_KEY or TIMESYNCHER_OPENROUTER_API_KEY for the app/server OpenRouter chat fallback',
    };
  }
  assertSharedReplyTargetAllowed(OPENROUTER_CHAT_COMPLETIONS_URL, 'tiered openrouter chat', { allowTieredOpenRouterChat: true });
  const request = replyRequestBody({ rules, jev, customerTurn, stage, screen, modelTier, responseModel, destination, memory, upsell, tripContext, planTable });
  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'HTTP-Referer': 'https://timesyncher.com',
        'X-Title': 'TimeSyncher Vacation App Shared Reply',
      },
      body: JSON.stringify({
        model: responseModel,
        temperature: 0.55,
        max_tokens: 900,
        messages: [
          { role: 'system', content: `${replyRulesSystem(rules, destination, upsell, postIntake, customerTurn, { tripContext, planLine, seatDollars, seat })}${systemExtra ? `\n\n${systemExtra}` : ''}` },
          { role: 'user', content: JSON.stringify(request) },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs > 0 ? timeoutMs : 90000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return {
        called: false,
        via: 'openrouter-chat',
        modelTier,
        responseModel,
        reason: text(body.error?.message || body.error || `tiered model HTTP ${response.status}`, 300),
      };
    }
    const answer = chatReplyText(body.choices?.[0]?.message?.content) || text(body.answer || body.reply || body.text, 3500);
    if (!answer) return { called: false, via: 'openrouter-chat', modelTier, responseModel, reason: 'tiered model returned an empty reply' };
    const returned = text(body.model || responseModel, 120);
    if (returned !== responseModel || !isBakeoffModelId(returned)) {
      return { called: false, via: 'openrouter-chat', modelTier, responseModel, reason: 'model_not_in_bakeoff_map' };
    }
    const visible = splitBeat(answer);
    if (!visible.text) return { called: false, via: 'openrouter-chat', modelTier, responseModel, reason: 'tiered model returned an empty reply' };
    return { called: true, via: 'openrouter-chat', modelTier, responseModel: returned, text: visible.text, beats: visible.beats, maxTokens: 900 };
  } catch (error) {
    return { called: false, via: 'openrouter-chat', modelTier, responseModel, reason: text(error?.message || error, 300) };
  }
}
