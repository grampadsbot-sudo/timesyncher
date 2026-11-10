# PR #907 / Issue #903 — vk base merge + CI unit-tests (cursor-ubuntu / composer-2.5)

**Outcome:** source-ready (uncommitted patch; host push). **Start HEAD:** `2965a598a2aebeda0dde98678037c0677b1708fa`.

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-907` — page_not_found (noted per brief).

## Host base merge

Host merged `origin/vk` (`2608a0ec`) into `2965a598` (see `basemerge.json` in job dir). Conflicts resolved in source:

- `J/RECEIPT.md` — merged PR #907 receipt with inherited vk #905 port notes (chat itinerary / vacation-app catch).
- Inherited vk merge brings #905 chat-itinerary-edit + `vacation-app.html` catch inlining (uncommitted on branch tip).

## This round — CI unit-tests

Live CI on `2965a598` failed `scripts/test_gate_b_live_replay_display_facts.mjs`: `place:630` `departureTime` was `undefined` while hosted fixture has `07:25`.

**Root cause:** `#903` item 7 strips clock ranges from Southwest titles in `applyLiveQa903Presentation` before `applyFlightThingFields` runs in `applyLiveAppListRowFields`, so structured times were lost on the served payload.

**Fix:** In `applyFlightTitleTimes`, when a flight title still carries a clock range, copy `departureTime` / `arrivalTime` from the title (or `place.place_time`) into `thingOverrides` before stripping the title.

## #903 acceptance (inherited)

Seven polish items remain covered by `scripts/test_issue_903_live_qa_polish.mjs` on this patch.

## Checks run @ `2965a598` + local patch

| Check | Result |
| --- | --- |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_issue_903_live_qa_polish.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (436 offline) |
| `node scripts/check-no-comments.mjs` | PASS (after `apps/vacation-client/npm ci`) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

## Uncommitted files (host)

- `src/vacation/live-qa-903-presentation.mjs` — flight time preservation before title strip
- `J/RECEIPT.md`
- Plus inherited vk-merge working tree (`vacation-app.html`, chat-itinerary-edit #905 port, etc.) already staged/modified before this round — host finishes merge commit per basemerge.

Host: finish merge commit, one push to `vkfill/903-20261109163214`. Gate B / live screenshots — not self-certified here.

## Not touched (scope)

Baselines, Gate B capture config, `.github/` workflows, `package.json` / lock, deploy config, NYC reference PNGs.

## Inherited vk #905 port (from merge; not re-authored)

| File | Why |
|------|-----|
| `vacation-app.html` | Inlined chat send failure catch for static contract test |
| `src/vacation/chat-itinerary-edit*.mjs`, client DayTimeline, etc. | Turn-2 / day inference from #905 port on vk |
