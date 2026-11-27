export function applyIntakeTripStateAssignments({ assignments, days, places, thingOverrides, occurrences }) {
  const dayIds = new Set(days.map((day) => String(day.id)));
  const placeById = new Map(places.map((place) => [place.id, place]));
  for (const [placeId, rows] of occurrences) {
    const place = placeById.get(placeId);
    const override = thingOverrides[`place:${placeId}`];
    override.dayIds = [];
    override.perDaySchedule = {};
    delete override.startTime;
    delete override.endTime;
    delete place.place_time;
    delete place.end_time;
    for (const { id, day, role, time, before, turn, via, proposed_by } of rows) {
      if (!dayIds.has(day)) continue;
      const schedule = time ? { startTime: time.value, timePrecision: time.precision } : {};
      const bucket = assignments[day] ??= [];
      bucket.push({
        id, day_id: Number(day), place_id: placeId, place: { ...place, ...schedule, place_time: time?.value || '' },
        notes: place.notes, role, tripStateTime: time, tripStateTurn: turn, tripStateVia: via || 'chat_action',
        ...(proposed_by ? { tripStateProposedBy: proposed_by } : {}),
        ...(time ? { start_time: time.value } : {}), ...(before ? { before } : {}),
      });
      const dayId = Number(day);
      if (!override.dayIds.includes(dayId)) override.dayIds.push(dayId);
      if (time && !override.perDaySchedule[day]) override.perDaySchedule[day] = schedule;
    }
    override.timeline = override.dayIds.length > 0;
  }
  for (const rows of Object.values(assignments)) {
    const followers = new Map();
    const ids = new Set(rows.map((row) => String(row.id)));
    for (const row of rows) {
      if (!ids.has(row.before)) continue;
      const group = followers.get(row.before) || [];
      group.push(row);
      followers.set(row.before, group);
    }
    const ordered = [];
    const seen = new Set();
    function append(row) {
      const id = String(row.id);
      if (seen.has(id)) return;
      seen.add(id);
      for (const earlier of followers.get(id) || []) append(earlier);
      ordered.push(row);
    }
    for (const row of rows) if (!ids.has(row.before)) append(row);
    for (const row of rows) append(row);
    rows.splice(0, rows.length, ...ordered.map((row, order_index) => ({ ...row, order_index })));
  }
}
