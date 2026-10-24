# PR #696 Gate B fix-it receipt

- GBrain handoff page `bot-admin/lanes/vk-pr-handoff/pr-696` was not found (`page_not_found` on fetch).
- Gate B failure on `daybyday-390.png` (~0.01%): triptych shows the only material diff is muted **TBD** in the Sleep row time column vs an empty column on the Oct 2026 NYC reference capture (pre–#690).
- Issue #690 requires visible TBD there; coder scope forbids baseline/reference/allowlist/workflow edits, so pixel Gate B cannot pass until the managing dr refreshes the NYC Gate B baseline to the approved #690 look (see `scripts/fixtures/nyc-final-reference/day-by-day-390.png` for the intended TBD styling).
- This round: match untimed TBD to reference font weight (`500` vs timed `700`) to clear sub-pixel residual if the host baseline already includes TBD.
