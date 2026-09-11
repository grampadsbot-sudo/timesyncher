import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const INTAKE_SOT = 'bot-admin/messages/time-syncher/tg-intake-gbrain-track-and-build-cue-20260910';
export const INTAKE_SKILL = 'skills/tg-intake-gbrain-track-and-build/skill';

/** Craig product cue after enough intake. Do not invent a different wait window. */
export const INITIAL_BUILD_CUE = "I'm building your initial itinerary now and it may take 10–15 minutes.";

export function productGbrainRoot(env = process.env) {
  return String(env.TIMESYNCHER_PRODUCT_GBRAIN_ROOT || env.TIMESYNCHER_PRIVATE_GBRAIN || '/home/ubishere9995/gbrain').replace(/\/+$/, '');
}

function slugPart(value, max = 40) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'unknown';
}

export function intakeTurnSlug({ telegramChatId, inboundTranscriptId, receivedAt } = {}) {
  return `bot-admin/messages/time-syncher/tg-intake/${slugPart(telegramChatId)}/${slugPart(inboundTranscriptId || receivedAt || Date.now())}`;
}

export function formatIntakePage({
  prompt = '',
  response = '',
  queued = false,
  vacationName = '',
  telegramChatId = '',
  inboundTranscriptId = '',
  outboundTranscriptId = '',
} = {}) {
  return [
    '---',
    'title: TG intake turn',
    'type: concept',
    'source: telegram-vacation-intake',
    `sot: ${INTAKE_SOT}`,
    '---',
    '',
    '# Telegram intake turn',
    '',
    `- chat: ${telegramChatId || ''}`,
    `- inbound: ${inboundTranscriptId || ''}`,
    `- outbound: ${outboundTranscriptId || ''}`,
    `- queued: ${queued ? 'yes' : 'no'}`,
    `- vacationName: ${vacationName || ''}`,
    '',
    '## Customer',
    '',
    String(prompt || '').trim() || '(empty)',
    '',
    '## TimeSyncher Vacation',
    '',
    String(response || '').trim() || '(empty)',
    '',
  ].join('\n');
}

export function persistIntakeTurnToGbrain(turn = {}, env = process.env) {
  const slug = intakeTurnSlug(turn);
  const content = formatIntakePage(turn);
  const root = productGbrainRoot(env);
  const dest = path.join(root, `${slug}.md`);
  const tmp = path.join('/tmp', `ts-tg-intake-${Date.now()}-${Math.random().toString(16).slice(2)}.md`);
  try {
    fs.writeFileSync(tmp, content);
    const capture = spawnSync('gbrain', ['capture', '--file', tmp, '--slug', slug], {
      encoding: 'utf8',
      timeout: 15000,
    });
    if (capture.status === 0) {
      fs.unlinkSync(tmp);
      return { ok: true, slug, via: 'gbrain-capture' };
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(tmp, dest);
    fs.unlinkSync(tmp);
    return { ok: true, slug, via: 'gbrain-write-through', path: dest };
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    return { ok: false, slug, error: error.message || String(error) };
  }
}
