# TSV #977 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `2cbd2b1077d0f7017a5210a805bc1d47508dc9b7` (verified before edit)

## Root cause

`vkSearchResultToDossier` in `src/vacation/dossier-vk-search.mjs` did not treat **priceline** as a bindable /10 rating source. JFK car census rows (710 Hertz, 711/712 Thrifty, 713–715 Dollar) carry `primarySource: priceline` and verbatim Priceline brand lines on the fetched SSP page, but no `ratingEvidence` block — so `dossier.rating` stayed undefined and list/detail stars never rendered.

## Source changes (uncommitted)

| File | Why |
| --- | --- |
| `src/vacation/dossier-vk-search.mjs` | Allow `priceline` in ten-scale binding; parse brand-line quotes (`Brand X Y reviews…`); bind from `rating.ratingEvidence` or from census `primarySource` + supported field/summary claims when quote is on-page. |
| `scripts/test_vk_search_rating_evidence.mjs` | Priceline 8.4→4.2 with quote+count; forged quote rejected; census 710/609 behavior. |

## Checks (local, starting HEAD `2cbd2b1`)

| Command | Result |
| --- | --- |
| `node scripts/test_vk_search_rating_evidence.mjs` | exit 0 |
| Census spot-check 710/711/713/609 via `loadVkSearchCensusResult` | 4.2 / 4.0 / 4.0 / null |

No commit, stage, push, merge, rebase or deploy (HOST PUBLICATION ONLY). WebKit accept (cars list + detail stars) and full CI loop left to host after publish.

## Host next

Verify uncommitted diff → commit → push → wait for `unit-tests`, `secrets`, `accept`, `gateb` on pushed head.
