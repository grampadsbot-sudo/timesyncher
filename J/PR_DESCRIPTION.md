Closes #805

## Summary

On live `7fd26c53`, `ui_logo_gate` failed only place 610 Carbone. Its `logoUrl` is `https://carbonenewyork.com/assets/favicons/carbone.png`, and that host sometimes answers hotlinks with 403 text/html.

- **Data fix:** I added Carbone's brand asset to `EXPLICIT_LOGO_REPAIRS` (`src/vacation/thing-logo-fallback-url.mjs`). Every served shared-trip path already runs this map through `finalizeServedSharedTripPayload` (#758). The served `places[].logoUrl` and `thingOverrides['place:610'].logoUrl` become `https://icons.duckduckgo.com/ip3/carbonenewyork.com.ico`. That is the favicon of Carbone's own sourced domain, the same DDG ip3 source 40 other places use. It is byte-identical to the brand file (569 bytes, same md5), so nothing changes visually.
- **Browser hardening:** The served bundle `public/assets/index-BKun7ofk.js` already falls back on `onerror` at every logo site: timeline `tsTimelineLogoFallback`, Thing-card chip `onError`, and the map-marker `onerror`. The order is domain DDG ip3 → Google favicon → category emoji, never `?`. This PR pins that path for a blocked brand asset path (not just `/favicon.ico`) by executing the bundle's real fallback functions in `scripts/test_map_marker_logo_fallback_758.mjs`. No bundle change, so no rebake.

## Checks run

- Logo gate rules (`ui_logo_gate.audit`, same headless-Chromium `logo_probe.mjs` plus net probe) on the live shared payload with this patch applied: `94/94 logos load (>=16px, not placeholder)`; place 610 serves the DDG ip3 icon.
- `node scripts/test_served_payload_logo_repair_758.mjs`, `test_map_marker_logo_fallback_758`, `test_served_logo_url_repair_758`, `test_thing_logo_fallback_758`, `test_ui_758_punchlist`, `test_tsv470_declared_icon_logo_repairs`, `test_served_trek_bundle`, `test_gate_b_product_row_fields`, `test_shared_trip_live_tab_logos`, `test_shared_place_logo_and_category`, `test_trip_thing_logo_metadata`, `test_shared_logo_chip_center_bundle`, `check-hardcoded-content` (0 fail), and `apps/vacation-client` `test/run-all.mjs`: all passed.
- Pre-DONE: `check-no-comments` passed, `test_offline_manifest` ok, `BASE=vk check-code-ratchet` 0 fail.
- Not reproduced on this pass: the brand URL returned 200 image/png on 3 rounds (the hotlink block is intermittent). The live payload also scored 94/94 at that moment.

## Left alone (scope)

- Fixture copies of the old Carbone URL (`scripts/fixtures/gate-b-nyc-shared-staging.json`, `pr336-*`). The serve path repairs them at runtime.
- The Thing-card chip `onError` stage 0 lacks the `duckduckgo|gstatic` host guard that the timeline fallback has. This is pre-existing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
