function inviteeLabel(row = {}) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const name = String(row.requested_for || meta.displayName || '').trim();
  const email = String(meta.email || '').trim().toLowerCase();
  if (name) return name;
  if (email) return email;
  return '';
}

export function pendingInviteReplyFacts(rows = []) {
  const pendingInvitees = (Array.isArray(rows) ? rows : []).map((row) => {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const name = String(row.requested_for || meta.displayName || '').trim();
    const email = String(meta.email || '').trim().toLowerCase();
    const label = inviteeLabel(row);
    if (!label) return null;
    return { name: name || null, email: email || null, label, status: 'pending' };
  }).filter(Boolean);
  if (!pendingInvitees.length) return null;
  return {
    pendingInvitees,
    rosterInviteRule:
      'Pending invitees have been emailed but have not joined yet. Name them as pending; do not welcome them or say they are confirmed on the trip.',
  };
}

export function applyPendingInviteReplyFacts(tripContext, facts) {
  if (!tripContext || typeof tripContext !== 'object') return tripContext;
  if (!facts) return tripContext;
  return { ...tripContext, ...facts };
}

export async function loadPendingCollaboratorInvites(db, {
  ownerCustomerId = '',
  tripId = '',
  onboardingSessionId = '',
} = {}) {
  if (!db || !ownerCustomerId) return [];
  const scopedTripId = String(tripId || '').trim();
  const sessionId = String(onboardingSessionId || '').trim();
  if (scopedTripId) {
    const rows = await db`
      select id, requested_for, status, metadata
      from vacation_collaborator_invites
      where owner_customer_id = ${ownerCustomerId}
        and trip_id = ${scopedTripId}::uuid
        and status = 'pending_payment'
      order by created_at asc
    `;
    return rows;
  }
  if (!sessionId) return [];
  const rows = await db`
    select id, requested_for, status, metadata
    from vacation_collaborator_invites
    where owner_customer_id = ${ownerCustomerId}
      and trip_id is null
      and status = 'pending_payment'
      and coalesce(metadata->>'onboardingSessionId', '') = ${sessionId}
    order by created_at asc
  `;
  return rows;
}
