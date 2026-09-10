# Initial website fill (per-category)

GBrain: `bot-admin/messages/time-syncher/initial-min-things-rule-20260910`  
Autonomy: `bot-admin/messages/time-syncher/autonomous-app-customer-flow-20260910`

**Not a total-of-8.** `TIMESYNCHER_ITINERARY_MIN_THINGS=8` is **void** as the product bar (Craig 2026-09-10).

Craig recollection (~15 stores / ~15 restaurants / ~10 others) is **not** the stamp. Exact coded mins:

| Bucket | Count | File:line |
| --- | --- | --- |
| restaurant | **15** | `scripts/vacation-public-research-worker.mjs:14` |
| store | **10** | `:15` |
| rest (The Rest: activities, tours, events, parks, transport notes, decisions — not restaurants/stores/hotels/flights/cars) | **15** | `:16` |

Constant: `DEFAULT_FIRST_PASS_MINIMUMS` (`:13`). Reader: `firstPassMinimums()` / `firstPassMissingMinimums()`. Env may raise a bucket; it cannot lower it.

## Required / fail-closed

Initial website fill cannot skip under those bucket counts.

- `assertRequiredFirstPassMinimums` throws with the missing buckets.
- `product-gbrain-dispatch.mjs` asserts **before** TREK sync (no `itinerary_research_update`-only gate, no `TIMESYNCHER_ALLOW_INCOMPLETE_RESEARCH_PASS` skip).
- `trek-vacation-sync.mjs` asserts when `researchedThings` is present.

QA: `node scripts/test_first_pass_minimums.mjs`
