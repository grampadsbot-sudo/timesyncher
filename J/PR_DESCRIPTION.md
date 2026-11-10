Closes #859

## Summary — #859 chat itinerary edit

- Chat **set_time** on a place not assigned to the target day now moves the TREK **assignment** (move/create APIs) before writing schedule overrides, so `buildDayTimeline` shows Carbone on Day 2 at 20:30 and removes it from Day 1.
- **add_bar_before** anchors to the assignment day and assigns the bar on that day with a real timeline row ending before the anchor.
- Post-generation **rewrite** and **reply ship gate** steps in `vacation-app-chat-queue` are wrapped in a 12s bounded await so the endpoint returns JSON instead of timing out at 60s.
- `placeOnDay` for itinerary edit resolution is assignment-only (override `dayIds` no longer count as “on day” for Thing rows).

## Inherited from `origin/vk` merge (keep both behaviours)

Host base-merge `origin/vk` @ `b1211bf9` into PR head @ `613fb4f0`.

- **#902 / customer build stamp:** Hide customer-visible build-stamp bar; keep `<meta name="timesyncher-build">` and `/api/version`. `public/ts-build-stamp-customer-hide.{css,js}`, `BuildStampFooter`, `apps/vacation-client/src/styles.css`.
- **#939 / #927:** `public/ts-trip-hero-collapse.js` expanded title unclip; touch splitter / hero collapse tests.
- **#905:** chat-itinerary sequential PUT merge (`mergeStoredChatItineraryScheduleOverride`).
- **#884:** logo-chip fallback hide; rebaked `public/assets/index-BKun7ofk.js`.
- Budget price parity, vk trip shell / stored-data polish paths as merged.

## Tests

```bash
timeout 120 node scripts/test_chat_itinerary_edit.mjs
node scripts/test_chat_itinerary_edit_905.mjs
cd apps/vacation-client && npm test
node scripts/test_build_stamp_customer_hidden.mjs
node scripts/test_vacation_app_927_hero_collapse.mjs
node scripts/test_served_trek_bundle.mjs
node scripts/check-no-comments.mjs
node scripts/test_offline_manifest.mjs
BASE=vk node scripts/check-code-ratchet.mjs
```

Copy-shape two-turn cases in `_905.mjs` fail on vk tip before the assignment/bounded-postgen patch.

## Out of scope

Haiku empty reply (#858), TREK body limits, NYC 8CQX / live fixture writes, live two-turn proof (host watcher).

## Left alone

Baselines, check config workflows, deploy config (`vercel.json` / `vite.config.mjs` except vk-merge carry), package deps, accidental evidence PNG churn unless host intends.
