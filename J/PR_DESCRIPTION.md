Closes #859

## Summary

- Chat **set_time** on a place not assigned to the target day now moves the TREK **assignment** (move/create APIs) before writing schedule overrides, so `buildDayTimeline` shows Carbone on Day 2 at 20:30 and removes it from Day 1.
- **add_bar_before** anchors to the assignment day and assigns the bar on that day with a real timeline row ending before the anchor.
- Post-generation **rewrite** and **reply ship gate** steps in `vacation-app-chat-queue` are wrapped in a 12s bounded await so the endpoint returns JSON instead of timing out at 60s.
- `placeOnDay` for itinerary edit resolution is assignment-only (override `dayIds` no longer count as “on day” for Thing rows).

## Tests

```bash
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
cd apps/vacation-client && npm test
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

Copy-shape two-turn cases in `_905.mjs` fail on vk tip before this patch.

## Out of scope

Haiku empty reply (#858), Gate B, TREK body limits, NYC 8CQX / live fixture data, rebaked bundles.

## Left alone

No changes to baselines, workflows, `offline-tests.txt`, deploy config, or dependencies.
