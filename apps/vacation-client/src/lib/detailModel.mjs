/** Thing detail popup field model (reads trip thingOverrides / place only). */

import {
  carPriceDisplay,
  flightPriceDisplay,
  flightSchedule,
  hotelPriceDisplay,
  logoUrlForPlace,
  numericPrice,
  placeName,
  tabCategoryKey,
} from './listTabModel.mjs';
import { ensureProductListSummary } from '../../../../src/vacation/trip-thing-enrichment.mjs';

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

const CATEGORY_LABELS = {
  flight: 'Flight',
  hotel: 'Hotel',
  car: 'Car',
  restaurant: 'Restaurant',
  bar: 'Bar',
  store: 'Store',
  event: 'Event',
};

export function detailCategoryKey(place, trip) {
  return tabCategoryKey(place, trip);
}

export function detailCategoryLabel(category) {
  const key = text(category).toLowerCase();
  return CATEGORY_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '');
}

export function detailSummary(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  const category = tabCategoryKey(place, trip);
  const raw = text(
    override.summary ||
      override.longDetails ||
      override.details ||
      source.summary ||
      place.description,
  );
  return ensureProductListSummary(raw, { ...place, sourceRecord: source }, { category });
}

export function detailItineraryNote(place, trip) {
  const override = overrideFor(trip, place);
  const source = sourceRecord(place, override);
  return text(override.itineraryNote || override.itinerary_note || source.itineraryNote);
}

export function detailHappyHour(override) {
  return text(override.happyHourDetails);
}

export function detailPriceLabel(place, trip, category) {
  const cat = text(category).toLowerCase();
  const override = overrideFor(trip, place);
  if (cat === 'flight') return flightPriceDisplay(place, trip);
  if (cat === 'hotel') return hotelPriceDisplay(place, trip);
  if (cat === 'car') return carPriceDisplay(place, trip);
  const price = numericPrice(place, trip);
  if (price != null) return `$${price}`;
  const level = text(override.priceLevel || override.price_level);
  if (level) return level;
  if (cat === 'event' || cat === 'music' || cat === 'tour' || cat === 'theatre' || cat === 'tickets') {
    return 'Price unknown';
  }
  return '';
}

export function detailRatingLines(override) {
  const lines = [];
  const googleRating = text(override.googleRating);
  const googleCount = text(override.googleReviewCount);
  if (googleRating) {
    lines.push({
      id: 'google',
      text: googleCount ? `${googleRating} on Google (${googleCount} reviews)` : `${googleRating} on Google`,
    });
  }
  const yelpRating = text(override.yelpRating);
  const yelpCount = text(override.yelpReviewCount);
  if (yelpRating) {
    lines.push({
      id: 'yelp',
      text: yelpCount ? `${yelpRating} on Yelp (${yelpCount} reviews)` : `${yelpRating} on Yelp`,
    });
  }
  const thirdRating = text(override.thirdPartyRating || override.rating);
  const thirdCount = text(override.thirdPartyReviewCount || override.count);
  const source = text(override.source);
  if (thirdRating && !googleRating && !yelpRating) {
    const label = source && !/^customer$/i.test(source) ? source : 'Rating';
    lines.push({
      id: 'third',
      text: thirdCount ? `${thirdRating} (${thirdCount} reviews)` : thirdRating,
      label,
    });
  }
  return lines;
}

export function detailReviews(override, category) {
  const cat = text(category).toLowerCase();
  if (cat === 'flight' || cat === 'car') return [];
  const reviews = [];
  for (let index = 1; index <= 4; index += 1) {
    const body = text(override[`review${index}`]);
    if (!body) continue;
    reviews.push({
      index,
      text: body,
      rating: text(override[`review${index}Rating`]),
      source: text(override[`review${index}Source`]),
    });
  }
  return reviews;
}

export function detailSummarySourceUrls(override) {
  const raw = override.summarySourceUrls;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => text(row)).filter(Boolean);
}

function flightDetailRows(place, trip, override) {
  const source = sourceRecord(place, override);
  const schedule = flightSchedule(place, trip);
  const rows = [];
  const airline = text(override.airline || source.airline);
  if (airline) rows.push({ key: 'airline', label: 'Airline', value: airline });
  const flightNumber = text(override.flightNumber || override.flight_number || source.flightNumber);
  if (flightNumber) rows.push({ key: 'flightNumber', label: 'Flight number', value: flightNumber });
  if (schedule.depart) rows.push({ key: 'departureTime', label: 'Departure', value: schedule.depart });
  if (schedule.arrive) rows.push({ key: 'arrivalTime', label: 'Arrival', value: schedule.arrive });
  const layovers = text(override.layovers || source.layovers);
  if (layovers) rows.push({ key: 'layovers', label: 'Layovers', value: layovers });
  const duration = text(override.duration || source.duration);
  if (duration) rows.push({ key: 'duration', label: 'Duration', value: duration });
  return rows;
}

function carDetailRows(place, trip, override) {
  const source = sourceRecord(place, override);
  const rows = [];
  const company = text(override.rentalCompany || source.rentalCompany || source.company);
  if (company) rows.push({ key: 'rentalCompany', label: 'Rental company', value: company });
  const carType = text(override.carType || override.vehicleClass || source.carType || source.vehicleClass);
  if (carType) rows.push({ key: 'carType', label: 'Car type', value: carType });
  const pickup = text(override.pickupLocation || source.pickupLocation || source.pickup_location);
  if (pickup) rows.push({ key: 'pickupLocation', label: 'Pickup', value: pickup });
  const dropoff = text(override.returnLocation || source.returnLocation || source.return_location);
  if (dropoff) rows.push({ key: 'returnLocation', label: 'Return', value: dropoff });
  return rows;
}

function hotelExtraRows(override) {
  const rows = [];
  const checkIn = text(override.checkInTime || override.check_in_time);
  if (checkIn) rows.push({ key: 'checkInTime', label: 'Check-in', value: checkIn });
  const checkOut = text(override.checkOutTime || override.check_out_time);
  if (checkOut) rows.push({ key: 'checkOutTime', label: 'Check-out', value: checkOut });
  const note = text(override.hotelNote || override.hotel_note);
  if (note) rows.push({ key: 'hotelNote', label: 'Hotel note', value: note });
  return rows;
}

function standardContactRows(place, override) {
  const source = sourceRecord(place, override);
  const rows = [];
  const address = text(override.address || place.address || source.address);
  if (address) rows.push({ key: 'address', label: 'Address', value: address });
  const hours = text(override.hours || source.hours || source.openingHours);
  if (hours) rows.push({ key: 'hours', label: 'Hours', value: hours });
  const phone = text(override.phone || place.phone || source.phone || source.telephone);
  if (phone) rows.push({ key: 'phone', label: 'Phone', value: phone, href: `tel:${phone.replace(/\s+/g, '')}` });
  const website = text(override.website || override.url || place.url || source.website || source.url);
  if (website) rows.push({ key: 'website', label: 'Website', value: website, href: website });
  return rows;
}

/** Rows to render in the detail popup for this place (only non-empty values). */
export function detailFieldRows(place, trip) {
  const override = overrideFor(trip, place);
  const category = detailCategoryKey(place, trip);
  const cat = text(category).toLowerCase();
  if (cat === 'flight') return flightDetailRows(place, trip, override);
  if (cat === 'car') return carDetailRows(place, trip, override);
  const rows = standardContactRows(place, override);
  if (cat === 'hotel') rows.push(...hotelExtraRows(override));
  return rows;
}

export function buildDetailViewModel(place, trip) {
  const override = overrideFor(trip, place);
  const category = detailCategoryKey(place, trip);
  const name = placeName(place);
  const logoUrl = logoUrlForPlace(place, trip);
  const fallback = text(override.icon || place.category?.icon || place.category_icon || '📍') || '📍';
  return {
    category,
    categoryLabel: detailCategoryLabel(category),
    name,
    logoUrl,
    logoFallback: fallback,
    summary: detailSummary(place, trip),
    itineraryNote: detailItineraryNote(place, trip),
    happyHourDetails: detailHappyHour(override),
    priceLabel: detailPriceLabel(place, trip, category),
    ratingLines: detailRatingLines(override),
    reviews: detailReviews(override, category),
    summarySourceUrls: detailSummarySourceUrls(override),
    fieldRows: detailFieldRows(place, trip),
  };
}
