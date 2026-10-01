import { collaboratorEulaAcceptUrl } from './collaborators.mjs';
import { vacationAppLink } from './onboarding.mjs';
import { publicTripUrl, webAccessAcceptUrl } from './web-access.mjs';

function cleanText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function supportEmail(env = process.env) {
  return env.TIMESYNCHER_SUPPORT_EMAIL || 'support@timesyncher.com';
}

function fromEmail(env = process.env) {
  return env.TIMESYNCHER_EMAIL_FROM || `TimeSyncher Vacation <${supportEmail(env)}>`;
}

function missingSessionError({ tripId = '', sessionId = '' } = {}) {
  const trip = cleanText(tripId, 80);
  const session = cleanText(sessionId, 120);
  const named = [trip && `trip ${trip}`, session && `session ${session}`].filter(Boolean).join(', ');
  const error = new Error(`purchase email missing vacation app session${named ? ` for ${named}` : ''}`);
  error.code = 'purchase_email_missing_session';
  console.error(JSON.stringify({ event: error.code, tripId: trip, sessionId: session }));
  return error;
}

export function purchaseLaunchUrl({ sessionToken = '', token = '', tripId = '', sessionId = '', env = process.env } = {}) {
  const appToken = cleanText(sessionToken || token, 180);
  if (!appToken) throw missingSessionError({ tripId, sessionId });
  const url = vacationAppLink(appToken, env);
  if (url.includes('/shared/')) {
    const error = new Error(`purchase email launch included a shared trip URL for session ${sessionId || appToken}`);
    error.code = 'purchase_email_shared_launch';
    console.error(JSON.stringify({ event: error.code, tripId, sessionId, url }));
    throw error;
  }
  return url;
}

export function purchaseEmail({ contact, sessionToken = '', token = '', tripId = '', sessionId = '', env = process.env }) {
  const name = cleanText(contact?.firstName || contact?.displayName || 'there', 80) || 'there';
  const launchUrl = purchaseLaunchUrl({ sessionToken, token, tripId, sessionId, env });
  const subject = 'Your TimeSyncher Vacation purchase is confirmed';
  const textBody = [
    `Hi ${name},`,
    '',
    'Your TimeSyncher Vacation purchase is confirmed.',
    '',
    'Click the link in this email to open TimeSyncher Vacation.',
    '',
    `Open TimeSyncher Vacation: ${launchUrl}`,
    '',
    `Questions: ${supportEmail(env)}`,
  ].join('\n');
  const htmlBody = `<!doctype html>
<html><body style="margin:0;background:#050505;color:#fffaf0;font-family:Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px">
    <h1 style="color:#f5d37b">Your TimeSyncher Vacation purchase is confirmed</h1>
    <p>Hi ${name},</p>
    <p>Your TimeSyncher Vacation purchase is confirmed. Click the link in this email to open TimeSyncher Vacation.</p>
    <p><a href="${launchUrl}" style="display:inline-block;background:#f5d37b;color:#080604;padding:13px 18px;border-radius:999px;font-weight:800;text-decoration:none">Open TimeSyncher Vacation</a></p>
    <p><a href="${launchUrl}" style="color:#f5d37b;word-break:break-all">${launchUrl}</a></p>
    <p style="color:#cfc2a9">Questions: <a href="mailto:${supportEmail(env)}" style="color:#f5d37b;text-decoration:underline">${supportEmail(env)}</a></p>
  </div>
</body></html>`;
  return { subject, textBody, htmlBody, launchUrl };
}

export function collaboratorInviteEmail({ contact, invite, token, acceptUrl = '', publicUrl = '', env = process.env }) {
  const name = cleanText(contact?.firstName || contact?.displayName || invite?.requested_for || 'there', 80) || 'there';
  const owner = cleanText(invite?.owner_display_name || invite?.owner_email || 'the vacation owner', 160);
  const tripTitle = cleanText(invite?.trip_title || 'this TimeSyncher Vacation', 180);
  const link = cleanText(acceptUrl, 600);
  const site = cleanText(publicUrl, 600);
  const subject = `${owner} invited you to edit ${tripTitle}`;
  const textBody = [
    `Hi ${name},`,
    '',
    `${owner} approved this email address to edit ${tripTitle} on the TimeSyncher Vacation website.`,
    '',
    'View access lets you see the days. Edit access lets you add notes after this email invite is approved.',
    'You join from this email, accept the terms, and then the vacation opens.',
    '',
    link ? `Approved email invite: ${link}` : '',
    site ? `Vacation website: ${site}` : '',
    '',
    'Anyone with the shared vacation link can view it. Editing requires this owner-approved email invite.',
    '',
    `Questions: ${supportEmail(env)}`,
  ].filter((line) => line !== '').join('\n');
  const htmlBody = `<!doctype html>
<html><body style="margin:0;background:#050505;color:#fffaf0;font-family:Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px">
    <h1 style="color:#f5d37b">You can edit ${tripTitle}</h1>
    <p>Hi ${name},</p>
    <p>${owner} approved this email address to edit <strong>${tripTitle}</strong> on the TimeSyncher Vacation website.</p>
    <p>View access lets you see the days. Edit access lets you add notes after this email invite is approved. You join from this email, accept the terms, and then the vacation opens.</p>
    ${link ? `<p><a href="${link}" style="display:inline-block;background:#f5d37b;color:#080604;padding:13px 18px;border-radius:999px;font-weight:800;text-decoration:none">Open the approved email invite</a></p>` : ''}
    ${link ? `<p><a href="${link}" style="color:#f5d37b;word-break:break-all">${link}</a></p>` : ''}
    ${site ? `<p><a href="${site}" style="display:inline-block;background:#f5d37b;color:#080604;padding:13px 18px;border-radius:999px;font-weight:800;text-decoration:none">Open the vacation</a></p>` : ''}
    ${site ? `<p><a href="${site}" style="color:#f5d37b;word-break:break-all">${site}</a></p>` : ''}
    <p style="color:#cfc2a9">Anyone with the shared vacation link can view it. Editing requires this owner-approved email invite.</p>
    <p style="color:#cfc2a9">Questions: <a href="mailto:${supportEmail(env)}" style="color:#f5d37b;text-decoration:underline">${supportEmail(env)}</a></p>
  </div>
</body></html>`;
  return { subject, textBody, htmlBody, acceptUrl: link };
}

export function webEditorInviteEmail({ grant, token, env = process.env }) {
  const name = cleanText(grant?.display_name || grant?.email || 'there', 120) || 'there';
  const owner = cleanText(grant?.owner_display_name || grant?.owner_email || 'the vacation owner', 160);
  const tripTitle = cleanText(grant?.trip_title || 'this TimeSyncher Vacation', 180);
  const acceptUrl = webAccessAcceptUrl(token, env);
  const publicUrl = cleanText(grant?.public_url || '', 500);
  const subject = `${owner} approved you to edit ${tripTitle}`;
  const textBody = [
    `Hi ${name},`,
    '',
    `${owner} approved this email address to edit ${tripTitle} on the TimeSyncher Vacation website.`,
    '',
    'Use this private magic link to verify this browser and enable website editing:',
    acceptUrl,
    '',
    publicUrl ? `Vacation website: ${publicUrl}` : '',
    '',
    'Anyone with the shared vacation link can view it. Editing requires this owner-approved email verification.',
    '',
    `Questions: ${supportEmail(env)}`,
  ].filter((line) => line !== '').join('\n');
  const htmlBody = `<!doctype html>
<html><body style="margin:0;background:#050505;color:#fffaf0;font-family:Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px">
    <h1 style="color:#f5d37b">You can edit ${tripTitle}</h1>
    <p>Hi ${name},</p>
    <p>${owner} approved this email address to edit <strong>${tripTitle}</strong> on the TimeSyncher Vacation website.</p>
    <p><a href="${acceptUrl}" style="display:inline-block;background:#f5d37b;color:#080604;padding:13px 18px;border-radius:999px;font-weight:800;text-decoration:none">Verify email and enable editing</a></p>
    ${publicUrl ? `<p>Vacation website: <a href="${publicUrl}" style="color:#f5d37b;text-decoration:underline">${publicUrl}</a></p>` : ''}
    <p style="color:#cfc2a9">Anyone with the shared vacation link can view it. Editing requires this owner-approved email verification.</p>
    <p style="color:#cfc2a9">Questions: <a href="mailto:${supportEmail(env)}" style="color:#f5d37b;text-decoration:underline">${supportEmail(env)}</a></p>
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
  const sessionToken = onboarding.session?.token || onboarding.token || '';
  const sessionId = onboarding.session?.id || '';
  const message = purchaseEmail({
    contact: onboarding.contact,
    sessionToken,
    tripId: onboarding.tripId || '',
    sessionId,
    env,
  });

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
        set to_email = ${to},
          subject = ${message.subject},
          html_body = ${message.htmlBody},
          text_body = ${message.textBody},
          provider = ${provider},
          provider_message_id = ${providerMessageId},
          status = ${status},
          error_summary = ${errorSummary},
          sent_at = ${sentAt},
          metadata = metadata || ${{
            onboardingUrl: onboarding.onboardingUrl,
            vacationAppUrl: onboarding.vacationAppUrl,
            launchUrl: message.launchUrl,
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
            vacationAppUrl: onboarding.vacationAppUrl,
            launchUrl: message.launchUrl,
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

export function collaboratorInviteTargets({ acceptUrl = '', publicUrl = '', invite = null, trip = null, env = process.env } = {}) {
  const link = cleanText(acceptUrl, 600) || (invite?.id ? collaboratorEulaAcceptUrl(invite, env) : '');
  const site = cleanText(publicUrl, 600) || (trip ? publicTripUrl(trip, env) : '');
  return { acceptUrl: link, publicUrl: site };
}

export async function queueOrSendCollaboratorInviteEmail(db, { invite, token, contact, acceptUrl = '', publicUrl = '' }, env = process.env) {
  const to = cleanText(contact?.email || invite?.requested_email, 180).toLowerCase();
  if (!to) return { ok: false, status: 'skipped', reason: 'missing email' };
  let trip = null;
  if (!cleanText(publicUrl, 600) && invite?.trip_id && db) {
    const trips = await db`select title, metadata from trips where id = ${invite.trip_id} limit 1`;
    trip = trips[0] || null;
  }
  const targets = collaboratorInviteTargets({ acceptUrl, publicUrl, invite, trip, env });
  acceptUrl = targets.acceptUrl;
  publicUrl = targets.publicUrl;
  const normalizedContact = {
    ...contact,
    email: to,
    displayName: cleanText(contact?.displayName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || invite?.requested_for, 180),
  };
  const message = collaboratorInviteEmail({ contact: normalizedContact, invite, token, acceptUrl, publicUrl, env });

  const existing = await db`
    select id, status
    from outbound_emails
    where metadata->>'collaboratorInviteId' = ${String(invite.id)}
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
        set to_email = ${to},
          subject = ${message.subject},
          html_body = ${message.htmlBody},
          text_body = ${message.textBody},
          provider = ${provider},
          provider_message_id = ${providerMessageId},
          status = ${status},
          error_summary = ${errorSummary},
          sent_at = ${sentAt},
          metadata = metadata || ${{
            collaboratorInviteId: invite.id,
            toEmail: to,
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
          ${invite.owner_customer_id}, null, null, ${to},
          ${message.subject}, ${message.htmlBody}, ${message.textBody}, ${provider},
          ${providerMessageId}, ${status}, ${errorSummary}, ${{
            collaboratorInviteId: invite.id,
            collaboratorRequestedFor: normalizedContact.displayName || null,
          }}, ${sentAt}
        )
        returning id
      `;

  return { ok: status !== 'failed', status, emailId: rows[0].id, provider, errorSummary };
}

export async function queueOrSendWebEditorInviteEmail(db, { grant, token, acceptUrl }, env = process.env) {
  const to = cleanText(grant?.email, 180).toLowerCase();
  if (!to) return { ok: false, status: 'skipped', reason: 'missing email' };
  const message = webEditorInviteEmail({ grant, token, acceptUrl, env });

  const existing = await db`
    select id, status
    from outbound_emails
    where metadata->>'webAccessGrantId' = ${String(grant.id)}
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
            webAccessGrantId: grant.id,
            webAccessAcceptUrl: webAccessAcceptUrl(token, env),
            toEmail: to,
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
          ${grant.owner_customer_id}, null, null, ${to},
          ${message.subject}, ${message.htmlBody}, ${message.textBody}, ${provider},
          ${providerMessageId}, ${status}, ${errorSummary}, ${{
            webAccessGrantId: grant.id,
            webAccessAcceptUrl: webAccessAcceptUrl(token, env),
            toEmail: to,
            tripId: grant.trip_id,
            role: grant.role,
          }}, ${sentAt}
        )
        returning id
      `;

  return { ok: status !== 'failed', status, emailId: rows[0].id, provider, errorSummary };
}
