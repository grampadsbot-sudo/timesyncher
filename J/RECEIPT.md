# VK PR #610 base merge (cursor-ubuntu vkfill-610)

**Base merge:** host merged `origin/migrate/trek-source` at `e2cbfcefe64f1f66d2537c24ce16dee9a7fff1ba` into PR head `62dac9c375e1022936ed94a1df472a094d7d834f` (2026-10-22).

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-610` page not found at lane launch (2026-10-22).

## Merge resolution

- `src/vacation/trip-thing-enrichment.mjs`: kept base judge/ccab hotel blanking plus PR `isThinNeighborhoodListSummary` list-copy gating.
- `public/assets/index-BKun7ofk.js`: base served bundle then `node scripts/rebake_served_trek_bundle.mjs`.

---

# VK PR #610 hard round (cursor-ubuntu vkfill-610)

**Parent start sha:** `8a6f10d507b6c12adc1e312f0c2b95c2cb254a55`  
**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-610` page not found at lane launch (2026-10-22).

## Root cause (rounds 1–2)

Gate B run `20261022-033425` on `8a6f10d`: `trek-gateb-list-budget-patches.mjs` replaced `mr()` flight-title logic with apostrophe-only normalization, so **Flight option:** prefixes rendered on Flights/Budget (pixel + vision FAIL vs `base-58f5be5`). `isThinNeighborhoodListSummary` treated bare `Neighborhood: …;` lines as thin and expanded every hotel list row (hotel screenshot FAIL). Semicolon-clause picking split decimal ratings (`8.7` → `8.` + `7`) and weakened Romer long-copy lines.

## Fix

- Restore `mr()` to strip **Flight option:** for flights; map curly apostrophe → ASCII on non-flight titles so `Romer Hell's Kitchen` matches fixture/coverage keys.
- Narrow thin-summary detection to rating-template rows only (not lone neighborhood semicolon lines).
- Pick list copy from semicolon clauses for Booking-style blobs; keep `longDetails` fallback in `rr()`.
- Rebake `public/assets/index-BKun7ofk.js`.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Committed locally; host publishes to `vkfill/607-20261021175801`. CI + Gate B on pushed head are authority (not self-certified).

---

# VK PR #610 Gate B round 2 (cursor-ubuntu vkfill-610)

**Start sha:** `6582997419fe4504244a0fd6f7a3adee0231ef74`  
**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-610` page not found at lane launch (2026-10-22).

## Problem

Gate B on `65829974`: hotels vision compare (long Booking-style list lines vs baseline); `gateb_coverage.py` Romer Hell's Kitchen missing list price/description (curly vs ASCII name segments); flights list missing fixture titles; budget first hotel/flight rows showed `Add price` while VK fill had amounts.

## Fix

- Treat `Neighborhood: …; Rating:` template prefixes as thin until a substantive clause (price, room type, etc.) in `isThinNeighborhoodListSummary` / trek `rr()` bundle / enrichment.
- Trek: keep full `Flight option:` titles in list rows; normalize `'` → `'` in `mr()`; budget rows show `ie()` fill when `bi()` has a price; `Mo` `hasPrice` honors `ie()`.
- Patches in `trek-gateb-list-budget-patches.mjs`; rebake `public/assets/index-BKun7ofk.js`.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node apps/vacation-client/test/listRows.unit.mjs` | 0 |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_served_trek_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

Committed on detached HEAD at PR start; host publishes to `vkfill/607-20261021175801`. CI + Gate B on pushed PR head are authority (not self-certified).
