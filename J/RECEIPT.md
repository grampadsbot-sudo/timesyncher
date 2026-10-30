# #739 B10 shared PDF in-app — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `7079bc4b73507d981a78a9dc6c068070e8009ad6` (unchanged committed tip; patch uncommitted).

**Outcome:** `source-ready` — list + daily shared PDF routes render `application/pdf` from the same shared-trip loader as `/api/shared/<token>`; Trek 302 removed for restaurants/stores/rest/complete-list/daily. Style-one/two keepsake PDFs still 302 to staging `Ae()` print (unchanged).

## Root cause + fix

Shared list/daily PDF handler built Trek URLs via `TIMESYNCHER_TREK_PUBLIC_BASE_URL` and 302-forwarded. Vacation-staging trips are not on Trek → invalid PDF. Fix: load trip with `loadSharedTripPayload()` (intake DB, Gate B offline fixture, optional upstream) and emit a minimal text PDF in-process.

| File | Change |
| --- | --- |
| `src/vacation/minimal-text-pdf.mjs` | Pure-JS PDF 1.4 writer (Helvetica text) |
| `src/vacation/shared-trip-report-pdf.mjs` | Report bodies (restaurants/stores/rest/complete-list/daily) from shared payload |
| `src/vacation/shared-trip-handler.mjs` | Export `loadSharedTripPayload()`; refactor GET to use it |
| `src/vacation/keepsake-style2-handler.mjs` | In-app PDF for list+daily; local `productPdfUrl`; 404/400 JSON; import `sendJson` |
| `scripts/test_shared_trip_report_pdf.mjs` | Fixture slug PDF content-type + `%PDF-` + thing names |
| `scripts/test_keepsake_style2.mjs` | `productPdfUrl` expects vacation-staging `/api/pdf/shared/…` not Trek |

## Tests run (7079bc4b workspace)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_trip_report_pdf.mjs` | PASS |
| `node scripts/test_keepsake_style2.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | BLOCKED (lane: missing `apps/vacation-client/node_modules/typescript`; host install) |
| `BASE=7079bc4b73507d981a78a9dc6c068070e8009ad6 node scripts/check-code-ratchet.mjs` | DEAD-CODE PASS; BASELINE-GROWTH FAIL (`origin/7079bc4b…` ref missing locally) |
| `node scripts/test_api_route_bundle.mjs` | PASS |

**Host:** register `scripts/test_shared_trip_report_pdf.mjs` in `scripts/offline-tests.txt` (issue scope banned coder edit; chief brief requires registration) then `node scripts/test_offline_manifest.mjs`.

**Note:** `test_keepsake_layout_routes.mjs` still expects keepsake/style-2 PDF **302** to journey print — intentional; full `Ae()` book PDF not in this patch. Keepsake menu items are HTML print targets, not Trek list reports.

## Slug results (fixture `8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y`)

| Slug | Handler | Sample text in PDF |
| --- | --- | --- |
| `restaurants` | 200 `application/pdf` | Carbone |
| `stores` | 200 | Zabar's |
| `rest` | 200 | Statue of Liberty walking tour |
| `complete-list` | 200 | Carbone (+ other buckets) |
| `daily/1` | 200 | Day 1 timed rows |
| `keepsake` / `keepsake-style-2` | 302 staging journey | (unchanged) |
| invalid token | 404 JSON | — |
| unknown slug | 400 JSON | — |

## Uncommitted files

- `src/vacation/minimal-text-pdf.mjs` (new)
- `src/vacation/shared-trip-report-pdf.mjs` (new)
- `src/vacation/shared-trip-handler.mjs`
- `src/vacation/keepsake-style2-handler.mjs`
- `scripts/test_shared_trip_report_pdf.mjs` (new)
- `scripts/test_keepsake_style2.mjs`
- `J/RECEIPT.md`

Local `npm install` may touch `node_modules/` / lockfile; host must not commit lockfile changes from lane install.
