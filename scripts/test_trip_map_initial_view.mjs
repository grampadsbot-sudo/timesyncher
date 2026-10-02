import assert from 'node:assert/strict';

import {
  MAP_CENTER_UNRESOLVED,
  TRIP_MAP_DESTINATION_ZOOM,
  TRIP_MAP_FIT_MAX_ZOOM,
  TRIP_MAP_SINGLE_POINT_ZOOM,
  computeTripMapInitialView,
} from '../src/vacation/trip-map-initial-view.mjs';
import { sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';

const p1 = { lat: 10, lng: 20 };
const p2 = { lat: 12, lng: 22 };
const p3 = { lat: 11, lng: 21 };

const boundsView = computeTripMapInitialView({
  places: [p1, p2, p3],
  trip: {},
});
assert.equal(boundsView.ok, true);
assert.equal(boundsView.mode, 'bounds');
assert.equal(boundsView.points.length, 3);
assert.ok(boundsView.points.every((pt) => [p1, p2, p3].some((want) => want.lat === pt.lat && want.lng === pt.lng)));
assert.equal(boundsView.maxZoom, TRIP_MAP_FIT_MAX_ZOOM);
assert.ok(boundsView.center.lat > 10 && boundsView.center.lat < 12);
assert.ok(boundsView.center.lng > 20 && boundsView.center.lng < 22);

const singleView = computeTripMapInitialView({
  places: [p1],
  trip: {},
});
assert.equal(singleView.ok, true);
assert.equal(singleView.mode, 'point');
assert.deepEqual(singleView.center, p1);
assert.equal(singleView.zoom, TRIP_MAP_SINGLE_POINT_ZOOM);
assert.equal(singleView.maxZoom, TRIP_MAP_SINGLE_POINT_ZOOM);

const destinationView = computeTripMapInitialView({
  places: [],
  trip: { metadata: { destinationCenter: { lat: 33.5, lng: -111.9 } } },
});
assert.equal(destinationView.ok, true);
assert.equal(destinationView.mode, 'destination');
assert.deepEqual(destinationView.center, { lat: 33.5, lng: -111.9 });
assert.equal(destinationView.zoom, TRIP_MAP_DESTINATION_ZOOM);

const unresolved = computeTripMapInitialView({ places: [], trip: { title: 'Trip' } });
assert.equal(unresolved.ok, false);
assert.equal(unresolved.code, MAP_CENTER_UNRESOLVED);

const shared = sharedTripFromIntake({
  trip: {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Fixture trip',
    destination: 'Area alpha',
    metadata: { destinationCenter: { lat: 40.1, lng: -105.2 } },
  },
  things: [],
});
assert.equal(shared.trip.lat, 40.1);
assert.equal(shared.trip.lng, -105.2);
const fromShared = computeTripMapInitialView({ places: shared.places, trip: shared.trip });
assert.equal(fromShared.ok, true);
assert.equal(fromShared.mode, 'destination');

console.log('trip map initial view unit tests passed');
