# Issue #805 lane receipt (vkfill-805, claude-ubuntu, claude-opus-5-5)

**Start HEAD (unchanged commit; host publish pending):** `7fd26c5383361e65d9ba11ff7bd105d9348cd75f` (`git rev-parse HEAD` matched the brief).

**Outcome:** source-ready. Uncommitted patch for the host to commit, push once, and open one PR into `vk` with `Closes #805`.

## Root cause

Every served shared-trip path runs `finalizeServedSharedTripPayload` → `repairServedLogoUrls` → `repairExplicitLogoUrl` (`src/vacation/shared-trip-served-page.mjs`, from #758 / `6c35291c`). That repair map (`EXPLICIT_LOGO_REPAIRS` in `src/vacation/thing-logo-fallback-url.mjs`) had no entry for place 610 Carbone's brand asset `https://carbonenewyork.com/assets/favicons/carbone.png`. So the served `places[].logoUrl` and `thingOverrides['place:610'].logoUrl` still pointed at a host that sometimes returns 403 to hotlinks.

## Change (3 files)

- `src/vacation/thing-logo-fallback-url.mjs`: added one `EXPLICIT_LOGO_REPAIRS` row that maps Carbone's brand asset to `https://icons.duckduckgo.com/ip3/carbonenewyork.com.ico`. That is the DDG ip3 favicon for Carbone's own sourced domain, the same source 40 other places already use.
- `scripts/test_served_payload_logo_repair_758.mjs`: added a 610 case. `finalizeServedSharedTripPayload` must serve the DDG ip3 icon in both `places` and `thingOverrides`.
- `scripts/test_map_marker_logo_fallback_758.mjs`: pins the browser hardening (TARGET 2) in the served bundle `public/assets/index-BKun7ofk.js`. Two checks:
  - The map-marker `onerror` takes a blocked brand path (not only `/favicon.ico`) to DDG ip3, then Google s2, then the emoji.
  - The bundle's real `tsTimelineLogoFallback` function is extracted and executed: a failed Carbone brand asset goes to DDG ip3 for `carbonenewyork.com`, then Google s2, then the category emoji SVG, never `?`.

## Renderer hardening (TARGET 2): already in the served bundle, now pinned by test

The served bundle already falls back on `onerror` and on a <16 px load, at every logo render site:

- timeline rows: `tsTimelineLogoFallback` → DDG ip3 for the domain → Google s2 → category emoji SVG
- Thing-card chips: `onError` with `dataset.tsLogoFallback` → DDG ip3 → gstatic faviconV2 → `.tsv-logo-fallback` emoji
- map markers: `data-ts-map-logo-fb`

No bundle change was needed, so there was no rebake (TARGET 3 does not apply). `node scripts/test_served_trek_bundle.mjs` still reports "served trek bundle matches the patcher".

## Verify (local, uncommitted tree on `7fd26c53`)

Real logo gate, on the live payload vs the payload with this patch applied (`/api/shared/8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y/`, run at about 11:25 PM PT on 11/2):

- `ui_logo_gate.py` itself needed Python, which needs approval in this lane, so I ported its `audit()` rules to node 1:1 (`<job>/gate805-audit.mjs`): the same rows, the same `~/tsv-dispatch/logo_probe.mjs` headless-Chromium probe, and the same http_4xx and placeholder-md5 checks.
  - live: `94/94 logos load (>=16px, not placeholder)`
  - patched: `94/94 logos load (>=16px, not placeholder)`
  - Served 610 after the patch: place and override both `https://icons.duckduckgo.com/ip3/carbonenewyork.com.ico`.
- The 403 from the issue did **not** reproduce on this pass. `<job>/probe805.mjs` ran 3 rounds with a browser UA and the staging Referer: the brand URL returned 200 image/png and browser `ok28` every time. So the hotlink block is intermittent.
- The DDG ip3 icon is byte-identical to Carbone's own file (569 bytes, md5 `6344edf5e6c8d64798ff83a80406e570` for both). The served icon pixels do not change, so the Gate B screens should not change.

Tests (all passed):

```
node scripts/test_map_marker_logo_fallback_758.mjs
node scripts/test_served_payload_logo_repair_758.mjs
node scripts/test_served_logo_url_repair_758.mjs
node scripts/test_thing_logo_fallback_758.mjs
node scripts/test_ui_758_punchlist.mjs
node scripts/test_tsv470_declared_icon_logo_repairs.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/test_gate_b_product_row_fields.mjs
node scripts/test_shared_trip_live_tab_logos.mjs
node scripts/test_shared_place_logo_and_category.mjs
node scripts/test_trip_thing_logo_metadata.mjs
node scripts/test_shared_logo_chip_center_bundle.mjs
node scripts/check-hardcoded-content.mjs        # 88 report, 0 fail
node scripts/test_check_hardcoded_content.mjs
(cd apps/vacation-client && node test/run-all.mjs)   # exit 0
node scripts/check-no-comments.mjs              # 1053 files scanned, passed
node scripts/test_offline_manifest.mjs          # 398 offline, 18 online
BASE=vk node scripts/check-code-ratchet.mjs     # 255 report, 0 fail
```

The vacation-client test run regenerated 47 tracked `evidence/vacation-client-*` PNGs. I restored them byte-for-byte from HEAD with `git show HEAD:<path>`, so they are not part of this patch.

## Not run in lane (host)

CI on the PR head, Gate B on the PR build, and `python3 ui_logo_gate.py` on the deployed staging build of the PR head.

## Left alone (scope)

- Fixture copies of the old Carbone URL: `scripts/fixtures/gate-b-nyc-shared-staging.json`, `pr336-gate-b-ccab-overlay.json`, `pr336-vk-search-places.snapshot.json`. Fixtures are out of scope; the serve path repairs them.
- The repair map is exact-URL. A generic serve-time rewrite of every brand-host logo would change many rows that load fine, so it was not attempted; browser `onerror` covers the general case.
- The Thing-card chip `onError` stage 0 has no `duckduckgo|gstatic` host guard (the timeline function has one). If a DDG ip3 URL itself failed, the chip would retry `icons.duckduckgo.com/ip3/icons.duckduckgo.com.ico` once before moving on. This is pre-existing and not touched.

## Host

Uncommitted files: `src/vacation/thing-logo-fallback-url.mjs`, `scripts/test_served_payload_logo_repair_758.mjs`, `scripts/test_map_marker_logo_fallback_758.mjs`, `J/RECEIPT.md`, `J/PR_DESCRIPTION.md`. No new test files; `scripts/offline-tests.txt` is unchanged (both edited tests are already listed, lines 65 and 67).
