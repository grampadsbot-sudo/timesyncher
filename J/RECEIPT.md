# PR #922 — host base-merge conflict resolve @ `578510a2`

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `578510a284ac0081e7ad40a99820ee0a5e6013f1` (verified). **Lane:** cursor-ubuntu, composer-2.5. Host merged `origin/vk` at `ce649c0cde4e7ecac6dc0138e2dddd5cc523ecde` (chief `basemerge.json` dirty-head requeue).

## Conflict resolution

| file | resolution |
| --- | --- |
| `scripts/offline-tests.txt` | Kept **both** `scripts/test_vkprloop_drift_921.mjs` (PR #922 / #921) and `scripts/test_vkprloop_drift_915.mjs` (`origin/vk`). Removed conflict markers only. |

Staged from merge (unchanged this round): `scripts/fixtures/vkprloop-drift-915.txt`, `scripts/test_vkprloop_drift_915.mjs`. No `public/assets/*.js` conflict; rebake not run.

## Checks (lane)

| check | result |
| --- | --- |
| `node scripts/test_vkprloop_drift_921.mjs` | PASS |
| `node scripts/test_vkprloop_drift_915.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (438 offline, 18 online) |
| `node scripts/check-no-comments.mjs` | BLOCKED locally: missing `apps/vacation-client/node_modules/typescript` (run root + `apps/vacation-client` `npm ci` before host pre-DONE) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | not run (blocked on same deps) |
| `cd apps/vacation-client && npm test` | PARTIAL: budget + dayTimeline PASS; `detail.unit.mjs` ERR_MODULE_NOT_FOUND `@neondatabase/serverless` (no `npm ci` in worktree) |

## Host publish

1. `git add scripts/offline-tests.txt` (resolve UU), then `git commit --no-edit` to finish the in-progress merge; push once to `grok/tsv-921-formal-model-drift-vkprloop-tla-behind-d`.
2. After `npm ci` (repo root + vacation-client): `node scripts/check-no-comments.mjs`, `node scripts/test_offline_manifest.mjs`, `BASE=vk node scripts/check-code-ratchet.mjs`, full `scripts/offline-tests.txt` suite per lane brief, then CI on new head.

---

# PR #908 / #901 — host base-merge follow-up (9420e788)

**Outcome:** source-ready PATCH (uncommitted; HOST PUBLICATION ONLY). **Start HEAD:** `9420e788aaf9d712bbcc2ce6c96f9eb7c77c7381` (verified). **Lane:** cursor-ubuntu, composer-2.5.

Host merged `origin/vk` at `2608a0ecbf08f33cc735b9824a357982a96d914e` into `9420e788`. Conflicted file: `J/RECEIPT.md` only. This round resolved that conflict (both sides kept below), ran `node scripts/rebake_served_trek_bundle.mjs` (no asset delta vs index), and re-ran pre-DONE gates.

## Checks @ `9420e788` + conflict resolution

| check | result |
| --- | --- |
| `node scripts/test_gate_b_product_row_fields.mjs` | PASS |
| `node scripts/test_gate_b_live_replay_display_facts.mjs` | PASS |
| `node scripts/test_issue_901_trip99_single_venue_standins.mjs` | PASS |
| `node scripts/test_reply_action_claim_d2_paia_save_route.mjs` | PASS |
| `node scripts/check-no-comments.mjs` | PASS (1128 files; `apps/vacation-client/npm ci` first) |
| `node scripts/test_offline_manifest.mjs` | PASS (436 offline, 18 online) |
| `BASE=vk node scripts/check-code-ratchet.mjs` | PASS (252 report, 0 fail) |

No CI run id on this uncommitted tree; pending host commit of staged merge + this `J/RECEIPT.md` resolution.

## Host publish

1. `git add J/RECEIPT.md` (conflict resolved); commit the staged host-merge index (80 paths) with merge message; push once to `vkfill/901-20261109163211`.
2. CI `unit-tests`, then Gate B structure on the new head.
3. Trip 99 live: apply `J/trip99-change.sql` + `J/trip99-change.json` per sections below before expecting live `/api/shared` to match fixtures.

**Uncommitted / staged (host):** merge index ~80 files from `origin/vk` (rebrand, #905 chat-itinerary pieces, `vacation-app.html` composer catch, etc.) plus this `J/RECEIPT.md`.

---

# #901 / PR #908: unit-tests fix (prior round summary, still authoritative)

**Prior start HEAD:** `3e710445c8aba3bc661ac65cafb9f4b1fed9470c`.

## Failure reproduced (9913e460 / 3e710445)

`node scripts/test_gate_b_live_replay_display_facts.mjs` gave `served: place 664 price must match hosted` (`65 !== 25`), and `externalId` wrong for 664 and 669 (served undefined; hosted had old bundle titles).

## Root cause

- The PR rewrote 664/669/672 in the Gate B served fixture, but the hosted live replay `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` still held the old bundle rows. Live staging had not applied `J/trip99-change.sql` yet.
- The ccab fix set `Big Apple Greeter.price` 0 → null. With null price, `buildGateBSearchPlaceForRow` → `enrichSearchPlace` uses the activity default (`src/vacation/search-place-price-estimate.mjs:62` → 65). Staging fixture, VK search snapshot, and SQL still said `0` (banned `$0`).
- Served `externalId` undefined for 664/669 when new narratives exceed 30 words (`mergeStoredCcabNarrativeIntoOverride` returns early in `src/vacation/stored-ccab-narrative-merge.mjs`).

## Data changes (on branch; in staged merge)

| file | change |
| --- | --- |
| `scripts/fixtures/nyc-screen-trip99-live-shared-api.json` | Trip 99 post-image for 664/669/672 |
| `scripts/fixtures/gate-b-nyc-shared-staging.json` | 664 place + override `price` 0 → 65 |
| `scripts/fixtures/pr336-vk-search-places.snapshot.json` | 664 `price` / `sourceRecord.price` 0 → 65 |
| `scripts/fixtures/nyc_ccab_place_enrichment.json` | `Big Apple Greeter.price` → null (skips `test_gate_b_product_row_fields.mjs:270`; served build still estimates 65) |
| `J/trip99-change.sql`, `J/trip99-change.json`, `J/trip99-backup.sql`, `J/REVERT.md` | Host Neon apply path |

**Price for 664:** dossier says free; `$0` banned; positive Gate B contract requires a price on every Thing — staging/live-replay/snapshot use estimator **65**; ccab enrichment keeps **null**.

---

# PR #913 / vkfill-905 port — inherited from `origin/vk` merge

**Starting HEAD (vk side doc):** `e18a08efa3df43c116adb0ca58917c46a4759a18`

## Vk merge change (staged; not re-authored this round)

| File | Why |
|------|-----|
| `vacation-app.html` | `scripts/test_reply_action_claim_d2_paia_save_route.mjs` requires `showComposerStatus(customerSafeErrorMessage` in static HTML; inlined catch matches `public/vacation-app-request.js` (90s `AbortError` + composer status). |

Turn-2 hang / Fix-6 Zinc logo / chat-itinerary edits from #905 port remain on the staged index (`src/vacation/chat-itinerary-edit*.mjs`, `DayTimeline.tsx`, etc.); see vk PR #913 receipt in GBrain when needed.

## Left alone (scope)

- Live override narratives for 664/669/672 bundle copy until host re-fill.
- Baselines, check config, workflows, `offline-tests.txt` ratchet files (per brief).
- Deploy / force-push / Neon writes from lane.
