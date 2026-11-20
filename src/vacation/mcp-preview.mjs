function clean(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function isoDateOnly(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function enumerateDateRange(startDate, endDate) {
  const start = isoDateOnly(startDate);
  const end = isoDateOnly(endDate) || start;
  if (!start) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end && dates.length < 60) {
    dates.push(cursor);
    const next = new Date(`${cursor}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return dates;
}

function listFrom(value) {
  return Array.isArray(value) ? value : [];
}

export function buildDraftImportPreview({
  draft,
  mediaRows = [],
  existingTrip = null,
  existingThings = [],
  applyMode = 'create_new',
}) {
  const vacation = draft?.vacation && typeof draft.vacation === 'object' ? draft.vacation : {};
  const startDate = isoDateOnly(vacation.start_date);
  const endDate = isoDateOnly(vacation.end_date);
  const rangeDates = enumerateDateRange(startDate, endDate);
  const rangeSet = new Set(rangeDates);
  const days = listFrom(draft?.days);
  const flights = listFrom(draft?.flights);
  const hotels = listFrom(draft?.hotels);
  const cars = listFrom(draft?.cars);
  const restaurants = listFrom(draft?.restaurants);
  const thingsToDo = listFrom(draft?.things_to_do);
  const notes = listFrom(draft?.notes);

  const missing = [];
  const conflicts = [];

  if (!clean(vacation.title, 180)) missing.push('Vacation title is missing.');
  if (!clean(vacation.destination, 180)) missing.push('Vacation destination is missing.');
  if (!startDate || !endDate) missing.push('Vacation start and end dates are missing.');
  if (!clean(vacation.timezone, 80)) missing.push('Vacation timezone is missing (UTC will be used for photo dates).');
  if (!days.length && rangeDates.length) {
    missing.push(`No custom day titles provided (${rangeDates.length} calendar days will be created automatically).`);
  }

  for (const hotel of hotels) {
    if (!clean(hotel?.location?.address, 240)) {
      missing.push(`Hotel "${clean(hotel?.title, 120) || 'Untitled'}" is missing an address.`);
    }
  }
  for (const restaurant of restaurants) {
    if (!clean(restaurant?.location?.address, 240)) {
      missing.push(`Restaurant "${clean(restaurant?.title, 120) || 'Untitled'}" is missing an address.`);
    }
  }

  const seenTitleDay = new Set();
  const checkDuplicateAndRange = (label, items) => {
    for (const item of items) {
      const title = clean(item?.title, 180);
      const dayDate = isoDateOnly(item?.day_date || item?.check_in || item?.starts_at);
      if (dayDate && rangeSet.size && !rangeSet.has(dayDate)) {
        conflicts.push(`${label} "${title}" is dated ${dayDate}, outside ${startDate} to ${endDate}.`);
      }
      const key = `${label.toLowerCase()}:${title.toLowerCase()}:${dayDate}`;
      if (title && seenTitleDay.has(key)) {
        conflicts.push(`Duplicate ${label.toLowerCase()} "${title}" on ${dayDate || 'the same vacation'}.`);
      }
      if (title) seenTitleDay.add(key);
    }
  };

  checkDuplicateAndRange('Flight', flights);
  checkDuplicateAndRange('Hotel', hotels);
  checkDuplicateAndRange('Car', cars);
  checkDuplicateAndRange('Restaurant', restaurants);
  checkDuplicateAndRange('Activity', thingsToDo);

  if (applyMode === 'populate_scoped' && existingTrip) {
    const existingNames = new Set(listFrom(existingThings).map((row) => clean(row.title, 180).toLowerCase()));
    const incoming = [...flights, ...hotels, ...cars, ...restaurants, ...thingsToDo];
    for (const item of incoming) {
      const name = clean(item?.title, 180);
      if (name && existingNames.has(name.toLowerCase())) {
        conflicts.push(`"${name}" already exists on the live vacation.`);
      }
    }
  }

  const mediaSummary = listFrom(mediaRows).map((row) => ({
    media_id: String(row.id),
    filename: String(row.filename || ''),
    media_kind: String(row.media_kind || 'photo'),
    bytes: Number(row.actual_bytes || 0),
    upload_status: String(row.upload_status || 'signed'),
    assignment_bucket: String(row.assignment_bucket || 'unassigned'),
    assigned_day_date: row.assigned_day_date ? isoDateOnly(row.assigned_day_date) : null,
    assigned_day_number: row.assigned_day_number ?? null,
    target_thing_ref: row.target_thing_ref || null,
    caption: row.caption || null,
  }));

  const unassignedMedia = mediaSummary.filter((item) => item.assignment_bucket === 'unassigned');
  if (unassignedMedia.length) {
    missing.push(`${unassignedMedia.length} media file(s) had no matching EXIF date and will stay in the Unassigned bucket.`);
  }
  const pendingUploadMedia = mediaSummary.filter((item) => item.upload_status === 'signed');
  if (pendingUploadMedia.length) {
    missing.push(`${pendingUploadMedia.length} signed media upload(s) have not been uploaded yet.`);
  }

  const willCreate = {
    vacation: {
      title: clean(vacation.title, 180) || 'Untitled Vacation',
      destination: clean(vacation.destination, 180),
      start_date: startDate || null,
      end_date: endDate || null,
      timezone: clean(vacation.timezone, 80) || 'UTC',
      currency: clean(vacation.currency, 12) || 'usd',
      summary: clean(vacation.summary, 600),
      apply_mode: applyMode,
    },
    days: days.length ? days : rangeDates.map((date, idx) => ({ day_number: idx + 1, date, title: '', notes: '' })),
    flights: flights.map((item) => ({ title: clean(item.title, 180), day_date: isoDateOnly(item.day_date || item.starts_at) || null })),
    hotels: hotels.map((item) => ({ title: clean(item.title, 180), check_in: isoDateOnly(item.check_in) || null, check_out: isoDateOnly(item.check_out) || null })),
    cars: cars.map((item) => ({ title: clean(item.title, 180), starts_at: item.starts_at || null })),
    restaurants: restaurants.map((item) => ({ title: clean(item.title, 180), day_date: isoDateOnly(item.day_date || item.starts_at) || null })),
    things_to_do: thingsToDo.map((item) => ({ title: clean(item.title, 180), day_date: isoDateOnly(item.day_date || item.starts_at) || null })),
    notes: notes.map((item) => ({ title: clean(item.title, 180), day_date: isoDateOnly(item.day_date) || null })),
    media: mediaSummary,
  };

  const counts = {
    days: willCreate.days.length,
    flights: willCreate.flights.length,
    hotels: willCreate.hotels.length,
    cars: willCreate.cars.length,
    restaurants: willCreate.restaurants.length,
    things_to_do: willCreate.things_to_do.length,
    notes: willCreate.notes.length,
    media: mediaSummary.length,
  };

  const itemTotal = counts.flights + counts.hotels + counts.cars + counts.restaurants + counts.things_to_do + counts.notes;
  const summaryText = `Ready to ${applyMode === 'populate_scoped' ? 'update' : 'create'} vacation "${willCreate.vacation.title}" with ${counts.days} day(s), ${itemTotal} item(s), and ${counts.media} media file(s).`;

  return {
    kind: 'draft_import',
    summary_text: summaryText,
    counts,
    will_create: willCreate,
    missing,
    conflicts,
  };
}

export function buildTargetedEditPreview({
  operations = [],
  existingTrip = null,
  existingThings = [],
  mediaRows = [],
  summary = '',
}) {
  const byId = new Map(listFrom(existingThings).map((row) => [String(row.id), row]));
  const mediaById = new Map(listFrom(mediaRows).map((row) => [String(row.id), row]));
  const willAdd = [];
  const willUpdate = [];
  const willRemove = [];
  const dayUpdates = [];
  const vacationFieldUpdates = [];
  const willAttachMedia = [];
  const missing = [];
  const conflicts = [];

  for (const op of listFrom(operations)) {
    if (op.op === 'add_item') {
      const title = clean(op.item?.title, 180);
      const category = clean(op.item?.category, 60) || 'note';
      willAdd.push({ category, title, day_date: isoDateOnly(op.item?.day_date || op.item?.starts_at) || null });
    } else if (op.op === 'update_item') {
      const existing = byId.get(String(op.item_id || ''));
      if (!existing) {
        conflicts.push(`Target item ${clean(op.item_id, 80)} was not found on this vacation.`);
      } else {
        willUpdate.push({
          item_id: String(existing.id),
          current_title: String(existing.title || ''),
          changed_fields: Object.keys(op.patch || {}),
        });
      }
    } else if (op.op === 'remove_item') {
      const existing = byId.get(String(op.item_id || ''));
      if (!existing) {
        conflicts.push(`Target item ${clean(op.item_id, 80)} was not found on this vacation.`);
      } else {
        willRemove.push({
          item_id: String(existing.id),
          title: String(existing.title || ''),
          category: String(existing.category || ''),
        });
      }
    } else if (op.op === 'update_day') {
      dayUpdates.push({
        day_date: isoDateOnly(op.day_date),
        changed_fields: Object.keys(op.patch || {}),
      });
    } else if (op.op === 'update_vacation_fields') {
      vacationFieldUpdates.push({
        changed_fields: Object.keys(op.patch || {}),
      });
    } else if (op.op === 'attach_media') {
      const media = mediaById.get(String(op.media_id || ''));
      if (!media) {
        missing.push(`Media ${clean(op.media_id, 80)} has not been uploaded for this vacation yet.`);
      } else {
        willAttachMedia.push({
          media_id: String(media.id),
          filename: String(media.filename || ''),
          day_date: isoDateOnly(op.day_date || media.assigned_day_date) || null,
          thing_id: op.thing_id || media.target_thing_ref || null,
        });
      }
    }
  }

  const vacationTitle = clean(existingTrip?.title, 180) || 'this vacation';
  const summaryText = clean(summary, 300)
    || `Proposed AI edits for "${vacationTitle}": ${willAdd.length} add, ${willUpdate.length} update, ${willRemove.length} remove, ${dayUpdates.length} day change(s), ${willAttachMedia.length} media attachment(s).`;

  return {
    kind: 'targeted_edit',
    summary_text: summaryText,
    counts: {
      add: willAdd.length,
      update: willUpdate.length,
      remove: willRemove.length,
      days: dayUpdates.length,
      media: willAttachMedia.length,
      vacation_fields: vacationFieldUpdates.length,
    },
    will_add: willAdd,
    will_update: willUpdate,
    will_remove: willRemove,
    day_updates: dayUpdates,
    vacation_field_updates: vacationFieldUpdates,
    will_attach_media: willAttachMedia,
    missing,
    conflicts,
  };
}
