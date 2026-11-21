export const RESERVATION_HOW_TO_URI = 'vk://reservations/how-to';

export const IMPORT_TOOL_NAMES = new Set([
  'describe_import_format',
  'start_import',
  'upload_media',
  'preview_import',
  'commit_import',
  'read_vacation',
  'update_vacation',
]);

export const RESERVATION_MCP_TOOLS = [
  {
    name: 'register_reservations_handshake',
    description: 'Register how your AI receives Vacay Keepsake reservation requests: mode "webhook" (option a: Vacay Keepsake pings your webhook or inbox URL), "polling" (option b: your AI calls list_reservation_requests on a schedule every N minutes), or "manual" (option c: the user pastes "check my VK reservations" into your AI). Completing this handshake activates the account-level reservations connection and confirms setup in chat.',
    inputSchema: {
      type: 'object',
      required: ['mode'],
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: ['webhook', 'polling', 'manual'],
          description: 'Chosen delivery option: "webhook" for option (a), "polling" for option (b), or "manual" for option (c).',
        },
        webhook_url: {
          type: 'string',
          description: 'Required when mode is "webhook": the http or https webhook or inbox URL Vacay Keepsake should ping with new reservation requests.',
        },
        poll_interval_minutes: {
          type: 'integer',
          minimum: 1,
          maximum: 1440,
          description: 'Required when mode is "polling": how often (in minutes) your AI checks list_reservation_requests.',
        },
        client_name: {
          type: 'string',
          description: 'Optional friendly name for your AI client.',
        },
        vacation_id: {
          type: 'string',
          description: 'Optional vacation id where setup confirmation should be posted in chat.',
        },
      },
    },
  },
  {
    name: 'list_vacations',
    description: 'List every vacation the connected account owns or collaborates on, returning each vacation_id, title, destination, dates, and role.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'find_vacation',
    description: 'Find a vacation the connected account owns or collaborates on by title, destination, or keyword so your AI can book directly without a prior Vacay Keepsake chat request.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          description: 'Search text matching the vacation title or destination.',
        },
      },
    },
  },
  {
    name: 'list_reservation_requests',
    description: 'List reservation requests across every vacation for the connected account (or filtered to one vacation_id). Defaults to status "waiting".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vacation_id: {
          type: 'string',
          description: 'Optional vacation id filter. Must be a vacation the connected account owns or collaborates on.',
        },
        status: {
          type: 'string',
          enum: ['waiting', 'booked', 'failed', 'cancelled', 'all'],
          description: 'Optional status filter (defaults to "waiting").',
        },
      },
    },
  },
  {
    name: 'submit_reservation_result',
    description: 'Report the outcome of a reservation booking back to Vacay Keepsake. Confirmed bookings land live immediately on the matching vacation item (or create one) marked "Booked by your AI" with time and confirmation number, and post a chat update. Failed bookings explain why in chat and offer alternatives without marking the item booked.',
    inputSchema: {
      type: 'object',
      required: ['status'],
      additionalProperties: false,
      properties: {
        request_id: {
          type: 'string',
          description: 'Waiting reservation request id from list_reservation_requests or webhook ping. Omit for ask-your-AI-first bookings.',
        },
        vacation_id: {
          type: 'string',
          description: 'Vacation id. Required when request_id is omitted; optional otherwise and must match the request vacation.',
        },
        status: {
          type: 'string',
          enum: ['confirmed', 'failed'],
          description: 'Booking result status: "confirmed" or "failed".',
        },
        venue_name: {
          type: 'string',
          description: 'Name of the restaurant, hotel, or venue. Required when request_id is omitted.',
        },
        category: {
          type: 'string',
          enum: ['restaurant', 'hotel', 'car', 'flight', 'activity', 'bar', 'tour', 'attraction', 'event', 'other'],
          description: 'Optional item category (defaults to "restaurant").',
        },
        date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Optional booking date in YYYY-MM-DD format.',
        },
        time: {
          type: 'string',
          description: 'Reservation time such as "19:30" or "7:30 PM".',
        },
        party_size: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Number of guests in the reservation.',
        },
        confirmation_number: {
          type: 'string',
          description: 'Booking confirmation number or code.',
        },
        notes: {
          type: 'string',
          description: 'Additional booking notes such as seating preference or cancellation policy.',
        },
        reason: {
          type: 'string',
          description: 'Plain explanation of why the booking could not be completed when status is "failed".',
        },
        alternatives: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggested next options when status is "failed" (such as another time, another place, or trying again).',
        },
      },
    },
  },
];

export const RESERVATION_TOOL_NAMES = new Set(RESERVATION_MCP_TOOLS.map((tool) => tool.name));

export const MCP_RESOURCES = [
  {
    uri: RESERVATION_HOW_TO_URI,
    name: 'Vacay Keepsake Reservations How-To',
    description: 'How an external AI completes the reservations handshake (options a, b, c), reads waiting requests, finds vacations, and submits live reservation results.',
    mimeType: 'text/markdown',
  },
];

const RESERVATIONS_HOW_TO_MARKDOWN = [
  '# Vacay Keepsake Reservations MCP Guide',
  '',
  'Vacay Keepsake never books reservations directly. Your AI connects once at the account level and handles reservations across every vacation the user owns or collaborates on.',
  '',
  '## 1. Handshake options',
  'Pick the best option your AI supports and either call `register_reservations_handshake` directly or return a short handshake reply for the user to paste into Vacay Keepsake chat:',
  '- **(a) Webhook / inbox (`mode: "webhook"`)**: Provide `webhook_url` (an http or https URL). Vacay Keepsake pings that URL whenever the user asks for a reservation (no token is included in the ping body).',
  '- **(b) Scheduled polling (`mode: "polling"`)**: Provide `poll_interval_minutes` (integer N). Your AI calls `list_reservation_requests` every N minutes to pick up waiting requests.',
  '- **(c) Manual (`mode: "manual"`)**: No background trigger. Each time the user asks for a reservation, Vacay Keepsake shows a one-tap copy button for `"check my VK reservations"`, which the user pastes into your AI.',
  '',
  '### Pasted handshake reply format (if your AI cannot call MCP during setup)',
  '```json',
  '{ "mode": "webhook", "webhook_url": "https://example.com/vk-reservations" }',
  '```',
  'or `{ "mode": "polling", "poll_interval_minutes": 10 }` or `{ "mode": "manual" }`.',
  '',
  '## 2. Reading waiting requests',
  'Call `list_reservation_requests` (optional `vacation_id`, `status` defaults to `"waiting"`). Each item carries `request_id`, `vacation_id`, `venue_name`, `requested_date`, `requested_time`, `party_size`, and `request_text`.',
  '',
  '## 3. Ask-your-AI-first bookings',
  'If the user asks your AI directly (for example "book a restaurant for my city vacation"), call `find_vacation` or `list_vacations` to locate the `vacation_id`, complete the booking, then call `submit_reservation_result` with `vacation_id` and `venue_name` (no `request_id` required).',
  '',
  '## 4. Submitting results (`submit_reservation_result`)',
  '- **Confirmed (`status: "confirmed"`)**: Include `request_id` (if fulfilling a request) or `vacation_id` + `venue_name`, plus `time`, `date` (YYYY-MM-DD), `party_size`, `confirmation_number`, and `notes`. The booking lands live immediately on the vacation item marked `"Booked by your AI"` and posts a `"booked"` update in chat.',
  '- **Failed (`status: "failed"`)**: Include `reason` and optional `alternatives` (another time, another place, try again). Vacay Keepsake posts a `"failed"` update in chat without marking the item booked.',
  '',
  '## 5. Scope and safety',
  'Reservations tokens are separate from vacation import tokens. Never echo or log access tokens in chat messages or webhook payloads.',
].join('\n');

export function readMcpResource(uri) {
  const normalized = String(uri || '').trim();
  if (normalized === RESERVATION_HOW_TO_URI) {
    return {
      contents: [
        {
          uri: RESERVATION_HOW_TO_URI,
          mimeType: 'text/markdown',
          text: RESERVATIONS_HOW_TO_MARKDOWN,
        },
      ],
    };
  }
  throw Object.assign(
    new Error(`Unknown MCP resource "${normalized}".`),
    { statusCode: 404, code: 'resource_not_found' },
  );
}

export function nextStepMessageForMode(mode, pollIntervalMinutes = null) {
  if (mode === 'webhook') {
    return 'From now on, just ask Vacay Keepsake to book something and wait — your AI will be notified automatically and post the result here.';
  }
  if (mode === 'polling') {
    const minutes = Math.max(1, Math.round(Number(pollIntervalMinutes) || 5));
    const unit = minutes === 1 ? 'minute' : 'minutes';
    return `From now on, just ask Vacay Keepsake to book something, and your AI will pick it up within about ${minutes} ${unit} and post the result here.`;
  }
  return 'From now on, ask Vacay Keepsake to book something, then tap once to copy "check my VK reservations" into your AI each time.';
}

export function reservationModeLabel(mode, pollIntervalMinutes = null) {
  if (mode === 'webhook') return 'Webhook (automatic ping)';
  if (mode === 'polling') {
    const minutes = Math.max(1, Math.round(Number(pollIntervalMinutes) || 5));
    return `Scheduled polling (every ${minutes} min)`;
  }
  if (mode === 'manual') return 'Manual check';
  return 'Waiting for handshake';
}
