Closes #888

#896 / #888 — flight row layout @390, conflict-badge wrap, trip switcher dates (`Jun 23–30, 2026`). Host vk base-merge @ `ed8687b929c9473e6f9f2915ac5bc82d6dd802d1` into `eea0e50cac463e3cf744ead29409e2f2ee740d18` also carries #903 live QA polish, #884 logo-chip fallback hide, #927 touch splitter + collapsible trip hero, and #925 chat-itinerary sequential PUT merge.

**#888 layout:** conflict badges and trip switcher wrap (no ellipsis); flight time chips show full arrival/depart text inside the card @390; one font weight on chips. Vacation client: `@media (max-width: 480px)` multi-row `.tsv-row-flight-main`. Served trek: `ISSUE_888_SERVED_LAYOUT_CSS` two-line grid + `SHARED_LIVE_FLIGHT_LOGO_NAME_CSS` centers logo with airline name.

**#903:** No serve-time title/narrative rewrites; stored fixture rows 609/630–634 carry customer wording. See `live-qa-903-presentation.mjs`.

**#884:** logo chips hide `.tsv-logo-fallback` after brand `img` loads; rebaked `public/assets/index-BKun7ofk.js`.

## Verification (lane @ merge head `eea0e50c`, uncommitted)

- `node scripts/rebake_served_trek_bundle.mjs`
- `node scripts/test_issue_888_clipped_text.mjs`
- `node scripts/test_issue_903_live_qa_polish.mjs`
- `node scripts/test_ui_884_logo_chip_fallback_hide.mjs`
- `node scripts/test_shared_logo_chip_center_bundle.mjs`
- `node scripts/test_shared_trip_live_tab_logos.mjs`
- `node scripts/test_served_trek_bundle.mjs`
- `cd apps/vacation-client && npm test`
- `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`

CI + Gate B with `gateb-allow.json["888"]` on host-published merge commit.

## Scope left alone

Baselines, Gate B host scripts/workflows, unrelated #882/#889/#865 paths. `GATE_B_DISPLAY_TITLE_ALIASES[609]` retained (#903).
