# Description as stored — U4 / issue #820

The list row, detail summary and day timeline read stored description verbatim. Missing or empty descriptions render no substitute summary or notes. Whitespace, clock-like text and strings longer than 4000 characters remain unchanged.

Checks: test_shared_tab_list_summary.mjs, test_list_row_description_substance.mjs, test_itinerary_fresh_daybyday_bundle.mjs, test_shared_trip_served_live_tab_mount.mjs and vacation-client detail.unit.mjs. Ordinary Ubuntu Gate B and CI must evaluate the published head before acceptance.
