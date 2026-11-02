# vkfill-550 receipt — PR #550 feature parity (#547 row layout preserved)

## Outcome

**source-ready** on start HEAD **a163889a16f6697ba440d1fa68ce9c6655c66573** (verified before edit).

## Root cause (Gate B round 14 `feature lost vs staging: header control 'Remove 🚗 Dollar JFK'`)

Staging parity controls come from `public/ts-car-brand-filter.js` (prepended brand bar). After #547 list rows moved to `li[data-list-row][data-thing-category="car"]` with inline descriptions, `carRows()` no longer matched rows: full-row `innerText` exceeds the 80-character filter, and rows no longer use `data-category`. The script never mounted, so candidate captures had zero `Remove 🚗 …` header controls on 1280px screens (see `~/tsv-dispatch/gateb-cand/pr550-a163889/`: staging `_v6-budget-1280-top.json` header_controls vs candidate `capture-regions.json`).

## Change (host publish)

| Path | Why |
| --- | --- |
| `public/ts-car-brand-filter.js` | Prefer `li[data-list-row][data-thing-category="car"]`; derive brand from `[data-ts-list-row-name="1"]`; label/aria `Remove 🚗 {brand}` (vk/staging shape); mount on DOM ready + mutation observer (not only Cars tab click). |

No change to `shared-trip-oe-list-row-patch.mjs`, served bundle rebake, tests, baselines, or Gate B config.

## Checks (local)

| Command | Exit | Ref |
| --- | --- | --- |
| `node scripts/test_real_app_entry.mjs` | 0 | still asserts `Remove a brand` + script linked from `shared-app.html` |
| `node scripts/check-no-comments.mjs` | 0 | |
| `node scripts/test_offline_manifest.mjs` | 0 | |
| `BASE=vk node scripts/check-code-ratchet.mjs` | 0 | 255 report, 0 fail |
| `cd apps/vacation-client && npm test` | 0 | |

Full `scripts/offline-tests.txt` sweep not re-run this round (lane time); host should run before push if required.

## Uncommitted (host only)

- `public/ts-car-brand-filter.js`
- `J/RECEIPT.md` (this file)

Authority: host commit + push → CI + Gate B structure on pushed head (not Cursor self-proof).
