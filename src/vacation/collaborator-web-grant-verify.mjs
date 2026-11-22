function clean(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

export async function verifiedCollaboratorWebGrant(db, webGrant, tripId) {
  if (!webGrant || webGrant.role === 'owner') return webGrant;
  const meta = webGrant.metadata && typeof webGrant.metadata === 'object' ? webGrant.metadata : {};
  const inviteId = clean(meta.inviteId || meta.collaboratorInviteId, 80);
  const fromCollaboratorSeat = meta.source === 'vacation_app_collaborator_session';
  if (!inviteId && !fromCollaboratorSeat) return webGrant;
  const normalizedTripId = clean(tripId || webGrant.trip_id, 80);
  if (!normalizedTripId) return null;
  if (inviteId) {
    const rows = await db`
      select status
      from vacation_collaborators
      where invite_id = ${inviteId}
        and (trip_id = ${normalizedTripId} or trip_id is null)
      order by case when status = 'active' then 0 else 1 end
      limit 1
    `;
    if (!rows[0] || (rows[0].status && rows[0].status !== 'active')) return null;
    return webGrant;
  }
  const email = clean(webGrant.email, 180).toLowerCase();
  if (!email) return null;
  const rows = await db`
    select status
    from vacation_collaborators
    where trip_id = ${normalizedTripId}
      and lower(coalesce(metadata->>'email', '')) = ${email}
    order by case when status = 'active' then 0 else 1 end
    limit 1
  `;
  if (!rows[0] || (rows[0].status && rows[0].status !== 'active')) return null;
  return webGrant;
}
