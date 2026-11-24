import { cleanText } from './http.mjs';
import { isAiImportChatRequest } from './mcp-chat-import.mjs';
import { validateWebhookUrl } from './mcp-reservations-store.mjs';
import { RESERVATION_HOW_TO_URI } from './mcp-reservations-tools.mjs';

const RESERVATION_ASK_RE = /\b(book|reserve|make\s+(?:a|me\s+a|us\s+a)?\s*reservation|need\s+a\s+reservation|get\s+(?:a|me\s+a|us\s+a)\s+(?:table|reservation)|book\s+(?:a\s+table|us|me))\b/i;
const DEDICATED_RESERVATION_RE = /\b(?:set\s*up(?:\s+(?:my|your|an)\s+ai(?:\s+for)?)?\s+reservations?|make\s+(?:a\s+|me\s+a\s+|us\s+a\s+)?reservations?|need\s+a\s+reservation|get\s+(?:a\s+|me\s+a\s+|us\s+a\s+)?(?:table|reservation)|book\s+(?:a\s+table|us|me)|reserve\s+(?:a\s+)?(?:table|reservation))\b/i;
const PLANNING_BOOK_ASIDE_RE = /\b(?:flag|note|mention|list|suggest)\b[\s\S]{0,80}\bbook\b|\b(?:want|wanted|like|need|would|we'?d)\s+to\s+book\b|\bbook\s+(?:early|later|ahead|in advance|soon)\b|\bkeep building\b|\bday-by-day\b|\bday by day\b|\bitinerary\b/i;
const BOOKED_PLACE_RE = /\bbook\s+[A-Z][A-Za-z'’.-]*/;
export const YES_REPLY_RE = /^(?:yes|yeah|yep|yup|sure|ok|okay|please|go\s+ahead|do\s+it|sounds\s+good|set\s+(?:it|that)\s+up|yes[\s,!.-]+(?:please|set|let'?s|connect|go).*|let'?s\s+(?:set|do|connect).*|connect\s+my\s+ai.*)$/i;
const HANDSHAKE_HINT_RE = /\b(handshake|vk_reservations_handshake|poll_interval_minutes|webhook_url|option\s*\(?[a-d]\)?|mode\s*[:=]\s*["']?(?:webhook|polling|manual|a|b|c))\b/i;
const PENDING_HANDSHAKE_WORD_RE = /\b(option|mode|webhook|poll|manual|handshake|https?:\/\/|minutes?)\b/i;

export function isReservationAsk(rawText = '') {
  const text = cleanText(rawText, 2000);
  if (!text) return false;
  if (isAiImportChatRequest(text)) return false;
  if (/\b(cancel|revoke|remove|delete)\b/i.test(text) && !/\b(book|reserve)\b/i.test(text)) return false;
  if (DEDICATED_RESERVATION_RE.test(text)) return true;
  if (PLANNING_BOOK_ASIDE_RE.test(text)) return BOOKED_PLACE_RE.test(text);
  return RESERVATION_ASK_RE.test(text);
}

export function reservationChatTurnNeedsLookup(rawText = '') {
  const text = cleanText(rawText, 4000);
  if (!text) return false;
  if (isReservationAsk(text) || YES_REPLY_RE.test(text)) return true;
  if (HANDSHAKE_HINT_RE.test(text) || PENDING_HANDSHAKE_WORD_RE.test(text)) return true;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('```')) return true;
  return false;
}

export function buildReservationsSetupCopyText({
  mcpEndpoint = 'https://www.timesyncher.com/api/mcp',
  token = '',
} = {}) {
  return [
    'Vacay Keepsake AI Reservations Setup',
    '',
    'Connect to my Vacay Keepsake account so you can handle vacation reservations for every vacation I own or collaborate on.',
    `MCP endpoint: ${cleanText(mcpEndpoint, 400)}`,
    `Authorization header: Authorization: Bearer ${cleanText(token, 300)}`,
    'Transport: MCP over Streamable HTTP (JSON-RPC 2.0 POST with Content-Type: application/json and the Authorization header above).',
    `Discovery: call "tools/list" for tool schemas and "resources/read" with uri "${RESERVATION_HOW_TO_URI}" for the full reservations guide.`,
    '',
    'Choose the best handshake option you support:',
    '(a) Webhook or inbox URL — provide an http or https URL Vacay Keepsake can ping whenever I ask for a reservation (mode: "webhook", webhook_url: "<url>").',
    '(b) Scheduled polling — poll "list_reservation_requests" every N minutes (mode: "polling", poll_interval_minutes: <N>).',
    '(c) Manual — each time I ask for a reservation, I will paste "check my VK reservations" into our chat (mode: "manual").',
    '',
    'How to finish setup:',
    '- If you can call the Vacay Keepsake MCP directly, call "register_reservations_handshake" with your chosen mode now and skip the paste.',
    '- Otherwise, reply with a short handshake message (JSON or plain lines naming option (a), (b), or (c) plus your webhook URL or polling interval in minutes) so I can paste it back into Vacay Keepsake chat.',
  ].join('\n');
}

function normalizeHandshakeMode(raw) {
  const value = cleanText(raw, 40).toLowerCase().replace(/[()]/g, '').trim();
  if (value === 'a' || value === 'option a' || value === 'webhook' || value === 'inbox') return 'webhook';
  if (value === 'b' || value === 'option b' || value === 'polling' || value === 'poll' || value === 'scheduled polling') return 'polling';
  if (value === 'c' || value === 'option c' || value === 'manual') return 'manual';
  return '';
}

function validateParsedHandshake({ mode, webhookUrl, pollIntervalMinutes, clientName }) {
  if (!mode) {
    return {
      matched: true,
      valid: false,
      errorMessage: 'I could not read which option your AI picked. Please paste your AI handshake reply naming option (a) webhook with a web address, option (b) polling with how many minutes between checks, or option (c) manual.',
    };
  }
  if (mode === 'webhook') {
    const checked = validateWebhookUrl(webhookUrl);
    if (!checked.ok) {
      return {
        matched: true,
        valid: false,
        errorMessage: 'I could not finish connecting your AI because option (a) needs a valid webhook or inbox web address starting with https:// or http://. Ask your AI to resend its handshake reply, or choose option (b) polling or option (c) manual.',
      };
    }
    return { matched: true, valid: true, mode: 'webhook', webhookUrl: checked.url, pollIntervalMinutes: null, clientName: cleanText(clientName, 120) || null };
  }
  if (mode === 'polling') {
    const minutes = Math.round(Number(pollIntervalMinutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      return {
        matched: true,
        valid: false,
        errorMessage: 'I could not finish connecting your AI because option (b) needs a polling interval in minutes (between 1 and 1440, for example 10 minutes). Ask your AI to resend its handshake reply.',
      };
    }
    return { matched: true, valid: true, mode: 'polling', webhookUrl: null, pollIntervalMinutes: minutes, clientName: cleanText(clientName, 120) || null };
  }
  return { matched: true, valid: true, mode: 'manual', webhookUrl: null, pollIntervalMinutes: null, clientName: cleanText(clientName, 120) || null };
}

export function parseReservationsHandshakeText(rawText = '', { hasPendingConnection = false } = {}) {
  const text = cleanText(rawText, 4000);
  if (!text) return { matched: false };

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const looksJson = candidate.startsWith('{') || candidate.startsWith('[');
  const hasHint = HANDSHAKE_HINT_RE.test(text);

  if (looksJson) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        if (!hasPendingConnection && !hasHint) return { matched: false };
        return validateParsedHandshake({ mode: '' });
      }
      const hasHandshakeKeys = Boolean(
        parsed.mode || parsed.option || parsed.webhook_url || parsed.webhookUrl
        || parsed.poll_interval_minutes !== undefined || parsed.pollIntervalMinutes !== undefined
        || parsed.vk_reservations_handshake,
      );
      if (!hasHandshakeKeys && !hasPendingConnection) return { matched: false };
      const mode = normalizeHandshakeMode(parsed.mode || parsed.option);
      const webhookUrl = parsed.webhook_url || parsed.webhookUrl || parsed.inbox_url || parsed.url || '';
      const pollIntervalMinutes = parsed.poll_interval_minutes ?? parsed.pollIntervalMinutes ?? parsed.interval_minutes ?? parsed.minutes;
      const clientName = parsed.client_name || parsed.clientName || parsed.ai || '';
      return validateParsedHandshake({ mode, webhookUrl, pollIntervalMinutes, clientName });
    } catch (error) {
      void error;
      if (!hasPendingConnection && !hasHint) return { matched: false };
      return {
        matched: true,
        valid: false,
        errorMessage: 'I could not read that handshake reply from your AI. Please paste the complete handshake reply naming option (a) webhook with a web address, option (b) polling with minutes between checks, or option (c) manual.',
      };
    }
  }

  if (!hasHint && !hasPendingConnection) return { matched: false };
  if (hasPendingConnection && isReservationAsk(text)) return { matched: false };

  const modeField = text.match(/\b(?:mode|option)\s*[:=\-]?\s*\(?([a-d]|webhook|polling|poll|manual)\)?\b/i);
  let mode = modeField ? normalizeHandshakeMode(modeField[1]) : '';
  if (!mode) {
    if (/\b(webhook|inbox)\b/i.test(text)) mode = 'webhook';
    else if (/\b(poll(?:ing)?|every\s+\d+\s*(?:min|minute))\b/i.test(text)) mode = 'polling';
    else if (/\bmanual\b/i.test(text) || /check my vk reservations/i.test(text)) mode = 'manual';
  }

  if (!mode) {
    if (!hasHint && !hasPendingConnection) return { matched: false };
    if (hasPendingConnection && YES_REPLY_RE.test(text)) return { matched: false };
    if (!hasHint && !/\b(option|mode|webhook|poll|manual|handshake|https?:\/\/|minutes?)\b/i.test(text)) {
      return { matched: false };
    }
    return validateParsedHandshake({ mode: '' });
  }

  const urlMatch = text.match(/https?:\/\/[^\s"'<>)]+/i)
    || text.match(/\b(?:webhook|url|inbox)\s*[:=]\s*([^\s,;]+)/i);
  const webhookUrl = urlMatch ? (urlMatch[1] || urlMatch[0]) : '';
  const minMatch = text.match(/\b(?:interval|poll(?:_interval)?(?:_minutes)?|every|minutes?)\s*[:=]?\s*(-?\d+)\b/i)
    || text.match(/\b(-?\d+)\s*(?:min|mins|minutes?)\b/i);
  const pollIntervalMinutes = minMatch ? Number(minMatch[1]) : NaN;
  const clientMatch = text.match(/\b(?:client|ai)\s*[:=]\s*([^\n,;]{2,60})/i);
  const clientName = clientMatch ? clientMatch[1].trim() : '';

  return validateParsedHandshake({ mode, webhookUrl, pollIntervalMinutes, clientName });
}
