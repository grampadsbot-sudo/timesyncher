#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';

const DEFAULT_DB_PATH = '/home/timesyncher-agent/trek/runtime/data/travel.db';
const DEFAULT_PUBLIC_BASE = 'https://travel.timesyncher.com';
const SCRIPT_DIR = '/home/timesyncher-agent/timesyncher/scripts';

function clean(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function parseJsonOutput(value) {
  const source = clean(value, 200000);
  try { return JSON.parse(source); } catch {}
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  throw new Error(clean(source || 'Invalid JSON response.', 600));
}

function normalizePageContext(raw) {
  const context = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const items = [];
  const add = (item = {}, scope = '') => {
    const title = clean(item.title || item.name || item.label, 180);
    const description = clean(item.description || item.summary || item.notes || item.details, 500);
    if (!title && !description) return;
    items.push({
      id: clean(item.id || item.placeId || item.place_id || item.assignmentId || item.assignment_id, 80) || null,
      title,
      description,
      category: clean(item.category || item.type || item.subtype, 80) || null,
      day: item.day ?? item.dayNumber ?? item.day_number ?? null,
      time: clean(item.time || item.startTime || item.assignment_time || item.place_time, 60) || null,
      scope: clean(scope || item.scope, 120) || null,
    });
  };
  for (const item of Array.isArray(context.items) ? context.items : []) add(item, item.scope || 'page');
  for (const item of Array.isArray(context.visibleItems) ? context.visibleItems : []) add(item, item.scope || 'visible_page');
  const sections = context.sections && typeof context.sections === 'object' ? context.sections : {};
  for (const [section, sectionItems] of Object.entries(sections)) {
    for (const item of Array.isArray(sectionItems) ? sectionItems : []) add(item, section);
  }
  const seen = new Set();
  return {
    trip: context.trip || null,
    source: clean(context.source || 'caller_page_context', 80),
    items: items.filter((item) => {
      const key = `${item.id || ''}:${item.title}:${item.description}`.toLowerCase();
      if (!item.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 250),
  };
}

function collectDbPageContext({ shareToken, dbPath }) {
  const token = clean(shareToken, 240);
  if (!token) return { trip: null, source: 'empty_token', items: [] };
  const code = String.raw`
import json, sqlite3, sys
p=json.load(sys.stdin)
db=sqlite3.connect(p.get('dbPath') or '/home/timesyncher-agent/trek/runtime/data/travel.db')
db.row_factory=sqlite3.Row
row=db.execute('SELECT trips.* FROM share_tokens JOIN trips ON trips.id=share_tokens.trip_id WHERE share_tokens.token=?', (p.get('shareToken') or '',)).fetchone()
if not row:
  print(json.dumps({'trip': None, 'source': 'db_no_trip', 'items': []}))
  raise SystemExit(0)
trip_id=int(row['id'])
items=[]
for r in db.execute('SELECT p.id,p.name,p.description,c.name AS category,p.place_time,p.notes FROM places p LEFT JOIN categories c ON c.id=p.category_id WHERE p.trip_id=? ORDER BY p.id', (trip_id,)).fetchall():
  items.append({'id': r['id'], 'title': r['name'], 'description': r['description'] or r['notes'] or '', 'category': r['category'] or '', 'time': r['place_time'] or '', 'scope': 'all_trip_things'})
for r in db.execute('SELECT da.id AS assignment_id,d.day_number,da.place_id,p.name,p.description,c.name AS category,da.assignment_time,da.notes FROM day_assignments da JOIN days d ON d.id=da.day_id JOIN places p ON p.id=da.place_id LEFT JOIN categories c ON c.id=p.category_id WHERE d.trip_id=? ORDER BY d.day_number,da.order_index,da.id', (trip_id,)).fetchall():
  items.append({'id': r['place_id'], 'assignmentId': r['assignment_id'], 'title': r['name'], 'description': r['description'] or r['notes'] or '', 'category': r['category'] or '', 'day': r['day_number'], 'time': r['assignment_time'] or '', 'scope': 'timeline'})
print(json.dumps({'trip': dict(row), 'source': 'trek_db', 'items': items}, default=str))
`;
  const result = spawnSync('python3', ['-c', code], {
    input: JSON.stringify({ shareToken: token, dbPath: dbPath || DEFAULT_DB_PATH }),
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) return { trip: null, source: 'db_context_error', error: clean(result.stderr || result.stdout, 500), items: [] };
  try { return normalizePageContext(JSON.parse(result.stdout)); } catch { return { trip: null, source: 'db_context_parse_error', items: [] }; }
}

function mergePageContexts(...contexts) {
  const out = { trip: null, source: 'merged_page_context', items: [] };
  const seen = new Set();
  for (const context of contexts.map(normalizePageContext)) {
    if (!out.trip && context.trip) out.trip = context.trip;
    for (const item of context.items || []) {
      const key = `${item.id || ''}:${item.title}:${item.day || ''}:${item.time || ''}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.items.push(item);
    }
  }
  out.items = out.items.slice(0, 300);
  return out;
}

function splitTranscriptIntoEditRequests(transcript) {
  const source = clean(transcript, 12000).replace(/\s+/g, ' ');
  if (!source) return [];
  const protectedSource = source.replace(/\b(and|also)\s+(?:see|check)\s+if\s+there(?:'| i)?s\b/gi, ' $1 check whether there is');
  const normalized = protectedSource
    .replace(/\band\s+(?=(?:on|at|for|in)\b[^.;]{0,140}\b(?:say|tell|make|change|update|move|take|remove|delete|add|put|switch|replace)\b)/gi, '\n')
    .replace(/\b(?:and\s+)?also\s+(?=(?:on|at|for|in)\b|(?:check|see|say|tell|make|change|update|move|take|remove|delete|add|put|switch|replace)\b)/gi, '\n')
    .replace(/\b(?:and\s+)?(?=(?:take|remove|delete)\s+(?:out|off|from|the)\b)/gi, '\n')
    .replace(/\b(?:and\s+)?(?=(?:move|switch|replace|change|update|add|put)\b)/gi, '\n');
  const segments = normalized
    .split(/\n+|(?:^|[.;])\s+/)
    .map((part) => clean(part.replace(/^(?:okay|ok|so|then|and)\b[\s,]*/i, ''), 1200))
    .filter((part) => part.length >= 4);
  const actionSegments = segments.filter((part) => /\b(check|see|say|tell|make|change|update|move|take|remove|delete|add|put|switch|replace)\b/i.test(part));
  const unique = [];
  const seen = new Set();
  for (const segment of actionSegments.length > 1 ? actionSegments : [source]) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ requestText: segment, heardText: segment, source: 'heuristic_splitter', targetCandidates: [] });
  }
  return unique;
}

function boundedParserSchema() {
  return JSON.stringify({
    type: 'object',
    required: ['requests'],
    properties: {
      requests: {
        type: 'array',
        items: {
          type: 'object',
          required: ['requestText', 'heardText', 'action', 'targetCandidates'],
          properties: {
            requestText: { type: 'string' },
            heardText: { type: 'string' },
            action: { type: 'string' },
            detail: { type: 'string' },
            targetCandidates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  heardAlias: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                additionalProperties: true,
              },
            },
          },
          additionalProperties: true,
        },
      },
    },
    additionalProperties: false,
  });
}

function boundedParserPrompt({ transcript, pageContext }) {
  const items = (pageContext.items || []).slice(0, 220).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    day: item.day,
    time: item.time,
    scope: item.scope,
    description: clean(item.description, 260),
  }));
  return [
    'Split this TimeSyncher Vacation edit transcript into separate bounded edit intents.',
    'Use the provided current page/trip items as the only possible itinerary targets. The page may be a full itinerary, a day, or another list of Things; do not assume only day timeline items are valid.',
    'You may propose likely aliases or phonetic matches only when they refer to one of the provided items, such as Omeke/Omeker for Umekes if that item is present.',
    'Do not create write operations and do not claim a match when several items could fit. Return targetCandidates with confidence; downstream deterministic code will validate before writing.',
    'Keep requestText short and self-contained. If a transcript contains multiple changes, return one request per change. If a request is research/check-only, still return it as a separate request with action check_or_research.',
    '',
    `Current page/trip items JSON: ${JSON.stringify(items).slice(0, 30000)}`,
    `Transcript: ${clean(transcript, 12000)}`,
  ].join('\n');
}

function normalizeWithBoundedParser({ transcript, pageContext }) {
  const fallback = splitTranscriptIntoEditRequests(transcript);
  if (process.env.TIMESYNCHER_VACATION_BOUNDED_PARSER_DISABLE_MODEL === '1') return fallback;
  const grokBin = process.env.TIMESYNCHER_GROK_BIN || '/home/ubishere9995/.local/bin/grok';
  const grokModel = process.env.TIMESYNCHER_VACATION_BOUNDED_PARSER_MODEL || process.env.TIMESYNCHER_GROK_MODEL || 'grok-4.5';
  const timeoutSeconds = Math.max(8, Math.ceil(Number(process.env.TIMESYNCHER_VACATION_BOUNDED_PARSER_TIMEOUT_MS || 45000) / 1000));
  const result = spawnSync('/usr/bin/timeout', ['-k', '5s', `${timeoutSeconds}s`, 'sudo', '-n', '-u', 'ubishere9995', grokBin, '-p', boundedParserPrompt({ transcript, pageContext }), '--output-format', 'json', '--json-schema', boundedParserSchema(), '--no-alt-screen', '--model', grokModel, '--max-turns', '1'], {
    encoding: 'utf8',
    timeout: (timeoutSeconds + 10) * 1000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) return fallback.map((request) => ({ ...request, parserFallback: clean(result.stderr || result.stdout, 600) }));
  try {
    const parsed = parseJsonOutput(result.stdout);
    const requests = Array.isArray(parsed.requests) ? parsed.requests : [];
    const normalized = requests
      .map((request) => ({
        requestText: clean(request.requestText || request.heardText, 1400),
        heardText: clean(request.heardText || request.requestText, 1400),
        action: clean(request.action, 80),
        detail: clean(request.detail, 500),
        targetCandidates: Array.isArray(request.targetCandidates) ? request.targetCandidates.slice(0, 5) : [],
        source: 'bounded_model_parser',
      }))
      .filter((request) => request.requestText || request.heardText);
    return normalized.length ? normalized : fallback;
  } catch (error) {
    return fallback.map((request) => ({ ...request, parserFallback: clean(error.message, 600) }));
  }
}

function enrichedRequestText(request) {
  const base = clean(request.requestText || request.heardText, 1400);
  const confident = (request.targetCandidates || []).filter((candidate) => Number(candidate.confidence) >= 0.72 && clean(candidate.title, 180));
  if (!confident.length) return base;
  const candidateLines = confident.slice(0, 3).map((candidate) => `Likely itinerary target: ${clean(candidate.title, 180)}${candidate.heardAlias ? ` (heard as ${clean(candidate.heardAlias, 80)})` : ''}.`);
  const detail = request.detail ? `Normalized detail: ${clean(request.detail, 300)}.` : '';
  return [base, ...candidateLines, detail].filter(Boolean).join('\n');
}

function runEditScript({ scriptName, shareToken, requestText, deterministicError = '', pageContext = {}, boundedIntent = {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`${SCRIPT_DIR}/${scriptName}`], {
      cwd: '/home/timesyncher-agent/timesyncher',
      env: {
        ...process.env,
        TIMESYNCHER_TREK_DB_PATH: process.env.TIMESYNCHER_TREK_DB_PATH || DEFAULT_DB_PATH,
        TIMESYNCHER_TREK_PUBLIC_BASE_URL: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(Object.assign(new Error('Timed out applying itinerary update.'), { statusCode: 504 }));
    }, Number(process.env.TIMESYNCHER_SHARED_EDIT_TIMEOUT_MS || process.env.TIMESYNCHER_SHARED_AUDIO_EDIT_TIMEOUT_MS || 930000));
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(Object.assign(new Error(clean(stderr || stdout || `${scriptName} exited ${code}`, 900)), { statusCode: 502 }));
        return;
      }
      try { resolve(parseJsonOutput(stdout)); } catch (error) { reject(Object.assign(error, { statusCode: 502 })); }
    });
    child.stdin.end(JSON.stringify({
      shareToken,
      token: shareToken,
      requestText,
      publicBase: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE,
      dbPath: process.env.TIMESYNCHER_TREK_DB_PATH || DEFAULT_DB_PATH,
      deterministicError,
      pageContext,
      boundedIntent,
    }));
  });
}

async function runTrekEdit({ shareToken, request, pageContext }) {
  const requestText = enrichedRequestText(request);
  try {
    const deterministic = await runEditScript({ scriptName: 'trek-itinerary-edit.mjs', shareToken, requestText, pageContext, boundedIntent: request });
    deterministic.mode = deterministic.mode || 'deterministic_trek_edit';
    return deterministic;
  } catch (error) {
    const fallback = await runEditScript({
      scriptName: 'trek-agent-edit.mjs',
      shareToken,
      requestText,
      pageContext,
      boundedIntent: request,
      deterministicError: clean(error?.message || error, 1200),
    });
    fallback.mode = fallback.mode || 'grok_trek_agent_edit';
    return fallback;
  }
}

function editApplied(result) {
  return result && result.noop !== true && result.editApplied !== false;
}

function updatedItemLabel(item = {}) {
  const action = clean(item.action || 'changed', 80).replace(/_/g, ' ');
  const title = clean(item.title || item.name || item.label || 'requested item', 180);
  const day = item.day ? ` on Day ${item.day}` : '';
  return `Changed "${title}"${day}: ${action}.`;
}

function noMatchText(heardText) {
  const heard = clean(heardText, 300).replace(/\s+/g, ' ');
  return heard
    ? `I heard "${heard}", couldn't find a match, what do you mean?`
    : `I couldn't find a match, what do you mean?`;
}

function multiResultMessage({ transcript = '', itemResults = [] } = {}) {
  const lines = [];
  if (itemResults.length <= 1) {
    const item = itemResults[0];
    if (!item) return noMatchText(transcript);
    if (!item.ok) return noMatchText(item.heardText || item.requestText || transcript);
    const changed = Array.isArray(item.edit?.updatedItems) && item.edit.updatedItems.length
      ? item.edit.updatedItems.map(updatedItemLabel).join(' ')
      : 'I changed that itinerary item.';
    return `I heard "${clean(item.heardText || item.requestText || transcript, 300).replace(/\s+/g, ' ')}". ${changed}`;
  }
  const heard = clean(transcript, 520).replace(/\s+/g, ' ');
  if (heard) lines.push(`I heard "${heard}".`);
  itemResults.forEach((item, index) => {
    const request = clean(item.heardText || item.requestText, 260).replace(/\s+/g, ' ');
    const prefix = `${index + 1}. `;
    if (item.ok) {
      const changed = Array.isArray(item.edit?.updatedItems) && item.edit.updatedItems.length
        ? item.edit.updatedItems.map(updatedItemLabel).join(' ')
        : 'I changed that itinerary item.';
      lines.push(`${prefix}${request ? `For "${request}": ` : ''}${changed}`);
      return;
    }
    lines.push(`${prefix}${noMatchText(request)}`);
  });
  return lines.join(' ');
}

async function runSharedEditPipeline(input) {
  const shareToken = clean(input.shareToken || input.share_token || input.token, 240);
  const transcript = clean(input.transcript || input.requestText || input.request_text || '', 12000);
  if (!shareToken) throw Object.assign(new Error('shareToken is required.'), { statusCode: 400 });
  if (!transcript) throw Object.assign(new Error('requestText is required.'), { statusCode: 400 });
  const dbContext = collectDbPageContext({ shareToken, dbPath: input.dbPath || input.db_path || process.env.TIMESYNCHER_TREK_DB_PATH || DEFAULT_DB_PATH });
  const pageContext = mergePageContexts(dbContext, input.pageContext || input.page_context || {});
  const requests = normalizeWithBoundedParser({ transcript, pageContext });
  const itemResults = [];
  for (const request of requests) {
    try {
      const edit = await runTrekEdit({ shareToken, request, pageContext });
      itemResults.push({ requestText: request.requestText, heardText: request.heardText, ok: editApplied(edit), edit, boundedIntent: request });
    } catch (error) {
      itemResults.push({
        requestText: request.requestText,
        heardText: request.heardText,
        ok: false,
        edit: { noop: true, reason: 'edit_runner_error', summary: clean(error?.message || error, 600) },
        boundedIntent: request,
      });
    }
  }
  const okCount = itemResults.filter((item) => item.ok).length;
  const failCount = itemResults.filter((item) => !item.ok).length;
  const updatedItems = itemResults.flatMap((item) => Array.isArray(item.edit?.updatedItems) ? item.edit.updatedItems : []);
  const firstUrl = clean(itemResults.find((item) => item.edit?.url)?.edit?.url, 500);
  const message = multiResultMessage({ transcript, itemResults });
  return {
    ok: okCount > 0,
    noop: okCount === 0,
    editApplied: okCount > 0,
    mode: 'shared_vacation_edit_pipeline',
    token: shareToken,
    url: firstUrl || `${(process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/, '')}/shared/${encodeURIComponent(shareToken)}/`,
    transcript,
    requests: requests.map((request) => request.requestText),
    boundedParser: { source: requests.some((request) => request.source === 'bounded_model_parser') ? 'bounded_model_parser' : 'heuristic_splitter', pageContextItemCount: pageContext.items.length },
    itemResults,
    okCount,
    failCount,
    summary: message,
    message,
    reason: okCount ? 'processed' : 'no_resolved_target',
    updatedItems,
    accessChanges: itemResults.flatMap((item) => Array.isArray(item.edit?.accessChanges) ? item.edit.accessChanges : []),
    operationCount: itemResults.reduce((total, item) => total + (Number(item.edit?.operationCount) || 0), 0),
    verification: { changed: okCount > 0, source: 'shared-vacation-edit-pipeline' },
  };
}

async function main() {
  const input = JSON.parse(await readStdin() || '{}');
  const result = await runSharedEditPipeline(input);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(clean(error?.message || error || 'Unable to apply vacation edit.', 1200));
  process.exit(1);
});
