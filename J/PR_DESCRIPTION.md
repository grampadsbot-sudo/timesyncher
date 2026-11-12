Closes #969

Craig-asked: 2026-11-12 11:35 AM PT, bot-admin/decisions/vk-edit-mode-20261112, with the 11:33 two-checkbox and 11:36 sparse-field amendments in bot-admin/decisions/vk-mockup-feedback-20261112.

Update the existing TREK Thing panel to the approved view/edit section order. Visits support multiple days and times, independent statuses, add/remove controls and clocks without seconds. Story inclusion writes only includeInTripRecap; Next Time writes only nextTime. Sparse Things expose the same editable fields, and empty view sections disappear. Happy Hour is one text field; Reviews stay read-only with gold stars; Photos & videos uses bound media and the existing caption persistence. Keep rating/price in the header and show a checkmark beside Close during editing.

Validation on the uncommitted candidate based on 6683cfc3e72156ca67d47f08f958d4bf75485185:

- node scripts/test_issue_959_owner_pencil_webkit.mjs: iPhone WebKit touch acceptance at 390 and 430, owner/viewer access, flag independence, repeated visits, removal, reload persistence, mixed media, and sparse Story/Happy Hour/Hours fill and clear. ACCEPTANCE_DIR writes acceptance/969.json; CAPTURE_DIR writes the five view/edit states at both widths.
- node scripts/test_issue_951_thing_detail_pencil_price.mjs and node scripts/test_issue_964_detail_overall_rating_row.mjs: rating/price and edit price persistence checks.
- npm run test:keepsake-style2 and npm run build: successful. The build used TIMESYNCHER_BUILD_SHA=6683cfc3e72156ca67d47f08f958d4bf75485185; this identifies the starting commit, not a published candidate.
- node scripts/check-no-comments.mjs, node scripts/test_offline_manifest.mjs, BASE=vk node scripts/check-code-ratchet.mjs, and git diff --check: successful.

The isolated worktree has no installed dependencies. Local commands used the host's existing packages read-only via the job dependency loader and NODE_PATH/PATH; no package or lockfile changed. All original #951 assertions remain intact; #964 now supplies the edit-state context and adds an edit-price assertion. No test gate or manifest was loosened.

Scope left alone: Flights/Hotels/Cars list dates, snapshot/fixture data, all references and gate configuration. The existing local snapshot has no separate Carbone Happy Hour/hours and has long review blurbs; these data gaps/text were not rewritten to match fictional mock content. Sparse fill tests use explicitly synthetic user notes only in the memory server. No live NYC trip write occurred.

Host publication only: source remains uncommitted. The host must create the single PR into vk and run CI on its immutable head. Local screenshots are advisory, not a CI, live build, or Gate B verdict. Hold certify.

Lane/model: codex-ubuntu, gpt-6.1-sol only; one agent, no alternate model or subagent.
