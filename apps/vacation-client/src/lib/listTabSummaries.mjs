import { buildCategoryDescription } from '../../../../src/vacation/trip-thing-enrichment.mjs';
import {
  numericPrice,
  parsePrice,
  placeName,
  tabCategoryKey,
} from './listTabModel.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function sourceRecord(place, override) {
  return (
    override.sourceRecord ||
    place.sourceRecord ||
    (place.source && typeof place.source === 'object' ? place.source : null) ||
    {}
  );
}

function rentalCompanyFromTitle(name = '') {
  const title = text(name);
  if (!title) return '';
  const head = title.split(/\s+\bat\b\s+/i)[0]?.trim() || title;
  const parts = head.split(/\s+/).filter(Boolean);
  if (/priceline/i.test(head) && parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return head;
}

function isEventLikePlace(place, trip) {
  const category = tabCategoryKey(place, trip);
  if (category === 'event') return true;
  const raw = text(
    overrideFor(trip, place).category ||
      place.category?.name ||
      place.category_name ||
      place.category,
  ).toLowerCase();
  return /^(event|music|activity|tour|theatre|artist|sightseeing|family_event|other)$/.test(raw);
}

function listLongDescription(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(
    override.longDetails ||
      override.details ||
      source.longDetails ||
      source.description ||
      source.details ||
      place.longDetails ||
      place.description,
  );
}

export function itinerarySummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(override.summary || source.summary || place.summary);
}

export function rowSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const category = tabCategoryKey(place, trip);
  const longDescription = listLongDescription(place, trip);
  if (category === 'car') {
    const enrichedSource = {
      ...source,
      rentalCompany: text(override.rentalCompany || source.rentalCompany || rentalCompanyFromTitle(placeName(place))),
      pickupLocation: text(
        override.pickupLocation || source.pickupLocation || source.pickup || place.address,
      ),
      dropoffLocation: text(
        override.dropoffLocation ||
          override.returnLocation ||
          source.dropoffLocation ||
          source.returnLocation ||
          source.dropoff,
      ),
      pickupHours: text(
        override.startTime || source.startTime || source.pickupTime || source.pickupHours,
      ),
      dropoffHours: text(
        override.endTime ||
          source.returnTime ||
          source.dropoffTime ||
          source.dropoffHours ||
          source.endTime,
      ),
      carType: text(override.vehicleClass || override.carType || source.vehicleClass || source.carType),
      summary: longDescription || text(override.summary || source.summary || place.description),
      price: numericPrice(place, trip) ?? parsePrice(override.price) ?? parsePrice(source.price),
    };
    if (longDescription) return longDescription;
    return text(
      buildCategoryDescription({
        category: 'car',
        title: placeName(place),
        sourceRecord: enrichedSource,
        address: text(place.address),
        rawDescription: text(override.summary || source.summary || place.description),
      }),
    );
  }
  const eventLike = isEventLikePlace(place, trip);
  const scheduleHint = text(
    override.startTime ||
      override.place_time ||
      place.place_time ||
      source.schedule ||
      source.startsAt ||
      source.when,
  );
  const enrichedSource = scheduleHint ? { ...source, when: scheduleHint, startTime: scheduleHint } : source;
  if (eventLike) {
    let price = numericPrice(place, trip);
    if (price == null) {
      price =
        parsePrice(source.price) ??
        parsePrice(source.ticketPrice) ??
        parsePrice(override.details) ??
        parsePrice(place.description);
    }
    const withPrice =
      price != null ? { ...enrichedSource, price, ticketPrice: price } : enrichedSource;
    let eventSummary = text(
      buildCategoryDescription({
        category: 'event',
        title: placeName(place),
        sourceRecord: {
          ...withPrice,
          summary: longDescription || text(override.summary || source.summary || place.description),
          description: text(override.details || source.description || longDescription),
        },
        address: text(place.address),
        rawDescription: '',
      }),
    );
    if (!/when:/i.test(eventSummary) && scheduleHint) {
      eventSummary = `${eventSummary} When: ${scheduleHint}.`.replace(/\s+/g, ' ').trim();
    }
    if (!/price:/i.test(eventSummary)) {
      const price = numericPrice(place, trip);
      if (price != null) {
        eventSummary = `${eventSummary} Price: tickets from about $${Math.round(price).toLocaleString('en-US')}.`.replace(
          /\s+/g,
          ' ',
        ).trim();
      }
    }
    return eventSummary;
  }
  const candidates = [
    longDescription,
    override.summary,
    source.summary,
    place.summary,
  ]
    .map((value) => text(value))
    .filter(Boolean);
  let summary =
    candidates[0] ||
    text(
      buildCategoryDescription({
        category,
        title: placeName(place),
        sourceRecord: enrichedSource,
        address: text(place.address),
        rawDescription: '',
      }),
    ) ||
    '';
  const price = numericPrice(place, trip);
  if (price != null && !/\$\s*\d|price:|from \$|tickets?\s+(from\s+)?\$/i.test(summary)) {
    summary = `${summary} Price: about $${Math.round(price).toLocaleString('en-US')}.`.replace(/\s+/g, ' ').trim();
  }
  return summary;
}
