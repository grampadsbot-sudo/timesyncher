# Description as stored — U4 / issue #820

The list row and detail summary read stored description verbatim. Missing or empty descriptions render no substitute summary or notes. Whitespace, clock-like text and strings longer than 4000 characters remain unchanged.

Checks: test_shared_tab_list_summary.mjs, test_list_row_description_substance.mjs, test_itinerary_fresh_daybyday_bundle.mjs, test_shared_trip_served_live_tab_mount.mjs and vacation-client detail.unit.mjs. Ordinary Ubuntu Gate B and CI must evaluate the published head before acceptance.

Issue #825: Day-by-Day and both HTML/PDF timelines read the stored itinerary note (direct field, dossier value/claims, then assignment/override notes), never description or summary. Notes are displayed as stored. List names wrap at every width and descriptions are unclamped. Reviews appear on detail pages only. Below Reviews, detail pages show stored Itinerary note, stored longDetails, Day/Timeline state, then photo thumbnails; empty narrative sections are omitted. Stored per-review ratings alone supply stars. Photo slots exclude logo/favicon assets; logo chips remain.
Budget includes exactly the distinct Things rendered in Day-by-Day, excluding unpicked reservations and candidates even when they carry dayIds.
