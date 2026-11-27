const travelSummaryFields = ['where', 'who', 'transport', 'tripName', 'description'];

export function travelSummaryValues(value) {
  return Object.fromEntries(travelSummaryFields.map((field) => [
    field, typeof value?.[field] === 'string' ? value[field].trim() : '',
  ]));
}

function parseRevisionState(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.state_json === 'string') {
    try {
      return JSON.parse(row.state_json);
    } catch {
      return null;
    }
  }
  return row.state_json && typeof row.state_json === 'object' ? row.state_json : null;
}

export function projectTravelSummaryFromRevision(row) {
  const state = parseRevisionState(row);
  if (!state || typeof state !== 'object' || !state.saved || typeof state.saved !== 'object') return null;
  const saved = state.saved;
  const items = saved.items && typeof saved.items === 'object' ? saved.items : {};
  const days = Object.entries(saved.days && typeof saved.days === 'object' ? saved.days : {})
    .map(([id, day]) => ({
      id,
      date: day?.date ?? '',
      assigned: (Array.isArray(day?.assigned) ? day.assigned : []).map((entry) => ({
        id: entry.id,
        item: entry.item,
        title: items[entry.item]?.title ?? entry.item,
        type: entry.type,
        role: entry.role,
        proposedBy: entry.proposed_by,
        time: entry.time ? { value: entry.time.value, precision: entry.time.precision } : null,
      })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const unassigned = (Array.isArray(saved.unassigned) ? saved.unassigned : []).map((id) => ({
    id,
    title: items[id]?.title ?? id,
    type: items[id]?.type ?? null,
  }));
  const travelers = Object.entries(saved.travelers && typeof saved.travelers === 'object' ? saved.travelers : {})
    .map(([id, traveler]) => ({
      id,
      name: traveler?.name ?? null,
      relation: traveler?.relation ?? null,
      age: traveler?.age ?? null,
      turn: traveler?.turn ?? null,
    }));
  const disclosed = Object.entries(state.disclosed && typeof state.disclosed === 'object' ? state.disclosed : {})
    .map(([id, fact]) => ({
      id,
      kind: fact?.kind ?? '',
      value: fact?.value ?? '',
      turn: fact?.turn ?? null,
    }));
  const collaborators = Object.entries(saved.collaborators && typeof saved.collaborators === 'object' ? saved.collaborators : {})
    .map(([id, member]) => ({
      id,
      name: member?.name ?? null,
      access: member?.access ?? '',
      status: member?.status ?? '',
      turn: member?.turn ?? null,
    }));
  const invites = Object.entries(saved.invites && typeof saved.invites === 'object' ? saved.invites : {})
    .map(([id, invite]) => ({
      id,
      name: invite?.name ?? null,
      access: invite?.access ?? '',
      status: invite?.status ?? '',
      turn: invite?.turn ?? null,
    }));
  const openAsks = (Array.isArray(state.open_asks) ? state.open_asks : []).map((ask) => ({
    id: ask.id,
    text: ask.text,
    status: ask.status,
    firstTurn: ask.first_turn,
    turn: ask.turn,
  }));
  const nextSteps = (Array.isArray(state.next_steps) ? state.next_steps : []).map((step) => ({
    kind: step.kind,
    task: step.task,
    refs: Array.isArray(step.refs) ? step.refs : [],
  }));
  return {
    version: state.version,
    tripId: state.trip_id,
    revision: state.revision,
    turn: state.updated_turn,
    phase: state.phase,
    digest: typeof row.digest === 'string' ? row.digest : null,
    siteRevision: saved.site_revision ?? null,
    read: saved.read ?? null,
    trip: {
      title: saved.trip?.title ?? null,
      destination: saved.trip?.destination ?? null,
      start: saved.trip?.start ?? null,
      end: saved.trip?.end ?? null,
    },
    days,
    unassigned,
    travelers,
    disclosed,
    collaborators,
    invites,
    openAsks,
    nextSteps,
    capabilities: state.capabilities && typeof state.capabilities === 'object' ? state.capabilities : null,
  };
}
