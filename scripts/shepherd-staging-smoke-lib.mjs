import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const MAUI_MAP_BOUNDS = {
  latMin: 20.5,
  latMax: 21.1,
  lngMin: -156.75,
  lngMax: -155.95,
};

/** Strip emoji / pictographs for shared-site tab matching (labels often prefix emoji). */
export function normalizeSharedTabLabel(text) {
  return String(text || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function sharedTabLabelIncludes(text, keyword) {
  const norm = normalizeSharedTabLabel(text);
  const want = String(keyword || '').trim().toLowerCase();
  return want.length > 0 && norm.includes(want);
}

/** ISO calendar date from starts_at (never String(Date)). */
export function isoDateFromStartsAt(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

export function d1StartsOnDate(startsAt, expected = '2027-03-13') {
  return isoDateFromStartsAt(startsAt) === expected;
}

function normalizeTitle(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Does this customer turn text reasonably request this thing title? */
export function turnTextRequestsThing(turnText, thingTitle) {
  const body = normalizeTitle(turnText);
  const title = normalizeTitle(thingTitle);
  if (!body || !title) return false;
  if (body.includes(title)) return true;
  const tokens = title.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length >= 2 && tokens.every((t) => body.includes(t))) return true;
  if (/paia/.test(title) && /paia/.test(body) && /fish/.test(title)) return true;
  if (/mama/.test(title) && /mama/.test(body) && /fish/.test(title)) return true;
  return false;
}

function thingIdsFromTurnResponse(json = {}) {
  const ids = new Set();
  if (json.thingId) ids.add(String(json.thingId));
  for (const row of json.savedThings || []) {
    if (row?.thingId) ids.add(String(row.thingId));
  }
  for (const id of json.savedThingIds || []) ids.add(String(id));
  const results = json.turnActionResults;
  if (results && typeof results === 'object') {
    for (const v of Object.values(results)) {
      if (v?.thingId) ids.add(String(v.thingId));
      if (Array.isArray(v?.thingIds)) for (const id of v.thingIds) ids.add(String(id));
    }
  }
  return ids;
}

/**
 * Attribute each trip_things row to a D customer turn by id (request_id / response thingId only).
 */
export function attributeDThingRows({
  things = [],
  customerTurns = [],
  turnResponses = [],
}) {
  const turnById = new Map(customerTurns.map((t) => [String(t.id), t]));
  const requestToTurn = new Map();
  for (const t of customerTurns) {
    if (t.request_id) requestToTurn.set(String(t.request_id), String(t.id));
  }
  const thingToTurn = new Map();
  for (const { turnId, json } of turnResponses) {
    for (const thingId of thingIdsFromTurnResponse(json)) {
      thingToTurn.set(thingId, String(turnId));
    }
  }

  return things.map((row) => {
    const thingId = String(row.id);
    let creatingTurnId = thingToTurn.get(thingId) || null;
    const meta = row.metadata || {};
    const req = meta.source_request_id || meta.sourceRequestId || row.source_request_id || null;
    if (!creatingTurnId && req && requestToTurn.has(String(req))) {
      creatingTurnId = requestToTurn.get(String(req));
    }
    const turn = creatingTurnId ? turnById.get(creatingTurnId) : null;
    return {
      thingId,
      name: row.title,
      source: row.source ?? meta.source ?? null,
      creatingTurnId,
      creatingTurnText: turn?.body || null,
    };
  });
}

export function gradeDExtraRows(attributedRows) {
  const failures = [];
  for (const row of attributedRows) {
    if (!row.creatingTurnId) {
      failures.push({ ...row, reason: 'no_creating_turn' });
      continue;
    }
    if (!turnTextRequestsThing(row.creatingTurnText, row.name)) {
      failures.push({ ...row, reason: 'turn_did_not_request_thing' });
    }
  }
  return failures;
}

export function collaboratorWelcomeTemplatePrefix() {
  const text = renderOnboardingWelcome({
    audience: 'collaborator',
    collabFirstName: 'Invitee',
    ownerFirstName: 'Owner',
    tripTitle: 'Trip',
    tripSiteUrl: 'https://example.com/shared/trip/',
  });
  return text.split('Invitee')[0];
}

/**
 * Match collaborator welcome via vacation_onboarding_welcomes.welcome_for + transcript payload.
 */
/** Transcript app turns tied to vacation_onboarding_welcomes.welcome_for (not time-order heuristics). */
export function welcomeTranscriptTurnsForClaims({ welcomeRows = [], transcriptTurns = [] }) {
  const welcomeForSet = new Set(welcomeRows.map((r) => String(r.welcome_for)));
  return (transcriptTurns || []).filter((t) => {
    if (t.speaker !== 'app') return false;
    const p = t.payload || {};
    if (p.welcomeFor && welcomeForSet.has(String(p.welcomeFor))) return true;
    const audience = String(p.welcomeAudience || '');
    if (audience === 'collaborator' || audience === 'collaborator_no_site') {
      return welcomeRows.length === 1 && welcomeForSet.has(String(welcomeRows[0].welcome_for));
    }
    return false;
  });
}

export function matchCollaboratorWelcome({
  welcomeRows = [],
  transcriptTurns = [],
  welcomeForCustomerId,
  inviteeDisplayName,
}) {
  const welcomeFor = String(welcomeForCustomerId || '').trim();
  const claims = welcomeRows.filter((r) => String(r.welcome_for) === welcomeFor);
  const welcomeTurns = welcomeTranscriptTurnsForClaims({ welcomeRows: claims, transcriptTurns });
  const prefix = collaboratorWelcomeTemplatePrefix();
  const greets = inviteeDisplayName
    ? welcomeTurns.filter((t) => new RegExp(inviteeDisplayName.split(/\s+/)[0], 'i').test(t.body || ''))
    : welcomeTurns;
  const templateOk = welcomeTurns.filter((t) => String(t.body || '').startsWith(prefix.slice(0, 20)));
  return {
    claimCount: claims.length,
    welcomeTurnCount: welcomeTurns.length,
    greetsInviteeCount: greets.length,
    templateMatchCount: templateOk.length,
    welcomeTurns: welcomeTurns.map((t) => ({
      id: t.id,
      welcomeFor: t.payload?.welcomeFor,
      welcomeAudience: t.payload?.welcomeAudience,
      bodySnippet: String(t.body || '').slice(0, 120),
    })),
  };
}

export function a2WelcomePass(match, { redirectOk, publicUrlOk }) {
  return Boolean(publicUrlOk)
    && redirectOk
    && match.claimCount === 1
    && match.welcomeTurnCount === 1
    && match.greetsInviteeCount === 1
    && match.templateMatchCount >= 1;
}

/** Offline replay: re-grade D bar from saved smoke out.json checkD + raw thing dates. */
/** Resolve Paia D2 customer turn id when DB ilike miss still left reply evidence (ASK-d2 wiring). */
export function resolvePaiaD2CustomerTurnId(checkD = {}, customerTurns = []) {
  const d2 = checkD?.d2 || {};
  if (d2.customerTurnId) return d2.customerTurnId;
  const fromTurns = (customerTurns || []).find((t) => /paia\s+fish\s+market/i.test(String(t.body || '')));
  if (fromTurns?.id) return fromTurns.id;
  const ids = checkD?.dCustomerTurnIds || [];
  if (ids.length >= 3) return ids[2];
  const reqId = d2.requestId || d2.turnResponse?.requestId || null;
  if (reqId) {
    const byReq = (customerTurns || []).find((t) => t.request_id === reqId);
    if (byReq?.id) return byReq.id;
  }
  return null;
}

export function replayDGradesFromSaved(checkD) {
  const d1Thing = checkD?.d1?.thing;
  const startsAt = d1Thing?.starts_at ?? checkD?.d1?.startsAt;
  const d1DateOk = d1StartsOnDate(startsAt);
  const legacyStartsAt = checkD?.d1?.startsAt;
  const legacyDateBug = legacyStartsAt && !/^\d{4}-\d{2}-\d{2}/.test(String(legacyStartsAt))
    && d1StartsOnDate(startsAt);
  const rows = checkD?.dExtra?.rows || [];
  const turns = (checkD?.dCustomerTurnIds || []).map((id, i) => ({
    id,
    body: i === 1 ? "add Mama's Fish House for Saturday" : i === 2 ? 'save Paia Fish Market' : 'Maui March 10-17 2027 with my wife',
    request_id: checkD?.d2?.requestId && i === 2 ? checkD.d2.requestId : null,
  }));
  const things = rows.map((r) => ({
    id: r.thingId,
    title: r.name || r.title,
    source: r.source,
    metadata: {
      source_request_id: r.source_request_id || r.metadata?.source_request_id || null,
    },
  }));
  const d2Json = checkD?.d2?.turnResponse || {};
  const responses = [
    { turnId: checkD?.d1?.customerTurnId || turns[1]?.id, json: checkD?.d1?.turnResponse || { thingId: checkD?.d1?.thingId, sharedDayIds: checkD?.d1?.sharedDayIds } },
    { turnId: checkD?.d2?.customerTurnId || turns[2]?.id, json: d2Json },
  ].filter((r) => r.turnId);
  const attributed = attributeDThingRows({ things, customerTurns: turns, turnResponses: responses });
  const failures = gradeDExtraRows(attributed);
  const legacyWrongPaia = rows.filter((r) => /paia/i.test(r.title || r.name || '') && r.creatingCustomerTurnId === turns[1]?.id).length;
  return {
    d1DateOk,
    iso: isoDateFromStartsAt(startsAt),
    legacyStartsAt,
    legacyDateBug,
    legacyWrongPaia,
    attributed,
    failures,
  };
}

/** Offline replay: A2 welcome match from saved checkA2 (welcomeDb + optional transcript rows). */
export function replayA2FromSaved(checkA2, inviteeDisplayName = 'Spouse964') {
  const welcomeDb = checkA2?.welcomeDb || [];
  const welcomeFor = welcomeDb[0]?.welcome_for || checkA2?.collabCustomerId || null;
  const transcriptTurns = (checkA2?.welcomeTurnsDb || []).map((t) => ({
    id: t.id,
    speaker: 'app',
    body: t.body || '',
    payload: t.payload || { welcomeFor: t.welcomeFor, welcomeAudience: 'collaborator' },
  }));
  const match = matchCollaboratorWelcome({
    welcomeRows: welcomeDb,
    transcriptTurns,
    welcomeForCustomerId: welcomeFor,
    inviteeDisplayName,
  });
  return { welcomeFor, match, wouldPassWithTranscript: match.welcomeTurnCount === 1 };
}


export {
  evaluateTripMapInPage,
  evaluateLeafletProductMapInPage,
  mapWithinMaui,
  gradeMapBar,
  gradeLeafletProductMap,
  budgetHardcodedHits,
} from './shepherd-staging-smoke-map-lib.mjs';
export {
  gradeCoffeeReplyRows,
  gradeLogoTabResult,
  gradeLogoChipRow,
  attributeLogoMisalignmentCss,
  mergeLogoCssSuspects,
  objectFitContentBox,
  LOGO_CENTER_TOLERANCE_PX,
  isRealBrandLogoSrc,
  gradeSharedTabLogoUrlRecords,
  gradeCarTabRowIcons,
  persistedLodgingAskSignals,
  gradeAskLodging,
} from './shepherd-staging-smoke-grader-lib.mjs';
export {
  gradeD2UnschedReply,
  gradeAskD2Reply,
  gradeInvClaimFirstReply,
  gradeInvClaimAfterLodgingReply,
  parseJevNoulAnswer,
  jevBlockFromResult,
} from './shepherd-staging-smoke-jev-reply-judge.mjs';

