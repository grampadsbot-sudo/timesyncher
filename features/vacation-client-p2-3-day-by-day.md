# Vacation client P2.3 — Day-by-Day + map (preview)

Clean-room React implementation in `apps/vacation-client` (preview `vacation-app-next.html`). Does **not** replace served TREK `/shared/` until a later cutover phase.

| Surface | Preview behavior |
| --- | --- |
| Vacation Day View | Day chips from `days[]`; single-day timeline from `assignments` + `thingOverrides.timeline` |
| Timeline | Times, durations, travel rows between geocoded stops, car pickup/drop-off, conflict labels, itinerary note per row |
| Map | react-leaflet + OSM tiles **below** timeline card (`data-ts-day-map` after `data-ts-day-timeline`) |
| Markers | Timeline-tagged places with lat/lng; excludes flights and rental cars (matches `features/maps.md`) |

Verification: `.cursor/skills/verify-timesyncher-vacation/features/vacation-client-day-by-day.md`
