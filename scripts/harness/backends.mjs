function isBackend(value) {
  return value === 'openrouter' || value === 'vk_bot_mcp';
}

function fillBlock(group) {
  let openCount = group.filter((story) => story.reply_backend === 'openrouter').length;
  let mcpCount = group.filter((story) => story.reply_backend === 'vk_bot_mcp').length;
  for (const story of group) {
    if (isBackend(story.reply_backend)) continue;
    if (openCount < 5) {
      story.reply_backend = 'openrouter';
      openCount += 1;
    } else if (mcpCount < 5) {
      story.reply_backend = 'vk_bot_mcp';
      mcpCount += 1;
    } else if (openCount <= mcpCount) {
      story.reply_backend = 'openrouter';
      openCount += 1;
    } else {
      story.reply_backend = 'vk_bot_mcp';
      mcpCount += 1;
    }
  }
}

export function assignReplyBackends(stories) {
  const next = stories.map((story) => ({ ...story }));
  for (let offset = 0; offset < next.length; offset += 10) fillBlock(next.slice(offset, offset + 10));
  return next;
}

const APP_FAILURE_FIELDS = ['error', 'reason', 'code', 'status', 'intentError', 'titleError', 'intakeError', 'rosterError'];

const KEY_LIMIT_RE = /key limit exceeded|\b(?:daily|monthly|weekly) (?:spend(?:ing)? |usage |key |credit )?limit\b|\bcredits?[_ ]required\b|\brate[ _-]?limit\w*\b[^.\n]{0,80}\b(?:daily|monthly)\b|\bspend(?:ing)? limit (?:exceeded|reached|hit)\b/i;

const SPEND_LIMIT_REASONS = Object.freeze(['payment-required', 'credit-exhausted', 'key-limit']);

export function isSpendLimitReason(reason) {
  return SPEND_LIMIT_REASONS.includes(String(reason || ''));
}

export function redactUrls(text) {
  return String(text ?? '').replace(/\b(?:https?|wss?):\/\/[^\s"'<>)\]]+/gi, '[redacted-url]').replace(/\bwww\.[^\s"'<>)\]]+/gi, '[redacted-url]');
}

function fieldText(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return [value.message, value.code, value.reason].filter((item) => item != null && item !== '').map(String).join(' ');
  return String(value);
}

function appFailureText(body) {
  if (!body || typeof body !== 'object') return '';
  return APP_FAILURE_FIELDS.map((key) => fieldText(body[key])).filter(Boolean).join(' ');
}

export function classifyAppFailure(status, body) {
  const code = Number(status);
  const text = appFailureText(body);
  if (code === 402 || /payment required|payment_required|provider_payment_required/i.test(text)) return 'payment-required';
  if (/credit exhausted|credits exhausted|insufficient credit|quota exceeded|billing limit/i.test(text)) return 'credit-exhausted';
  const failed = code >= 400 || body?.ok === false;
  if (failed && KEY_LIMIT_RE.test(text)) return 'key-limit';
  return '';
}

export function spendLimitDetail(reason, body) {
  const label = reason === 'key-limit' ? 'model-key spend/quota limit' : reason === 'payment-required' ? 'payment-required wall' : 'credit/quota limit';
  const message = redactUrls(appFailureText(body)).replace(/\s+/g, ' ').trim().slice(0, 240);
  return `app hit a spend/quota limit (${label}; no reply generated, nothing stored)${message ? `: ${message}` : ''}`;
}

export function clampConcurrency(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 1) return 1;
  return 2;
}
