function inviteRow(turnActionResults) {
  const invite = turnActionResults?.invite;
  if (!invite || typeof invite !== 'object') return null;
  return invite;
}

const TURN_INVITE_PENDING_RULE =
  'This turn emailed a collaborator invite only. The invitee is pending until they accept. Say the invite was emailed and is pending; do not welcome them by name or say they are joining, on, or confirmed on the trip.';

export function turnInviteReplyFacts(turnActionResults) {
  const invite = inviteRow(turnActionResults);
  if (!invite) return null;
  const email = invite.inviteeEmail ? String(invite.inviteeEmail).toLowerCase() : '';
  const inviteeName = String(invite.inviteeName || '').trim();
  const code = String(invite.code || '').trim();
  if (invite.ok === true && email) {
    return {
      turnInvite: {
        ok: true,
        code: code || 'collaborator_invite_sent',
        inviteeEmail: email,
        ...(inviteeName ? { inviteeName } : {}),
        detail: `emailed to ${email}; pending until they accept the invite`,
      },
      turnInviteRule: TURN_INVITE_PENDING_RULE,
    };
  }
  if (invite.ok === false) {
    return {
      turnInvite: {
        ok: false,
        code: code || 'send_failed',
        inviteeEmail: email || null,
        detail: code ? `invite not sent (${code})` : 'invite not sent',
      },
    };
  }
  return null;
}

export function applyTurnInviteReplyFacts(tripContext, turnActionResults) {
  if (!tripContext || typeof tripContext !== 'object') return tripContext;
  const facts = turnInviteReplyFacts(turnActionResults);
  if (!facts) return tripContext;
  return { ...tripContext, ...facts };
}

