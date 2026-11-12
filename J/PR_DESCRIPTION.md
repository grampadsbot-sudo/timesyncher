blocked: #968 acceptance visibility checks fail in the initial split pane, and the legacy hotel test isolates the previous row renderer. Starting HEAD: 6683cfc3e72156ca67d47f08f958d4bf75485185.

Closes #968

Flights, Hotels and Cars now show the logo/name and a one-line price on top, with gold rating stars left and one right-aligned date range below. Hotel prices retain `/ night`; car prices say `total`. Dates use stored timing and trip-relative days, including Day 0, negative days, overnight flights and daylight-saving timezone abbreviations. The existing renderer and served bundle are updated; Thing view/edit is unchanged.

Validation on the uncommitted patch based on `6683cfc3e72156ca67d47f08f958d4bf75485185`:

- Extended `node scripts/test_served_star_rating_bundle.mjs`: exit 0; date formats, invalid dates, overnight/westbound timing and timezone cases.
- Served-bundle, #959 flight/detail-price, fresh itinerary, Thing-card and keepsake-style2 checks: exit 0.
- `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`: exit 0.
- `TIMESYNCHER_BUILD_SHA=6683cfc3e72156ca67d47f08f958d4bf75485185 npm run build`: exit 0. The SHA identifies the base of this dirty worktree, not a published patch.
- WebKit touch measurements at 390 and 430: all 39 snapshot rows per width have one-line dates, no row overflow and no star/date overlap. Available filled stars compute to `rgb(245, 158, 11)`. These measurements and screenshots are diagnostic, not acceptance authority.
- Host `acceptance/968.json`: unresolved visibility checks report dates rendered but `topmost:false` before the iframe is scrolled; see the final local acceptance report and `J/RECEIPT.md`. Do not treat this as accepted or CI green.
- `node scripts/test_shared_hotels_390_text_wrap.mjs`: exit 1, first error `ReferenceError: tsListDateRange is not defined`. Its isolated old renderer lacks the new runtime inputs; it also still asserts stars-right/price-adjacent behavior superseded by the approved v3 layout. Left unchanged under the check-edit ban.

Scope left alone: split-pane chrome/scroll position, existing snapshot logo/evidence gaps, flight/car ratings without qualifying stored evidence, Thing view/edit, live trip data, fixtures, baselines, acceptance/check configuration, workflows, deployment configuration and dependencies. No CI run, publication, Git mutation or external message was made. Host owns the draft PR into `vk` and all Git mutations. Keep #968 open pending acceptance and CI on the host-published head.

Final local verdict on the uncommitted patch at base `6683cfc3e72156ca67d47f08f958d4bf75485185`: `accept=failure`, 25/30; five visibility assertions report `topmost:false`. Exact report: `/home/ubishere9995/tsv-work/vkfill-968-job/evidence/final-head-acceptance/report.json`.
