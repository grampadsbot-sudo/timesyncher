function firstToken(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function personRecord(person, id = '') {
  const displayName = String(person?.displayName || person?.display_name || person?.name || '').trim();
  const firstName = String(person?.firstName || person?.first_name || '').trim();
  const personId = String(id || person?.id || person?.customerId || person?.customer_id || '').trim();
  if (!displayName && !firstName) return null;
  return { id: personId, displayName, firstName };
}

export function authorPeopleFromTrip(party = {}, collaborators = [], ownerId = '') {
  const people = [];
  const push = (record) => {
    if (!record) return;
    const sameId = record.id && people.some((item) => item.id === record.id);
    const sameName = record.displayName && people.some((item) => item.displayName.toLowerCase() === record.displayName.toLowerCase());
    if (sameId || sameName) return;
    people.push(record);
  };
  if (party?.primary) push(personRecord(party.primary, ownerId));
  for (const person of Array.isArray(party?.collaborators) ? party.collaborators : []) push(personRecord(person));
  for (const seat of Array.isArray(party?.seats) ? party.seats : []) push(personRecord(seat));
  for (const row of Array.isArray(collaborators) ? collaborators : []) {
    const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const inviteMeta = row?.invite_metadata && typeof row.invite_metadata === 'object' ? row.invite_metadata : {};
    const collabId = String(
      row?.customer_id || meta.collaboratorCustomerId || inviteMeta.collaboratorCustomerId || '',
    ).trim();
    push(personRecord(row, collabId));
  }
  return people;
}

export function transcriptAuthorMissingError(turn = {}, session = {}, tripId = null) {
  return {
    event: 'transcript_author_missing',
    tripId: tripId ? String(tripId) : null,
    viewerId: String(session.viewerId || session.customer_id || ''),
    speaker: String(turn.speaker || ''),
    direction: String(turn.direction || ''),
    authorId: String(turn.authorId || turn.payload?.authorId || ''),
    authorName: String(turn.authorName || turn.payload?.authorName || ''),
    bodyPreview: String(turn.body || '').slice(0, 120),
  };
}

function rosterName(person) {
  return firstToken(person?.firstName) || firstToken(person?.displayName);
}

function findAuthor(turn, people) {
  const authorId = String(turn.authorId || turn.payload?.authorId || '').trim();
  const spoken = String(turn.authorName || turn.payload?.authorName || turn.payload?.liveTranscript?.speakerName || '').trim().toLowerCase();
  const list = Array.isArray(people) ? people : [];
  if (authorId) {
    const byId = list.find((person) => person.id && person.id === authorId);
    if (byId) return byId;
  }
  if (!spoken) return null;
  return list.find((person) => {
    const display = String(person.displayName || '').trim().toLowerCase();
    return Boolean(display) && (display === spoken || display.split(/\s+/)[0] === spoken);
  }) || null;
}

export function turnAuthorLabel(turn = {}, session = {}, people = []) {
  const inbound = turn.speaker === 'customer' || turn.direction === 'inbound';
  if (!inbound) return { label: 'TimeSyncher', reason: '' };
  const authorId = String(turn.authorId || turn.payload?.authorId || '').trim();
  const viewerId = String(session.viewerId || session.customer_id || '').trim();
  if (authorId && viewerId && authorId === viewerId) return { label: 'You', reason: '' };
  const label = rosterName(findAuthor(turn, people));
  if (!label) return { label: '', reason: 'author_name_missing' };
  return { label, reason: '' };
}
