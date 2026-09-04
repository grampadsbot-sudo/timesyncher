import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PREVIEW_MAP_VERSION = 1;
export const PREVIEW_MAP_REL = 'features/preview-map.json';
export const DEFAULT_PREVIEW_ORIGIN = 'https://timesyncher-git-cursor-vacatio-453141-grampads-boughts-projects.vercel.app';
export const EXPECTED_HEAD = '18ca97344a278c70c488eba2edb008f5807d8f93';
export const EXPECTED_DEPLOYMENT_ID = 'dpl_5cyCb18FhnViwqofcXt2at5Kee8g';

const SECRET_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-vercel-protection-bypass',
  'x-timesyncher-intake-token',
  'x-timesyncher-worker-token',
  'x-timesyncher-admin-token',
  'x-timesyncher-web-access-token',
]);

const SECRET_QUERY_NAMES = new Set([
  'x-vercel-protection-bypass',
  'token',
  'session',
  'payment_intent',
  'paymentintent',
]);

export const PREVIEW_SCENARIOS = Object.freeze([
  {
    id: 'storefront',
    feature: 'checkout',
    method: 'GET',
    path: '/',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html', body_includes: ['TimeSyncher'] },
  },
  {
    id: 'addons-checkout',
    feature: 'checkout',
    method: 'GET',
    path: '/addons-checkout.html',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html', body_includes: ['Add-on'] },
  },
  {
    id: 'owner-media-checkout',
    feature: 'checkout',
    method: 'GET',
    path: '/owner-media-checkout.html',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html', body_includes: ['Photo'] },
  },
  {
    id: 'checkout-config',
    feature: 'checkout',
    method: 'GET',
    path: '/api/checkout-config',
    kind: 'api',
    expect: { status: [200, 503], json: true },
  },
  {
    id: 'order-success',
    feature: 'onboarding',
    method: 'GET',
    path: '/order-success.html',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html' },
  },
  {
    id: 'onboarding-eula-page',
    feature: 'onboarding',
    method: 'GET',
    path: '/onboarding-eula.html',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html' },
  },
  {
    id: 'login',
    feature: 'onboarding',
    method: 'GET',
    path: '/login.html',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html' },
  },
  {
    id: 'onboarding-session-missing',
    feature: 'onboarding',
    method: 'GET',
    path: '/api/onboarding-session',
    kind: 'api',
    expect: { status: [400], json: true, fail_closed: true },
  },
  {
    id: 'eula-missing-action',
    feature: 'onboarding',
    method: 'GET',
    path: '/api/eula',
    kind: 'api',
    expect: { status: [400, 404, 405], json: true },
  },
  {
    id: 'vacation-itinerary-missing-session',
    feature: 'telegram-messages',
    method: 'GET',
    path: '/api/vacation-itinerary',
    kind: 'api',
    expect: { status: [400], json: true, fail_closed: true, body_includes: ['session is required'] },
  },
  {
    id: 'vacation-telegram-turn-get',
    feature: 'telegram-messages',
    method: 'GET',
    path: '/api/vacation-telegram-turn',
    kind: 'api',
    expect: { status: [405], json: true, fail_closed: true },
  },
  {
    id: 'vacation-request-get',
    feature: 'telegram-messages',
    method: 'GET',
    path: '/api/vacation-request',
    kind: 'api',
    expect: { status: [405], json: true },
  },
  {
    id: 'web-access-status',
    feature: 'collaborator-edits',
    method: 'GET',
    path: '/api/vacation-web-access?action=status',
    kind: 'api',
    expect: { status: [200, 500, 503], json: true },
  },
  {
    id: 'shared-page-proxy',
    feature: 'collaborator-edits',
    method: 'GET',
    path: '/shared/las-vegas-strip-vacation/',
    kind: 'document',
    expect: { status: [200, 301, 302, 307, 308], allow_redirect: true },
  },
  {
    id: 'vacation-edit-logged-out',
    feature: 'collaborator-edits',
    method: 'POST',
    path: '/api/vacation-itinerary?webAccess=1',
    kind: 'api',
    body: {
      action: 'vacation_edit',
      tripId: 'trip-vegas-live-001',
      text: 'Move Bellagio Fountains to day 2',
      pageContext: { kind: 'timeline', items: [] },
    },
    expect: { status: [403], json: true, fail_closed: true },
  },
  {
    id: 'itinerary-page',
    feature: 'timeline-thing-media',
    method: 'GET',
    path: '/itinerary.html',
    kind: 'document',
    expect: { status: [200], content_type_includes: 'text/html' },
  },
]);

export function bypassSecretPresent(env = process.env) {
  return Boolean(env.VERCEL_PROTECTION_BYPASS && String(env.VERCEL_PROTECTION_BYPASS).length > 0);
}

export function bypassHeaders(env = process.env) {
  if (!bypassSecretPresent(env)) {
    throw new Error('VERCEL_PROTECTION_BYPASS is missing');
  }
  return {
    'x-vercel-protection-bypass': env.VERCEL_PROTECTION_BYPASS,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

export function isSsoRedirect(status, location = '') {
  if (status !== 301 && status !== 302 && status !== 303 && status !== 307 && status !== 308) return false;
  return /vercel\.com\/(sso|login|oauth)/i.test(String(location || ''));
}

export function classifyObservation(scenario, observation) {
  if (observation.auth_failure || isSsoRedirect(observation.status, observation.location)) {
    return 'auth_failure';
  }
  const allowed = scenario.expect.status || [200];
  if (!allowed.includes(observation.status)) return 'unexpected';
  if (scenario.expect.fail_closed) return 'fail_closed';
  if (observation.status >= 500) return 'env_gap';
  if (observation.status >= 300 && observation.status < 400) return 'redirect';
  return 'ok';
}

function headerMap(headers) {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out = {};
    for (const row of headers) {
      if (!row) continue;
      if (Array.isArray(row)) out[String(row[0] || '').toLowerCase()] = String(row[1] || '');
      else if (row.name) out[String(row.name).toLowerCase()] = String(row.value || '');
    }
    return out;
  }
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[String(key).toLowerCase()] = Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }
  return out;
}

export function stripSecretQuery(search = '') {
  const raw = String(search || '');
  const qs = raw.startsWith('?') ? raw.slice(1) : raw;
  if (!qs) return '';
  const params = new URLSearchParams(qs);
  for (const name of [...params.keys()]) {
    if (SECRET_QUERY_NAMES.has(name.toLowerCase())) params.delete(name);
  }
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function sanitizeUrl(rawUrl, origin = DEFAULT_PREVIEW_ORIGIN) {
  try {
    const url = new URL(rawUrl, origin);
    url.search = stripSecretQuery(url.search);
    url.hash = '';
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return String(rawUrl || '').split('#')[0];
  }
}

export function scenarioPathname(pathWithQuery) {
  const [pathname] = String(pathWithQuery || '/').split('?');
  return pathname || '/';
}

export function matchScenario(method, rawUrl, origin = DEFAULT_PREVIEW_ORIGIN) {
  let url;
  try {
    url = new URL(rawUrl, origin);
  } catch {
    return null;
  }
  const methodUpper = String(method || 'GET').toUpperCase();
  return PREVIEW_SCENARIOS.find((scenario) => {
    const expected = new URL(scenario.path, origin);
    if (scenario.method !== methodUpper) return false;
    if (expected.pathname !== url.pathname) return false;
    if (expected.search) {
      for (const [key, value] of expected.searchParams.entries()) {
        if (url.searchParams.get(key) !== value) return false;
      }
    }
    return true;
  }) || null;
}

function sanitizeHeaders(headers) {
  const map = headerMap(headers);
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    if (SECRET_HEADER_NAMES.has(key)) continue;
    if (/bypass|authorization|cookie|token|secret|jwt/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizeHar(har) {
  const entries = har?.log?.entries || har?.entries || [];
  return {
    log: {
      version: '1.2',
      creator: { name: 'timesyncher-feature-map-preview', version: String(PREVIEW_MAP_VERSION) },
      entries: entries.map((entry) => {
        const request = entry.request || {};
        const response = entry.response || {};
        return {
          startedDateTime: entry.startedDateTime || null,
          time: typeof entry.time === 'number' ? entry.time : null,
          request: {
            method: String(request.method || 'GET').toUpperCase(),
            url: sanitizeUrl(request.url || ''),
            queryString: [],
            headers: [],
            postData: request.postData?.text && !/token|secret|bypass/i.test(request.postData.text)
              ? { mimeType: request.postData.mimeType || 'application/json', text: request.postData.text }
              : undefined,
          },
          response: {
            status: Number(response.status || 0),
            statusText: String(response.statusText || ''),
            headers: Object.entries(sanitizeHeaders(response.headers)).map(([name, value]) => ({ name, value })),
            redirectURL: sanitizeUrl(response.redirectURL || ''),
            content: {
              mimeType: response.content?.mimeType || headerMap(response.headers)['content-type'] || '',
              size: Number(response.content?.size || 0),
              text: typeof response.content?.text === 'string'
                ? response.content.text.slice(0, 4000)
                : '',
            },
          },
        };
      }),
    },
  };
}

export function assertNoSecret(text, env = process.env) {
  const secret = env.VERCEL_PROTECTION_BYPASS;
  if (secret && String(text).includes(secret)) {
    throw new Error('secret leaked into artifact');
  }
}

function bodyPreview(text, mimeType = '') {
  const raw = String(text || '');
  if (!raw) return '';
  if (/json/i.test(mimeType) || raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(raw));
    } catch {
      return raw.slice(0, 240);
    }
  }
  return raw.replace(/\s+/g, ' ').slice(0, 240);
}

export function extractFeatureMap(har, { origin = DEFAULT_PREVIEW_ORIGIN } = {}) {
  const sanitized = sanitizeHar(har);
  const byId = new Map();
  for (const entry of sanitized.log.entries) {
    const scenario = matchScenario(entry.request.method, entry.request.url, origin);
    if (!scenario) continue;
    const location = headerMap(entry.response.headers).location || entry.response.redirectURL || '';
    const observation = {
      status: entry.response.status,
      location,
      content_type: entry.response.content.mimeType || '',
      body_preview: bodyPreview(entry.response.content.text, entry.response.content.mimeType),
      auth_failure: isSsoRedirect(entry.response.status, location),
    };
    const row = {
      id: scenario.id,
      feature: scenario.feature,
      method: scenario.method,
      path: scenario.path,
      kind: scenario.kind,
      expect: scenario.expect,
      observed: {
        status: observation.status,
        content_type: observation.content_type,
        location: observation.location ? sanitizeUrl(observation.location, origin) : '',
        body_preview: observation.body_preview,
      },
      class: classifyObservation(scenario, observation),
    };
    byId.set(scenario.id, row);
  }
  const scenarios = PREVIEW_SCENARIOS.map((scenario) => byId.get(scenario.id) || {
    id: scenario.id,
    feature: scenario.feature,
    method: scenario.method,
    path: scenario.path,
    kind: scenario.kind,
    expect: scenario.expect,
    observed: null,
    class: 'missing',
  });
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    version: PREVIEW_MAP_VERSION,
    scenarios: scenarios.map((row) => ({
      id: row.id,
      method: row.method,
      path: row.path,
      class: row.class,
      status: row.observed?.status ?? null,
    })),
  })).digest('hex');
  return {
    version: PREVIEW_MAP_VERSION,
    origin_host: new URL(origin).host,
    expected_head: EXPECTED_HEAD,
    expected_deployment_id: EXPECTED_DEPLOYMENT_ID,
    extract_digest: digest,
    scenarios,
  };
}

export function previewMapStable(map) {
  return {
    version: map.version,
    origin_host: map.origin_host,
    expected_head: map.expected_head,
    expected_deployment_id: map.expected_deployment_id,
    extract_digest: map.extract_digest,
    scenarios: map.scenarios.map((row) => ({
      id: row.id,
      feature: row.feature,
      method: row.method,
      path: row.path,
      kind: row.kind,
      expect: row.expect,
      observed: row.observed ? {
        status: row.observed.status,
        content_type: row.observed.content_type,
        location: row.observed.location || '',
        body_preview: row.observed.body_preview || '',
      } : null,
      class: row.class,
    })),
  };
}

function readBodySafe(response, mimeType) {
  return response.text().then((text) => bodyPreview(text, mimeType)).catch(() => '');
}

export async function probePreview({
  origin = DEFAULT_PREVIEW_ORIGIN,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (!bypassSecretPresent(env)) {
    return { ok: false, reason: 'bypass_missing', origin, observations: [] };
  }
  const headers = bypassHeaders(env);
  const observations = [];
  for (const scenario of PREVIEW_SCENARIOS) {
    if (scenario.kind === 'named') continue;
    const url = new URL(scenario.path, origin);
    const init = {
      method: scenario.method,
      headers: { ...headers },
      redirect: 'manual',
    };
    if (scenario.body) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(scenario.body);
    }
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      observations.push({
        id: scenario.id,
        feature: scenario.feature,
        method: scenario.method,
        path: scenario.path,
        status: 0,
        location: '',
        content_type: '',
        body_preview: '',
        auth_failure: false,
        class: 'network_error',
        error: error.message || 'fetch_failed',
      });
      continue;
    }
    const location = response.headers.get('location') || '';
    const contentType = response.headers.get('content-type') || '';
    const authFailure = isSsoRedirect(response.status, location);
    let bodyPreviewText = '';
    if (!authFailure) {
      bodyPreviewText = await readBodySafe(response, contentType);
    }
    const observation = {
      id: scenario.id,
      feature: scenario.feature,
      method: scenario.method,
      path: scenario.path,
      status: response.status,
      location: location ? sanitizeUrl(location, origin) : '',
      content_type: contentType,
      body_preview: bodyPreviewText,
      auth_failure: authFailure,
    };
    observation.class = classifyObservation(scenario, observation);
    observations.push(observation);
    if (authFailure) {
      return {
        ok: false,
        reason: 'auth_failure',
        origin,
        stopped_on: scenario.id,
        observations,
      };
    }
  }
  return { ok: true, origin, observations };
}

export function observationsToHar(observations, { origin = DEFAULT_PREVIEW_ORIGIN } = {}) {
  return {
    log: {
      version: '1.2',
      creator: { name: 'timesyncher-feature-map-preview-probe', version: String(PREVIEW_MAP_VERSION) },
      entries: observations.map((row) => ({
        startedDateTime: null,
        time: null,
        request: {
          method: row.method,
          url: new URL(row.path, origin).toString(),
          headers: [],
          queryString: [],
        },
        response: {
          status: row.status,
          statusText: '',
          headers: [
            row.content_type ? { name: 'content-type', value: row.content_type } : null,
            row.location ? { name: 'location', value: row.location } : null,
          ].filter(Boolean),
          redirectURL: row.location || '',
          content: {
            mimeType: row.content_type || '',
            size: (row.body_preview || '').length,
            text: row.body_preview || '',
          },
        },
      })),
    },
  };
}

export function evaluatePreviewMap(map) {
  const classes = map.scenarios.map((row) => row.class);
  const authFailure = map.scenarios.find((row) => row.class === 'auth_failure');
  const unexpected = map.scenarios.filter((row) => row.class === 'unexpected' || row.class === 'missing' || row.class === 'network_error');
  const envGaps = map.scenarios.filter((row) => row.class === 'env_gap');
  const failClosed = map.scenarios.filter((row) => row.class === 'fail_closed');
  const okRows = map.scenarios.filter((row) => row.class === 'ok' || row.class === 'redirect');
  return {
    ok: !authFailure && unexpected.length === 0,
    certified: false,
    auth_failure: Boolean(authFailure),
    unexpected: unexpected.map((row) => row.id),
    env_gaps: envGaps.map((row) => row.id),
    fail_closed: failClosed.map((row) => row.id),
    ok_ids: okRows.map((row) => row.id),
    classes,
  };
}

export function writePreviewMap(map, cwd = process.cwd()) {
  const stable = previewMapStable(map);
  const text = `${JSON.stringify(stable, null, 2)}\n`;
  assertNoSecret(text);
  const dest = path.join(cwd, PREVIEW_MAP_REL);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
  return path.relative(cwd, dest);
}

export function readPreviewMap(cwd = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(cwd, PREVIEW_MAP_REL), 'utf8'));
}

export function compactPreviewReceipt({
  jobId,
  map,
  evaluation,
  eventsRel,
  artifactDir,
  playwright,
  head,
  notes = [],
}) {
  return {
    job_id: jobId,
    surface: 'hosted-preview',
    actor: 'preview-bypass-automation',
    trip_id: 'trip-vegas-live-001',
    public_url: DEFAULT_PREVIEW_ORIGIN,
    expected_head: EXPECTED_HEAD,
    expected_deployment_id: EXPECTED_DEPLOYMENT_ID,
    head: head || null,
    preview_map: PREVIEW_MAP_REL,
    extract_digest: map.extract_digest,
    events_jsonl: eventsRel,
    artifact_dir: artifactDir,
    dry_run: PREVIEW_MAP_REL,
    certified: false,
    apply_on_this_receipt: false,
    ok: evaluation.ok,
    auth_failure: evaluation.auth_failure,
    env_gaps: evaluation.env_gaps,
    fail_closed: evaluation.fail_closed,
    unexpected: evaluation.unexpected,
    playwright: playwright || { ran: false },
    writes_applied: [],
    notes,
    required_artifacts: [
      'whole-experience screenshot / customer-flow PDF',
      'customer-story PDF with generated pictures',
      'final keepsake PDF',
    ],
    stop_rules: [
      { id: 'no_customer_simulation', status: 'pass', detail: 'Preview probe only; no customer journey.' },
      { id: 'no_production_billing', status: 'pass', detail: 'Did not POST create-payment-intent or checkout-coupon.' },
      { id: 'no_unvalidated_writes', status: 'pass', detail: 'Logged-out vacation_edit expected 403.' },
      { id: 'vercel_protection_bypass', status: evaluation.auth_failure ? 'fail' : 'pass', detail: evaluation.auth_failure ? 'SSO redirect' : 'Bypass header reached the app.' },
      { id: 'prove_state_movement', status: 'hold', detail: 'Hosted preview probe does not apply TREK writes.' },
    ],
  };
}
