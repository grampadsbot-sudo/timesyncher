# Vacation client screens (clean-room preview)

Preview host: `vacation-app-next.html?token=<slug>`. Replaces served TREK `/shared/` only at P3 cutover (`docs/tsv-removal-list.md`).

| Screen | Verification fixture | Runs in CI (unit-tests job) | Feature / verify entry |
| --- | --- | --- | --- |
| Trip shell + tabs | `apps/vacation-client/test/shell-layout.mjs` | Layout when `CHROME_PATH` set; tab model in `tabNav.unit.mjs` | `.cursor/skills/verify-timesyncher-vacation/features/shared-trip.md` (`shell`, tab sub-features) |
| Category lists | `list-layout.mjs`, `listRows.unit.mjs` | Unit yes; layout via shell gate | `shared-trip.md` (flights…budget tabs) |
| Day-by-day | `day-layout.mjs`, `dayTimeline.unit.mjs` | Unit yes; layout via shell | `features/vacation-client-p2-3-day-by-day.md`, `.cursor/skills/verify-timesyncher-vacation/features/vacation-client-day-by-day.md` |
| Budget | `budget-layout.mjs`, `budget.unit.mjs` | Unit yes; layout via shell | `.cursor/skills/verify-vacation-client-budget/SKILL.md` |
| Thing detail | `detail-layout.mjs`, `detail.unit.mjs` | Unit yes; layout via shell | `shared-trip.md` (detail panel; no separate vacation-client feature file yet) |
| Keepsake journey | `keepsake-layout.mjs`, `keepsake.unit.mjs` | Unit yes; layout via shell | `features/layouts.md` / keepsake Style one & two (live TREK SoT until cutover) |

Additional CI coverage: `scripts/test_shared_trip_boot_fetch.mjs` imports list/day/budget/detail/keepsake unit tests; `scripts/test_shared_category_tab_icon_center_chrome.mjs` calls `runVacationClientShellTests()`.
