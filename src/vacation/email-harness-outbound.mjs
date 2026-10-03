function cleanText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

/** When TIMESYNCHER_HARNESS_STUB_OUTBOUND=1, only bundle-spine recipients hit Resend. */
export function harnessOutboundEmailAllowed(to, env = process.env) {
  if (env.TIMESYNCHER_HARNESS_STUB_OUTBOUND !== '1') return true;
  const addr = cleanText(to, 180).toLowerCase();
  if (addr === 'alex.rivera.sct@agentmail.to') return true;
  if (addr === 'kim.rivera.sct@agentmail.to') return true;
  if (/^shepherd-[0-9a-f]{7}-\d+@resend\.dev$/.test(addr)) return true;
  return false;
}

/** Shepherd smoke + purchase paths: only real Resend sends pass (never stubbed/pending/failed). */
export function outboundEmailPassesSmokeHarness(row = {}) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.status || '') !== 'sent') return false;
  return cleanText(row.provider_message_id, 200).length > 0;
}

export function extractResendResponseMetadata(response) {
  if (!response?.headers) return {};
  const meta = {};
  const daily = response.headers.get('x-resend-daily-quota');
  if (daily != null && String(daily).trim()) meta.resendDailyQuota = cleanText(daily, 120);
  const ratelimit = {};
  for (const [key, value] of response.headers.entries()) {
    if (!/^ratelimit-/i.test(key)) continue;
    ratelimit[key.toLowerCase()] = cleanText(value, 120);
  }
  if (Object.keys(ratelimit).length) meta.resendRatelimit = ratelimit;
  return meta;
}

export function resendAttemptFields(sent, error) {
  if (error) {
    return {
      provider: 'resend',
      providerMessageId: null,
      status: 'failed',
      errorSummary: cleanText(error.message, 1000),
      sentAt: null,
      resendMetadata: error.resendMetadata || {},
    };
  }
  if (sent?.stubbed) {
    return {
      provider: sent.provider,
      providerMessageId: null,
      status: 'stubbed',
      errorSummary: null,
      sentAt: null,
      resendMetadata: sent.resendMetadata || { harnessStub: true },
    };
  }
  if (sent) {
    return {
      provider: sent.provider,
      providerMessageId: sent.providerMessageId,
      status: 'sent',
      errorSummary: null,
      sentAt: new Date().toISOString(),
      resendMetadata: sent.resendMetadata || {},
    };
  }
  return {
    provider: 'pending',
    providerMessageId: null,
    status: 'pending',
    errorSummary: null,
    sentAt: null,
    resendMetadata: {},
  };
}

export async function sendWithResend({
  to, subject, htmlBody, textBody, env, fromEmailFn,
}) {
  if (!harnessOutboundEmailAllowed(to, env)) {
    return {
      provider: 'harness_stub',
      providerMessageId: null,
      stubbed: true,
      resendMetadata: { harnessStub: true },
    };
  }
  const apiKey = env.RESEND_API_KEY || env.TIMESYNCHER_RESEND_API_KEY || '';
  if (!apiKey) return null;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmailFn(env),
      to,
      subject,
      html: htmlBody,
      text: textBody,
    }),
  });
  const resendMetadata = extractResendResponseMetadata(response);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(json.message || json.error || `Resend ${response.status}`);
    err.resendMetadata = resendMetadata;
    throw err;
  }
  return { provider: 'resend', providerMessageId: json.id || null, resendMetadata };
}
