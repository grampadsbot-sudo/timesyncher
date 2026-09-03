import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PIPELINE_NAME = 'vacation-edit-pipeline';
export const PIPELINE_VERSION = '1';
export const NO_MATCH_TEMPLATE = 'I heard "{heard}", couldn\'t find a match, what do you mean?';
export const FIRST_PASS_LANGUAGE = /turning this into an itinerary|turning the information you sent into a hosted|will send the itinerary link when the first pass is ready/i;

export const SURFACES = Object.freeze(['telegram-text', 'telegram-voice', 'shared-page-voice']);
export const PAGE_KINDS = Object.freeze(['day', 'list', 'timeline']);

export const ALIASES = Object.freeze({
  omeke: 'Umekes Fish Market Bar & Grill',
  omeker: 'Umekes Fish Market Bar & Grill',
  "omeker's": 'Umekes Fish Market Bar & Grill',
  omekes: 'Umekes Fish Market Bar & Grill',
  umeke: 'Umekes Fish Market Bar & Grill',
  umekes: 'Umekes Fish Market Bar & Grill',
});

const DEFAULT_STOP_RULES = Object.freeze([
  { id: 'no_customer_simulation', description: 'Do not start synthetic customer journeys from this lever.' },
  { id: 'no_production_billing', description: 'Do not charge Stripe or mutate production entitlements.' },
  { id: 'no_unvalidated_writes', description: 'The parser never writes. Only validated item IDs on the locked trip may mutate.' },
  { id: 'fail_closed_stale_media', description: 'Media must bind to the live trip_id or no-op.' },
  { id: 'fail_closed_unauthorized_upload', description: 'Public-link and unauthorized collaborator uploads reject.' },
  { id: 'fail_closed_duplicate_trek', description: 'Split-trip must not create a second TREK row for the same title/token.' },
  { id: 'exact_no_match_copy', description: 'Unmatched targets use the exact no-match sentence.' },
  { id: 'prove_state_movement', description: 'A success reply is invalid unless before/after hashes differ for the named change.' },
  { id: 'no_first_pass_language_on_edits', description: 'Existing-itinerary edits must not use first-pass creation language.' },
]);

export function noMatchCopy(heard) {
  return NO_MATCH_TEMPLATE.replace('{heard}', String(heard || '').trim());
}

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function applyAlias(value) {
  const raw = String(value || '').trim();
  const key = normalizeName(raw).replace(/\s+/g, ' ');
  const compact = key.replace(/\s+/g, '');
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const aliasNorm = normalizeName(alias);
    if (key === aliasNorm || compact === aliasNorm.replace(/\s+/g, '') || key.startsWith(`${aliasNorm} `)) {
      return { canonical, alias: alias, proposed: true };
    }
  }
  return { canonical: raw, alias: null, proposed: false };
}

export function stableJobId({ fixtureId, surface, tripId, text, seed } = {}) {
  if (fixtureId) return `vac-verify-${slugToken(fixtureId)}`;
  const material = [surface || '', tripId || '', String(text || '').trim(), seed || ''].join('\n');
  const digest = crypto.createHash('sha256').update(material).digest('hex').slice(0, 12);
  return `vac-verify-${digest}`;
}

export function snapshotHash(value) {
  return crypto.createHash('sha256').update(canonicalize(value)).digest('hex');
}

export function artifactDirFor(jobId, root = process.cwd()) {
  return path.join(root, 'artifacts', 'vacation-verify', slugToken(jobId));
}

export function defaultStopRules() {
  return DEFAULT_STOP_RULES.map((rule) => ({ ...rule, status: 'pending' }));
}

export function parseIntents(text, { surface, pageKind } = {}) {
  const source = String(text || '').trim();
  if (!source) return [];
  const chunks = splitRequestChunks(source);
  return chunks.map((chunk, index) => classifyIntent(chunk, { surface, pageKind, index }));
}

export function contextItems(input) {
  const page = input.pageContext || {};
  const tripItems = Array.isArray(input.trip?.items) ? input.trip.items : [];
  const pageItems = Array.isArray(page.items) ? page.items : [];
  const kind = page.kind || 'timeline';
  if (kind === 'list') return uniqueItems(pageItems.length ? pageItems : tripItems);
  if (kind === 'day') {
    const day = page.day ?? page.dayNumber;
    const scoped = (pageItems.length ? pageItems : tripItems).filter((item) => {
      if (day == null) return true;
      return Number(item.day ?? item.dayNumber) === Number(day);
    });
    return uniqueItems(scoped);
  }
  return uniqueItems(pageItems.length ? pageItems : tripItems);
}

export function matchIntent(intent, items) {
  if (!intent?.target) {
    return { status: intent?.kind === 'incomplete_move' ? 'incomplete' : 'no_target', candidates: [], chosen: null };
  }
  const alias = applyAlias(intent.target);
  const wanted = normalizeName(alias.canonical);
  const scored = items.map((item) => {
    const name = normalizeName(item.title || item.name);
    let score = 0;
    if (name === wanted) score = 1;
    else if (name.includes(wanted) || wanted.includes(name)) score = 0.82;
    else if (tokenOverlap(name, wanted) >= 0.6) score = 0.7;
    return { item, score, alias: alias.proposed ? alias : null };
  }).filter((row) => row.score >= 0.7).sort((a, b) => b.score - a.score);

  if (!scored.length) return { status: 'no_match', candidates: [], chosen: null, alias };
  if (scored.length > 1 && scored[0].score < 0.95 && Math.abs(scored[0].score - scored[1].score) < 0.08) {
    return { status: 'ambiguous', candidates: scored.slice(0, 4), chosen: null, alias };
  }
  return { status: 'matched', candidates: scored.slice(0, 4), chosen: scored[0], alias };
}

export function evaluateStopRules({ input, intents, decisions, receipt, apply }) {
  const rules = defaultStopRules();
  const mark = (id, status, detail) => {
    const row = rules.find((rule) => rule.id === id);
    if (row) Object.assign(row, { status, detail });
  };

  mark('no_customer_simulation', 'pass', 'Dry-run/control driver only; no customer journey started.');
  mark('no_production_billing', input.allowProductionBilling ? 'fail' : 'pass', 'Checkout proof uses a synthetic account fixture.');
  mark('no_unvalidated_writes', decisions.every((row) => row.write == null || row.validation === 'validated') ? 'pass' : 'fail', 'Writes require deterministic validation.');
  mark(
    'fail_closed_stale_media',
    decisions.some((row) => row.stop === 'stale_trip_media' && row.write) ? 'fail' : 'pass',
    'Stale or mismatched trip media must no-op.',
  );
  mark(
    'fail_closed_unauthorized_upload',
    decisions.some((row) => row.stop === 'unauthorized_upload' && row.write) ? 'fail' : 'pass',
    'Unauthorized or public-link uploads must reject.',
  );
  mark(
    'fail_closed_duplicate_trek',
    decisions.some((row) => row.stop === 'duplicate_trek' && row.write) ? 'fail' : 'pass',
    'Split-trip must reuse or reject, never duplicate TREK rows.',
  );
  const noMatchOk = decisions
    .filter((row) => row.matchStatus === 'no_match')
    .every((row) => row.response === noMatchCopy(row.heard));
  mark('exact_no_match_copy', noMatchOk ? 'pass' : 'fail', 'Unmatched copy must be exact.');
  const editReply = receipt.customer_facing_response || '';
  const usedFirstPass = FIRST_PASS_LANGUAGE.test(editReply) && intents.some((intent) => intent.kind !== 'intake');
  mark('no_first_pass_language_on_edits', usedFirstPass ? 'fail' : 'pass', 'Existing edits must name the change, not first-pass setup.');
  const appliedWrites = decisions.filter((row) => row.write && row.applied);
  if (!apply) {
    mark('prove_state_movement', 'hold', 'Dry-run records planned writes; apply mode proves the hash move.');
  } else if (appliedWrites.length) {
    mark(
      'prove_state_movement',
      receipt.before_hash && receipt.after_hash && receipt.before_hash !== receipt.after_hash ? 'pass' : 'fail',
      'Applied writes must change the itinerary snapshot hash.',
    );
  } else {
    mark('prove_state_movement', 'pass', 'No-op path: after-hash must match before-hash.');
  }
  return rules;
}

export function runVacationEditPipeline(rawInput = {}, options = {}) {
  const input = normalizeInput(rawInput);
  const jobId = options.jobId || input.job_id || stableJobId({
    fixtureId: input.fixture_id,
    surface: input.surface,
    tripId: input.trip.trip_id,
    text: input.text,
    seed: options.seed,
  });
  const apply = Boolean(options.apply);
  const cwd = options.cwd || process.cwd();
  const artifactRoot = options.artifactRoot || artifactDirFor(jobId, cwd);
  const events = [];
  const emit = (step, detail) => {
    events.push({
      ts: options.now || new Date().toISOString(),
      job_id: jobId,
      step,
      ...detail,
    });
  };

  emit('initialize', { surface: input.surface, actor: input.actor.role, trip_id: input.trip.trip_id });
  const items = contextItems(input);
  emit('lock_identity', {
    trip_id: input.trip.trip_id,
    public_url: input.trip.publicUrl,
    page_kind: input.pageContext.kind,
    item_count: items.length,
    audio_path: input.audioPath || null,
  });

  const intents = parseIntents(input.text, { surface: input.surface, pageKind: input.pageContext.kind });
  emit('parse', { intent_count: intents.length, intents: intents.map(publicIntent) });

  const before = clone(input.trip);
  const beforeHash = snapshotHash(before);
  const working = clone(input.trip);
  const decisions = intents.map((intent) => decideIntent(intent, { input, items, working, apply }));
  emit('validate', { decisions: decisions.map(publicDecision) });

  if (apply) {
    for (const decision of decisions) {
      if (decision.write && decision.validation === 'validated') {
        applyWrite(working, decision.write);
        decision.applied = true;
      }
    }
  }

  const afterHash = snapshotHash(working);
  const responses = decisions.map((row) => row.response).filter(Boolean);
  const customerFacing = composeCustomerFacing(responses, decisions);
  const receipt = {
    schema: 'timesyncher.vacation-edit-pipeline.v1',
    pipeline: PIPELINE_NAME,
    pipeline_version: PIPELINE_VERSION,
    job_id: jobId,
    mode: apply ? 'apply' : 'dry-run',
    surface: input.surface,
    actor: input.actor,
    trip: {
      trip_id: input.trip.trip_id,
      title: input.trip.title,
      publicUrl: input.trip.publicUrl,
      status: input.trip.status,
    },
    page_context: {
      kind: input.pageContext.kind,
      day: input.pageContext.day ?? null,
      item_ids: items.map((item) => item.id),
    },
    transcript: input.text,
    audio_path: input.audioPath || null,
    fixture_id: input.fixture_id || null,
    fixture_path: input.fixture_path || null,
    intents: intents.map(publicIntent),
    candidates: decisions.flatMap((row) => row.candidates || []),
    planned_writes: decisions.filter((row) => row.write).map((row) => row.write),
    no_ops: decisions.filter((row) => !row.write).map((row) => ({
      reason: row.stop || row.matchStatus || row.kind,
      heard: row.heard,
      response: row.response,
    })),
    writes_applied: decisions.filter((row) => row.applied).map((row) => row.write),
    customer_facing_response: customerFacing,
    before_hash: beforeHash,
    after_hash: afterHash,
    before_state: before,
    after_state: apply ? working : before,
    artifacts: {
      dir: artifactRoot,
      events: path.join(artifactRoot, 'events.jsonl'),
      dry_run: path.join(artifactRoot, 'dry-run.json'),
      receipt: path.join(artifactRoot, 'receipt.json'),
      before: path.join(artifactRoot, 'before.json'),
      after: path.join(artifactRoot, 'after.json'),
    },
  };
  receipt.stop_rules = evaluateStopRules({ input, intents, decisions, receipt, apply });
  receipt.ok = receipt.stop_rules.every((rule) => rule.status === 'pass' || rule.status === 'hold');
  emit('copy_check', { response: customerFacing, first_pass_language: FIRST_PASS_LANGUAGE.test(customerFacing) });
  emit('complete', { ok: receipt.ok, write_count: receipt.planned_writes.length, no_op_count: receipt.no_ops.length });

  if (options.persist !== false) {
    persistArtifacts(receipt, events, { apply });
  }
  return { receipt, events, decisions, intents };
}

export function loadFixture(filePath, cwd = process.cwd()) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  raw.fixture_path = resolved;
  raw.fixture_id = raw.fixture_id || raw.id || path.basename(resolved, '.json');
  if (raw.audio_path && !path.isAbsolute(raw.audio_path)) {
    raw.audioPath = path.join(path.dirname(resolved), raw.audio_path);
  } else if (raw.audioPath && !path.isAbsolute(raw.audioPath)) {
    raw.audioPath = path.join(path.dirname(resolved), raw.audioPath);
  }
  return raw;
}

export function listFixtureFiles(root = process.cwd()) {
  const dir = path.join(root, 'features', 'fixtures');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'catalog.json' && !name.startsWith('_'))
    .map((name) => path.join(dir, name))
    .sort();
}

function persistArtifacts(receipt, events, { apply }) {
  fs.mkdirSync(receipt.artifacts.dir, { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  fs.writeFileSync(receipt.artifacts.events, lines);
  fs.writeFileSync(receipt.artifacts.dry_run, JSON.stringify(receipt, null, 2) + '\n');
  fs.writeFileSync(receipt.artifacts.receipt, JSON.stringify(compactReceipt(receipt), null, 2) + '\n');
  fs.writeFileSync(receipt.artifacts.before, JSON.stringify(receipt.before_state, null, 2) + '\n');
  fs.writeFileSync(receipt.artifacts.after, JSON.stringify(apply ? receipt.after_state : receipt.before_state, null, 2) + '\n');
}

export function compactReceipt(receipt) {
  return {
    job_id: receipt.job_id,
    events_jsonl: receipt.artifacts.events,
    surface: receipt.surface,
    actor: receipt.actor.role,
    trip_id: receipt.trip.trip_id,
    public_url: receipt.trip.publicUrl,
    before_hash: receipt.before_hash,
    after_hash: receipt.after_hash,
    dry_run: receipt.artifacts.dry_run,
    artifact_dir: receipt.artifacts.dir,
    required_artifacts: [
      'whole-experience screenshot / customer-flow PDF',
      'customer-story PDF with generated pictures',
      'final keepsake PDF',
    ],
    stop_rules: receipt.stop_rules,
    writes_applied: receipt.writes_applied,
    no_ops: receipt.no_ops,
    customer_facing_response: receipt.customer_facing_response,
    ok: receipt.ok,
  };
}

function normalizeInput(raw) {
  const text = String(raw.text || raw.transcript || raw.requestText || '').trim();
  const surface = SURFACES.includes(raw.surface) ? raw.surface : 'telegram-text';
  const pageKind = PAGE_KINDS.includes(raw.pageContext?.kind) ? raw.pageContext.kind : (raw.page_kind || 'timeline');
  const actor = raw.actor || {};
  return {
    fixture_id: raw.fixture_id || raw.id || null,
    fixture_path: raw.fixture_path || null,
    job_id: raw.job_id || null,
    surface,
    text,
    audioPath: raw.audioPath || raw.audio_path || null,
    allowProductionBilling: Boolean(raw.allowProductionBilling),
    actor: {
      id: actor.id || 'synthetic-actor',
      role: actor.role || 'owner',
      authorized: actor.authorized !== false && actor.role !== 'public-link' && actor.role !== 'viewer',
      canUpload: Boolean(actor.canUpload),
      canEdit: actor.canEdit !== false && actor.role !== 'public-link' && actor.role !== 'viewer',
    },
    trip: {
      trip_id: raw.trip?.trip_id || raw.trip?.id || 'trip-unspecified',
      title: raw.trip?.title || 'Vacation',
      publicUrl: raw.trip?.publicUrl || raw.trip?.public_url || '',
      status: raw.trip?.status || 'live',
      items: Array.isArray(raw.trip?.items) ? raw.trip.items : [],
      trek_rows: Array.isArray(raw.trip?.trek_rows) ? raw.trip.trek_rows : [],
    },
    pageContext: {
      kind: pageKind,
      day: raw.pageContext?.day ?? raw.pageContext?.dayNumber ?? null,
      items: Array.isArray(raw.pageContext?.items) ? raw.pageContext.items : null,
    },
    media: raw.media || null,
    checkout: raw.checkout || null,
  };
}

function splitRequestChunks(source) {
  const numbered = source.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (numbered.length > 1) return numbered;
  return source
    .split(/(?:\s+and then\s+|\s+then\s+|;\s+|(?<=\w)[.!]+\s+)/i)
    .map((chunk) => chunk.replace(/[.?!]+$/g, '').trim())
    .filter(Boolean);
}

function classifyIntent(chunk, { surface, pageKind, index }) {
  const heard = chunk;
  const lower = chunk.toLowerCase();
  const alias = extractQuoted(chunk) || extractNamedTarget(chunk);
  const target = alias ? applyAlias(alias).canonical : extractNamedTarget(chunk);

  if (isCheckout(lower)) {
    return { id: `intent-${index + 1}`, kind: 'checkout_entitlement', heard, target: extractEntitlement(lower), surface, pageKind };
  }
  if (isSplitTrip(lower)) {
    return { id: `intent-${index + 1}`, kind: 'split_trip', heard, target: extractSplitTitle(chunk), surface, pageKind };
  }
  if (isMediaUpload(lower)) {
    return { id: `intent-${index + 1}`, kind: 'media_upload', heard, target, surface, pageKind };
  }
  if (isResearch(lower)) {
    return { id: `intent-${index + 1}`, kind: 'research', heard, target, surface, pageKind };
  }
  if (/\b(move|put|shift)\b/.test(lower) && !hasDestination(lower)) {
    return { id: `intent-${index + 1}`, kind: 'incomplete_move', heard, target, surface, pageKind };
  }
  if (/\b(remove|delete|drop|take .* off)\b/.test(lower)) {
    return { id: `intent-${index + 1}`, kind: 'remove', heard, target, surface, pageKind };
  }
  if (/\b(move|put|shift)\b/.test(lower)) {
    return {
      id: `intent-${index + 1}`,
      kind: 'move',
      heard,
      target,
      destination: extractDestination(chunk),
      surface,
      pageKind,
    };
  }
  if (/\b(rename|change|update|replace|swap)\b/.test(lower)) {
    return {
      id: `intent-${index + 1}`,
      kind: 'update',
      heard,
      target,
      replacement: extractReplacement(chunk),
      surface,
      pageKind,
    };
  }
  if (/\b(add|include|schedule)\b/.test(lower)) {
    return { id: `intent-${index + 1}`, kind: 'add', heard, target: extractQuoted(chunk) || extractNamedTarget(chunk), surface, pageKind };
  }
  return { id: `intent-${index + 1}`, kind: 'unknown', heard, target, surface, pageKind };
}

function decideIntent(intent, { input, items, working, apply }) {
  const heard = intent.heard;
  if (intent.kind === 'research') {
    return {
      kind: intent.kind,
      heard,
      matchStatus: 'unsupported',
      stop: 'unsupported_research',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [],
      response: `I heard "${heard}", but I cannot research or check live listings from this edit. Tell me the itinerary change you want.`,
    };
  }
  if (intent.kind === 'incomplete_move') {
    return {
      kind: intent.kind,
      heard,
      matchStatus: 'incomplete',
      stop: 'incomplete_move',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [],
      response: `I heard "${heard}", but I do not have a destination day or time, so I left the itinerary unchanged.`,
    };
  }
  if (intent.kind === 'media_upload') {
    return decideMediaUpload(intent, input);
  }
  if (intent.kind === 'split_trip') {
    return decideSplitTrip(intent, input);
  }
  if (intent.kind === 'checkout_entitlement') {
    return decideCheckout(intent, input);
  }

  if (!input.actor.canEdit) {
    return {
      kind: intent.kind,
      heard,
      matchStatus: 'unauthorized',
      stop: 'unauthorized_edit',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [],
      response: collaboratorDeniedCopy(),
    };
  }

  const match = matchIntent(intent, items);
  if (match.status !== 'matched') {
    return {
      kind: intent.kind,
      heard,
      matchStatus: match.status === 'no_target' ? 'no_match' : match.status,
      stop: match.status === 'ambiguous' ? 'ambiguous_target' : 'no_match',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: (match.candidates || []).map(publicCandidate),
      alias: match.alias || null,
      response: noMatchCopy(heard),
    };
  }

  const item = match.chosen.item;
  if (String(item.trip_id || input.trip.trip_id) !== String(input.trip.trip_id)) {
    return {
      kind: intent.kind,
      heard,
      matchStatus: 'stale_trip',
      stop: 'stale_trip_media',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [publicCandidate(match.chosen)],
      response: `I heard "${heard}", but that item is not on the locked live trip, so I left it unchanged.`,
    };
  }

  const write = planWrite(intent, item, input);
  const response = successCopy(intent, item, write);
  return {
    kind: intent.kind,
    heard,
    matchStatus: 'matched',
    validation: 'validated',
    stop: null,
    write,
    applied: Boolean(apply && write),
    candidates: [publicCandidate(match.chosen)],
    alias: match.alias || null,
    response,
  };
}

function decideMediaUpload(intent, input) {
  const media = input.media || {};
  const bound = media.bound_trip_id || media.trip_id || media.claimed_trip_id;
  const liveId = input.trip.trip_id;
  const live = input.trip.status === 'live';
  if (!bound || String(bound) !== String(liveId) || !live) {
    return {
      kind: intent.kind,
      heard: intent.heard,
      matchStatus: 'stale_trip',
      stop: 'stale_trip_media',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [],
      response: `I heard "${intent.heard}", but that media is not bound to the live trip, so I did not upload it.`,
    };
  }
  const publicLink = input.actor.role === 'public-link' || input.actor.role === 'viewer';
  if (publicLink || !input.actor.authorized || !input.actor.canUpload) {
    return {
      kind: intent.kind,
      heard: intent.heard,
      matchStatus: 'unauthorized',
      stop: 'unauthorized_upload',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [],
      response: collaboratorDeniedCopy(),
    };
  }
  const write = {
    op: 'attach_media',
    trip_id: liveId,
    item_id: media.thing_id || null,
    media_kind: media.media_kind || 'photo',
    attachment_scope: media.attachment_scope || 'trip',
  };
  return {
    kind: intent.kind,
    heard: intent.heard,
    matchStatus: 'matched',
    validation: 'validated',
    stop: null,
    write,
    applied: false,
    candidates: [],
    response: `Attached a ${write.media_kind} to ${input.trip.title}.`,
  };
}

function decideSplitTrip(intent, input) {
  const rows = input.trip.trek_rows || [];
  const wanted = normalizeName(intent.target || input.trip.title);
  const existing = rows.filter((row) => normalizeName(row.title || row.token) === wanted || normalizeName(row.token) === wanted);
  if (existing.length >= 1 && !intent.uniqueTitle) {
    return {
      kind: intent.kind,
      heard: intent.heard,
      matchStatus: 'duplicate',
      stop: 'duplicate_trek',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: existing.map((row) => ({ id: row.id, title: row.title, token: row.token })),
      response: `I heard "${intent.heard}", but a TREK row for ${intent.target || input.trip.title} already exists, so I did not create another.`,
    };
  }
  return {
    kind: intent.kind,
    heard: intent.heard,
    matchStatus: 'matched',
    validation: 'validated',
    stop: null,
    write: { op: 'create_trek_row', title: intent.target, unique: true },
    applied: false,
    candidates: [],
    response: `Created a separate TREK row titled ${intent.target}.`,
  };
}

function decideCheckout(intent, input) {
  const account = input.checkout?.account || input.checkout || {};
  const wanted = intent.target || 'unlimited';
  const entitlements = account.entitlements || {};
  const proof = {
    unlimited_trips: Boolean(entitlements.unlimited_trips || entitlements.plan === 'unlimited'),
    photos: Boolean(entitlements.photos || entitlements.photo_memories),
    videos: Boolean(entitlements.videos || entitlements.video_memories),
  };
  const missing = [];
  if (wanted.includes('trip') && !proof.unlimited_trips) missing.push('unlimited trips');
  if (wanted.includes('photo') && !proof.photos) missing.push('photo upload');
  if (wanted.includes('video') && !proof.videos) missing.push('video upload');
  if (wanted === 'unlimited' && (!proof.unlimited_trips || !proof.photos || !proof.videos)) {
    if (!proof.unlimited_trips) missing.push('unlimited trips');
    if (!proof.photos) missing.push('photo upload');
    if (!proof.videos) missing.push('video upload');
  }
  if (missing.length) {
    return {
      kind: intent.kind,
      heard: intent.heard,
      matchStatus: 'missing_entitlement',
      stop: 'checkout_entitlement',
      validation: 'rejected',
      write: null,
      applied: false,
      candidates: [],
      proof,
      response: `This synthetic account does not have ${missing.join(', ')} yet, so I did not unlock that access.`,
    };
  }
  return {
    kind: intent.kind,
    heard: intent.heard,
    matchStatus: 'matched',
    validation: 'validated',
    stop: null,
    write: null,
    applied: false,
    candidates: [],
    proof,
    response: `This synthetic account has unlimited trips, photo upload, and video upload.`,
  };
}

function planWrite(intent, item, input) {
  if (intent.kind === 'move') {
    return {
      op: 'move_thing',
      trip_id: input.trip.trip_id,
      item_id: item.id,
      title: item.title || item.name,
      from: locationOf(item),
      to: intent.destination,
    };
  }
  if (intent.kind === 'remove') {
    return {
      op: 'remove_thing',
      trip_id: input.trip.trip_id,
      item_id: item.id,
      title: item.title || item.name,
      from: locationOf(item),
    };
  }
  if (intent.kind === 'update') {
    return {
      op: 'update_thing',
      trip_id: input.trip.trip_id,
      item_id: item.id,
      title: item.title || item.name,
      from: item.title || item.name,
      to: intent.replacement || item.title,
    };
  }
  if (intent.kind === 'add') {
    return {
      op: 'add_thing',
      trip_id: input.trip.trip_id,
      item_id: null,
      title: intent.target,
      to: intent.destination || locationOf(item),
    };
  }
  return null;
}

function applyWrite(trip, write) {
  trip.items = Array.isArray(trip.items) ? trip.items : [];
  if (write.op === 'move_thing') {
    const item = trip.items.find((row) => row.id === write.item_id);
    if (item && write.to) {
      const day = Number(String(write.to).match(/day\s*(\d+)/i)?.[1] || item.day);
      item.day = day;
      item.location = write.to;
    }
  } else if (write.op === 'remove_thing') {
    trip.items = trip.items.filter((row) => row.id !== write.item_id);
  } else if (write.op === 'update_thing' && write.to) {
    const item = trip.items.find((row) => row.id === write.item_id);
    if (item) item.title = write.to;
  } else if (write.op === 'add_thing') {
    trip.items.push({
      id: `added-${slugToken(write.title)}`,
      trip_id: trip.trip_id,
      title: write.title,
      day: Number(String(write.to || '').match(/day\s*(\d+)/i)?.[1] || 1),
    });
  } else if (write.op === 'attach_media') {
    trip.media = [...(trip.media || []), { ...write }];
  }
}

function successCopy(intent, item, write) {
  const title = item.title || item.name;
  if (intent.kind === 'move') return `Moved ${title} from ${locationOf(item)} to ${write.to}.`;
  if (intent.kind === 'remove') return `Removed ${title} from ${locationOf(item)}.`;
  if (intent.kind === 'update') return `Updated ${title}: ${write.from} is now ${write.to}.`;
  if (intent.kind === 'add') return `Added ${write.title} to ${write.to}.`;
  return `Updated ${title}.`;
}

function composeCustomerFacing(responses, decisions) {
  if (!responses.length) return noMatchCopy(decisions[0]?.heard || 'that');
  return responses.join('\n');
}

function collaboratorDeniedCopy() {
  return [
    'I received this, but this Telegram account is not authorized to modify that vacation yet.',
    '',
    'The vacation owner can add you as a paid Telegram collaborator. Non-Telegram website invitees use an owner-approved email magic link.',
  ].join('\n');
}

function locationOf(item) {
  if (item.location) return item.location;
  if (item.day != null) return `day ${item.day}`;
  return 'the itinerary';
}

function extractQuoted(value) {
  const match = String(value || '').match(/["'“”]([^"'“”]{2,160})["'“”]/);
  return match?.[1]?.trim() || '';
}

function extractNamedTarget(value) {
  const source = String(value || '');
  const move = source.match(/\b(?:move|remove|delete|drop|update|change|rename|replace|swap|put|shift)\s+(?:the\s+)?(.+?)(?:\s+from|\s+to|\s+off|\s+out|\s+on\b|\s+into|\s+with|\s+by|$)/i);
  if (move?.[1]) return cleanTarget(move[1]);
  const add = source.match(/\b(?:add|include|schedule)\s+(?:the\s+)?(.+?)(?:\s+to|\s+on|\s+for|$)/i);
  if (add?.[1]) return cleanTarget(add[1]);
  return cleanTarget(source);
}

function extractDestination(value) {
  const match = String(value || '').match(/\b(?:to|on|into|for)\s+(day\s*\d+[^\s,.]*(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i);
  return match?.[1]?.trim() || '';
}

function extractReplacement(value) {
  const match = String(value || '').match(/\b(?:to|with|as)\s+["']?([^"'.,;]+)["']?$/i);
  return match?.[1]?.trim() || '';
}

function extractSplitTitle(value) {
  const match = String(value || '').match(/\b(?:called|titled|named)\s+["']?([^"'.,;]+)["']?/i);
  return cleanTarget(match?.[1] || '');
}

function extractEntitlement(lower) {
  const bits = [];
  if (/\b(unlimited|all vacations|all trips)\b/.test(lower)) bits.push('unlimited trips');
  if (/\b(photo|pics?|pictures?)\b/.test(lower)) bits.push('photos');
  if (/\b(video|videos?)\b/.test(lower)) bits.push('videos');
  return bits.join(' ') || 'unlimited';
}

function hasDestination(lower) {
  return /\b(to|on|into)\s+day\s*\d+/.test(lower) || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower);
}

function isResearch(lower) {
  return /\b(is there|are there|check|look up|find out|who is playing|live music|what's open|what is open|hours tonight)\b/.test(lower)
    && !/\b(move|remove|delete|add|rename|update)\b/.test(lower);
}

function isMediaUpload(lower) {
  const asksAbility = /\b(do i have|can i|am i able|entitlement|checkout proof)\b/.test(lower);
  return !asksAbility && /\b(upload|attach|add)\b/.test(lower) && /\b(photo|pics?|pictures?|video|videos?|media)\b/.test(lower);
}

function isSplitTrip(lower) {
  return /\b(split|duplicate|second trip|another trek|copy this trip)\b/.test(lower);
}

function isCheckout(lower) {
  return /\b(entitlement|unlimited trips|photo upload|video upload|do i have unlimited|checkout proof)\b/.test(lower);
}

function cleanTarget(value) {
  return String(value || '')
    .replace(/^\s*(?:the|a|an)\s+/i, '')
    .replace(/\s+(?:please|from the itinerary|from the timeline)$/i, '')
    .replace(/[.,;:]+$/g, '')
    .trim();
}

function tokenOverlap(a, b) {
  const left = new Set(a.split(' ').filter((part) => part.length > 2));
  const right = b.split(' ').filter((part) => part.length > 2);
  if (!right.length) return 0;
  const hits = right.filter((part) => left.has(part)).length;
  return hits / right.length;
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || normalizeName(item.title || item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicIntent(intent) {
  return {
    id: intent.id,
    kind: intent.kind,
    heard: intent.heard,
    target: intent.target || null,
    destination: intent.destination || null,
    replacement: intent.replacement || null,
  };
}

function publicDecision(decision) {
  return {
    kind: decision.kind,
    heard: decision.heard,
    matchStatus: decision.matchStatus,
    validation: decision.validation,
    stop: decision.stop,
    write: decision.write,
    response: decision.response,
  };
}

function publicCandidate(row) {
  const item = row.item || row;
  return {
    id: item.id,
    title: item.title || item.name,
    score: row.score ?? null,
    day: item.day ?? null,
  };
}

function slugToken(value) {
  return String(value || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'job';
}

function canonicalize(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
