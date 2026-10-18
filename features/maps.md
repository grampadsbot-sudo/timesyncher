# Maps

- Shared day map: Vacation Day View; timeline-tagged stops only.
- Keepsake maps: Config **Day1 map** / **Day2 map** / **Day3 map** (all default ON). Live heading **Daily maps**, buttons **Day {n} map**. Off → `ksMapOff`.
- Mapbox control labels in the live bundle: **Enter fullscreen** / **Exit fullscreen** (`FullscreenControl`). Not a shared-header button.
- TREK settings (not shared-guest header): Mapbox GL / Google Maps API Key.

Day-by-Day map markers are Leaflet pins from timeline things with lat/lng (`La` / `Ht`). Clicking a pin opens that thing (`Ne(Qt(G))`). Flights and TREK-`car` rows are excluded. Staging writes venue coords onto `places` and nested `assignments[].place`, and classifies restaurants before `car` so Carbone is not dropped as a car.

Maps on/off follow Keepsakes Config only. Do not invent extra map toggles.

## React preview map — #336 piece A

`DayMap` uses Leaflet's packaged standard/retina marker images and shadow, with OpenStreetMap tiles at `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Markers use finite coordinates from places, overrides and stored source records (including metadata source records); numeric strings are accepted. Null, empty/whitespace strings, booleans, nonnumeric and out-of-range values cannot become coordinate zero. Actual numeric zero remains valid. Flight/car/travel entries are excluded and markers deduplicate by Thing id.

The no-coordinate state stays **Map appears when places include coordinates.** There is no fixed-city or trip-center fallback. Source coordinates drive the initial view and subsequent day fits. Live map measurements publish Leaflet engine, center, zoom and bounds on the container and `window.__tsTripMap`; the hook is removed when the map unmounts. Resize events update the map size and measurements.

The preview day screen fills the viewport and gives the timeline its own scrolling area above the map. This structural layout does not change timeline icon/name geometry or Keepsakes Config. `test/dayTimeline.unit.mjs` covers source coordinate resolution, invalid coercion, valid zero, marker exclusion and deduplication. Visual acceptance against Craig's baseline remains separate; this port does not switch the served entry.
