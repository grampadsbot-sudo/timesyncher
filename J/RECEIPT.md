# PR #776 / issue #613 — escalated try 1 (lane vkfill-776-20261101145818)

**Start HEAD:** `ae2679948fa35b238c46059fb9ddaa61e9d97822`

## Restatement (written before editing)

On the shared trip at 390 px, the Events tab ("The Rest") lets some row
**titles** run past the right edge of the screen. On base `8793b8e`
(`gateb-cand/base-8793b8e-fixture-1fc60c083ad28555/capture-regions.json`,
events-390 `struct.text_overflow`) there are 8 `past_right` boxes, and every one is
a `strong` name: the 7 "Flight option: …" titles run 52–94 px past, and
"Village Vanguard / Smoke / Birdland / Jazz Gallery" runs 2 px past. They are
`white-space: nowrap` with `overflow-x: visible`, so nothing stops them.
The descriptions are not part of the problem. On base they wrap inside the
row (for example the Statue of Liberty row is 142 px, `desc_box` 46 px tall).

The two earlier pushes on this PR each went too far in one direction:
- `8850e3b` wrapped everything. The titles broke onto extra lines, and Gate B
  failed events-390-top (3.20%) and events-390 (2.04%).
- `ae26799` forced every Events description (`[data-list-summary="1"]`, which is
  `.tsv-row-desc` in vacation-client) onto one line with an ellipsis. That hides
  5 descriptions by up to 324 px (Statue City Cruises 317, TKTS 324, Blue Note
  239/86/21) and shortens rows 7–12, cutting 108 px of page height (list 2619 → 2511).
  That hides content Craig wants to see.

So the fix: titles stay on one line and get an ellipsis only when they don't fit
(the Flight option rows and the jazz title). Descriptions go back to base behaviour
and wrap in full. The containment chain (row, button, header, logo/name pair) stays,
so the ellipsis can engage.

## Fix (uncommitted; host publishes)

- `public/assets/index-CbEHlMj6.css`: removed the Events 390px rule
  `[data-shared-live-tab="events"] [data-list-summary="1"]{…white-space:nowrap…ellipsis}`.
  Descriptions fall back to the bundle's own inline `whiteSpace:"normal",overflowWrap:"anywhere"`,
  which is the base behaviour. Name containment is unchanged: row `overflow-x:clip`, the button,
  header, logo/name pair and name with `min-width:0` + `overflow:hidden`, and the name `strong`
  with `nowrap` + `ellipsis`.
- `apps/vacation-client/src/styles.css`: removed `[data-shared-live-tab='events'] .tsv-row-desc` nowrap
  and ellipsis. The generic mobile `.tsv-row-desc` wrap applies again. The name ellipsis is kept.
- `scripts/test_shared_events_390_text_wrap.mjs`: rewritten to parse the single Events `@media` block.
  It asserts the full containment chain (row clip, then button/header/pair/name `min-width:0`, `max-width:100%`,
  `overflow:hidden`), and that the name `strong` uses nowrap + ellipsis + overflow hidden + max-width 100%. It also
  asserts no `white-space:normal` on names, no `[data-list-summary]` rule in the Events block,
  and that the bundle's description element wraps. It fails on ae26799 (summary rule) and on base (no Events block).
- `scripts/test_vacation_client_list_row_390_text_wrap.mjs`: new assertion that there is no Events `.tsv-row-desc` override.

## Local measurement (built dist at this tree, `capture/capture.mjs`, fixture `fixture-nyc/heads/ae26799….json`, out `vkfill-776-20261101145818-job/cap`)

- `look_screen_rules.check` → `live_accept.classify_screen`: **overflow_390 = 0**. Events has 0 true
  overflow boxes and 9 intended ellipses, each with `right` 355 ≤ `container_right` 355.
  Same classifier on base `8793b8e` capture: overflow_390 = 4 (events-390/-top).
- events-390 rows 0–21: every row box and `desc_box` is identical to base (list 2619 px, doc 3209 px; ae26799 was 3101).
  `body_text` is identical to base.
- events-390-top: 0 px different from the pipeline's ae26799 capture.

## Screens expected to differ from base `8793b8e` (Gate B on the pushed head)

| screen | expected | why |
|---|---|---|
| events-390-top.png | small diff (local 843 px / 0.26% raw; Gate B scored the identical ae26799 top at 0.039%) | 4 visible "Flight option: …" titles now end in "…" at 355 px instead of running off the card |
| events-390.png | small diff (local 3581 px / 0.29% raw; no height change) | 7 Flight option titles, "Statue of Liberty / Ellis Island tour candidate" (6 px) and "Village Vanguard / Smoke / Birdland / Jazz Gallery" (37 px) end in "…". Descriptions and row heights match base |
| all other 30 screens | no change from this patch | every rule is scoped under `[data-shared-live-tab="events"]` @media ≤480px. Local diffs of ≤69 px on logo chips/tiles (cars/flights/restaurants/stores/daybyday) also show between the two pipeline captures base↔ae26799, so they are capture noise |

Per brief: do not chase 0 px on events-390 by clipping descriptions; the remaining diff is the intended name ellipsis.

## Checks (this tree, uncommitted)

| command | result |
|---|---|
| `node scripts/test_shared_events_390_text_wrap.mjs` | PASS |
| `node scripts/test_vacation_client_list_row_390_text_wrap.mjs` | PASS |
| `node scripts/test_shared_hotels_390_text_wrap.mjs` | PASS |
| all 394 `scripts/offline-tests.txt` entries (job-dir `run-all-offline.mjs`) | 390 PASS, 4 env-only FAIL: `test_purchase_email_app_link` (no google-chrome), `test_live_transcript_dialog_pdf` (reportlab/gbrain PATH), `test_same_selection_capture` + `test_capture_fixture_replay_harness` (host `git worktree add` in `~/tsv-dispatch/pr-src` refused); none touch this diff |
| `node scripts/check-no-comments.mjs` | PASS (1042 files) |
| `node scripts/test_offline_manifest.mjs` | PASS (394 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (255 report, 0 fail) |

The offline loop rewrote 4 tracked `scripts/ops/gateb/__pycache__/*.pyc`. They were restored from HEAD and are not in the diff.
Remote `refs/pull/776/head` = `ae2679948fa35b238c46059fb9ddaa61e9d97822` at DONE (no race).
Gate B / CI ids: none claimed. The pipeline runs Gate B on the pushed head.

---

# PR #776 / issue #613 — Gate B fix-it receipt

**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-776` — page not found at lane start (noted per handoff).

**Start HEAD:** `8850e3b1223f2e7b8fb1ff46c6f71b0235d94afa`

**Fix-it:** First push used wrap at 390px; Gate B failed `events-390-top.png` (3.20%) and `events-390.png` (2.04%) vs baseline (single-line ellipsis). Reverted Events mobile rules to `nowrap` + ellipsis + `overflow-x:clip` / `min-width:0` containment; kept `data-shared-live-tab="events"`. Served CSS: Events `@media` block ordered before Hotels so `test_shared_hotels_390_text_wrap.mjs` greedy regex does not cross-match.

**Commit:** `64b230f0` on branch `cursor/tsv-613-vk-live-accept-no-text-past-the-right-edge-at-390-px-live-staging-74f5`

---

# PR #773 / issue #471 — lane vkfill-773 receipt

**Start HEAD:** `4ec3250b7f07d494568ce8c255715eb530cd875c` (unchanged; host publishes)

## Root cause (Gate B on 4ec3250b)

`patchSharedTripListWrapping` set `whiteSpace:"normal"` on every `data-ts-list-row-name` span, including rows inside `data-ts-logo-name-pair`. Multi-line names vertically center the 28px chip against the full text block, so logo ink (nudged to the first name line) fails Gate B **logo not centred with name** on flights/hotels/restaurants/events/stores/cars captures. Price lines in the brief are data-only (ignored per Craig 10/20).

## Fix

Keep #471 Apple leaf alignment (`lineHeight:1`, `strong` block, ink → `tsListRowNameLeafCenterY`) but restore **single-line** list titles inside logo+name pairs (`nowrap` + ellipsis) so chip center and first name line stay aligned.

## Files touched

- `src/vacation/shared-trip-oe-list-row-patch.mjs` — `OE_LOGO_PAIR_LIST_ROW_NAME_*` rewind after wrap patch
- `public/assets/index-BKun7ofk.js` — rebaked (`node scripts/rebake_served_trek_bundle.mjs`, sha256 `dd89d02ba17d8ecf57060706c3925d1a600e07a24b5dd273800dd1912f3ee469`)
- `scripts/test_ui_471_apple_row_name_frame.mjs` — assert logo-pair bundle anchor
- `scripts/test_shared_tab_list_summary.mjs` — list row name `nowrap` under logo pair

## Checks (local, uncommitted tree)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | PASS |
| `node scripts/test_ui_471_apple_row_name_frame.mjs` | PASS |
| `node scripts/test_shared_tab_list_summary.mjs` | PASS |
| `node scripts/test_gate_b_row_name_frame.mjs` | PASS |
| `node scripts/test_thing_logo_ink_center.mjs` | PASS |
| `node scripts/test_gate_b_live_tab_logo_rows.mjs` | PASS |
| `node scripts/test_served_trek_bundle.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS |

Gate B pixel re-run on Ubuntu staging not executed in lane (host CI + `restore_check.py` on push).

## Scope left alone

Budget/flight/hotel/car **price** gaps on NYC fixture — data harness, not UI (brief + decisions-log #65/#773 handoff).
