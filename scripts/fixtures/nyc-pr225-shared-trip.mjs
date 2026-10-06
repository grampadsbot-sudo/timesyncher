import { applyCapturedLogos } from '../../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../../src/vacation/intake-shared-trip.mjs';
import {
  applyLiveAppTimelineSelections,
  assignPlaceToTripDays,
} from '../../src/vacation/shared-trip-live-app-fields.mjs';

export const NYC_PR225_SLUG = 'intake-c15be2f6d7bf';
export const NYC_PR225_TRIP_ID = 'c15be2f6-d7bf-498a-b2e7-aa2b828dfab6';

function nycThings() {
  return [
    {
      id: 'flight-jfk-outbound',
      category: 'flight',
      title: 'JetBlue BOS → JFK 6:30 am–10:15 am',
      description: 'Nonstop morning option; good if you want to land before lunch.',
      source: 'customer',
      metadata: {
        categoryName: 'flight',
        price: 248,
        sourceRecord: {
          source: 'customer',
          summary: 'Nonstop morning option; good if you want to land before lunch.',
          price: 248,
          timeline: true,
          fareDirection: 'one-way',
          logoUrl: 'https://www.jetblue.com/favicon.ico',
        },
      },
    },
    {
      id: 'hotel-midtown-sample',
      category: 'hotel',
      title: 'Midtown sample hotel',
      description: 'Strong transit access and easy walk to dinner reservations.',
      source: 'brave',
      location: { lat: 40.758, lng: -73.9855, address: 'W 47th St, New York, NY' },
      metadata: {
        categoryName: 'Hotel',
        price: 389,
        sourceRecord: {
          url: 'https://example-hotel.test/',
          source: 'brave',
          summary: 'Strong transit access and easy walk to dinner reservations.',
          price: 389,
          timeline: true,
          stayDays: 4,
          checkInDate: '2026-06-10',
          checkOutDate: '2026-06-14',
          checkInTime: '16:00',
          checkOutTime: '11:00',
          logoUrl: 'https://example-hotel.test/favicon.ico',
        },
      },
    },
    {
      id: 'car-priceline-opaque',
      category: 'car',
      title: 'Priceline opaque Toyota Corolla',
      description: 'Compact automatic; pick up near JFK AirTrain.',
      source: 'brave',
      location: { lat: 40.6413, lng: -73.7781, address: 'JFK Airport, Queens, NY' },
      metadata: {
        categoryName: 'car',
        price: 172,
        sourceRecord: {
          url: 'https://www.priceline.com/favicon.ico',
          source: 'brave',
          rentalCompany: 'Priceline opaque',
          carType: 'Toyota Corolla or similar',
          vehicleClass: 'Toyota Corolla or similar',
          summary: 'Compact automatic; pick up near JFK AirTrain.',
          price: 172,
          timeline: true,
          startTime: '11:00',
          duration: '45',
          logoUrl: 'https://www.priceline.com/favicon.ico',
        },
      },
    },
    {
      id: 'restaurant-nyc-sample',
      category: 'restaurant',
      title: 'Sample NYC restaurant',
      description: 'Reservations recommended on Friday nights.',
      source: 'brave',
      location: { lat: 40.733, lng: -74.002, address: 'Greenwich Village, New York, NY' },
      metadata: {
        categoryName: 'restaurant',
        sourceRecord: {
          url: 'https://example-restaurant.test/',
          source: 'brave',
          summary: 'Reservations recommended on Friday nights.',
          timeline: false,
        },
      },
    },
    {
      id: 'store-nyc-sample',
      category: 'store',
      title: 'Sample NYC store',
      description: 'Good stop for travel essentials near the hotel.',
      source: 'brave',
      location: { lat: 40.761, lng: -73.977, address: 'Midtown, New York, NY' },
      metadata: {
        categoryName: 'store',
        sourceRecord: {
          url: 'https://example-store.test/',
          source: 'brave',
          summary: 'Good stop for travel essentials near the hotel.',
          timeline: false,
        },
      },
    },
    {
      id: 'event-nyc-sample',
      category: 'activity',
      title: 'Sample NYC event',
      description: 'Timed entry; buy tickets before the trip.',
      source: 'customer',
      location: { lat: 40.779, lng: -73.963, address: 'Upper East Side, New York, NY' },
      metadata: {
        categoryName: 'event',
        sourceRecord: {
          source: 'customer',
          summary: 'Timed entry; buy tickets before the trip.',
          timeline: false,
        },
      },
    },
  ].map((row) => thingRecordFromTripRow(row));
}

function wirePr225Timeline(shared) {
  const bySlug = (needle) => shared.places.find((place) => String(place.name || '').includes(needle));
  const flight = bySlug('JetBlue');
  const hotel = bySlug('Midtown sample');
  const car = bySlug('Priceline opaque');
  if (!flight || !hotel || !car) {
    throw new Error('NYC PR225 fixture missing flight, hotel, or car place row');
  }
  let next = applyLiveAppTimelineSelections(shared, [flight.id, hotel.id, car.id]);
  next = assignPlaceToTripDays(next, flight.id, [1]);
  next = assignPlaceToTripDays(next, hotel.id, [1, 2, 3, 4]);
  const day1 = (next.days || []).find((day) => Number(day.day_number) === 1);
  const day5 = (next.days || []).find((day) => Number(day.day_number) === 5);
  const perDaySchedule = {};
  if (day1) {
    perDaySchedule[String(day1.id)] = { startTime: '11:00', duration: '45' };
  }
  if (day5) {
    perDaySchedule[String(day5.id)] = { startTime: '16:00', duration: '45' };
  }
  next = assignPlaceToTripDays(next, car.id, [1, 5], {
    startTime: '11:00',
    duration: '45',
    endTime: '16:45',
    perDaySchedule,
  });
  return next;
}

export function buildNycPr225SharedTrip() {
  const base = sharedTripFromIntake({
    trip: {
      id: NYC_PR225_TRIP_ID,
      title: 'June NYC sample trip',
      destination: 'New York City',
      start_date: '2026-06-10',
      end_date: '2026-06-14',
      metadata: {
        intakeShare: true,
        publicSlug: NYC_PR225_SLUG,
        destinationCenter: { lat: 40.758, lng: -73.9855 },
      },
    },
    things: nycThings(),
  });
  return applyCapturedLogos(wirePr225Timeline(base));
}
