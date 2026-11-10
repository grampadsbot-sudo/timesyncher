# PR #896 / issue #888 — host vk merge conflict resolution

**Outcome:** SOURCE-READY for host commit (merge completion). **Starting HEAD:** `4c5c7ed2f0e548ceb70523958d2cbf7c2eecb547`. **Merged base:** `origin/vk` @ `5a67b4fc90c1e579381b02dbf94396a0d72ce9b8` (host `basemerge.json`). **Model:** composer-2.5; HOST PUBLICATION ONLY — no commit, stage, push, or Git metadata write by this round.

## Conflict resolution

Host merge left one conflict: `J/RECEIPT.md`. Resolved by keeping **both** sides: this #896 handoff plus the inherited vk #889 dossier-overlay receipt section below. Product behaviour: PR #888 clipped-text / switcher / flight-row rules on branch head, plus vk street-address and dossier-overlay changes from the staged merge index.

Served bundle: `public/assets/index-BKun7ofk.js` unchanged by `node scripts/rebake_served_trek_bundle.mjs` (sha256 `fdb62e27…`, `node scripts/test_served_trek_bundle.mjs` exit 0).

No additional #888 product source edits were required on `4c5c7ed2`; prior head already carries vacation-client flight-row CSS (`apps/vacation-client/src/styles.css` @390 `nowrap` time chips, name wrap, `margin-top: calc(0.5lh - 11px)` logo) and trek conflict-label wrap patches.

## Check evidence @ `4c5c7ed2` (+ merge index, uncommitted receipt only)

| Command | Result |
|---|---|
| `node apps/vacation-client/test/list-layout.mjs` | pass (390/1280; JetBlue row logo ink within tolerance) |
| `node scripts/test_issue_888_clipped_text.mjs` | pass |
| `node scripts/test_real_app_entry.mjs` | pass |
| `node scripts/test_trip_dropdown_human_status_848.mjs` | pass |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `node scripts/test_dossier_evidence_hydrate_682.mjs` | pass (vk merge regression) |
| `node scripts/check-no-comments.mjs` | pass (1121 files) |
| `node scripts/test_offline_manifest.mjs` | pass (433 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass (252 report, 0 fail) |

`npm ci` at repo root was run once to restore `@neondatabase/serverless` for `test_real_app_entry.mjs`; no `package.json` / lockfile edits.

## Staged merge index (host owns `git add` + commit)

From vk @ `5a67b4fc`: dossier overlay / intake presentation, fixture address and flight-route rows, offline tests `test_vkprloop_*`, `scripts/offline-tests.txt` rows, and related sources per diff stat (`git diff --cached --stat`). **Left outside this round:** Gate B capture, deploy, NYC live data writes, baselines, check config.

## Host handoff

- Uncommitted: `J/RECEIPT.md` (this file).
- Host: complete merge commit (`git commit --no-edit` after conflict mark removal), push `vkfill/888-20261109142715`, re-run CI and official Gate B / rowcheck on the **published** SHA (not Cursor self-proof).

## Prior #896 partial receipt (GPT round @ `f2cff426` — superseded for merge gate)

Earlier partial noted Southwest logo 3px vs 2px tolerance on full Gate B flights-390 and pending official gate approval. This conflict round does not re-run host capture; host must re-validate gates on the post-merge commit.

---

# Inherited from vk merge — PR #892 / #889 street addresses + dossier overlay

**vk HEAD at merge:** `5a67b4fc90c1e579381b02dbf94396a0d72ce9b8`

## Changes (in staged merge index)

1. **`src/vacation/shared-trip-dossier-overlay.mjs`** — When a stored dossier has a supported, `addressIsSpecific` street address, it wins over neighborhood-only `thingOverrides` / fixture placeholders.
2. **`src/vacation/intake-shared-trip.mjs`** — `applyThingPresentation` no longer overwrites a specific override address with a non-specific trip-row address.
3. **Fixtures** — Street addresses for #889 addendum table in `gate-b-nyc-shared-staging.json`, `pr336-vk-search-places.snapshot.json`, and `nyc_ccab_place_enrichment.json`; flight rows in snapshot/staging use `AAA → BBB` routes instead of `Flight options / Bookings tab`.
4. **`scripts/test_dossier_evidence_hydrate_682.mjs`** — Overlay regression: Park Central dossier `870 7th Ave` beats `Midtown / Central Park South`.

## Left alone (vk scope)

- Gate B pixel/screenshot capture beyond regression tests above, Piccola hours garbage, duplicate Blue Note titles, Zinc 404 logo hunt.
