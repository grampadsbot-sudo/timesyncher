function inviteRow(turnActionResults) {
  const invite = turnActionResults?.invite;
  if (!invite || typeof invite !== 'object') return null;
  return invite;
}

const TURN_INVITE_PENDING_RULE =
  'This turn emailed a collaborator invite only. The invitee is pending until they accept. Say the invite was emailed and is pending; do not welcome them by name or say they are joining, on, or confirmed on the vacation. Always say "vacation", never "trip".';

const TURN_INVITE_ACTIVE_RULE =
  'This turn added an existing Vacay Keepsake customer directly to this vacation. No accept email was sent; the vacation now appears in their dropdown. Always say "vacation", never "trip".';

export function turnInviteReplyFacts(turnActionResults) {
  const invite = inviteRow(turnActionResults);
  if (!invite) return null;
  const email = invite.inviteeEmail ? String(invite.inviteeEmail).toLowerCase() : '';
  const inviteeName = String(invite.inviteeName || '').trim();
  const code = String(invite.code || '').trim();
  if (invite.ok === true && email) {
    const activated = code === 'collaborator_seat_activated';
    return {
      turnInvite: {
        ok: true,
        code: code || 'collaborator_invite_sent',
        inviteeEmail: email,
        ...(inviteeName ? { inviteeName } : {}),
        detail: activated
          ? `added directly for ${email}; vacation appears in their dropdown with no accept email`
          : `emailed to ${email}; pending until they accept the invite`,
      },
      turnInviteRule: activated ? TURN_INVITE_ACTIVE_RULE : TURN_INVITE_PENDING_RULE,
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

