import { evaluateCheckIOutbound } from './shepherd-staging-smoke-env.mjs';
import { postItinerary } from './shepherd-staging-smoke-helpers.mjs';

export async function runShepherdCheckI(runCheck, { out, db, state, INVITE_EMAIL }) {
  await runCheck('I', async ({ setStage }) => {
    setStage('collaborator invite Alex');
    const inviteRes = await postItinerary(state.session, {
      tripId: state.tripId,
      action: 'collaborator-invite',
      seats: [{ name: 'Invite Alex', email: INVITE_EMAIL }],
    });
    const iInviteRow = (await db`
      select id, trip_id, status, metadata from vacation_collaborator_invites
      where owner_customer_id=${state.customerId} and metadata->>'email'=${INVITE_EMAIL} order by created_at desc limit 1`)[0];
    const iOutboundAll = await db`
      select id, status, subject, to_email, html_body, text_body, metadata, error_summary, provider_message_id, provider from outbound_emails
      where customer_id=${state.customerId} and to_email=${INVITE_EMAIL} order by created_at asc`;
    const ownerDisplay = (await db`select display_name, first_name from customers where id=${state.customerId} limit 1`)[0];
    const iAcceptPath = iInviteRow?.id ? `/accept/vacation-collaborator-${iInviteRow.id}` : '';
    const iHtml = String(iOutboundAll[0]?.html_body || iOutboundAll[0]?.text_body || '');
    const iLinkOk = iHtml.includes(iAcceptPath);
    const outboundRow = iOutboundAll[0] || null;
    const errorSummary = String(outboundRow?.error_summary || outboundRow?.metadata?.error || '');
    const resendQuotaBlocked = /daily email sending quota/i.test(errorSummary);
    out.checkI = {
      http: inviteRes.status,
      inviteId: iInviteRow?.id,
      outboundCount: iOutboundAll.length,
      outboundEmail: outboundRow,
      ownerDisplay,
      tripTitle: state.tripTitle,
      acceptLinkOk: iLinkOk,
      expectedAcceptPath: iAcceptPath,
      resendQuotaBlocked,
    };
    if (resendQuotaBlocked) {
      out.checkI.infraReason = errorSummary;
      console.error(`Check I: INFRA_BLOCKED — Resend daily quota (not an app PASS/FAIL): ${errorSummary}`);
      return {
        pass: false,
        checkStatus: 'INFRA_BLOCKED',
        infraDetail: { reason: 'resend_daily_quota', errorSummary },
        http: inviteRes.status,
      };
    }
    const outboundEval = evaluateCheckIOutbound({ row: outboundRow, env: process.env });
    out.checkI.outboundEval = outboundEval;
    if (outboundEval.infraBlocked) {
      out.checkI.infraReason = outboundEval.reason;
      console.error(`Check I: INFRA_BLOCKED — cannot confirm outbound (${outboundEval.reason})`);
      return {
        pass: false,
        checkStatus: 'INFRA_BLOCKED',
        infraDetail: { reason: outboundEval.reason },
        http: inviteRes.status,
      };
    }
    const iOwnerOk = new RegExp(ownerDisplay?.display_name?.split(/\s+/)[0] || 'Shepherd', 'i').test(outboundRow?.subject || '');
    const iTitleOk = state.tripTitle && (outboundRow?.subject || '').includes(state.tripTitle);
    const pass = inviteRes.status === 200 && iOutboundAll.length === 1
      && outboundEval.pass && iLinkOk && iOwnerOk && iTitleOk;
    return { pass, http: inviteRes.status };
  }, { timeoutMs: 60000 });
}
