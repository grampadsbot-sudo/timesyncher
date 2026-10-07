# Maps

- Shared day map: Vacation Day View; timeline-tagged stops only.
- Keepsake maps: Config **Day1 map** / **Day2 map** / **Day3 map** (all default ON). Live heading **Daily maps**, buttons **Day {n} map**. Off → `ksMapOff`.
- Mapbox control labels in the live bundle: **Enter fullscreen** / **Exit fullscreen** (`FullscreenControl`). Not a shared-header button.
- TREK settings (not shared-guest header): Mapbox GL / Google Maps API Key.

Day-by-Day map markers are Leaflet pins from timeline things with lat/lng (`La` / `Ht`). Clicking a pin opens that thing (`Ne(Qt(G))`). Flights and TREK-`car` rows are excluded. Staging writes venue coords onto `places` and nested `assignments[].place`, and classifies restaurants before `car` so Carbone is not dropped as a car.

Maps on/off follow Keepsakes Config only. Do not invent extra map toggles.
