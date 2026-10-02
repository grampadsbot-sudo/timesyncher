function inviteRow(turnActionResults) {
  const invite = turnActionResults?.invite;
  if (!invite || typeof invite !== 'object') return null;
  return invite;
}

export function turnInviteReplyFacts(turnActionResults) {
  const invite = inviteRow(turnActionResults);
  if (!invite) return null;
  const email = invite.inviteeEmail ? String(invite.inviteeEmail).toLowerCase() : '';
  const code = String(invite.code || '').trim();
  if (invite.ok === true && email) {
    return {
      turnInvite: {
        ok: true,
        code: code || 'collaborator_invite_sent',
        inviteeEmail: email,
        detail: `emailed to ${email}; joins once they accept`,
      },
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

