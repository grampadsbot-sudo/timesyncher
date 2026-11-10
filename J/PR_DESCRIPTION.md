Closes #902

## Summary

Hide the customer-visible build-stamp bar on every page while keeping machine-readable build id (`<meta name="timesyncher-build">` and `/api/version`). The DOM footer with the 7-char sha remains for probes; CSS hides it unless `?debug=1`.

Host base-merge through `6bdaf42f` (`origin/vk` into PR branch): vk trip shell / #905 chat-itinerary paths plus #902 stamp hide. **`shared-app.html`:** vk `#root` flex shell + hide rules on `footer[data-build-stamp="1"]` (vk `position:static` on the stamp dropped — it brought back the dark bar).

## #902 changes

- Inline `timesyncher-build-stamp-style` + `public/ts-build-stamp-customer-hide.{css,js}` on static shells (`routes/version.mjs`, `vite.config.mjs`).
- React `BuildStampFooter` + **`apps/vacation-client/src/styles.css`**: bundled trip client hides `.tsv-build-footer` by default; debug query shows the fixed bar.

## Test plan

- [x] `node scripts/test_build_stamp_customer_hidden.mjs`
- [x] `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser node scripts/test_build_stamp_viewport.mjs`
- [x] `node apps/vacation-client/test/shell-layout.mjs`
- [x] `node scripts/test_issue_901_trip99_single_venue_standins.mjs`
- [x] `node scripts/test_gate_b_live_replay_display_facts.mjs`
- [x] `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs`
- [x] `node scripts/test_vacation_app_shell.mjs`, `node scripts/test_shared_trip_boot_fetch.mjs`
- [ ] CI on pushed PR head `6bdaf42f`+ (see J/RECEIPT.md)
- [ ] Gate B structure: no viewport-visible build sha on hub/lists/detail at 390 and 1280

## Left alone

- Baselines, check config workflows, deploy config, package deps.
- Live Neon apply for trip 99 SQL (host).
