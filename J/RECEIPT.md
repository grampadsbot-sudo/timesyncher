# Lane receipt — issue #470 (declared-icon logo 403/429 → served repair)

**Start HEAD:** `ccaa511f70381a8be34946651b04bb45c96ae239` (HOST PUBLICATION ONLY — uncommitted PATCH for outer host)

## Root cause

Declared `favicon.ico` / site icon URLs on flight, hotel, and event rows often return **403**, **429**, or empty bodies in the browser. TREK list chips then showed blank or generic logos on Gate B live tabs even when `thingOverrides.logoUrl` was populated.

## Changes (this lane round, on top of ccaa511 logo repair maps)

| Area | File | What |
| --- | --- | --- |
| Fill / search logo URL | `src/vacation/thing-logo-capture.mjs` | `logoUrlFromSearchPlace()` applies `repairExplicitLogoUrl()` to declared icons and origin favicon guesses before persist; flight titles still resolve via brand rules. |
| Re-export | `src/vacation/trip-thing-enrichment.mjs` | Re-export `logoUrlFromSearchPlace` from capture module (keeps search-event + enrichment imports stable); drops duplicate implementation to stay under FILE-SIZE-500 ratchet. |
| Test | `scripts/test_tsv470_declared_icon_logo_repairs.mjs` | Asserts hotel/event declared favicons map to DuckDuckGo ip3 repairs via `logoUrlFromSearchPlace`. |

**Already on start HEAD (ccaa511, host may have landed earlier):** `EXPLICIT_LOGO_REPAIRS` for AA/Southwest/JetBlue + hotel/event favicons; `declaredIconFetchLooksBroken`; `applyCapturedLogos` / `finalizeServedSharedTripPayload` repair; airline `NAMED_THING_LOGOS` DuckDuckGo URLs; offline test registered in `scripts/offline-tests.txt`.

**Left alone (scope / ruling 109):** no `public/assets` bundle rebake (`LIST_LOGO_PATCH` / `tsRepairDeclaredLogo` remain build helpers only until host rebakes); no fixture/baseline/check-config edits.

## Checks (local, start HEAD `ccaa511f`)

| Command | Result |
| --- | --- |
| `node scripts/test_tsv470_declared_icon_logo_repairs.mjs` | PASS |
| `node scripts/test_thing_logo_fallback_758.mjs` | PASS |
| `node scripts/test_served_payload_logo_repair_758.mjs` | PASS |
| `node scripts/test_served_logo_url_repair_758.mjs` | PASS |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | PASS |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_trip_thing_logo_metadata.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (0 fail) |

Gate B pixel PASS on PR head is **not** claimed here (host CI + Ubuntu Gate B after push).

## Host next

Commit modified paths on branch `vkfill/470-20261031200815`, push once, open PR to `vk` with `Closes #470` describing declared-icon repair at fill + serve time and #758 regression coverage.
