Closes #988

## Summary

Removes four fill fallbacks that copied **Summary** into **Details** (or seeded both from the same text), per Craig pt3372u and the essence-ladder contract (#68). When ladder output for `longDetails`/`details` is missing, those fields stay empty for a later ladder fill instead of duplicating summary text.

## Changes

- `mergeWebDetailIntoSearchPlace`: no `detail.summary` → `longDetails`.
- `applyEnrichedDetailToTripThing`: thing `description` from `detail.longDetails` only.
- `enrichTripThing`: `sourceRecord` no longer sets `summary` from category `description`.
- Hotel branch in `applyLiveAppListRowFields`: no longer overwrites generic/planning `summary` with `hotelNarrative` already applied to `longDetails`.

## Tests

```bash
node scripts/test_acceptance_988_no_summary_details_fallback.mjs
node scripts/test_vk_hotel_detail_fill.mjs
node scripts/test_trip_thing_logo_metadata.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

All above passed locally except `check-no-comments.mjs` (needs `apps/vacation-client` TypeScript install on the host runner).

## Left alone (scope)

- Thing-detail UI layout, NYC trip 99 / 8CQX data, baselines, CI workflows, Gate B capture config.
- Other unrelated `summary`/`description` helpers outside the four named paths.
