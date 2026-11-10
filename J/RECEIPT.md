# PR #907 — host vk merge conflict resolve @ `74d3ea6b`

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `74d3ea6bd3256823860a4444bf68b899b41ba4b6` (verified). **Lane:** cursor-ubuntu, composer-2.5.

## Host merge `origin/vk` @ `86d90ed1` into `74d3ea6b`

| file | resolution |
| --- | --- |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | Both sides kept: #903 stored-data binding receipt + #927/#925 vk merge notes |
| Staged from merge (no re-author) | `apps/vacation-client/src/lib/budgetModel.mjs`, `public/ts-trip-hero-collapse.js`, `public/vacation-app-request.js`, splitter CSS, #927 tests, `src/vacation/chat-itinerary-edit*.mjs`, `scripts/test_chat_itinerary_edit*.mjs`, etc. |

No `public/assets/*.js` conflict; rebake not required this round.

---

# PR #907 / #903 — stored data + provenance test @ `74d3ea6b`

## Root cause (prior round on `db729549`)

CI unit-tests red at `scripts/test_pr336_ccab_search_provenance.mjs:24`: the test pinned the pre-#903 stored title `'Priceline opaque Standard sedan'` for row 609. Stored source row and snapshot read `'Priceline Express Deal (car company shown after booking) Standard sedan'`. Fix landed in `74d3ea6b` (host-published merge).

## TARGET D (alias)

`GATE_B_DISPLAY_TITLE_ALIASES[609]` kept. Without it, `assertGateBRowProvenance` throws `row 609: title Priceline Express Deal … does not match ccab key Priceline opaque JFK — Standard sedan`.

## TARGET E (all snapshot rows bind)

`node scripts/build_gateb_canonical_shared_trip.mjs` → `vkfill-907-20261110001306-job/canonical.json`, inline bind script vs `scripts/fixtures/pr336-vk-search-places.snapshot.json`: **all 94 rows match** @ `74d3ea6b`.

Leftover grep (`retitleFlightUpsell|SOUTHWEST_LGA_ARRIVAL_BY_ROW|row.id === 609` in `live-qa-903-presentation.mjs` and `nyc-craig-kim-daybyday-trip.mjs`): no matches.

## #927 Gate B fixes (inherited vk merge, staged)

| failure | fix |
| --- | --- |
| `price budget-390/1280` | `budgetLineAmount` copies `numericPrice` before `thingBudgetAmount` (`budgetModel.mjs`) |
| `daybyday-1280.png` chrome | `ts-trip-hero-collapse.js` mounts only for `max-width: 844px` |

## Checks @ PATCH (merge index + resolved J files)

| check | result |
| --- | --- |
| `node scripts/test_pr336_ccab_search_provenance.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `cd apps/vacation-client && npm test` | PASS |
| `node apps/vacation-client/test/budget.unit.mjs` | PASS |
| `node scripts/test_vacation_app_927_hero_collapse.mjs` | PASS |
| `node scripts/test_vacation_app_927_touch_splitter.mjs` | PASS |
| `node scripts/regenerate_pr336_search_trip_fixture.mjs` | ok, 94 places, snapshot unchanged |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (441 offline, 19 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |
| `node scripts/test_chat_itinerary_edit_905.mjs` | not run (staged merge; host after commit) |

CI run id and Gate B verdict for the published merge commit: not available from this lane (host publishes).

## Host publish

1. Mark `J/PR_DESCRIPTION.md` and `J/RECEIPT.md` resolved; `git add` unmerged paths + staged merge files; `git commit --no-edit` (merge completion) on `vkfill/903-20261109163214`; push once.
2. Discard accidental `evidence/vacation-client-p2-*/*.png` diffs from local `npm test` (not part of product patch).
3. After push: exact-head CI, pregate Gate B (overall look, never height), look batch.
4. Post-deploy: `node scripts/test_vacation_app_927_webkit_touch_live.mjs` when WebKit URL available.

## Scope left alone

- Baselines, check config, workflows, force-push / deploy from lane.
- `vk_contract_check_local.mjs` DATA-CONTRACT rows (692–695, 710): unchanged by this merge.
