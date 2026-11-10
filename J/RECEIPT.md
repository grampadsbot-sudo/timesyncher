# PR #891 rebase onto 52d8843 (eggbot 4:11 AM PT 11/10)

Host rebase of #887 flight time zones (12:37 pm PT → 8:59 pm ET) onto live vk `52d8843`.

Kept #935 conflict calc:
- `applyDayTimelineConflictFlags` / `resolveFlightTimelineTimes` stay in the day timeline model
- served-bundle conflict loop is the vk / #935 loop (no `patchDayTimelineConflicts887`)
- no new conflict module, no `test_issue_887_day1_conflict_flags.mjs`

Taken from #891 (timezone / no invented ends only):
- trek flight timezone + stored-time patches, display hook, layout `tsTimelineRowTime`
- invented check-in/out durations removed; hotel-wake sorts first
- DayTimeline TBD on untimed wake/sleep; #734 TBD-empty patch removed
- `scripts/test_issue_887_daybyday_time_column.mjs`

Dropped the stray evidence / `.artifacts` PNGs (not in this tree).

Verified: time-column, #928 arrival conflicts, fresh day-by-day bundle, #734, #754.
