export function placeAssignedOnDay(payload, placeId, dayId) {
  const rows = payload?.assignments?.[String(dayId)] || [];
  return rows.some((row) => String(row.place_id ?? row.place?.id) === String(placeId));
}

export function findPlaceAssignment(payload, placeId) {
  const target = String(placeId);
  for (const [dayId, rows] of Object.entries(payload?.assignments || {})) {
    for (const row of rows || []) {
      if (String(row.place_id ?? row.place?.id) === target) {
        return {
          dayId,
          row,
          assignmentId: row.id ?? row.assignment_id ?? null,
        };
      }
    }
  }
  return null;
}

export function applyAssignmentMoveOnPayload(payload, { placeId, fromDayId, toDayId, assignmentId = null }) {
  const fromKey = String(fromDayId);
  const toKey = String(toDayId);
  const assignments = structuredClone(payload.assignments || {});
  const fromRows = [...(assignments[fromKey] || [])];
  const idx = fromRows.findIndex((row) => String(row.place_id ?? row.place?.id) === String(placeId));
  if (idx < 0) return payload;
  const [row] = fromRows.splice(idx, 1);
  assignments[fromKey] = fromRows;
  const toRows = [...(assignments[toKey] || [])];
  const place = (payload.places || []).find((p) => String(p.id) === String(placeId));
  toRows.push({
    ...row,
    id: assignmentId ?? row.id,
    day_id: Number(toDayId),
    place_id: Number(placeId),
    order_index: toRows.length,
    place: row.place || place || undefined,
  });
  assignments[toKey] = toRows;
  return { ...payload, assignments };
}

export function applyAssignmentCreateOnPayload(payload, { placeId, dayId, assignmentId = null }) {
  const dayKey = String(dayId);
  const assignments = structuredClone(payload.assignments || {});
  const rows = [...(assignments[dayKey] || [])];
  if (rows.some((row) => String(row.place_id ?? row.place?.id) === String(placeId))) {
    return payload;
  }
  const place = (payload.places || []).find((p) => String(p.id) === String(placeId));
  rows.push({
    id: assignmentId ?? `chat-edit-${placeId}-${dayId}`,
    day_id: Number(dayId),
    place_id: Number(placeId),
    order_index: rows.length,
    notes: '',
    place: place ? { ...place } : undefined,
  });
  assignments[dayKey] = rows;
  return { ...payload, assignments };
}

export function planPlaceOnDayAssignment(payload, { placeId, dayId }) {
  const targetDayId = String(dayId);
  if (placeAssignedOnDay(payload, placeId, targetDayId)) {
    return { kind: 'already_on_day' };
  }
  const current = findPlaceAssignment(payload, placeId);
  if (current?.assignmentId != null) {
    return {
      kind: 'move',
      assignmentId: current.assignmentId,
      fromDayId: current.dayId,
      toDayId: targetDayId,
    };
  }
  if (current) {
    return {
      kind: 'move',
      assignmentId: current.row?.id,
      fromDayId: current.dayId,
      toDayId: targetDayId,
    };
  }
  return { kind: 'create', toDayId: targetDayId, placeId };
}
