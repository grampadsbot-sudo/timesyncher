# TSV client cutover removal list (P1 inventory only)

Nothing in this document is deleted in P1. Each row names what the clean-room client at `apps/vacation-client` is intended to replace, and the planned cutover phase.

| Item | Location / identifier | Replaced by (P1 scaffold) | Remove in |
| --- | --- | --- | --- |
| Served upstream TREK bundle (patched) | `public/assets/index-BKun7ofk.js` via `src/vacation/trek-style2-bundle.mjs` | Built assets from `apps/vacation-client` | P3 |
| Bundle strip / rebake pipeline | `scripts/strip-served-trek-bundle.mjs`, `scripts/rebake_served_trek_bundle.mjs`, `scripts/test_served_trek_bundle.mjs` | No upstream bundle to strip | P4 |
| TREK sync / agent edit tooling | `scripts/trek-vacation-sync.mjs`, `scripts/trek-agent-edit.mjs`, `scripts/trek-itinerary-edit.mjs` | Direct API + client data layer | P4 |
| Needle: style-2 / keepsake print bundle | `src/vacation/trek-style2-bundle.mjs` | Shared renderer components (web + print in one codebase later) | P3 |
| Needle: live product / list / tab patches | `src/vacation/trek-live-product-patches.mjs` | Native React list rows, tabs, budget, cars, flights | P3 |
| Needle: shared layout overflow | `src/vacation/trek-shared-layout-patches.mjs` | Client CSS layout | P3 |
| Needle: day-by-day / map tiles | `src/vacation/trek-day-by-day-map-patches.mjs`, `src/vacation/trek-default-map-tiles.mjs` | `react-leaflet` + OSM (live); print map in shared renderer | P3 |
| Needle: budget saved targets only | `src/vacation/trek-budget-target-patches.mjs` | Budget tab reads `shared.budget` from API | P3 |
| Needle: thing detail panel | `src/vacation/trek-thing-detail-patches.mjs` | `ThingDetailScreen` | P3 |
| Needle: thing detail fields | `src/vacation/trek-thing-detail-fields-patch.mjs` | Detail fields from API / `thingOverrides` | P3 |
| Needle: thing detail capture | `src/vacation/trek-thing-detail-capture-patch.mjs` | Client-side detail presentation (no bundle hook) | P3 |
| Needle: thing detail ratings | `src/vacation/trek-thing-detail-ratings-patch.mjs` | Ratings UI in detail screen | P3 |
| Needle: shared Oe() list row HTML injection | `src/vacation/shared-trip-oe-list-row-patch.mjs` | React list rows | P3 |
| Served page boot → TREK script | `shared-app.html` `appendSharedTrekBundle()` / `index-BKun7ofk.js` | `vacation-app-next.html` (preview) then route cutover | P3 |
| Post-load DOM patches | `public/ts-timeline-icon-patch.js` | Tab / timeline icons in React | P3 |
| Post-load DOM patches | `public/ts-car-brand-filter.js` | Cars tab filtering in React | P3 |
| Post-load DOM patches | `public/ts-thing-media-overlay.js` | Thing media in detail / timeline | P3 |
| Inline trip-page CSS overrides | `shared-app.html` `<style>` blocks for logo chip, audio, embed | Client stylesheet | P3 |
| Upstream proxy for published slugs | `shared-trip-handler.mjs` `readUpstreamSharedResponse` / `proxyConfiguredUpstream` | Client talks only to TimeSyncher `/api/shared/` JSON | P4 |
| `TIMESYNCHER_TREK_PUBLIC_BASE_URL` dependency | env + `trekUpstreamBase()` | Not needed when all trips served from Neon | P4 |
| Vite entry for legacy shared shell | `vite.config.mjs` `sharedApp: shared-app.html` | Add next entry or replace with next client (separate PR) | P3 |
| Gate B bundle-derived tests (temporary) | Tests that call `renderServedTrekBundle()` | Client component / layout tests | P4 |

## Cutover steps (high level)

- **P3:** Switch `/shared/{slug}` (and embed) to serve the new client bundle; stop serving `index-BKun7ofk.js` for trip pages; remove needle modules and public patch scripts; keep API shape stable.
- **P4:** Remove TREK upstream proxy, bundle strip/rebake scripts, and bundle-specific CI; delete vendored upstream asset tree when unused.
