import { cleanText } from './http.mjs';
import { intakeShareSlug } from './intake-shared-trip.mjs';
import { insertTripThing } from './trip-things.mjs';
import { formatLocalClockTime, inferVacationTimeZone, resolveLocalCaptureDate } from './mcp-exif.mjs';
import { collectDraftLandingItems, findClosestGpsItem, normalizeImportedCategory } from './mcp-preview-common.mjs';
import {
  asArray,
  asObject,
  enumerateVacationDates,
  isoDateOnly,
  publishMediaRow,
  recordVacationMediaUsage,
  vacationShareSlugForRow,
} from './mcp-read.mjs';

function landingItemToThingRow(item, sourceTag, timezone = 'UTC') {
  const extraMeta = {};
  if (item.airline) extraMeta.airline = item.airline;
  if (item.flight_number) extraMeta.flightNumber = item.flight_number;
  if (item.departure_airport) extraMeta.departureAirport = item.departure_airport;
  if (item.arrival_airport) extraMeta.arrivalAirport = item.arrival_airport;
  if (item.confirmation_code) extraMeta.confirmationCode = item.confirmation_code;
  if (item.category === 'hotel') {
    if (item.check_in) extraMeta.checkIn = item.check_in;
    if (item.check_out) extraMeta.checkOut = item.check_out;
    extraMeta.customerStatedLodging = true;
  }
  if (item.pickup_location) extraMeta.pickupLocation = item.pickup_location;
  if (item.dropoff_location) extraMeta.dropoffLocation = item.dropoff_location;

  const unscheduled = !item.scheduled;
  const startTime = unscheduled ? '' : (cleanText(item.start_time, 32) || '');
  const endTime = unscheduled ? '' : (cleanText(item.end_time, 32) || '');
  const thingDetail = {};
  if (startTime) thingDetail.startTime = startTime;
  if (endTime) thingDetail.endTime = endTime;
  if (item.category === 'flight') {
    if (startTime) thingDetail.departureTime = startTime;
    if (endTime) thingDetail.arrivalTime = endTime;
    if (item.airline) thingDetail.airline = item.airline;
    if (item.flight_number) thingDetail.flightNumber = item.flight_number;
  }
  if (item.category === 'hotel') {
    if (item.check_in) thingDetail.checkInDate = item.check_in;
    if (item.check_out) thingDetail.checkOutDate = item.check_out;
    if (startTime) thingDetail.checkInTime = startTime;
    if (endTime) thingDetail.checkOutTime = endTime;
  }
  if (item.notes) thingDetail.itineraryNote = item.notes;
  if (item.description) thingDetail.longDetails = item.description;
  if (item.website) thingDetail.website = item.website;
  if (item.location?.address) thingDetail.address = item.location.address;

  const metadata = {
    ...extraMeta,
    ...(item.ref ? { draftRef: item.ref } : {}),
    ...(!unscheduled && item.day_date ? { dayDate: item.day_date, whenLabel: item.day_date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(item.notes ? { notes: [item.notes] } : {}),
    ...(item.website ? { website: item.website } : {}),
    ...(Object.keys(thingDetail).length ? { thingDetail } : {}),
    ...(timezone ? { timezone } : {}),
    scheduled: !unscheduled,
    unscheduled,
    timeline: !unscheduled,
    source: sourceTag,
  };

  return {
    ref: item.ref || null,
    scheduled: !unscheduled,
    location: asObject(item.location),
    thing: {
      category: item.category,
      subtype: null,
      title: item.title,
      description: item.description || null,
      startsAt: unscheduled ? null : (item.starts_at || null),
      endsAt: unscheduled ? null : (item.ends_at || null),
      costEstimateCents: Number.isInteger(item.total_price_cents) ? item.total_price_cents : null,
      currency: item.currency || 'usd',
      location: asObject(item.location),
      links: item.website ? [{ url: item.website, label: 'Website' }] : [],
      ratings: {},
      metadata,
    },
  };
}

export async function applyApprovedDraftImport(db, { changeSet, mediaRows }) {
  const draft = asObject(changeSet.payload);
  const vacation = asObject(draft.vacation);
  const scopeRows = await db`
    select id, customer_id, metadata from trips where id = ${changeSet.scope_trip_id} limit 1
  `;
  const scopeTrip = scopeRows[0];
  if (!scopeTrip) throw Object.assign(new Error('Scoped vacation not found.'), { statusCode: 404, code: 'vacation_not_found' });

  const startDate = isoDateOnly(vacation.start_date) || null;
  const endDate = isoDateOnly(vacation.end_date) || startDate;
  const rawDays = asArray(draft.days);
  const days = rawDays.length
    ? rawDays
    : enumerateVacationDates(startDate, endDate).map((date, idx) => ({ day_number: idx + 1, date, title: '', notes: '' }));
  const prelimItems = collectDraftLandingItems(draft).allItems;
  const explicitTz = cleanText(vacation.timezone, 80);
  const resolvedTimezone = inferVacationTimeZone({
    timezone: explicitTz,
    timezoneExplicit: Boolean(explicitTz),
    destination: cleanText(vacation.destination || vacation.title, 200),
    points: prelimItems.map((item) => item.location).filter(Boolean),
  });
  const baseMeta = {
    timezone: resolvedTimezone,
    ...(explicitTz ? { timezoneExplicit: true } : {}),
    currency: cleanText(vacation.currency, 12) || 'usd',
    summary: cleanText(vacation.summary, 1000) || '',
    days,
    intakeShare: true,
    importedFromChangeSetId: String(changeSet.id),
  };

  let targetTripId;
  let shareSlug;
  if (changeSet.apply_mode === 'populate_scoped') {
    targetTripId = String(scopeTrip.id);
    const mergedMeta = { ...asObject(scopeTrip.metadata), ...baseMeta };
    shareSlug = vacationShareSlugForRow({ id: targetTripId, metadata: mergedMeta });
    mergedMeta.publicSlug = shareSlug;
    await db`
      update trips
      set title = ${cleanText(vacation.title, 200) || 'Vacation'},
        destination = ${cleanText(vacation.destination, 200) || null},
        start_date = ${startDate},
        end_date = ${endDate},
        status = 'active',
        metadata = ${mergedMeta},
        updated_at = now()
      where id = ${targetTripId}
    `;
  } else {
    const inserted = await db`
      insert into trips (customer_id, title, destination, start_date, end_date, status, metadata)
      values (
        ${scopeTrip.customer_id || null},
        ${cleanText(vacation.title, 200) || 'Vacation'},
        ${cleanText(vacation.destination, 200) || null},
        ${startDate},
        ${endDate},
        'active',
        ${baseMeta}
      )
      returning id, metadata
    `;
    targetTripId = String(inserted[0].id);
    shareSlug = intakeShareSlug(targetTripId) || targetTripId;
    const withSlug = { ...asObject(inserted[0].metadata), publicSlug: shareSlug };
    await db`
      update trips
      set metadata = ${withSlug}, updated_at = now()
      where id = ${targetTripId}
    `;
  }

  const refToThing = new Map();
  const createdItemsForGps = [];
  const { allItems } = collectDraftLandingItems(draft, resolvedTimezone);
  for (const item of allItems) {
    const row = landingItemToThingRow(item, 'mcp_import', resolvedTimezone);
    const created = await insertTripThing(db, {
      tripId: targetTripId,
      requestId: null,
      thing: row.thing,
    });
    if (created?.id) {
      const entry = {
        id: String(created.id),
        title: String(created.title),
        ref: row.ref,
        scheduled: row.scheduled,
        day_date: item.day_date || null,
        location: row.location,
      };
      if (row.ref) refToThing.set(row.ref, entry);
      createdItemsForGps.push(entry);
    }
  }

  const dayNumberByDate = new Map(days.map((d, idx) => [isoDateOnly(d.date), Number(d.day_number || idx + 1)]));
  const removedMediaIds = new Set(asArray(draft.removed_media_ids).map((id) => String(id || '')));
  const mediaLinksById = new Map(asArray(draft.media).map((link) => [String(link.media_id || ''), link]));
  const publishedMedia = [];
  let skippedMediaCount = 0;
  let newTripBytes = 0;
  let newTripMediaCount = 0;
  for (const mediaRow of asArray(mediaRows)) {
    if (mediaRow.upload_status === 'signed' || mediaRow.upload_status === 'expired') continue;
    if (removedMediaIds.has(String(mediaRow.id))) continue;
    const link = mediaLinksById.get(String(mediaRow.id)) || {};
    const clearThing = link.clear_thing === true || link.thing_ref === '';
    const ref = clearThing ? '' : cleanText(link.thing_ref || mediaRow.target_thing_ref, 120);
    const gpsMatch = (!ref && !clearThing) ? findClosestGpsItem(mediaRow.exif_lat, mediaRow.exif_lng, createdItemsForGps) : null;
    const linked = (ref ? refToThing.get(ref) || null : null) || gpsMatch?.item || null;
    const exifRaw = asObject(mediaRow.exif_raw);
    const hasOffset = Boolean(exifRaw.offsetText) || (typeof exifRaw.capturedAtIso === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(exifRaw.capturedAtIso));
    const rawCaptured = !hasOffset && exifRaw.capturedAtRaw ? exifRaw.capturedAtRaw : (mediaRow.exif_captured_at || exifRaw.capturedAtIso || exifRaw.capturedAtRaw || null);
    const localCaptureDate = resolveLocalCaptureDate({ capturedAt: rawCaptured, offsetText: exifRaw.offsetText || null, vacationTimeZone: resolvedTimezone });
    const timeMatchedDate = localCaptureDate && dayNumberByDate.has(localCaptureDate) ? localCaptureDate : null;
    const explicitDay = isoDateOnly(link.day_date) || null;
    const storedDay = isoDateOnly(mediaRow.assigned_day_date) || null;
    const validManualDay = explicitDay && (!dayNumberByDate.size || dayNumberByDate.has(explicitDay)) ? explicitDay : null;
    const validStoredDay = storedDay && dayNumberByDate.has(storedDay) ? storedDay : null;
    const dayDate = validManualDay || timeMatchedDate || validStoredDay || (linked?.scheduled ? linked.day_date : null) || null;
    const dayNumber = dayDate ? (dayNumberByDate.get(dayDate) || null) : null;
    if (!linked?.id && !dayDate) {
      skippedMediaCount += 1;
      continue;
    }
    const published = await publishMediaRow(db, {
      mediaRow,
      shareSlug,
      tripId: targetTripId,
      linkedThingId: linked?.id || null,
      linkedThingTitle: linked?.title || null,
      dayDate,
      dayNumber: dayNumber > 0 ? dayNumber : null,
      caption: link.caption ?? mediaRow.caption,
    });
    if (!published) {
      skippedMediaCount += 1;
      continue;
    }
    publishedMedia.push(published);
    newTripBytes += Number(mediaRow.actual_bytes || 0);
    newTripMediaCount += 1;
  }

  if (targetTripId !== String(scopeTrip.id) && newTripMediaCount > 0) {
    await recordVacationMediaUsage(db, {
      tripId: targetTripId,
      bytesDelta: newTripBytes,
      countDelta: newTripMediaCount,
    });
  }

  return {
    publishedTripId: targetTripId,
    shareSlug,
    itemsCreated: createdItemsForGps.length,
    mediaPublished: publishedMedia.length,
    mediaSkipped: skippedMediaCount,
  };
}

export async function applyApprovedTargetedEdit(db, { changeSet, mediaRows }) {
  const tripId = String(changeSet.target_trip_id || changeSet.scope_trip_id);
  const tripRows = await db`
    select id, title, destination, start_date, end_date, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const trip = tripRows[0];
  if (!trip) throw Object.assign(new Error('Target vacation not found.'), { statusCode: 404, code: 'vacation_not_found' });
  const shareSlug = vacationShareSlugForRow(trip);
  const operations = asArray(changeSet.payload?.operations);
  const removedMediaIds = new Set(asArray(changeSet.payload?.removed_media_ids).map((id) => String(id || '')));
  const mediaById = new Map(asArray(mediaRows).map((row) => [String(row.id), row]));
  const refToThing = new Map();
  let metaDirty = false;
  let tripDirty = false;
  let nextTitle = trip.title;
  let nextDestination = trip.destination;
  const nextMeta = { ...asObject(trip.metadata) };
  const applied = { added: 0, updated: 0, removed: 0, daysUpdated: 0, mediaAttached: 0, mediaSkipped: 0 };

  for (const op of operations) {
    if (op.op === 'add_item') {
      const item = asObject(op.item);
      const rawDayDate = isoDateOnly(item.day_date || item.starts_at) || null;
      const unscheduled = Boolean(item.unscheduled === true || !rawDayDate);
      const dayDate = unscheduled ? null : rawDayDate;
      const ref = cleanText(item.ref, 120) || null;
      const website = cleanText(item.website, 500) || null;
      const tripTz = inferVacationTimeZone({
        timezone: cleanText(nextMeta.timezone, 80),
        timezoneExplicit: nextMeta.timezoneExplicit === true,
        destination: cleanText(nextDestination || nextTitle, 200),
      });
      const startTime = unscheduled ? '' : (formatLocalClockTime(item.start_time || item.starts_at, tripTz) || '');
      const endTime = unscheduled ? '' : (formatLocalClockTime(item.end_time || item.ends_at, tripTz) || '');
      const itemTitle = cleanText(item.title, 240);
      const itemDesc = cleanText(item.description, 4000) || null;
      const itemNotes = cleanText(item.notes, 1000) || null;
      const normalizedCategory = normalizeImportedCategory(item.category, 'note', itemTitle, itemDesc || '');
      const thingDetail = {
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(itemNotes ? { itineraryNote: itemNotes } : {}),
        ...(itemDesc ? { longDetails: itemDesc } : {}),
        ...(website ? { website } : {}),
      };
      const itemMeta = {
        ...(ref ? { draftRef: ref } : {}),
        ...(dayDate ? { dayDate, whenLabel: dayDate } : {}),
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(itemNotes ? { notes: [itemNotes] } : {}),
        ...(website ? { website } : {}),
        ...(Object.keys(thingDetail).length ? { thingDetail } : {}),
        scheduled: !unscheduled,
        unscheduled,
        timeline: !unscheduled,
        source: 'mcp_update',
      };
      const created = await insertTripThing(db, {
        tripId,
        requestId: null,
        thing: {
          category: normalizedCategory,
          title: itemTitle,
          description: itemDesc,
          startsAt: unscheduled ? null : (item.starts_at || (dayDate ? `${dayDate}T12:00:00.000Z` : null)),
          endsAt: unscheduled ? null : (item.ends_at || null),
          costEstimateCents: Number.isInteger(item.total_price_cents) ? item.total_price_cents : null,
          currency: cleanText(item.currency, 12) || 'usd',
          location: asObject(item.location),
          links: website ? [{ url: website, label: 'Website' }] : [],
          ratings: {},
          metadata: itemMeta,
        },
      });
      if (ref && created?.id) {
        refToThing.set(ref, { id: String(created.id), title: String(created.title) });
      }
      applied.added += 1;
    } else if (op.op === 'update_item') {
      const existingRows = await db`
        select * from trip_things where id = ${op.item_id} and trip_id = ${tripId} limit 1
      `;
      const existing = existingRows[0];
      if (!existing) continue;
      const patch = asObject(op.patch);
      const updatedTitle = patch.title !== undefined ? cleanText(patch.title, 240) : existing.title;
      const updatedDesc = patch.description !== undefined ? cleanText(patch.description, 4000) : existing.description;
      const updatedStarts = patch.unscheduled === true
        ? null
        : (patch.starts_at !== undefined ? patch.starts_at : existing.starts_at);
      const updatedEnds = patch.unscheduled === true
        ? null
        : (patch.ends_at !== undefined ? patch.ends_at : existing.ends_at);
      const updatedCost = patch.total_price_cents !== undefined
        ? patch.total_price_cents
        : (patch.cost_estimate_cents !== undefined ? patch.cost_estimate_cents : existing.cost_estimate_cents);
      const updatedLocation = patch.location !== undefined ? { ...asObject(existing.location), ...asObject(patch.location) } : existing.location;
      const updatedMeta = {
        ...asObject(existing.metadata),
        ...(patch.day_date !== undefined
          ? {
            dayDate: isoDateOnly(patch.day_date) || null,
            whenLabel: isoDateOnly(patch.day_date) || null,
            scheduled: Boolean(isoDateOnly(patch.day_date)),
            unscheduled: !isoDateOnly(patch.day_date),
            timeline: Boolean(isoDateOnly(patch.day_date)),
          }
          : {}),
        ...(patch.unscheduled === true ? { dayDate: null, whenLabel: null, scheduled: false, unscheduled: true, timeline: false } : {}),
        ...(patch.notes !== undefined ? { notes: Array.isArray(patch.notes) ? patch.notes : [cleanText(patch.notes, 1000)] } : {}),
        ...(patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : {}),
      };
      await db`
        update trip_things
        set title = ${updatedTitle},
          description = ${updatedDesc},
          starts_at = ${updatedStarts},
          ends_at = ${updatedEnds},
          cost_estimate_cents = ${updatedCost},
          location = ${updatedLocation},
          metadata = ${updatedMeta},
          updated_at = now()
        where id = ${op.item_id} and trip_id = ${tripId}
      `;
      applied.updated += 1;
    } else if (op.op === 'remove_item') {
      await db`
        delete from trip_things
        where id = ${op.item_id} and trip_id = ${tripId}
      `;
      applied.removed += 1;
    } else if (op.op === 'update_day') {
      const date = isoDateOnly(op.day_date);
      if (date) {
        const dayMeta = { ...asObject(nextMeta.dayMeta) };
        dayMeta[date] = { ...asObject(dayMeta[date]), ...asObject(op.patch) };
        nextMeta.dayMeta = dayMeta;
        metaDirty = true;
        applied.daysUpdated += 1;
      }
    } else if (op.op === 'update_vacation_fields') {
      const patch = asObject(op.patch);
      if (patch.title !== undefined) { nextTitle = cleanText(patch.title, 200); tripDirty = true; }
      if (patch.destination !== undefined) { nextDestination = cleanText(patch.destination, 200); tripDirty = true; }
      if (patch.timezone !== undefined) { nextMeta.timezone = cleanText(patch.timezone, 80); metaDirty = true; }
      if (patch.summary !== undefined) { nextMeta.summary = cleanText(patch.summary, 1000); metaDirty = true; }
    } else if (op.op === 'attach_media') {
      if (removedMediaIds.has(String(op.media_id || ''))) continue;
      const mediaRow = mediaById.get(String(op.media_id || ''));
      if (!mediaRow || mediaRow.upload_status === 'signed' || mediaRow.upload_status === 'expired') continue;
      let linkedId = op.thing_id || null;
      let thingTitle = null;
      if (!linkedId && op.thing_ref) {
        const fromBatch = refToThing.get(cleanText(op.thing_ref, 120));
        if (fromBatch) {
          linkedId = fromBatch.id;
          thingTitle = fromBatch.title;
        }
      }
      if (linkedId && !thingTitle) {
        const tRows = await db`select title from trip_things where id = ${linkedId} and trip_id = ${tripId} limit 1`;
        thingTitle = tRows[0]?.title || null;
      }
      const tripDays = asArray(nextMeta.days).length
        ? asArray(nextMeta.days).map((d, idx) => ({ date: isoDateOnly(d.date), day_number: Number(d.day_number || idx + 1) }))
        : enumerateVacationDates(trip.start_date, trip.end_date).map((date, idx) => ({ date, day_number: idx + 1 }));
      const editDayNumberByDate = new Map(tripDays.filter((d) => d.date).map((d) => [d.date, d.day_number]));
      const editTz = inferVacationTimeZone({ timezone: cleanText(nextMeta.timezone, 80), timezoneExplicit: nextMeta.timezoneExplicit === true, destination: cleanText(nextDestination || nextTitle, 200) });
      const exifRaw = asObject(mediaRow.exif_raw);
      const hasOffset = Boolean(exifRaw.offsetText) || (typeof exifRaw.capturedAtIso === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(exifRaw.capturedAtIso));
      const rawCaptured = !hasOffset && exifRaw.capturedAtRaw ? exifRaw.capturedAtRaw : (mediaRow.exif_captured_at || exifRaw.capturedAtIso || exifRaw.capturedAtRaw || null);
      const localCaptureDate = resolveLocalCaptureDate({ capturedAt: rawCaptured, offsetText: exifRaw.offsetText || null, vacationTimeZone: editTz });
      const timeMatchedDate = localCaptureDate && editDayNumberByDate.has(localCaptureDate) ? localCaptureDate : null;
      const explicitDay = isoDateOnly(op.day_date) || null;
      const storedDay = isoDateOnly(mediaRow.assigned_day_date) || null;
      const validExplicitDay = explicitDay && (!editDayNumberByDate.size || editDayNumberByDate.has(explicitDay)) ? explicitDay : null;
      const validStoredDay = storedDay && editDayNumberByDate.has(storedDay) ? storedDay : null;
      const resolvedDayDate = validExplicitDay || timeMatchedDate || validStoredDay || null;
      const resolvedDayNumber = resolvedDayDate ? (editDayNumberByDate.get(resolvedDayDate) || null) : null;
      if (!linkedId && !resolvedDayDate) {
        applied.mediaSkipped += 1;
        continue;
      }
      const published = await publishMediaRow(db, {
        mediaRow,
        shareSlug,
        tripId,
        linkedThingId: linkedId,
        linkedThingTitle: thingTitle,
        dayDate: resolvedDayDate,
        dayNumber: resolvedDayNumber,
        caption: op.caption ?? mediaRow.caption,
      });
      if (!published) {
        applied.mediaSkipped += 1;
        continue;
      }
      applied.mediaAttached += 1;
    }
  }

  if (tripDirty || metaDirty) {
    await db`
      update trips
      set title = ${nextTitle},
        destination = ${nextDestination},
        metadata = ${nextMeta},
        updated_at = now()
      where id = ${tripId}
    `;
  }

  return { publishedTripId: tripId, shareSlug, applied };
}
