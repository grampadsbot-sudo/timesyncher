import { inferVacationTimeZone } from './mcp-exif.mjs';
import {
  buildPreviewMediaEntries,
  cleanPreviewText,
  collectDraftLandingItems,
  computePreviewHash,
  groupLandingDaysAndUnscheduled,
  normalizeDraftLandingItem,
  previewDateRange,
  previewIsoDateOnly,
  previewList,
} from './mcp-preview-common.mjs';

export function buildDraftImportPreview({
  draft,
  mediaRows = [],
  existingTrip = null,
  existingThings = [],
  applyMode = 'create_new',
}) {
  const vacation = draft?.vacation && typeof draft.vacation === 'object' ? draft.vacation : {};
  const startDate = previewIsoDateOnly(vacation.start_date);
  const endDate = previewIsoDateOnly(vacation.end_date);
  const rangeDates = previewDateRange(startDate, endDate);
  const rangeSet = new Set(rangeDates);
  const preliminaryItems = collectDraftLandingItems(draft).allItems;
  const vacationTimeZone = inferVacationTimeZone({
    timezone: cleanPreviewText(vacation.timezone, 80),
    timezoneExplicit: Boolean(cleanPreviewText(vacation.timezone, 80)),
    destination: cleanPreviewText(vacation.destination, 180) || cleanPreviewText(vacation.title, 180),
    points: preliminaryItems.map((item) => item.location).filter(Boolean),
  });
  const rawDays = previewList(draft?.days);
  const flights = previewList(draft?.flights);
  const hotels = previewList(draft?.hotels);
  const cars = previewList(draft?.cars);
  const restaurants = previewList(draft?.restaurants);
  const stores = previewList(draft?.stores);
  const thingsToDo = previewList(draft?.things_to_do);
  const notes = previewList(draft?.notes);
  const explicitUnscheduled = previewList(draft?.unscheduled_things);

  const { allItems, scheduledItems, unscheduledItems } = collectDraftLandingItems(draft, vacationTimeZone);
  const resolvedDays = rawDays.length
    ? rawDays
    : rangeDates.map((date, idx) => ({ day_number: idx + 1, date, title: '', notes: '' }));

  const missing = [];
  const conflicts = [];

  if (!cleanPreviewText(vacation.title, 180)) missing.push('Vacation title is missing.');
  if (!cleanPreviewText(vacation.destination, 180)) missing.push('Vacation destination is missing.');
  if (!startDate || !endDate) missing.push('Vacation start and end dates are missing.');
  if (!cleanPreviewText(vacation.timezone, 80)) missing.push('Vacation timezone is missing (UTC will be used for photo dates).');
  if (!rawDays.length && rangeDates.length) {
    missing.push(`No custom day titles provided (${rangeDates.length} calendar days will be created automatically).`);
  }

  for (const hotel of hotels) {
    if (!cleanPreviewText(hotel?.location?.address, 240)) {
      missing.push(`Hotel "${cleanPreviewText(hotel?.title, 120) || 'Untitled'}" is missing an address.`);
    }
  }
  for (const restaurant of restaurants) {
    if (!cleanPreviewText(restaurant?.location?.address, 240)) {
      missing.push(`Restaurant "${cleanPreviewText(restaurant?.title, 120) || 'Untitled'}" is missing an address.`);
    }
  }

  const seenTitleDay = new Set();
  const checkDuplicateAndRange = (label, items) => {
    for (const item of items) {
      const title = cleanPreviewText(item?.title, 180);
      const dayDate = item?.unscheduled === true
        ? ''
        : previewIsoDateOnly(item?.day_date || item?.check_in || item?.starts_at);
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
  checkDuplicateAndRange('Store', stores);
  checkDuplicateAndRange('Activity', thingsToDo);
  checkDuplicateAndRange('Saved item', explicitUnscheduled);

  if (applyMode === 'populate_scoped' && existingTrip) {
    const existingNames = new Set(previewList(existingThings).map((row) => cleanPreviewText(row.title, 180).toLowerCase()));
    for (const item of allItems) {
      const name = cleanPreviewText(item?.title, 180);
      if (name && existingNames.has(name.toLowerCase())) {
        conflicts.push(`"${name}" already exists on the live vacation.`);
      }
    }
  }

  const mediaLinksById = new Map(previewList(draft?.media).map((link) => [String(link.media_id || ''), link]));
  const { media: mediaEntries, totalBytes } = buildPreviewMediaEntries({
    mediaRows,
    mediaLinksById,
    items: allItems,
    days: resolvedDays,
    vacationTimeZone,
  });

  const unassignedMedia = mediaEntries.filter((item) => item.assignment_bucket === 'unassigned');
  if (unassignedMedia.length) {
    missing.push(`${unassignedMedia.length} photo or video item(s) could not be matched to a vacation day and will appear in Not placed yet.`);
  }
  const pendingUploadMedia = mediaEntries.filter((item) => item.upload_status === 'signed');
  if (pendingUploadMedia.length) {
    missing.push(`${pendingUploadMedia.length} signed media upload(s) have not been uploaded yet.`);
  }

  const { days: landingDays, unscheduledThings, unplacedMedia } = groupLandingDaysAndUnscheduled({
    resolvedDays,
    scheduledItems,
    unscheduledItems,
    mediaEntries,
  });

  const vacationBlock = {
    title: cleanPreviewText(vacation.title, 180) || 'Untitled Vacation',
    destination: cleanPreviewText(vacation.destination, 180),
    start_date: startDate || null,
    end_date: endDate || null,
    timezone: vacationTimeZone,
    currency: cleanPreviewText(vacation.currency, 12) || 'usd',
    summary: cleanPreviewText(vacation.summary, 600),
    apply_mode: applyMode,
  };

  const willCreate = {
    vacation: vacationBlock,
    days: landingDays,
    flights: flights.map((item) => ({ title: cleanPreviewText(item.title, 180), day_date: previewIsoDateOnly(item.day_date || item.starts_at) || null })),
    hotels: hotels.map((item) => ({ title: cleanPreviewText(item.title, 180), check_in: previewIsoDateOnly(item.check_in) || null, check_out: previewIsoDateOnly(item.check_out) || null })),
    cars: cars.map((item) => ({ title: cleanPreviewText(item.title, 180), starts_at: item.starts_at || null })),
    restaurants: restaurants.map((item) => ({ title: cleanPreviewText(item.title, 180), day_date: item.unscheduled === true ? null : (previewIsoDateOnly(item.day_date || item.starts_at) || null) })),
    stores: stores.map((item) => ({ title: cleanPreviewText(item.title, 180), day_date: item.unscheduled === true ? null : (previewIsoDateOnly(item.day_date || item.starts_at) || null) })),
    things_to_do: thingsToDo.map((item) => ({ title: cleanPreviewText(item.title, 180), day_date: item.unscheduled === true ? null : (previewIsoDateOnly(item.day_date || item.starts_at) || null) })),
    notes: notes.map((item) => ({ title: cleanPreviewText(item.title, 180), day_date: item.unscheduled === true ? null : (previewIsoDateOnly(item.day_date) || null) })),
    unscheduled_things: unscheduledThings,
    media: mediaEntries,
  };

  const counts = {
    days: landingDays.length,
    flights: willCreate.flights.length,
    hotels: willCreate.hotels.length,
    cars: willCreate.cars.length,
    restaurants: willCreate.restaurants.length,
    stores: willCreate.stores.length,
    things_to_do: willCreate.things_to_do.length,
    notes: willCreate.notes.length,
    scheduled_items: scheduledItems.length,
    unscheduled_things: unscheduledThings.length,
    media: mediaEntries.length,
    total_bytes: totalBytes,
  };

  const unscheduledNote = unscheduledThings.length ? `, ${unscheduledThings.length} unscheduled long-list item(s)` : '';
  const summaryText = `Ready to ${applyMode === 'populate_scoped' ? 'update' : 'create'} vacation "${vacationBlock.title}" with ${counts.days} day(s), ${scheduledItems.length} scheduled item(s)${unscheduledNote}, and ${counts.media} media file(s).`;

  const hashPayload = {
    kind: 'draft_import',
    apply_mode: applyMode,
    vacation: vacationBlock,
    days: landingDays,
    unscheduled_things: unscheduledThings,
    media: mediaEntries,
    total_bytes: totalBytes,
    will_create: willCreate,
    missing,
    conflicts,
  };
  const previewHash = computePreviewHash(hashPayload);

  return {
    kind: 'draft_import',
    preview_hash: previewHash,
    summary_text: summaryText,
    counts,
    vacation: vacationBlock,
    days: landingDays,
    unscheduled_things: unscheduledThings,
    media: mediaEntries,
    unplaced_media: unplacedMedia,
    media_count: mediaEntries.length,
    total_bytes: totalBytes,
    will_create: willCreate,
    missing,
    conflicts,
  };
}

function existingThingToLanding(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const dayDate = meta.unscheduled === true ? null : (previewIsoDateOnly(meta.dayDate || row.starts_at) || null);
  const scheduled = Boolean(dayDate) && meta.unscheduled !== true && meta.timeline !== false;
  return {
    id: String(row.id),
    ref: cleanPreviewText(meta.draftRef, 120) || String(row.id),
    category: cleanPreviewText(row.category, 60) || 'note',
    title: cleanPreviewText(row.title, 240),
    source: cleanPreviewText(meta.source, 80) || 'vacation_record',
    description: cleanPreviewText(row.description, 4000) || null,
    scheduled,
    day_date: scheduled ? dayDate : null,
    starts_at: scheduled ? (row.starts_at || null) : null,
    ends_at: scheduled ? (row.ends_at || null) : null,
    total_price_cents: Number.isInteger(row.cost_estimate_cents) ? row.cost_estimate_cents : null,
    currency: cleanPreviewText(row.currency, 12) || 'usd',
    location: row.location && typeof row.location === 'object' ? row.location : {},
    website: cleanPreviewText(meta.website, 500) || null,
    notes: Array.isArray(meta.notes) ? cleanPreviewText(meta.notes[0], 1000) || null : null,
  };
}

export function buildTargetedEditPreview({
  operations = [],
  existingTrip = null,
  existingThings = [],
  mediaRows = [],
  summary = '',
}) {
  const byId = new Map(previewList(existingThings).map((row) => [String(row.id), row]));
  const mediaById = new Map(previewList(mediaRows).map((row) => [String(row.id), row]));
  const tripMeta = existingTrip?.metadata && typeof existingTrip.metadata === 'object' ? existingTrip.metadata : {};
  const vacationTimeZone = cleanPreviewText(tripMeta.timezone, 80) || 'UTC';
  const dayMeta = tripMeta.dayMeta && typeof tripMeta.dayMeta === 'object' ? { ...tripMeta.dayMeta } : {};
  const baseDays = previewList(tripMeta.days).length
    ? previewList(tripMeta.days).map((d, idx) => ({
      day_number: Number(d.day_number || idx + 1),
      date: previewIsoDateOnly(d.date),
      title: cleanPreviewText(dayMeta[previewIsoDateOnly(d.date)]?.title ?? d.title, 180),
      notes: cleanPreviewText(dayMeta[previewIsoDateOnly(d.date)]?.notes ?? d.notes, 1000),
    }))
    : previewDateRange(existingTrip?.start_date, existingTrip?.end_date).map((date, idx) => ({
      day_number: idx + 1,
      date,
      title: cleanPreviewText(dayMeta[date]?.title, 180),
      notes: cleanPreviewText(dayMeta[date]?.notes, 1000),
    }));

  const workingItems = previewList(existingThings).map(existingThingToLanding);
  const workingVacation = {
    title: cleanPreviewText(existingTrip?.title, 180) || 'Untitled Vacation',
    destination: cleanPreviewText(existingTrip?.destination, 180),
    start_date: previewIsoDateOnly(existingTrip?.start_date) || null,
    end_date: previewIsoDateOnly(existingTrip?.end_date) || null,
    timezone: vacationTimeZone,
    currency: cleanPreviewText(tripMeta.currency, 12) || 'usd',
    summary: cleanPreviewText(tripMeta.summary, 600),
  };

  const willAdd = [];
  const willUpdate = [];
  const willRemove = [];
  const dayUpdates = [];
  const vacationFieldUpdates = [];
  const attachMediaRows = [];
  const attachMediaLinks = new Map();
  const missing = [];
  const conflicts = [];

  for (const op of previewList(operations)) {
    if (op.op === 'add_item') {
      const normalized = normalizeDraftLandingItem(op.item?.category || 'note', op.item || {}, {
        currency: workingVacation.currency,
        source: 'mcp_update',
      });
      if (normalized) {
        workingItems.push(normalized);
        willAdd.push({
          ref: normalized.ref,
          category: normalized.category,
          title: normalized.title,
          day_date: normalized.day_date,
          scheduled: normalized.scheduled,
        });
      }
    } else if (op.op === 'update_item') {
      const existing = byId.get(String(op.item_id || ''));
      if (!existing) {
        conflicts.push(`Target item ${cleanPreviewText(op.item_id, 80)} was not found on this vacation.`);
      } else {
        const patch = op.patch && typeof op.patch === 'object' ? op.patch : {};
        willUpdate.push({
          item_id: String(existing.id),
          current_title: String(existing.title || ''),
          changed_fields: Object.keys(patch),
        });
        const target = workingItems.find((item) => String(item.id) === String(existing.id));
        if (target) {
          if (patch.title !== undefined) target.title = cleanPreviewText(patch.title, 240);
          if (patch.description !== undefined) target.description = cleanPreviewText(patch.description, 4000) || null;
          if (patch.starts_at !== undefined) target.starts_at = patch.starts_at;
          if (patch.ends_at !== undefined) target.ends_at = patch.ends_at;
          if (patch.total_price_cents !== undefined) target.total_price_cents = patch.total_price_cents;
          else if (patch.cost_estimate_cents !== undefined) target.total_price_cents = patch.cost_estimate_cents;
          if (patch.location && typeof patch.location === 'object') target.location = { ...target.location, ...patch.location };
          if (patch.day_date !== undefined) {
            const nextDate = previewIsoDateOnly(patch.day_date) || null;
            target.day_date = nextDate;
            target.scheduled = Boolean(nextDate);
          }
          if (patch.unscheduled === true) {
            target.day_date = null;
            target.scheduled = false;
            target.starts_at = null;
          }
        }
      }
    } else if (op.op === 'remove_item') {
      const existing = byId.get(String(op.item_id || ''));
      if (!existing) {
        conflicts.push(`Target item ${cleanPreviewText(op.item_id, 80)} was not found on this vacation.`);
      } else {
        willRemove.push({
          item_id: String(existing.id),
          title: String(existing.title || ''),
          category: String(existing.category || ''),
        });
        const idx = workingItems.findIndex((item) => String(item.id) === String(existing.id));
        if (idx >= 0) workingItems.splice(idx, 1);
      }
    } else if (op.op === 'update_day') {
      const date = previewIsoDateOnly(op.day_date);
      dayUpdates.push({ day_date: date, changed_fields: Object.keys(op.patch || {}) });
      const day = baseDays.find((entry) => entry.date === date);
      if (day && op.patch && typeof op.patch === 'object') {
        if (op.patch.title !== undefined) day.title = cleanPreviewText(op.patch.title, 180);
        if (op.patch.notes !== undefined) day.notes = cleanPreviewText(op.patch.notes, 1000);
      }
    } else if (op.op === 'update_vacation_fields') {
      const patch = op.patch && typeof op.patch === 'object' ? op.patch : {};
      vacationFieldUpdates.push({ changed_fields: Object.keys(patch) });
      if (patch.title !== undefined) workingVacation.title = cleanPreviewText(patch.title, 180);
      if (patch.destination !== undefined) workingVacation.destination = cleanPreviewText(patch.destination, 180);
      if (patch.timezone !== undefined) workingVacation.timezone = cleanPreviewText(patch.timezone, 80) || workingVacation.timezone;
      if (patch.summary !== undefined) workingVacation.summary = cleanPreviewText(patch.summary, 600);
    } else if (op.op === 'attach_media') {
      const media = mediaById.get(String(op.media_id || ''));
      if (!media) {
        missing.push(`Media ${cleanPreviewText(op.media_id, 80)} has not been uploaded for this vacation yet.`);
      } else {
        attachMediaRows.push(media);
        attachMediaLinks.set(String(media.id), {
          media_id: String(media.id),
          day_date: op.day_date || null,
          thing_id: op.thing_id || null,
          thing_ref: op.thing_ref || null,
          caption: op.caption ?? null,
        });
      }
    }
  }

  const { media: mediaEntries, totalBytes } = buildPreviewMediaEntries({
    mediaRows: attachMediaRows,
    mediaLinksById: attachMediaLinks,
    items: workingItems,
    days: baseDays,
    vacationTimeZone: workingVacation.timezone,
  });

  const { days: landingDays, unscheduledThings, unplacedMedia } = groupLandingDaysAndUnscheduled({
    resolvedDays: baseDays,
    scheduledItems: workingItems.filter((item) => item.scheduled),
    unscheduledItems: workingItems.filter((item) => !item.scheduled),
    mediaEntries,
  });

  const vacationTitle = cleanPreviewText(workingVacation.title, 180) || 'this vacation';
  const summaryText = cleanPreviewText(summary, 300)
    || `Proposed AI edits for "${vacationTitle}": ${willAdd.length} add, ${willUpdate.length} update, ${willRemove.length} remove, ${dayUpdates.length} day change(s), ${mediaEntries.length} media attachment(s).`;

  const hashPayload = {
    kind: 'targeted_edit',
    vacation: workingVacation,
    days: landingDays,
    unscheduled_things: unscheduledThings,
    media: mediaEntries,
    total_bytes: totalBytes,
    will_add: willAdd,
    will_update: willUpdate,
    will_remove: willRemove,
    day_updates: dayUpdates,
    vacation_field_updates: vacationFieldUpdates,
    will_attach_media: mediaEntries,
    missing,
    conflicts,
  };
  const previewHash = computePreviewHash(hashPayload);

  return {
    kind: 'targeted_edit',
    preview_hash: previewHash,
    summary_text: summaryText,
    counts: {
      add: willAdd.length,
      update: willUpdate.length,
      remove: willRemove.length,
      days: dayUpdates.length,
      media: mediaEntries.length,
      vacation_fields: vacationFieldUpdates.length,
      unscheduled_things: unscheduledThings.length,
      total_bytes: totalBytes,
    },
    vacation: workingVacation,
    days: landingDays,
    unscheduled_things: unscheduledThings,
    media: mediaEntries,
    unplaced_media: unplacedMedia,
    media_count: mediaEntries.length,
    total_bytes: totalBytes,
    will_add: willAdd,
    will_update: willUpdate,
    will_remove: willRemove,
    day_updates: dayUpdates,
    vacation_field_updates: vacationFieldUpdates,
    will_attach_media: mediaEntries,
    missing,
    conflicts,
  };
}
