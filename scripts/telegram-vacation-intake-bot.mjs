#!/usr/bin/env node

import { execFile, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TELEGRAM_BOT_TOKEN = process.env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || '';
const API_BASE = (process.env.TIMESYNCHER_API_BASE_URL || 'https://vacation.timesyncher.com').replace(/\/+$/, '');
const INTAKE_TOKEN = process.env.TIMESYNCHER_INTAKE_TOKEN || '';
const OPENAI_API_KEY = process.env.TIMESYNCHER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const STT_MODEL = process.env.TIMESYNCHER_STT_MODEL || 'whisper-1';
const IMAGE_SCREENSHOT_CLASSIFIER_MODEL = process.env.TIMESYNCHER_IMAGE_SCREENSHOT_CLASSIFIER_MODEL || 'gpt-4o-mini';
const OFFSET_FILE = process.env.TIMESYNCHER_TELEGRAM_OFFSET_FILE || './telegram-vacation.offset';
const INGRESS_CACHE_DIR = process.env.TIMESYNCHER_TELEGRAM_INGRESS_CACHE_DIR || './telegram-ingress-cache';
const INGRESS_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_INGRESS_RETENTION_DAYS || '30', 10));
const POLL_TIMEOUT_SECONDS = Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_POLL_TIMEOUT_SECONDS || '30', 10);
const FETCH_RETRY_ATTEMPTS = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_FETCH_RETRY_ATTEMPTS || '3', 10));
const FETCH_RETRY_BASE_MS = Math.max(50, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_FETCH_RETRY_BASE_MS || '600', 10));
const DELAYED_RETRY_MS = Math.max(1000, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_DELAYED_RETRY_MS || '60000', 10));
const WORKER_DRAIN_MODE = cleanText(process.env.TIMESYNCHER_WORKER_DRAIN_MODE || 'systemd-user', 40).toLowerCase();
const WORKER_DRAIN_SERVICE = process.env.TIMESYNCHER_WORKER_DRAIN_SERVICE || 'timesyncher-vacation-worker-drain.service';
const WORKER_DRAIN_TARGET_FILE = process.env.TIMESYNCHER_WORKER_DRAIN_TARGET_FILE || path.join(process.cwd(), 'telegram-worker-drain-target.json');
const WORKER_DRAIN_ENV_FILE = process.env.TIMESYNCHER_WORKER_DRAIN_ENV_FILE || path.join(process.cwd(), '.env.staging-worker-drain');
const WORKER_DRAIN_SCRIPT = process.env.TIMESYNCHER_WORKER_DRAIN_SCRIPT || path.join(process.cwd(), 'timestopper-worker.mjs');
const TELEGRAM_MEDIA_MAX_BYTES = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_MEDIA_MAX_BYTES || '20971520', 10));
const TREK_SHARED_API_BASE = (process.env.TIMESYNCHER_TREK_SHARED_API_BASE || 'http://127.0.0.1:3010').replace(/\/+$/, '');
const TREK_DEFAULT_SHARE_TOKEN = process.env.TIMESYNCHER_TREK_DEFAULT_SHARE_TOKEN || '';
const TREK_RUNTIME_DIR = process.env.TIMESYNCHER_TREK_RUNTIME_DIR || '/home/timesyncher-agent/trek/runtime';
const TREK_DB_PATH = process.env.TIMESYNCHER_TREK_DB_PATH || path.join(TREK_RUNTIME_DIR, 'data', 'travel.db');
const TREK_PUBLIC_BASE_URL = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://travel.timesyncher.com').replace(/\/+$/, '');
const TREK_CONTAINER = process.env.TIMESYNCHER_TREK_CONTAINER || 'trek';
const TREK_DB_OWNER = process.env.TIMESYNCHER_TREK_DB_OWNER || 'ubishere9995';
const PRODUCT_MANIFEST_PATH = process.env.TIMESYNCHER_PRODUCT_GBRAIN_MANIFEST || path.join(process.cwd(), 'product-gbrain-manifest.json');

function requireEnv() {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TIMESYNCHER_TELEGRAM_BOT_TOKEN is required.');
}

function cleanText(value, max = 12000) {
  return String(value || '').trim().slice(0, max);
}

function isWebsiteLinkRequest(value = '') {
  const normalized = cleanText(value, 1000).toLowerCase();
  if (!normalized) return false;
  const asksForLink = /\b(send|share|show|give|need|where|what|open)\b/.test(normalized) || /\?/.test(normalized);
  const mentionsWebsite = /\b(website|web site|site|link|url)\b/.test(normalized);
  const mentionsTrip = /\b(caldwell|vacation|trip|itinerary)\b/.test(normalized);
  return asksForLink && mentionsWebsite && mentionsTrip;
}

function isGenericQueuedAcknowledgement(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  return (
    normalized.includes('turning the information you sent into a hosted timesyncher vacation itinerary') ||
    normalized.includes('will send the itinerary link when the first pass is ready') ||
    normalized.includes('will send the itinerary link when the next pass is ready') ||
    normalized.includes('updating the hosted timesyncher vacation itinerary now') ||
    normalized.includes('processing the information you sent and setting up your timesyncher vacation')
  );
}

function websiteLinkQueuedAcknowledgement() {
  return [
    'I am looking up the right TimeSyncher Vacation link now.',
    '',
    'If I find one matching vacation, I will send the link here. If there is more than one match, I will ask which vacation you mean.',
  ].join('\n');
}

function isQuestionLike(value = '') {
  const normalized = cleanText(value, 1000).toLowerCase();
  return normalized.includes('?') || /\b(do|does|can|could|will|would|what|when|where|why|how|am i|are we|is there|did i|have i)\b/.test(normalized);
}

function isNewVacationAdviceQuestion(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  if (!normalized || !isQuestionLike(normalized)) return false;
  const asksForAdvice = /\b(should i|should we|what should i do|what do i do|do i need to|am i supposed to|is the current one|is my current|did the current|was the current)\b/.test(normalized);
  const mentionsNewVacation = /\b(start|create|make|build|plan|set up|setup)\b/.test(normalized)
    && /\b(new|brand new|fresh|another|separate|next)\b/.test(normalized)
    && /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(normalized);
  const mentionsMetaState = /\b(staging bot|vacation bot|bot|current one|current vacation|current trip|deleted|still there|already exists|should i test)\b/.test(normalized);
  return asksForAdvice && (mentionsNewVacation || mentionsMetaState);
}

function isVagueNextStepQuestion(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || !isQuestionLike(normalized)) return false;
  if (isWebsiteLinkRequest(normalized)) return false;
  return /\b(now what|what next|what should i do now|what do i do now|what should i send|what should i send you|what do you need from me|what else do you need|how should i proceed)\b/.test(normalized);
}


function isVacationExistenceQuestion(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || !isQuestionLike(normalized)) return false;
  const mentionsVacation = /\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(normalized);
  if (!mentionsVacation) return false;
  return /\b(is there|are there|do we have|do i have|did we create|did i create|is my|is our|does .* exist|already exists|still there)\b/.test(normalized);
}


function isPersonAccessQuestion(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/\bfamily event\b/.test(normalized)) return false;
  if (/\/shared\/[^/?#\s]+/i.test(normalized) && /\b(update|change|edit|add|remove|delete|rename|move|make)\b/.test(normalized)) return false;
  const mentionsAccess = /\b(access|permission|permissions|edit rights?|view rights?|member|collaborator|collaborate|share|shared|see|view|look at|edit|modify|change|interact|add|invite|link|add\s+(?:pics?|photos?|videos?|media)|upload)\b/.test(normalized);
  const mentionsPerson = /\b(kim|wife|husband|spouse|partner|she|he|family|friend|assistant|collaborator|member)\b/.test(normalized);
  const mentionsVacationContext = /\b(this|that|vegas|las vegas|strip|jockey club|vacation|trip|itinerary|website|site|telegram|collaborator)\b/.test(normalized);
  return mentionsAccess && mentionsPerson && mentionsVacationContext;
}

function vacationLookupTerm(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(vegas|las vegas|strip|jockey club)\b/.test(normalized)) return 'Las Vegas';
  if (/\b(hawaii|oahu|waikiki|maui|kona|big island)\b/.test(normalized)) return 'Hawaii';
  if (isPersonAccessQuestion(normalized) && !/\b(vacation|trip|itinerary|staycation|travel plan)\b/.test(normalized)) return '';
  const match = normalized.match(/\b(?:is there|are there|do we have|do i have|did we create|did i create|is my|is our)\s+(?:a|an|the|any)?\s*([a-z][a-z0-9 .'-]{2,80}?)(?:\s+(?:vacation|trip|itinerary|staycation|travel plan)\b|[?!.]|$)/i);
  return cleanText(match?.[1] || '', 120);
}

function publicVacationUrlFromToken(token = '') {
  const cleanToken = cleanText(token, 180);
  return cleanToken ? `${TREK_PUBLIC_BASE_URL}/shared/${encodeURIComponent(cleanToken)}/` : '';
}

function findAccessibleVacationMatchesForQuestion(value = '') {
  const lookup = vacationLookupTerm(value);
  const allowSingleVacationFallback = !lookup && (isPersonAccessQuestion(value) || isWebsiteLinkRequest(value));
  if (!lookup && !allowSingleVacationFallback) return [];
  const script = `
import json, sqlite3, sys
db_path, lookup, public_base = sys.argv[1], sys.argv[2].lower(), sys.argv[3].rstrip("/")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
rows = []
if lookup:
    terms = [lookup]
    if "vegas" in lookup or "las vegas" in lookup:
        terms += ["vegas", "las vegas", "strip", "jockey club"]
    if "hawaii" in lookup:
        terms += ["hawaii", "oahu", "waikiki", "maui", "kona", "big island"]
    terms = ["%" + term + "%" for term in dict.fromkeys(terms) if term]
    for term in terms:
        rows.extend(conn.execute("""
        select t.id, t.title, t.description, t.start_date, t.end_date, t.created_at,
               st.token, st.share_collab, st.share_map, st.share_bookings, st.share_packing, st.share_budget
          from trips t
          join share_tokens st on st.trip_id = t.id
         where lower(ifnull(t.title, '')) like ?
            or lower(ifnull(t.description, '')) like ?
            or lower(ifnull(st.token, '')) like ?
         order by datetime(t.created_at) desc, t.id desc
         limit 20
        """, (term, term, term)).fetchall())
else:
    rows = conn.execute("""
        select t.id, t.title, t.description, t.start_date, t.end_date, t.created_at,
               st.token, st.share_collab, st.share_map, st.share_bookings, st.share_packing, st.share_budget
          from trips t
          join share_tokens st on st.trip_id = t.id
         order by datetime(t.created_at) desc, t.id desc
         limit 6
    """).fetchall()
seen = set()
out = []
for row in rows:
    key = row["id"]
    if key in seen:
        continue
    seen.add(key)
    token = row["token"] or ""
    members = [dict(member) for member in conn.execute("""
        select u.id, u.username, u.email, u.role
          from trip_members tm
          join users u on u.id = tm.user_id
         where tm.trip_id = ?
         order by u.id
    """, (row["id"],)).fetchall()]
    out.append({
        "id": row["id"],
        "name": row["title"] or "Vacation",
        "title": row["title"] or "Vacation",
        "destination": lookup.title() if lookup else "",
        "shareToken": token,
        "url": public_base + "/shared/" + token + "/" if token else "",
        "createdAt": row["created_at"],
        "startDate": row["start_date"],
        "endDate": row["end_date"],
        "shareCollab": bool(row["share_collab"]),
        "shareMap": bool(row["share_map"]),
        "shareBookings": bool(row["share_bookings"]),
        "sharePacking": bool(row["share_packing"]),
        "shareBudget": bool(row["share_budget"]),
        "members": members,
        "webEditorInvites": [],
        "source": "trek_accessible_vacation_lookup"
    })
if not lookup and len(out) != 1:
    out = []
print(json.dumps(out[:5]))
`;
  try {
    const result = spawnSync('python3', ['-c', script, TREK_DB_PATH, lookup, TREK_PUBLIC_BASE_URL], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) {
      console.error(`[${new Date().toISOString()}] TREK vacation lookup failed: ${cleanText(result.stderr || result.stdout, 500)}`);
      return [];
    }
    const parsed = JSON.parse(result.stdout || '[]');
    return Array.isArray(parsed) ? parsed.filter((vacation) => vacation && typeof vacation === 'object') : [];
  } catch (error) {
    console.error(`[${new Date().toISOString()}] TREK vacation lookup failed: ${error.message}`);
    return [];
  }
}

function configuredWebEditorInviteForPerson(person = '') {
  const label = cleanText(person, 120).toLowerCase();
  const wifeName = cleanText(process.env.TIMESYNCHER_CUSTOMER_WIFE_DISPLAY_NAME, 120).toLowerCase();
  if (!label || !wifeName || label !== wifeName) return null;
  const status = cleanText(process.env.TIMESYNCHER_CUSTOMER_WIFE_WEB_EDITOR_INVITE_STATUS, 80).toLowerCase();
  if (!['sent', 'invited', 'pending', 'accepted', 'active'].includes(status)) return null;
  return {
    name: process.env.TIMESYNCHER_CUSTOMER_WIFE_DISPLAY_NAME,
    email: cleanText(process.env.TIMESYNCHER_CUSTOMER_WIFE_EMAIL, 220),
    role: 'web_editor',
    status,
  };
}

function webEditorInviteStateForPerson(match = {}, person = '') {
  const personNeedle = cleanText(person, 120).toLowerCase();
  const inviteLists = [
    ...(Array.isArray(match.webEditorInvites) ? match.webEditorInvites : []),
    ...(Array.isArray(match.web_editor_invites) ? match.web_editor_invites : []),
    ...(Array.isArray(match.editorInvites) ? match.editorInvites : []),
    ...(Array.isArray(match.editor_invites) ? match.editor_invites : []),
    ...(Array.isArray(match.invites) ? match.invites : []),
    ...(Array.isArray(match.invitees) ? match.invitees : []),
    ...(Array.isArray(match.accessGrants) ? match.accessGrants : []),
    ...(Array.isArray(match.access_grants) ? match.access_grants : []),
  ];
  const configured = configuredWebEditorInviteForPerson(person);
  if (configured) inviteLists.push(configured);
  const invite = inviteLists.find((entry = {}) => {
    const role = cleanText(entry.role || entry.access || entry.kind, 80).toLowerCase();
    if (role && !role.includes('web') && !role.includes('editor')) return false;
    const haystack = [
      entry.name,
      entry.displayName,
      entry.display_name,
      entry.email,
      entry.status,
    ].map((value) => cleanText(value, 180).toLowerCase()).join(' ');
    return personNeedle && haystack.includes(personNeedle);
  });
  if (!invite) return '';
  const status = cleanText(invite.status || invite.state, 80).toLowerCase();
  if (['sent', 'invited', 'pending'].includes(status)) return 'sent';
  if (['accepted', 'active'].includes(status)) return 'accepted';
  return '';
}

function vacationExistenceAnswerFromMatches(value = '', matches = []) {
  if (!matches.length) return '';
  const latest = matches[0] || {};
  const label = cleanText(latest.title || latest.name || vacationLookupTerm(value) || 'that vacation', 160);
  const url = cleanText(latest.url || publicVacationUrlFromToken(latest.shareToken), 500);
  if (isWebsiteLinkRequest(value)) {
    return `Yes, I found ${label}. I am preparing the Telegram access link for this account.`;
  }
  if (matches.length === 1) {
    return url ? `Yes, I found ${label}. Here is the website: ${url}` : `Yes, I found ${label}.`;
  }
  return url
    ? `Yes, I found ${label}. Here is the latest website I can access: ${url}`
    : `Yes, I found ${label}.`;
}

function loadProductManifest() {
  try {
    return JSON.parse(fs.readFileSync(PRODUCT_MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function accessPersonLabel(value = '') {
  const normalized = cleanText(value, 2000);
  if (/\bkim\b/i.test(normalized)) return 'Kim';
  if (/\bwife\b/i.test(normalized)) return 'your wife';
  if (/\bhusband\b/i.test(normalized)) return 'your husband';
  if (/\bspouse\b/i.test(normalized)) return 'your spouse';
  if (/\bfamily\b/i.test(normalized)) return 'your family';
  if (/\bassistant\b/i.test(normalized)) return 'your assistant';
  const named = normalized.match(/\b([A-Z][a-z]{2,24})\b/);
  return cleanText(named?.[1] || 'that person', 80);
}

function accessPersonCustomerLabel(person = '', requestText = '') {
  const configuredWifeName = cleanText(process.env.TIMESYNCHER_CUSTOMER_WIFE_DISPLAY_NAME || process.env.TIMESYNCHER_PRIMARY_SPOUSE_NAME, 80);
  if (person === 'your wife' && configuredWifeName) return configuredWifeName;
  if (person === 'your wife' && /\bkim\b/i.test(requestText)) return 'Kim';
  return cleanText(person || 'that person', 120);
}

function accessCapabilitiesRequested(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  const caps = new Set();
  if (/\b(photo|photos|picture|pictures|pic|pics|video|videos|media|upload|uploads|add .*media|add .*photo|add .*video)\b/.test(normalized)) caps.add('media_upload');
  if (/\b(telegram|bot|message|chat|talk to|text|modify|change|edit|add to|interact|upload|uploads|photo|photos|video|videos|media)\b/.test(normalized)) caps.add('collab_telegram');
  if (/\b(website|site|web|web page|shared link|link|view|see|look at|open)\b/.test(normalized)) caps.add('view_shared');
  if (/\b(web collab|website collab|collaborate on the website|collaborate on the web page|comment on the shared website|comment on the website|edit the website|edit the web page|modify the website|modify the web page)\b/.test(normalized) || (/\b(collaborate|comment|edit|modify|change)\b/.test(normalized) && /\b(website|web page|site|web)\b/.test(normalized))) caps.add('collab_web');
  if (!caps.size) caps.add('collab_telegram');
  return [...caps];
}

function isTelegramCollaboratorStatusQuestion(value = '') {
  const normalized = cleanText(value, 1200).toLowerCase();
  if (!/\btelegram\b/.test(normalized) || !/\bcollaborator\b/.test(normalized)) return false;
  if (!/\b(already|currently|now|is|are|listed|status)\b/.test(normalized)) return false;
  if (/\b(can|could|may|able|allow|let|add|invite|make|give|grant|buy|purchase|cost|price|upload|photo|photos|video|videos|website|web page|site)\b/.test(normalized)) return false;
  return true;
}

function memberMatchesAccessPerson(member = {}, person = '') {
  const needle = cleanText(person, 80).toLowerCase();
  const haystack = [
    member.username,
    member.email,
    member.name,
    member.displayName,
    member.role,
  ].map((value) => cleanText(value, 160).toLowerCase()).join(' ');
  return Boolean(needle && haystack.includes(needle));
}

function bridgeCustomerCopyLooksSafe(answer = '', facts = {}) {
  const source = cleanText(answer, 2400);
  if (!source || source.length > 900) return false;
  if (/\b(TREK|GBrain|research workspace|worker|capability gate|public research pass|sqlite|Traceback|\/home\/|database|router|no-write|deterministic|schema|fact packet|could not verify|matching vacation|linked vacation)\b/i.test(source)) return false;
  const lower = source.toLowerCase();
  const person = cleanText(facts.person_name, 120);
  const label = cleanText(facts.vacation_name, 180);
  if (person && person !== 'that person' && !lower.includes(person.toLowerCase())) return false;
  if (label && !lower.includes(label.toLowerCase())) return false;
  if (facts.telegram_collaborator === false && !/^\s*no\b/i.test(source)) return false;
  if (facts.telegram_collaborator === true && !/^\s*yes\b/i.test(source)) return false;
  if (facts.telegram_collaborator === false && /\b(can edit through telegram|has telegram access)\b/i.test(source) && !/\bnot\b/i.test(source)) return false;
  return true;
}

function grokBridgeCustomerRender(facts = {}) {
  if (process.env.TIMESYNCHER_GROK_RESPONSE_RENDERER_FAKE === '1') {
    const claims = Array.isArray(facts.allowed_claims) ? facts.allowed_claims : [];
    const first = facts.telegram_collaborator === false && claims[0] ? `No, ${claims[0]}` : claims[0];
    const answer = [first, claims[1], claims[2]].filter(Boolean).join(' ');
    return bridgeCustomerCopyLooksSafe(answer, facts) ? answer : '';
  }
  if (process.env.TIMESYNCHER_DISABLE_GROK_RESPONSE_RENDERER === '1') return '';
  const token = cleanText(process.env.TIMESYNCHER_GROK_ROUTER_TOKEN, 500);
  if (!token) return '';
  const host = cleanText(process.env.TIMESYNCHER_GROK_ROUTER_HOST || '127.0.0.1', 120);
  const port = cleanText(process.env.TIMESYNCHER_GROK_ROUTER_PORT || '39217', 20);
  const routePath = cleanText(process.env.TIMESYNCHER_GROK_RENDER_PATH || '/render', 80) || '/render';
  const timeoutSeconds = Math.max(1, Math.ceil(Number(process.env.TIMESYNCHER_GROK_RENDER_CLIENT_TIMEOUT_MS || process.env.TIMESYNCHER_GROK_ROUTER_CLIENT_TIMEOUT_MS || process.env.TIMESYNCHER_GROK_ROUTER_TIMEOUT_MS || 12000) / 1000));
  const url = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') + routePath : 'http://' + host + ':' + port + routePath;
  const payload = JSON.stringify({ facts });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync('/usr/bin/curl', ['-sS', '--max-time', String(timeoutSeconds), '-H', 'content-type: application/json', '-H', 'authorization: Bearer ' + token, '--data-binary', '@-', url], {
      input: payload,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.status !== 0) continue;
    try {
      const body = JSON.parse(result.stdout || '{}');
      if (body.ok === false) continue;
      const answer = cleanText(body.answer || body.reply || body.customerResponse, 1800);
      if (bridgeCustomerCopyLooksSafe(answer, facts)) return answer;
    } catch {}
  }
  return '';
}

function bridgeAccessFacts(value = '', match = {}, person = '') {
  const label = cleanText(match.title || match.name || vacationLookupTerm(value) || 'that vacation', 160);
  const url = cleanText(match.url || publicVacationUrlFromToken(match.shareToken), 500);
  const requestedCaps = accessCapabilitiesRequested(value);
  const namedMember = Array.isArray(match.members) && match.members.some((member) => memberMatchesAccessPerson(member, person));
  const telegramCollaborator = Boolean(namedMember && requestedCaps.includes('collab_telegram'));
  const inviteState = webEditorInviteStateForPerson(match, person);
  const allowedClaims = [
    telegramCollaborator
      ? `${person} is a Telegram collaborator on ${label}.`
      : `${person} is not a Telegram collaborator on ${label} yet.`,
  ];
  if (inviteState === 'sent') allowedClaims.push(`${person} has been sent a website editor invite.`);
  if (inviteState === 'accepted') allowedClaims.push(`${person} has accepted a website editor invite.`);
  allowedClaims.push('Telegram collaboration is separate from website editor access.');
  allowedClaims.push(namedMember
    ? `${person} is listed as a named member/editor on ${label}.`
    : `${person} is not listed as a named member/editor on ${label}.`);
  if (url) allowedClaims.push(`The shared vacation website is ${url}.`);
  return {
    kind: 'vacation_access_status',
    request_text: cleanText(value, 1000),
    person_name: person,
    vacation_name: label,
    vacation_url: url || '',
    requested_capabilities: requestedCaps,
    telegram_collaborator: telegramCollaborator,
    named_member_or_editor: namedMember,
    website_editor_invite: inviteState || 'unknown',
    allowed_claims: allowedClaims,
    forbidden_claims: [
      `${person} can edit through Telegram.`,
      `${person} is a collaborator.`,
      `${person} has website editor access.`,
    ],
    required_terms: [person, label],
    preferred_style: 'direct, warm, one or two short Telegram sentences',
  };
}

function bridgeAccessFallbackAnswer(value = '', match = {}, person = '') {
  if (!isTelegramCollaboratorStatusQuestion(value)) return '';
  const label = cleanText(match.title || match.name || vacationLookupTerm(value) || 'that vacation', 160);
  const requestedCaps = accessCapabilitiesRequested(value);
  const namedMember = Array.isArray(match.members) && match.members.some((member) => memberMatchesAccessPerson(member, person));
  const telegramCollaborator = Boolean(namedMember && requestedCaps.includes('collab_telegram'));
  const inviteState = webEditorInviteStateForPerson(match, person);
  if (requestedCaps.includes('collab_telegram')) {
    const lines = [
      telegramCollaborator
        ? `Yes, ${person} is a Telegram collaborator on ${label}.`
        : `No, ${person} is not a Telegram collaborator on ${label} yet.`,
    ];
    if (inviteState === 'sent') lines.push(`${person} has the website editor invite, but Telegram collaboration is separate.`);
    else lines.push('Telegram collaboration is separate from website editor access.');
    return lines.join('\n\n');
  }
  return '';
}

function checkoutBaseUrl(manifest = {}) {
  return cleanText(
    process.env.TIMESYNCHER_ACCESS_CHECKOUT_BASE_URL ||
      process.env.TIMESYNCHER_VACATION_CHECKOUT_BASE_URL ||
      manifest?.accessRemediationCatalog?.defaultCheckoutBaseUrl ||
      'https://vacation-staging.timesyncher.com',
    500,
  ).replace(/\/+$/, '');
}

function remediationLine(manifest = {}, targetCapability, { person = 'that person', label = 'this vacation' } = {}) {
  const items = Array.isArray(manifest?.accessRemediationCatalog?.items) ? manifest.accessRemediationCatalog.items : [];
  const item = items.find((candidate) => cleanText(candidate?.targetCapability, 80) === targetCapability);
  if (!item) return '';
  const actionType = cleanText(item.actionType, 80);
  const ctaLabel = cleanText(item.ctaLabel, 160) || 'Add access';
  const pathValue = cleanText(item.path, 240);
  const amount = Number(item.amountUsd || 0);
  const price = amount > 0 ? `$${amount}` : '';
  const url = pathValue ? `${checkoutBaseUrl(manifest)}${pathValue.startsWith('/') ? pathValue : `/${pathValue}`}` : '';
  if (actionType === 'owner_enable') {
    return `${ctaLabel}: ${person} is not enabled for that website editing path on ${label} yet.`;
  }
  return [
    `${ctaLabel}${price ? ` (${price})` : ''}:`,
    url,
  ].filter(Boolean).join(' ');
}

function isAccessPricingQuestion(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  if (!isQuestionLike(normalized)) return false;
  const asksPrice = /\b(how much|cost|costs|price|pricing|charge|fee|pay|purchase|buy)\b/.test(normalized);
  const accessTarget = /\b(access|full access|collaborator|collaborate|edit|editing|change|modify|telegram|photo|photos|pic|pics|video|videos|media|upload|wife|spouse|family|assistant|kim)\b/.test(normalized);
  return asksPrice && accessTarget;
}

function accessPricingAnswer(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  const manifest = loadProductManifest();
  const person = accessPersonLabel(value);
  const allVacations = /\b(all|every|unlimited|future)\b/.test(normalized) && /\b(vacations?|trips?)\b/.test(normalized);
  const wantsMedia = /\b(photo|photos|picture|pictures|pic|pics|video|videos|media|upload|uploads)\b/.test(normalized) || /\bfull access\b/.test(normalized);
  const plans = Array.isArray(manifest?.collaboratorEntitlementPolicy?.plans) ? manifest.collaboratorEntitlementPolicy.plans : [];
  const singleTrip = plans.find((plan) => cleanText(plan?.scope, 80) === 'single_trip');
  const unlimited = plans.find((plan) => cleanText(plan?.scope, 80) === 'unlimited_trips');
  const photo = manifest?.mediaAddOnPolicy?.photoMemories || {};
  const video = manifest?.mediaAddOnPolicy?.videoMemoriesRecommendation || {};
  const checkout = checkoutBaseUrl(manifest);
  const lines = [];
  if (allVacations) {
    lines.push(`For ${person}, full Telegram editing access across all of your vacations is ${unlimited?.amountUsd ? `$${unlimited.amountUsd}` : '$27'}.`);
    lines.push(`That adds one active Telegram collaborator. Add more collaborators one checkout at a time.`);
    if (wantsMedia) {
      lines.push(`Photo upload access across all vacations is ${photo.unlimitedVacationsAmountUsd ? `$${photo.unlimitedVacationsAmountUsd}` : '$9'}.`);
      lines.push(`Video upload access across all vacations is ${video.unlimitedVacationsAmountUsd ? `$${video.unlimitedVacationsAmountUsd}` : '$27'}.`);
    }
  } else {
    lines.push(`For ${person}, Telegram editing access for one vacation is ${singleTrip?.amountUsd ? `$${singleTrip.amountUsd}` : '$15'}.`);
    lines.push(`That adds one active Telegram collaborator for that vacation. Add more collaborators one checkout at a time.`);
    if (wantsMedia) {
      lines.push(`Photo upload access for one vacation is ${photo.singleVacationAmountUsd ? `$${photo.singleVacationAmountUsd}` : '$5'}.`);
      lines.push(`Video upload access for one vacation is ${video.singleVacationAmountUsd ? `$${video.singleVacationAmountUsd}` : '$17'}.`);
    }
  }
  lines.push(`Checkout link: ${checkout}/order-test.html`);
  return lines.join('\n\n');
}

function vacationAccessAnswerFromMatches(value = '', matches = []) {
  const person = accessPersonCustomerLabel(accessPersonLabel(value), value);
  if (!matches.length) {
    return [
      `I could not verify ${person}'s access to a matching vacation yet.`,
    ].join('\n');
  }
  const match = matches[0] || {};
  const label = cleanText(match.title || match.name || vacationLookupTerm(value) || 'that vacation', 160);
  const url = cleanText(match.url || publicVacationUrlFromToken(match.shareToken), 500);
  const manifest = loadProductManifest();
  const requestedCaps = accessCapabilitiesRequested(value);
  const namedMember = Array.isArray(match.members) && match.members.some((member) => memberMatchesAccessPerson(member, person));
  const modelAnswer = grokBridgeCustomerRender(bridgeAccessFacts(value, match, person));
  if (modelAnswer) return modelAnswer;
  const fallbackAnswer = bridgeAccessFallbackAnswer(value, match, person);
  if (fallbackAnswer) return fallbackAnswer;
  const lines = [];
  lines.push(namedMember
    ? `${person} is listed as a named member/editor on ${label}.`
    : `${person} is not listed as a named member/editor on ${label}.`);
  if (url) lines.push(`The vacation website itself is available to anyone with the shared link: ${url}`);
  else lines.push('I found the vacation record, but I do not have a share-link URL for it yet.');
  lines.push(match.shareCollab
    ? 'Website editing is enabled for approved sessions: the owner or paid Telegram collaborator can open from Telegram and edit; non-Telegram invitees can use an owner-approved email magic link.'
    : 'The shared website is view-only unless the owner opens from Telegram/session, the paid Telegram collaborator opens from Telegram, or the owner invites a named email user as a web editor.');
  if (requestedCaps.includes('media_upload')) {
    lines.push(`${person} is not currently enabled for photo/video uploads on ${label}.`);
  }
  if (!namedMember || requestedCaps.includes('collab_telegram')) {
    lines.push('Full Telegram editing is separate and requires paid collaborator access.');
    const line = remediationLine(manifest, 'collab_telegram', { person, label });
    if (line) lines.push(line);
  }
  if (requestedCaps.includes('media_upload')) {
    const line = remediationLine(manifest, 'media_upload', { person, label });
    if (line) lines.push(line);
  }
  if (!match.shareCollab && requestedCaps.includes('collab_web')) {
    const line = remediationLine(manifest, 'collab_web', { person, label });
    if (line) lines.push(line);
  }
  return lines.join('\n\n');
}

function noWriteDecisionFromTurn(turn = {}) {
  const candidates = [turn.supportRouterDecision, turn.support_router_decision, turn.turnDecision, turn.turn_decision, turn.routerDecision, turn.router_decision].filter(Boolean);
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const writeMode = cleanText(candidate.write_mode || candidate.writeMode, 80).toLowerCase();
    if (candidate.shouldQueueWorker === false || writeMode === 'none') return candidate;
  }
  return null;
}

function vacationDirectionClarificationCopy() {
  return 'To start a new vacation, send the destination, dates, and priorities. To update an existing vacation, tell me which vacation by name and the change you want made.';
}

function mediaCaptionLooksLikeSupportScreenshot(caption = '') {
  const normalized = cleanText(caption, 2000).toLowerCase();
  if (!normalized) return false;
  const mentionsScreenshot = /\b(screen ?shot|screenshot|screen grab|photo of (the )?(chat|response|message)|attached image)\b/.test(normalized);
  const mentionsFailure = /\b(not fixed|still broken|poor response|bad response|wrong response|issue|bug|problem|error|failed|failure|couldn'?t|cannot|can'?t handle|didn'?t analyze|saved .*photo|what should we do|what do you suggest)\b/.test(normalized);
  const mentionsBotOrSupport = /\b(bot|timesyncher|staging|response|reply|message|chat|support|debug)\b/.test(normalized);
  return (mentionsScreenshot && (mentionsFailure || mentionsBotOrSupport)) || (mentionsFailure && mentionsBotOrSupport && isQuestionLike(normalized));
}

function supportScreenshotReply() {
  return [
    'That looks like a screenshot of a problem in this chat, not a vacation photo.',
    '',
    `I saved the screenshot for review instead of attaching it to the vacation. ${vacationDirectionClarificationCopy()}`,
  ].join('\n');
}

function supportScreenshotTurnText(media, decision = {}) {
  const extractedText = cleanText(decision.extractedText, 1200);
  const caption = cleanText(media.caption, 1000);
  return [
    'Customer sent a screenshot that appears to show a TimeSyncher Vacation support/debug issue, not a vacation media attachment.',
    caption ? `Caption: ${caption}` : '',
    extractedText ? `Screenshot text: ${extractedText}` : '',
    'Do not attach this image to the vacation itinerary.',
  ].filter(Boolean).join('\n');
}

async function classifyPhotoSupportScreenshot(media, cached, { cacheDir = '' } = {}) {
  if (media?.mediaKind !== 'photo') return null;
  if (mediaCaptionLooksLikeSupportScreenshot(media.caption)) {
    return {
      kind: 'support_debug_screenshot',
      confidence: 0.9,
      source: 'caption',
      extractedText: media.caption,
    };
  }
  if (!OPENAI_API_KEY || !cached?.bytes?.length) return null;

  const imageBytes = cached.bytes;
  const dataUrl = `data:${media.mimeType || 'image/jpeg'};base64,${imageBytes.toString('base64')}`;
  const prompt = [
    'Classify this Telegram photo for TimeSyncher Vacation intake.',
    'Return support_debug_screenshot when the image is a screenshot/photo of a chat, bot reply, app error, poor response, "not fixed" message, or support/debug problem.',
    'Return vacation_media when it is a normal customer travel/vacation photo or video still that should be attached to the vacation.',
    'Return unclear if you cannot tell.',
    'Use OCR. Include the most relevant visible text in extractedText.',
  ].join('\n');

  const { response, json } = await fetchJsonWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_SCREENSHOT_CLASSIFIER_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${prompt}\n\nReturn JSON with fields: kind, confidence, extractedText, reason.` },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
      max_tokens: 300,
    }),
  }, 'OpenAI image screenshot classifier');
  if (!response.ok) throw new Error(json.error?.message || `OpenAI image screenshot classifier ${response.status}`);

  const parsed = parseJsonObject(json.choices?.[0]?.message?.content || '');
  const kind = cleanText(parsed?.kind, 80);
  const confidence = Number(parsed?.confidence || 0);
  const extractedText = cleanText(parsed?.extractedText, 1200);
  noteCacheStage(cacheDir, 'classified-photo-intent', {
    kind,
    confidence,
    extractedText,
    reason: cleanText(parsed?.reason, 500),
    model: IMAGE_SCREENSHOT_CLASSIFIER_MODEL,
  });
  if (kind === 'support_debug_screenshot' && confidence >= 0.55) {
    return {
      kind,
      confidence,
      source: 'vision',
      extractedText,
    };
  }
  return null;
}

function isConcreteItineraryEditRequest(value = '') {
  const normalized = cleanText(value, 4000).toLowerCase();
  if (!normalized) return false;
  if (isWebsiteLinkRequest(normalized)) return false;
  const mentionsTrip = /\b(vacation|trip|itinerary|caldwell|davidson|shared website|travel plan)\b/.test(normalized);
  const mentionsEdit = /\b(add|remove|delete|keep|change|update|move|create|fill in|timeline|day\s*\d|days?\s+\d|right dates?|length of (the )?trip|rename|title|description|access|share|member|family|wife|husband|spouse|collaborator|permission|edit rights?|view rights?)\b/.test(normalized);
  const timelineAdd = /\b(add|create|put|include|schedule)\b/.test(normalized)
    && /\b(day\s*\d|days?\s+\d|timeline|family event)\b/.test(normalized);
  return (mentionsTrip && mentionsEdit) || timelineAdd;
}

function editAcknowledgement(value = '') {
  const original = cleanText(value, 1000);
  const quoted = original.match(/["“”']([^"“”']{2,120})["“”']/)?.[1];
  const day = original.match(/\bday\s*(\d{1,2})\b/i)?.[1];
  const action = quoted
    ? `added "${quoted}"${day ? ` to Day ${day}` : ''}`
    : 'made that itinerary change';
  return [
    'Got it. I am updating the TimeSyncher Vacation website now.',
    '',
    `I will send the itinerary link when I have ${action}. You can keep sending changes or priorities here while I work.`,
  ].join('\n');
}

function displayName(user = {}) {
  return cleanText(
    [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `telegram:${user.id}`,
    160,
  );
}

function readOffset() {
  try {
    const value = Number.parseInt(fs.readFileSync(OFFSET_FILE, 'utf8'), 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeOffset(offset) {
  fs.writeFileSync(OFFSET_FILE, `${offset}\n`, { mode: 0o600 });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function safePathPart(value, fallback = 'unknown') {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function normalizeMediaTarget(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function updateCacheDir(update) {
  const message = update.message || {};
  const receivedAt = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000);
  const datePart = receivedAt.toISOString().slice(0, 10);
  const updatePart = safePathPart(update.update_id, 'no-update-id');
  const messagePart = safePathPart(message.message_id, 'no-message-id');
  return path.join(INGRESS_CACHE_DIR, datePart, `update-${updatePart}-message-${messagePart}`);
}

function cacheRawUpdate(update) {
  const dir = updateCacheDir(update);
  writeJsonAtomic(path.join(dir, 'update.json'), {
    cachedAt: new Date().toISOString(),
    sourceBot: 'TimeSyncherVacationBot',
    update,
  });
  return dir;
}

function noteCacheStage(cacheDir, stage, details = {}) {
  if (!cacheDir) return;
  writeJsonAtomic(path.join(cacheDir, `${safePathPart(stage)}.json`), {
    cachedAt: new Date().toISOString(),
    stage,
    ...details,
  });
}

function conversationStatePath(chatId = '') {
  return path.join(INGRESS_CACHE_DIR, 'state', `chat-${safePathPart(chatId || 'unknown')}.json`);
}

function readConversationState(chatId = '') {
  try {
    const filePath = conversationStatePath(chatId);
    if (!fs.existsSync(filePath)) return { recentTurns: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { recentTurns: [] };
  } catch {
    return { recentTurns: [] };
  }
}

function conversationContextForMessage(message = {}, text = '') {
  const chatId = String(message.chat?.id || '');
  const state = readConversationState(chatId);
  const recentTurns = Array.isArray(state.recentTurns) ? state.recentTurns : [];
  return {
    activeVacation: cleanText(state.activeVacation, 160) || null,
    activeDestination: cleanText(state.activeDestination, 160) || null,
    knownParticipants: Array.isArray(state.knownParticipants)
      ? state.knownParticipants.map((name) => cleanText(name, 80)).filter(Boolean).slice(0, 8)
      : [],
    recentTurns: recentTurns
      .map((turn) => ({
        speaker: cleanText(turn.speaker, 24) || 'customer',
        body: cleanText(turn.body, 700),
      }))
      .filter((turn) => turn.body)
      .slice(-8),
    currentTurnPreview: cleanText(text, 700),
  };
}

function rememberConversationTurn(message = {}, { inboundText = '', outboundText = '', turn = {} } = {}) {
  const chatId = String(message.chat?.id || '');
  if (!chatId) return;
  const state = readConversationState(chatId);
  const recentTurns = Array.isArray(state.recentTurns) ? state.recentTurns : [];
  const knownParticipants = new Set(Array.isArray(state.knownParticipants) ? state.knownParticipants : []);
  const combined = `${inboundText}\n${outboundText}`;
  if (/\bkim\b/i.test(combined)) knownParticipants.add('Kim');
  const vacationName = cleanText(turn.vacationName || turn.payload?.vacationName || state.activeVacation, 160);
  const nextTurns = [
    ...recentTurns,
    inboundText ? { speaker: 'customer', body: cleanText(inboundText, 700), at: new Date().toISOString() } : null,
    outboundText ? { speaker: 'assistant', body: cleanText(outboundText, 700), at: new Date().toISOString() } : null,
  ].filter(Boolean).slice(-8);
  writeJsonAtomic(conversationStatePath(chatId), {
    updatedAt: new Date().toISOString(),
    activeVacation: vacationName || null,
    knownParticipants: [...knownParticipants].slice(0, 8),
    recentTurns: nextTurns,
  });
}

function cleanupIngressCache() {
  const cutoffMs = Date.now() - INGRESS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    ensureDir(INGRESS_CACHE_DIR);
    for (const dateEntry of fs.readdirSync(INGRESS_CACHE_DIR, { withFileTypes: true })) {
      if (!dateEntry.isDirectory()) continue;
      const dateDir = path.join(INGRESS_CACHE_DIR, dateEntry.name);
      for (const updateEntry of fs.readdirSync(dateDir, { withFileTypes: true })) {
        if (!updateEntry.isDirectory()) continue;
        const updateDir = path.join(dateDir, updateEntry.name);
        const stat = fs.statSync(updateDir);
        if (stat.mtimeMs < cutoffMs) fs.rmSync(updateDir, { recursive: true, force: true });
      }
      if (fs.readdirSync(dateDir).length === 0) fs.rmdirSync(dateDir);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ingress cache cleanup failed: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvFile(filePath) {
  const env = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] worker drain env load failed: ${error.message}`);
  }
  return env;
}

function startWorkerDrainDirect(jobId) {
  const env = {
    ...process.env,
    ...parseEnvFile(WORKER_DRAIN_ENV_FILE),
    TIMESYNCHER_WORKER_TARGET_JOB_ID: jobId,
    TIMESYNCHER_WORKER_TARGET_FILE: WORKER_DRAIN_TARGET_FILE,
  };
  const child = spawn(process.execPath, [WORKER_DRAIN_SCRIPT, '--drain'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] direct worker drain failed to start for job ${jobId}: ${error.message}`);
  });
  child.on('close', (code) => {
    if (code === 0) {
      console.log(`[${new Date().toISOString()}] direct worker drain completed for queued Telegram job ${jobId}`);
    } else {
      console.error(`[${new Date().toISOString()}] direct worker drain exited ${code} for queued Telegram job ${jobId}`);
    }
  });
}

function startWorkerDrainIfQueued(turn) {
  const jobId = cleanText(turn?.queued?.jobId || turn?.queued?.job_id, 80);
  if (!turn || !turn.queued || !jobId || !WORKER_DRAIN_SERVICE) return;
  writeJsonAtomic(WORKER_DRAIN_TARGET_FILE, {
    jobId,
    requestId: cleanText(turn.queued.requestId || turn.queued.request_id, 80) || null,
    transcriptId: cleanText(turn.transcriptId || turn.transcript_id, 80) || null,
    outboundTranscriptId: cleanText(turn.outboundTranscriptId || turn.outbound_transcript_id, 80) || null,
    queuedAt: new Date().toISOString(),
    reason: 'telegram_turn_scoped_worker_drain',
  });
  if (WORKER_DRAIN_MODE === 'direct') {
    console.log(`[${new Date().toISOString()}] direct worker drain start requested for queued Telegram job ${jobId}`);
    startWorkerDrainDirect(jobId);
    return;
  }
  execFile('systemctl', ['--user', 'start', WORKER_DRAIN_SERVICE], (error) => {
    if (error) {
      console.error(`[${new Date().toISOString()}] worker drain start failed for job ${jobId}: ${error.message}`);
      startWorkerDrainDirect(jobId);
      return;
    }
    console.log(`[${new Date().toISOString()}] worker drain start requested for queued Telegram job ${jobId}`);
  });
}

async function fetchJsonWithRetry(url, options, label) {
  const response = await fetchWithRetry(url, options, label);
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function fetchWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === FETCH_RETRY_ATTEMPTS) return response;
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_RETRY_ATTEMPTS) throw error;
    }
    const delayMs = FETCH_RETRY_BASE_MS * attempt;
    console.error(`[${new Date().toISOString()}] ${label} attempt ${attempt} failed: ${lastError.message}; retrying in ${delayMs}ms`);
    await sleep(delayMs);
  }
  throw lastError || new Error(`${label} failed`);
}

async function telegram(method, body = {}) {
  const { response, json } = await fetchJsonWithRetry(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, `Telegram ${method}`);
  if (!response.ok || !json.ok) throw new Error(json.description || `Telegram ${method} failed`);
  return json.result;
}

function replyMarkupForTurn(turn = {}) {
  const replyMarkup = turn.replyMarkup || turn.reply_markup;
  if (replyMarkup && typeof replyMarkup === 'object' && !Array.isArray(replyMarkup)) return replyMarkup;

  const checkoutUrl = cleanText(
    turn.checkoutUrl ||
      turn.checkoutURL ||
      turn.orderUrl ||
      turn.orderURL ||
      turn.paymentUrl ||
      turn.paymentURL ||
      turn.collaboratorCheckoutUrl ||
      turn.collaboratorCheckoutURL,
    2048,
  );
  if (!checkoutUrl) return undefined;

  return {
    inline_keyboard: [[
      {
        text: 'Open checkout',
        url: checkoutUrl,
      },
    ]],
  };
}

async function sendMessage(chatId, text, replyToMessageId, replyMarkup) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: /<a\s+href=/i.test(String(text || '')) ? 'HTML' : undefined,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  };
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) delete body[key];
  }
  return telegram('sendMessage', body);
}

async function downloadTelegramFile({ fileId, cacheDir, label, extension = 'bin' }) {
  if (!fileId) throw new Error(`${label} did not include a Telegram file id.`);
  const file = await telegram('getFile', { file_id: fileId });
  if (!file?.file_path) throw new Error(`Telegram did not return a ${label} file path.`);

  const audioResponse = await fetchWithRetry(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    {},
    `Telegram ${label} download`,
  );
  if (!audioResponse.ok) throw new Error(`Telegram ${label} download ${audioResponse.status}`);

  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  const filePath = path.join(cacheDir || INGRESS_CACHE_DIR, `${safePathPart(label)}.${safePathPart(extension, 'bin')}`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  writeJsonAtomic(`${filePath}.json`, {
    cachedAt: new Date().toISOString(),
    label,
    fileId,
    telegramFilePath: file.file_path,
    sizeBytes: bytes.length,
    path: filePath,
  });
  return { bytes, file, filePath };
}

function parseMediaAttachmentTarget(caption = '') {
  const text = cleanText(caption, 1000);
  if (!/\b(?:attach|add|save|put)\s+this\s+(?:to|on|with)\b/i.test(text)) return null;
  const dayNumber = Number.parseInt(text.match(/\bday\s*(\d{1,2})\b/i)?.[1] || '', 10);
  const quoted = text.match(/["“”']([^"“”']{2,160})["“”']/)?.[1];
  const unquoted = text.match(/\b(?:attach|add|save|put)\s+this\s+(?:to|on|with)\s+(.+?)(?:\s+(?:thing|event|item)\b|\s+(?:on\s+)?\bday\s*\d{1,2}\b|$)/i)?.[1];
  const targetText = normalizeMediaTarget(quoted || unquoted || '');
  if (!targetText || !Number.isFinite(dayNumber)) return null;
  return { targetText, dayNumber };
}

function mediaTargetMatches(candidate = '', targetText = '') {
  const haystack = normalizeMediaTarget(candidate);
  const tokens = normalizeMediaTarget(targetText).split(/\s+/).filter((token) => token.length >= 2);
  if (!haystack || !tokens.length) return false;
  return tokens.every((token) => haystack.includes(token));
}

function mediaCaptionLooksLikeAttachmentCommand(caption = '') {
  const text = cleanText(caption, 1000);
  if (!text) return false;
  return /\b(?:attach|add|save|put|connect|link|associate)\b/i.test(text)
    && /\b(?:this|photo|picture|pic|video|media|it)\b/i.test(text)
    && /\b(?:to|on|with|under|inside|for)\b/i.test(text);
}

function mediaAttachmentIntentSchema() {
  return JSON.stringify({
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['attach_media_to_itinerary_item', 'none'] },
      targetText: { type: 'string' },
      dayNumber: { type: 'integer' },
    },
    required: ['kind', 'targetText', 'dayNumber'],
    additionalProperties: false,
  });
}

function parseJsonObject(value = '') {
  const text = cleanText(value, 4000);
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function parseMediaAttachmentTargetWithModel(caption = '') {
  const fast = parseMediaAttachmentTarget(caption);
  if (fast) return fast;
  const text = cleanText(caption, 1000);
  if (!mediaCaptionLooksLikeAttachmentCommand(text)) return null;
  if (process.env.TIMESYNCHER_MEDIA_INTENT_DISABLE_MODEL === '1') return null;
  const grokBin = process.env.TIMESYNCHER_GROK_BIN || '/home/ubishere9995/.local/bin/grok';
  const grokModel = process.env.TIMESYNCHER_MEDIA_INTENT_MODEL || process.env.TIMESYNCHER_GROK_MODEL || 'grok-4.5';
  const prompt = [
    'Classify this Telegram media caption into one known TimeSyncher Vacation command.',
    'Known command: attach_media_to_itinerary_item. Use it when the customer wants the attached photo/video/media saved to an existing itinerary thing/event/item on a day.',
    'Extract the itinerary target text and day number. Do not require exact wording; interpret normal customer phrasing.',
    'Return kind none only when the caption is not asking to attach this media to an itinerary item.',
    `Caption: ${JSON.stringify(text)}`,
  ].join('\n');
  const timeoutSeconds = Math.max(8, Number.parseInt(process.env.TIMESYNCHER_MEDIA_INTENT_TIMEOUT_SECONDS || '35', 10));
  const result = spawnSync('/usr/bin/timeout', ['-k', '5s', `${timeoutSeconds}s`, 'sudo', '-n', '-u', 'ubishere9995', grokBin, '-p', prompt, '--output-format', 'json', '--json-schema', mediaAttachmentIntentSchema(), '--no-alt-screen', '--model', grokModel, '--max-turns', '1'], {
    encoding: 'utf8',
    timeout: (timeoutSeconds + 8) * 1000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`I could not interpret that media attachment command yet: ${cleanText(result.stderr || result.stdout || 'model parser failed', 240)}`);
  }
  const parsed = parseJsonObject(result.stdout);
  if (!parsed || parsed.kind !== 'attach_media_to_itinerary_item') return null;
  const dayNumber = Number.parseInt(parsed.dayNumber, 10);
  const targetText = normalizeMediaTarget(parsed.targetText || '');
  if (!targetText || !Number.isFinite(dayNumber)) {
    throw new Error('I understood that as an attachment command, but I could not identify both the itinerary item and day number.');
  }
  return { targetText, dayNumber };
}

async function resolveTrekMediaTarget(caption = '') {
  const parsed = parseMediaAttachmentTargetWithModel(caption);
  if (!parsed) return null;
  if (!TREK_DEFAULT_SHARE_TOKEN) {
    throw new Error('I could not identify which vacation should receive that media attachment yet.');
  }

  const url = `${TREK_SHARED_API_BASE}/api/shared/${encodeURIComponent(TREK_DEFAULT_SHARE_TOKEN)}?_=${Date.now()}`;
  const response = await fetchWithRetry(url, {}, 'Trek shared itinerary API');
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.error || `Trek shared itinerary API ${response.status}`);

  const days = Array.isArray(json.days) ? json.days : [];
  const day = days.find((item) => Number(item.day_number) === parsed.dayNumber);
  if (!day?.id) throw new Error(`I could not find Day ${parsed.dayNumber} on the itinerary.`);

  const assignmentsByDay = json.assignments && typeof json.assignments === 'object' ? json.assignments : {};
  const thingOverrides = json.thingOverrides && typeof json.thingOverrides === 'object' ? json.thingOverrides : {};
  const dayAssignments = Array.isArray(assignmentsByDay[String(day.id)])
    ? assignmentsByDay[String(day.id)]
    : (Array.isArray(assignmentsByDay[day.id]) ? assignmentsByDay[day.id] : []);
  const candidates = dayAssignments
    .map((assignment) => {
      const place = assignment?.place || {};
      const override = thingOverrides[`place:${place.id}`] || {};
      return {
        placeId: Number(place.id || assignment.place_id || assignment.placeId),
        placeName: cleanText(override.title || place.name || assignment.title, 200),
        matchText: [override.title, place.name, override.summary, place.description, assignment.title].filter(Boolean).join(' '),
      };
    })
    .filter((candidate) => candidate.placeId && candidate.placeName);
  const match = candidates.find((candidate) => mediaTargetMatches(candidate.matchText, parsed.targetText));
  if (!match) {
    throw new Error(`I could not match "${parsed.targetText}" to an item on Day ${parsed.dayNumber}.`);
  }
  return {
    token: TREK_DEFAULT_SHARE_TOKEN,
    dayId: Number(day.id),
    dayNumber: parsed.dayNumber,
    placeId: match.placeId,
    placeName: match.placeName,
  };
}

function runChecked(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = cleanText(result.stderr || result.stdout || `${command} exited ${result.status}`, 500);
    throw new Error(`${label} failed: ${detail}`);
  }
  return result.stdout || '';
}

function copyMediaIntoTrekUploads(cached, filename) {
  const tmpPath = path.join('/tmp', `${process.pid}-${Date.now()}-${safePathPart(filename, 'telegram-media')}`);
  const destination = path.join(TREK_RUNTIME_DIR, 'uploads', 'photos', filename);
  fs.copyFileSync(cached.filePath, tmpPath);
  fs.chmodSync(tmpPath, 0o644);
  runChecked('sudo', ['-n', '-u', TREK_DB_OWNER, 'cp', tmpPath, destination], 'copy media into Trek uploads');
  runChecked('sudo', ['-n', '-u', TREK_DB_OWNER, 'chmod', '644', destination], 'chmod Trek media upload');
  fs.rmSync(tmpPath, { force: true });
  return destination;
}

function mediaFilenameForTrek(media, target) {
  const extension = safePathPart(media.extension || path.extname(media.originalName || '').replace(/^\./, '') || 'bin', 'bin').toLowerCase();
  const label = safePathPart(media.label || `telegram-${media.mediaKind}-${Date.now()}`, 'telegram-media');
  const targetSlug = safePathPart(target.placeName, 'itinerary-item').toLowerCase().slice(0, 80);
  return `${label}-${targetSlug}.${extension}`;
}

function insertTrekMediaRow(target, media, cached, filename) {
  const script = `
const Database = require('better-sqlite3');
const input = JSON.parse(process.env.ATTACH_JSON || '{}');
const db = new Database('/app/data/travel.db');
db.pragma('foreign_keys = ON');
const trip = db.prepare('SELECT t.id FROM trips t JOIN share_tokens st ON st.trip_id = t.id WHERE st.token = ?').get(input.token);
if (!trip) throw new Error('Trip token not found');
const day = db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(input.dayId, trip.id);
if (!day) throw new Error('Target day not found on trip');
const place = db.prepare('SELECT id FROM places WHERE id = ? AND trip_id = ?').get(input.placeId, trip.id);
if (!place) throw new Error('Target item not found on trip');
const existing = db.prepare('SELECT * FROM photos WHERE filename = ?').get(input.filename);
if (!existing) {
  db.prepare('INSERT INTO photos (trip_id, day_id, place_id, filename, original_name, file_size, mime_type, caption, taken_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(trip.id, input.dayId, input.placeId, input.filename, input.originalName, input.fileSizeBytes, input.mimeType, input.caption, null);
}
const row = db.prepare('SELECT * FROM photos WHERE filename = ?').get(input.filename);
console.log(JSON.stringify(row));
`;
  const input = {
    token: target.token,
    dayId: target.dayId,
    placeId: target.placeId,
    filename,
    originalName: media.originalName || path.basename(cached.filePath),
    fileSizeBytes: media.fileSizeBytes || cached.bytes.length,
    mimeType: media.mimeType || (media.mediaKind === 'video' ? 'video/mp4' : 'image/jpeg'),
    caption: target.placeName,
  };
  const stdout = runChecked('docker', ['exec', '-e', `ATTACH_JSON=${JSON.stringify(input)}`, '-u', 'node', TREK_CONTAINER, 'node', '-e', script], 'insert Trek media row');
  return JSON.parse(stdout.trim() || '{}');
}

async function attachMediaToTrekThing(message, media, cached) {
  if (!mediaCaptionLooksLikeAttachmentCommand(media.caption)) return null;
  const target = await resolveTrekMediaTarget(media.caption);
  if (!target) throw new Error('I could not map that caption to a known media attachment command.');
  const filename = mediaFilenameForTrek(media, target);
  const destination = copyMediaIntoTrekUploads(cached, filename);
  const row = insertTrekMediaRow(target, media, cached, filename);
  return {
    ...target,
    filename,
    destination,
    row,
    telegramMessageId: message.message_id || null,
  };
}

async function transcribeVoiceMessage(message, { cacheDir = '' } = {}) {
  if (!OPENAI_API_KEY) throw new Error('Voice transcription is not configured yet.');
  const voice = message.voice;
  if (!voice?.file_id) throw new Error('Voice message did not include a Telegram file id.');
  const extension = String(voice.mime_type || '').includes('mpeg') ? 'mp3' : 'ogg';
  const cachedVoice = await downloadTelegramFile({
    fileId: voice.file_id,
    cacheDir,
    label: `telegram-voice-${message.message_id || Date.now()}`,
    extension,
  });

  const audio = new Blob([cachedVoice.bytes], { type: voice.mime_type || 'audio/ogg' });
  const form = new FormData();
  form.append('model', STT_MODEL);
  form.append('file', audio, path.basename(cachedVoice.filePath));

  const response = await fetchWithRetry('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  }, 'OpenAI voice transcription');
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `OpenAI voice transcription ${response.status}`);
  const text = cleanText(json.text, 12000);
  if (!text) throw new Error('Voice transcription returned empty text.');
  noteCacheStage(cacheDir, 'transcription', {
    model: STT_MODEL,
    text,
    voicePath: cachedVoice.filePath,
  });
  return {
    text,
    voiceCache: {
      path: cachedVoice.filePath,
      telegramFilePath: cachedVoice.file.file_path,
      sizeBytes: cachedVoice.bytes.length,
    },
  };
}

async function recordTelegramTurn(message, { textOverride = '', payload = {} } = {}) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = cleanText(textOverride || message.text || message.caption);
  const startMatch = /^\/start(?:\s+(.+))?/i.exec(text);
  const conversationContext = conversationContextForMessage(message, text);
  const { response, json } = await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      event: 'message',
      onboardingToken: startMatch ? cleanText(startMatch[1], 160) : '',
      telegramChatId: String(chat.id || ''),
      telegramUserId: from.id ? String(from.id) : '',
      telegramMessageId: message.message_id ? String(message.message_id) : '',
      receivedAt: new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      text,
      user: {
        id: from.id ? String(from.id) : '',
        firstName: cleanText(from.first_name, 80) || null,
        lastName: cleanText(from.last_name, 80) || null,
        username: from.username || null,
        languageCode: from.language_code || null,
      },
      message: {
        chatId: String(chat.id || ''),
        chatType: chat.type || '',
        messageId: message.message_id ? String(message.message_id) : '',
        text,
      },
      payload: {
        ...payload,
        conversationContext,
        telegramChatId: String(chat.id || ''),
        telegramChatType: chat.type || '',
        telegramMessageId: message.message_id || null,
        telegramUserId: from.id ? String(from.id) : null,
        telegramUsername: from.username || null,
        sourceBot: 'TimeSyncherVacationBot',
      },
    }),
  }, 'Vacation Telegram API');
  if (!response.ok || json.ok === false) throw new Error(json.error || `Vacation Telegram API ${response.status}`);
  return json;
}

function mediaFromMessage(message = {}) {
  const caption = cleanText(message.caption, 1000);
  const photos = Array.isArray(message.photo) ? message.photo : [];
  if (photos.length) {
    const photo = photos[photos.length - 1];
    return {
      mediaKind: 'photo',
      telegramFileId: photo.file_id || '',
      telegramFileUniqueId: photo.file_unique_id || '',
      fileSizeBytes: photo.file_size || 0,
      width: photo.width || null,
      height: photo.height || null,
      mimeType: 'image/jpeg',
      originalName: `telegram-photo-${message.message_id || Date.now()}.jpg`,
      caption,
      extension: 'jpg',
      label: `telegram-photo-${message.message_id || Date.now()}`,
    };
  }
  if (message.video?.file_id) {
    const video = message.video;
    return {
      mediaKind: 'video',
      telegramFileId: video.file_id || '',
      telegramFileUniqueId: video.file_unique_id || '',
      fileSizeBytes: video.file_size || 0,
      width: video.width || null,
      height: video.height || null,
      durationSeconds: video.duration || null,
      mimeType: video.mime_type || 'video/mp4',
      originalName: video.file_name || `telegram-video-${message.message_id || Date.now()}.mp4`,
      caption,
      extension: 'mp4',
      label: `telegram-video-${message.message_id || Date.now()}`,
    };
  }
  const document = message.document;
  const mimeType = cleanText(document?.mime_type, 160).toLowerCase();
  if (document?.file_id && /^image\//.test(mimeType)) {
    return {
      mediaKind: 'photo',
      telegramFileId: document.file_id || '',
      telegramFileUniqueId: document.file_unique_id || '',
      fileSizeBytes: document.file_size || 0,
      mimeType: document.mime_type || 'image/jpeg',
      originalName: document.file_name || `telegram-photo-${message.message_id || Date.now()}`,
      caption,
      extension: path.extname(document.file_name || '').replace(/^\./, '') || 'jpg',
      label: `telegram-photo-document-${message.message_id || Date.now()}`,
    };
  }
  if (document?.file_id && /^video\//.test(mimeType)) {
    return {
      mediaKind: 'video',
      telegramFileId: document.file_id || '',
      telegramFileUniqueId: document.file_unique_id || '',
      fileSizeBytes: document.file_size || 0,
      mimeType: document.mime_type || 'video/mp4',
      originalName: document.file_name || `telegram-video-${message.message_id || Date.now()}`,
      caption,
      extension: path.extname(document.file_name || '').replace(/^\./, '') || 'mp4',
      label: `telegram-video-document-${message.message_id || Date.now()}`,
    };
  }
  return null;
}

async function recordMediaUpload(message, media, { cacheDir = '' } = {}) {
  if (!media?.telegramFileId) throw new Error('Telegram media did not include a file id.');
  if (media.fileSizeBytes && media.fileSizeBytes > TELEGRAM_MEDIA_MAX_BYTES) {
    throw new Error(`That file is too large for Telegram bot intake right now. Limit is ${Math.floor(TELEGRAM_MEDIA_MAX_BYTES / 1024 / 1024)} MB until the private upload-link path is live.`);
  }
  const cached = await downloadTelegramFile({
    fileId: media.telegramFileId,
    cacheDir,
    label: media.label,
    extension: media.extension,
  });
  const from = message.from || {};
  const chat = message.chat || {};
  const payload = {
    ...media,
    fileSizeBytes: media.fileSizeBytes || cached.bytes.length,
    telegramFilePath: cached.file?.file_path || '',
    telegramChatId: String(chat.id || ''),
    telegramUserId: from.id ? String(from.id) : '',
    telegramMessageId: message.message_id ? String(message.message_id) : '',
    metadata: {
      sourceBot: 'TimeSyncherVacationBot',
      telegramUsername: from.username || null,
      cachePath: cached.filePath,
      cacheSizeBytes: cached.bytes.length,
      telegramBotApiDownloadLimitBytes: TELEGRAM_MEDIA_MAX_BYTES,
    },
  };

  let supportScreenshot = null;
  try {
    supportScreenshot = await classifyPhotoSupportScreenshot(media, cached, { cacheDir });
  } catch (error) {
    noteCacheStage(cacheDir, 'photo-intent-classification-failed', {
      mediaKind: media.mediaKind,
      caption: media.caption,
      error: error.message,
    });
  }
  if (supportScreenshot) {
    noteCacheStage(cacheDir, 'support-screenshot-not-media-upload', {
      mediaKind: media.mediaKind,
      caption: media.caption,
      source: supportScreenshot.source,
      confidence: supportScreenshot.confidence,
      extractedText: supportScreenshot.extractedText,
      turnText: supportScreenshotTurnText(media, supportScreenshot),
    });
    return {
      ok: true,
      skippedMediaUpload: true,
      supportScreenshot,
      reply: supportScreenshotReply(),
    };
  }

  const { response, json } = await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({ event: 'media_upload', ...payload }),
  }, 'Vacation media API');
  if (!response.ok || json.ok === false) throw new Error(json.error || `Vacation media API ${response.status}`);
  let trekAttachment = null;
  try {
    trekAttachment = await attachMediaToTrekThing(message, media, cached);
  } catch (error) {
    noteCacheStage(cacheDir, 'trek-media-attach-failed', {
      mediaKind: media.mediaKind,
      caption: media.caption,
      error: error.message,
    });
    if (mediaCaptionLooksLikeAttachmentCommand(media.caption)) {
      return {
        ...json,
        reply: `I received that ${media.mediaKind}, but I could not attach it to the requested itinerary item yet: ${cleanText(error.message, 300)}`,
        trekAttachmentError: error.message,
      };
    }
  }
  noteCacheStage(cacheDir, 'recorded-media', {
    mediaId: json.media?.id || null,
    mediaKind: media.mediaKind,
    fileSizeBytes: payload.fileSizeBytes,
    trekAttachment: trekAttachment ? {
      dayNumber: trekAttachment.dayNumber,
      dayId: trekAttachment.dayId,
      placeId: trekAttachment.placeId,
      placeName: trekAttachment.placeName,
      filename: trekAttachment.filename,
    } : null,
  });
  if (trekAttachment) {
    return {
      ...json,
      trekAttachment,
      reply: `Got it — I attached that ${media.mediaKind} to ${trekAttachment.placeName} on Day ${trekAttachment.dayNumber}.`,
    };
  }
  return json;
}

async function recordDelivery({ transcriptId, telegramMessageId }) {
  if (!transcriptId) return;
  await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      event: 'delivery',
      transcriptId,
      telegramMessageId: telegramMessageId ? String(telegramMessageId) : '',
      sentAt: new Date().toISOString(),
    }),
  }, 'Vacation Telegram delivery API').catch(() => {});
}

async function recordBotError({ message = {}, updateId, stage, error }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const errorMessage = cleanText(error?.message || error, 1000);
  if (!chat.id && !errorMessage) return;
  await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      event: 'bot_error',
      stage: cleanText(stage, 120),
      error: errorMessage,
      failedAt: new Date().toISOString(),
      updateId: updateId ? String(updateId) : '',
      telegramChatId: chat.id ? String(chat.id) : '',
      telegramUserId: from.id ? String(from.id) : '',
      telegramMessageId: message.message_id ? String(message.message_id) : '',
      retryPolicy: {
        fetchRetryAttempts: FETCH_RETRY_ATTEMPTS,
        fetchRetryBaseMs: FETCH_RETRY_BASE_MS,
        delayedRetryMs: DELAYED_RETRY_MS,
      },
      user: {
        id: from.id ? String(from.id) : '',
        firstName: cleanText(from.first_name, 80) || null,
        lastName: cleanText(from.last_name, 80) || null,
        username: from.username || null,
      },
      message: {
        chatId: chat.id ? String(chat.id) : '',
        chatType: chat.type || '',
        messageId: message.message_id ? String(message.message_id) : '',
        text: cleanText(message.text || message.caption, 500),
      },
      details: {
        sourceBot: 'TimeSyncherVacationBot',
      },
    }),
  }, 'Vacation Telegram bot error API').catch((logError) => {
    console.error(`[${new Date().toISOString()}] could not record bot error: ${logError.message}`);
  });
}

async function handleMessage(message, { cacheDir = '' } = {}) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;
  let text = cleanText(message.text || message.caption);
  let payload = {};
  if (!chatId) return;

  if (!text && message.voice) {
    await telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const transcription = await transcribeVoiceMessage(message, { cacheDir });
    text = transcription.text;
    payload = {
      telegramVoice: {
        duration: message.voice.duration || null,
        fileId: message.voice.file_id || null,
        fileUniqueId: message.voice.file_unique_id || null,
        fileSize: message.voice.file_size || null,
        mimeType: message.voice.mime_type || null,
        transcriptionModel: STT_MODEL,
        cachePath: transcription.voiceCache?.path || null,
      },
      transcribedFromVoice: true,
    };
  }

  const media = mediaFromMessage(message);
  if (media) {
    await telegram('sendChatAction', { chat_id: chatId, action: media.mediaKind === 'video' ? 'upload_video' : 'upload_photo' }).catch(() => {});
    const result = await recordMediaUpload(message, media, { cacheDir });
    const reply = result.reply || (media.mediaKind === 'video'
      ? 'Got it — I saved that video to this vacation.'
      : 'Got it — I saved that photo to this vacation.');
    await sendMessage(chatId, reply, messageId);
    return;
  }

  if (!text) {
    await sendMessage(chatId, 'Send me the trip, dates, people, budget, or what you want planned, and I will start the vacation workspace.', messageId);
    return;
  }

  let turn;
  try {
    turn = await recordTelegramTurn(message, { textOverride: text, payload });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] record turn failed for message ${messageId}: ${error.message}; delayed retry in ${DELAYED_RETRY_MS}ms`);
    await sleep(DELAYED_RETRY_MS);
    turn = await recordTelegramTurn(message, { textOverride: text, payload });
  }
  noteCacheStage(cacheDir, 'recorded-turn', {
    transcriptId: turn.transcriptId || null,
    outboundTranscriptId: turn.outboundTranscriptId || null,
    queued: turn.queued || null,
  });
  const hostedNoWriteDecision = noWriteDecisionFromTurn(turn);
  const supportNoWrite = Boolean(hostedNoWriteDecision);
  startWorkerDrainIfQueued(turn);

  const hostedReply = cleanText(turn.reply || turn.customerResponse || turn.answer, 4000);
  let reply = hostedReply || [
    'I am processing the information you sent and setting up your TimeSyncher Vacation.',
    '',
    'Expect an initial vacation itinerary in about 10-20 minutes. You can keep sending updates here while I work on it.',
  ].join('\n');
  if (!supportNoWrite && turn.queued && isConcreteItineraryEditRequest(text) && isGenericQueuedAcknowledgement(reply)) {
    reply = editAcknowledgement(text);
  }
  if (!supportNoWrite && !isPersonAccessQuestion(text) && isWebsiteLinkRequest(text) && turn.queued && isGenericQueuedAcknowledgement(reply)) {
    noteCacheStage(cacheDir, 'website-link-request-ack-replaced', {
      reason: 'generic_queue_ack_replaced_with_link_lookup_ack',
      transcriptId: turn.transcriptId || null,
      outboundTranscriptId: turn.outboundTranscriptId || null,
    });
    reply = websiteLinkQueuedAcknowledgement();
  }
  let sent;
  try {
    sent = await sendMessage(chatId, reply, messageId, supportNoWrite ? null : replyMarkupForTurn(turn));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] send reply failed for message ${messageId}: ${error.message}; delayed retry in ${DELAYED_RETRY_MS}ms`);
    await sleep(DELAYED_RETRY_MS);
    sent = await sendMessage(chatId, reply, messageId, supportNoWrite ? null : replyMarkupForTurn(turn));
  }
  await recordDelivery({ transcriptId: turn.outboundTranscriptId, telegramMessageId: sent?.message_id });
  rememberConversationTurn(message, { inboundText: text, outboundText: reply, turn });
}

async function pollOnce() {
  const offset = readOffset();
  const updates = await telegram('getUpdates', {
    offset: offset ? offset + 1 : undefined,
    timeout: POLL_TIMEOUT_SECONDS,
    allowed_updates: ['message'],
  });

  for (const update of updates) {
    const cacheDir = cacheRawUpdate(update);
    try {
      if (update.message) await handleMessage(update.message, { cacheDir });
      noteCacheStage(cacheDir, 'processed', { ok: true });
    } catch (error) {
      noteCacheStage(cacheDir, 'failed', { ok: false, error: cleanText(error.message, 1000) });
      const chatId = update.message?.chat?.id;
      await recordBotError({
        message: update.message,
        updateId: update.update_id,
        stage: 'update_delivery',
        error,
      });
      if (chatId) {
        await sendMessage(chatId, 'I received that, but hit a delivery issue while responding. I am logging it for follow-up.', update.message?.message_id);
      }
      console.error(`[${new Date().toISOString()}] update ${update.update_id} failed: ${error.message}`);
    } finally {
      writeOffset(update.update_id);
    }
  }
}

async function main() {
  requireEnv();
  cleanupIngressCache();
  await telegram('deleteWebhook', { drop_pending_updates: false });
  const me = await telegram('getMe');
  console.log(`[${new Date().toISOString()}] TimeSyncher Vacation Telegram intake started as @${me.username}`);
  for (;;) {
    await pollOnce().catch((error) => {
      console.error(`[${new Date().toISOString()}] poll failed: ${error.message}`);
    });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
