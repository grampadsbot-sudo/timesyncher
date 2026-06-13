import { onboardingLink, telegramLink } from './onboarding.mjs';

function cleanText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function supportEmail(env = process.env) {
  return env.TIMESYNCHER_SUPPORT_EMAIL || 'support@timesyncher.com';
}

function fromEmail(env = process.env) {
  return env.TIMESYNCHER_EMAIL_FROM || `TimeSyncher Vacation <${supportEmail(env)}>`;
}

export function purchaseEmail({ contact, token, env = process.env }) {
  const name = cleanText(contact?.firstName || contact?.displayName || 'there', 80) || 'there';
  const onboardingUrl = onboardingLink(token, env);
  const botUrl = telegramLink(token, env);
  const iosUrl = 'https://apps.apple.com/app/telegram-messenger/id686449807';
  const androidUrl = 'https://play.google.com/store/apps/details?id=org.telegram.messenger';
  const macUrl = 'https://apps.apple.com/us/app/telegram/id747648890?mt=12';
  const subject = 'Your TimeSyncher Vacation purchase is confirmed';
  const textBody = [
    `Hi ${name},`,
    '',
    'Your TimeSyncher Vacation purchase is confirmed.',
    '',
    'Click the button below to review TimeSyncher Terms & Privacy and get started on your unforgettable TimeSyncher Vacation.',
    '',
    `Start TimeSyncher Vacation: ${onboardingUrl}`,
    `Telegram bot link after terms acceptance: ${botUrl}`,
    '',
    'If Telegram is not installed:',
    `iPhone/iPad: ${iosUrl}`,
    `Android: ${androidUrl}`,
    `Mac: ${macUrl}`,
    '',
    `Questions: ${supportEmail(env)}`,
  ].join('\n');
  const htmlBody = `<!doctype html>
<html><body style="margin:0;background:#050505;color:#fffaf0;font-family:Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px">
    <h1 style="color:#f5d37b">Your TimeSyncher Vacation purchase is confirmed</h1>
    <p>Hi ${name},</p>
    <p>Click the button below to review TimeSyncher Terms &amp; Privacy and get started on your unforgettable TimeSyncher Vacation.</p>
    <p><a href="${onboardingUrl}" style="display:inline-block;background:#f5d37b;color:#080604;padding:13px 18px;border-radius:999px;font-weight:800;text-decoration:none">Start TimeSyncher Vacation</a></p>
    <p>After terms acceptance, you can also open the bot directly with this tokenized link:</p>
    <p><a href="${botUrl}">${botUrl}</a></p>
    <p>If Telegram is not installed: <a href="${iosUrl}">iPhone/iPad</a> · <a href="${androidUrl}">Android</a> · <a href="${macUrl}">Mac</a></p>
    <p style="color:#cfc2a9">Questions: ${supportEmail(env)}</p>
  </div>
</body></html>`;
  return { subject, textBody, htmlBody };
}

async function sendWithResend({ to, subject, htmlBody, textBody, env }) {
  const apiKey = env.RESEND_API_KEY || env.TIMESYNCHER_RESEND_API_KEY || '';
  if (!apiKey) return null;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail(env),
      to,
      subject,
      html: htmlBody,
      text: textBody,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || json.error || `Resend ${response.status}`);
  return { provider: 'resend', providerMessageId: json.id || null };
}

export async function queueOrSendPurchaseEmail(db, onboarding, env = process.env) {
  const to = cleanText(onboarding.contact?.email, 180).toLowerCase();
  if (!to) return { ok: false, status: 'skipped', reason: 'missing email' };
  const message = purchaseEmail({ contact: onboarding.contact, token: onboarding.token, env });

  const existing = await db`
    select id, status
    from outbound_emails
    where session_id = ${onboarding.session.id}
      and subject = ${message.subject}
    limit 1
  `;
  if (existing[0]?.status === 'sent') return { ok: true, status: 'already_sent', emailId: existing[0].id };

  let provider = 'pending';
  let providerMessageId = null;
  let status = 'pending';
  let errorSummary = null;
  let sentAt = null;

  try {
    const sent = await sendWithResend({ to, ...message, env });
    if (sent) {
      provider = sent.provider;
      providerMessageId = sent.providerMessageId;
      status = 'sent';
      sentAt = new Date().toISOString();
    }
  } catch (error) {
    provider = 'resend';
    status = 'failed';
    errorSummary = cleanText(error.message, 1000);
  }

  const rows = existing[0]
    ? await db`
        update outbound_emails
        set provider = ${provider},
          provider_message_id = ${providerMessageId},
          status = ${status},
          error_summary = ${errorSummary},
          sent_at = ${sentAt},
          metadata = metadata || ${{
            onboardingUrl: onboarding.onboardingUrl,
            telegramUrl: onboarding.telegramUrl,
          }}
        where id = ${existing[0].id}
        returning id
      `
    : await db`
        insert into outbound_emails (
          customer_id, order_id, session_id, to_email, subject, html_body, text_body,
          provider, provider_message_id, status, error_summary, metadata, sent_at
        )
        values (
          ${onboarding.customerId}, ${onboarding.orderId}, ${onboarding.session.id}, ${to},
          ${message.subject}, ${message.htmlBody}, ${message.textBody}, ${provider},
          ${providerMessageId}, ${status}, ${errorSummary}, ${{
            onboardingUrl: onboarding.onboardingUrl,
            telegramUrl: onboarding.telegramUrl,
          }}, ${sentAt}
        )
        returning id
      `;

  if (status === 'sent') {
    await db`
      update onboarding_sessions
      set email_sent_at = coalesce(email_sent_at, now()), updated_at = now()
      where id = ${onboarding.session.id}
    `;
  }

  return { ok: status !== 'failed', status, emailId: rows[0].id, provider, errorSummary };
}
