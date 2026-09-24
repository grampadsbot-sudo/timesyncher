import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REPLY_RULES_SLUG = 'bot-admin/skills/time-syncher/vacation-app-reply-rules';
export const DIALOG_TEST_FINGERPRINT = 'TS-DIALOG-FINGERPRINT-20260924-bar2';
export const SHARED_REPLY_PIPELINE = 'jev_precall_then_tiered_model';

const OPENROUTER_HOST = /openrouter\.ai/i;
const JEV_DECISIONS_PATH = /\/api\/alpha\/decisions\/?$/i;

function text(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function isOpenRouterReplyUrl(value) {
  const url = text(value, 500);
  if (!url || !OPENROUTER_HOST.test(url)) return false;
  return !JEV_DECISIONS_PATH.test(url);
}

export function assertSharedReplyTargetAllowed(value, label = 'reply target') {
  if (isOpenRouterReplyUrl(value)) {
    const error = new Error(`refused: shared reply path will not call OpenRouter for customer replies (${label})`);
    error.code = 'OPENROUTER_REPLY_REFUSED';
    throw error;
  }
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

export async function loadVacationAppReplyRules(env = process.env) {
  const http = await loadViaHttp(env);
  if (http?.ok) return http;
  const cli = loadViaCli();
  if (cli?.ok) return cli;
  const brainFile = loadViaBrainFile(env);
  if (brainFile?.ok) return brainFile;
  const cached = loadViaEnvCache(env);
  if (cached) return cached;
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
    return { jevRan: false, via, error: 'jev response missing model tier', modelTier: null, responseModel: null };
  }
  return {
    jevRan: true,
    via,
    modelTier,
    responseModel: responseModel || tierModel(modelTier),
    routeType: text(source?.route_type || source?.routeType, 80) || null,
    extraContext: source?.extra_context || source?.extraContext || source?.context || null,
  };
}

export async function jevPrecall({ customerTurn, stage, gate, screen, session, env = process.env } = {}) {
  const payload = {
    current_turn: text(customerTurn, 4000),
    context: {
      channel: 'vacation-app',
      stage: text(stage, 80) || 'vacation-app',
      gate: text(gate, 80) || null,
      screen: text(screen, 80) || 'vacation-app',
      session: session && typeof session === 'object' ? session : {},
      pipeline: SHARED_REPLY_PIPELINE,
      rules_slug: REPLY_RULES_SLUG,
    },
  };
  const url = text(env.TIMESYNCHER_JEV_CLASSIFY_URL, 500);
  if (!url) {
    return {
      jevRan: false,
      via: 'not-configured',
      modelTier: null,
      responseModel: null,
      error: 'Jev pre-call is not configured. Set TIMESYNCHER_JEV_CLASSIFY_URL. This VM cannot bind gbrain jev_classify_turn, and OpenRouter is not used to write replies.',
      request: payload,
    };
  }
  if (isOpenRouterReplyUrl(url)) {
    return {
      jevRan: false,
      via: 'refused-openrouter-reply',
      modelTier: null,
      responseModel: null,
      error: 'refused: Jev pre-call URL points at an OpenRouter reply endpoint',
      request: payload,
    };
  }
  try {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    const key = text(env.TIMESYNCHER_JEV_CLASSIFY_TOKEN || env.JEV_OPENROUTER_API_KEY || env.TIMESYNCHER_JEV_OPENROUTER_API_KEY, 500);
    if (key && JEV_DECISIONS_PATH.test(url)) headers.authorization = `Bearer ${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return {
        jevRan: false,
        via: 'http-jev',
        modelTier: null,
        responseModel: null,
        error: text(body.error?.message || body.error || `Jev HTTP ${response.status}`, 300),
        request: payload,
      };
    }
    return { ...normalizeJev(body, 'http-jev'), request: payload };
  } catch (error) {
    return {
      jevRan: false,
      via: 'http-jev',
      modelTier: null,
      responseModel: null,
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

export async function callTieredModel({ rules, jev, customerTurn, stage, screen, env = process.env } = {}) {
  const modelTier = jev?.modelTier ?? null;
  const responseModel = text(jev?.responseModel, 120) || tierModel(modelTier);
  if (!jev?.jevRan || (!modelTier && !responseModel)) {
    return { called: false, modelTier, responseModel: responseModel || null, reason: 'jev_did_not_choose_a_model' };
  }
  const url = grokReplyUrl(env);
  if (!url) {
    return { called: false, modelTier, responseModel, reason: 'tiered_model_credentials_missing' };
  }
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
      body: JSON.stringify({
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
          routeType: jev?.routeType || null,
          extraContext: jev?.extraContext || null,
        },
        customer_turn: text(customerTurn, 4000),
        stage: text(stage, 80),
        screen: text(screen, 80),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return { called: false, modelTier, responseModel, reason: text(body.error || `tiered model HTTP ${response.status}`, 300) };
    }
    const answer = text(body.answer || body.reply || body.customerResponse || body.text, 3500);
    if (!answer) return { called: false, modelTier, responseModel, reason: 'tiered model returned an empty reply' };
    return { called: true, modelTier, responseModel: text(body.model || responseModel, 120), text: answer };
  } catch (error) {
    return { called: false, modelTier, responseModel, reason: text(error?.message || error, 300) };
  }
}
