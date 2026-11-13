# TSV #971 — lane receipt (composer-2.5 / HOST PUBLICATION ONLY)

**Starting HEAD:** `d535c3acdfcfab63cc44a2b3580ec52d7f45d993` (verified before edit)  
**GBrain handoff:** `bot-admin/lanes/vk-pr-handoff/pr-971`  
**Host merge:** `origin/vk` @ `9e641b63d15da94030d8043f55aaf9afafd8817d` into `d535c3ac` (2026-11-13 PT).

## Merge resolution

| Path | Resolution |
| --- | --- |
| `src/vacation/trek-style2-bundle.mjs` | Both: `patchListRowDates` (vk) + `patchThingDetailV3` + `patchDetailSubstanceHarness` + outer `patchUi903DetailChrome` (#969). |
| `public/assets/index-BKun7ofk.js` | vk base, then `node scripts/rebake_served_trek_bundle.mjs` (sha256 `4eb59592cff7c74fe84a83918ea15c1cc453a252f5059222cf85badd3338b540`). |
| `J/PR_DESCRIPTION.md`, `J/RECEIPT.md` | PR text + base-merge note. |

## Root cause (unit-tests on `d535c3ac` + dirty merge)

**CI `unit-tests`:** `scripts/test_list_row_description_substance.mjs:102` — `#969` `patchThingDetailV3` replaced the legacy detail panel, so rebaked bundles lost `const sum=String(d.summary` / `(()=>{const note=tsItinLine(Dt)` needles still asserted offline (not a test change). Merge also needed vk `patchListRowDates` in the patch chain.

## Changes (uncommitted — host must commit/push)

| Path | Why |
| --- | --- |
| `src/vacation/trek-list-row-description-patch.mjs` | `patchDetailSubstanceHarness` preserves offline substance needles beside v3 via a parse-safe stub; shared `DETAIL_READONLY_EXTRA_FRAG`. |
| `src/vacation/trek-style2-bundle.mjs` | Merge chain + call harness after v3. |
| `public/assets/index-BKun7ofk.js` | Rebaked. |
| `J/*` | Conflict resolution + this receipt. |

## Local verification (starting HEAD `d535c3ac`, uncommitted)

| Command | Result |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | pass |
| `node scripts/test_list_row_description_substance.mjs` | pass (was assert line 102) |
| `node scripts/test_served_trek_bundle.mjs` | pass |
| `npm run test:keepsake-style2` | pass |
| `apps/vacation-client` `npm test` | pass |
| `node scripts/check-no-comments.mjs` | pass |
| `node scripts/test_offline_manifest.mjs` | pass |
| `BASE=vk node scripts/check-code-ratchet.mjs` | pass |

Full `scripts/offline-tests.txt` slice not re-run end-to-end in lane (host CI). No git stage/commit/push in lane.

## Host next steps

`git add` merge resolutions + rebake → `git commit --no-edit` (merge) if needed → push `vkfill/969-20261112114227` → wait for CI on new tip.
