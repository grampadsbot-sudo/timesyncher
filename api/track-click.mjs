import { sql } from '../src/vacation/db.mjs';
import { getSessionByToken, hashIp } from '../src/vacation/onboarding.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';

const TARGETS = {
  onboarding_page: null,
  telegram_open: 'telegramUrl',
  telegram_ios: 'telegramInstall.ios',
  telegram_android: 'telegramInstall.android',
  telegram_desktop: 'telegramInstall.desktop',
  telegram_skip_install: 'telegramUrl',
};

function header(req, name) {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(req) {
  return cleanText(header(req, 'x-forwarded-for')?.split(',')[0] || header(req, 'x-real-ip') || '', 120);
}

function targetHref(session, target) {
  if (!session) return '';
  if (target === 'telegram_open' || target === 'telegram_skip_install') return session.telegram_deep_link || '';
  if (target === 'telegram_ios') return 'https://apps.apple.com/app/telegram-messenger/id686449807';
  if (target === 'telegram_android') return 'https://play.google.com/store/apps/details?id=org.telegram.messenger';
  if (target === 'telegram_desktop') return 'https://apps.apple.com/us/app/telegram/id747648890?mt=12';
  return '';
}

async function recordClick(req, body) {
  const token = cleanText(body.session || body.token, 140);
  const eventType = cleanText(body.eventType || body.event_type || 'click', 80);
  const target = cleanText(body.target, 120);
  const db = sql(process.env);
  const session = token ? await getSessionByToken(db, token) : null;
  const href = cleanText(body.href || targetHref(session, target), 1000);

  const rows = await db`
    insert into onboarding_clicks (
      session_id, customer_id, order_id, event_type, target, href, user_agent, ip_hash, metadata
    )
    values (
      ${session?.id || null}, ${session?.customer_id || null}, ${session?.order_id || null},
      ${eventType}, ${target}, ${href}, ${cleanText(header(req, 'user-agent'), 500)},
      ${hashIp(clientIp(req), process.env)}, ${body.metadata || {}}
    )
    returning id
  `;

  if (session?.id && target) {
    await db`
      update onboarding_sessions
      set current_step = ${target},
        telegram_install_choice = case
          when ${target} in ('telegram_ios', 'telegram_android', 'telegram_desktop', 'telegram_skip_install') then ${target}
          else telegram_install_choice
        end,
        updated_at = now()
      where id = ${session.id}
    `;
  }

  return { id: rows[0].id, href };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = await readJson(req);
      const result = await recordClick(req, body);
      return sendJson(res, 201, { ok: true, clickId: result.id });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'https://timesyncher.com');
      const result = await recordClick(req, {
        session: url.searchParams.get('session'),
        eventType: 'redirect_click',
        target: url.searchParams.get('target'),
        href: url.searchParams.get('href'),
        metadata: { via: 'redirect' },
      });
      if (!result.href) return sendJson(res, 400, { ok: false, error: 'No redirect target.' });
      res.statusCode = 302;
      res.setHeader('location', result.href);
      res.end();
      return;
    }

    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to track click.' });
  }
}
