# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, 2026-10-22)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (kickback 2026-10-22 12:15 AM PT).

**Start sha:** `fe221bb44ddc348925bd6dcf6a7b676df58e0eeb` (includes `ac6689ac` 390px tab fix).

## Change

1. **390px tab capture (from `ac6689ac`):** defer per-logo canvas ink work off the React commit path (`requestAnimationFrame` / `setTimeout(0)`), harden canvas reads, `onLoad` + deferred `ref` when `img.complete` (ref only schedules ink fn; no sync canvas in ref).
2. **Ink vs first name line:** `tsCenterThingLogoInk` targets `[data-ts-list-row-name]` first-line centre (Gate B `judgeRowNameFrame`), with `object-fit: contain` content-box math; chip-centre fallback when name node missing.
3. Rebaked `public/assets/index-BKun7ofk.js` via `node scripts/rebake_served_trek_bundle.mjs`.

Row `sr` / chip box untouched.

## Local verification

| Check | Result |
| --- | --- |
| `TSV_CAPTURE_BASE=http://127.0.0.1:9876` + `~/tsv-dispatch/capture/capture.mjs` (head build) | `{"shots":32,"failed":0}` at 390 and 1280 |
| Playwright on restaurants tab | `getImageData` fails: canvas tainted by cross-origin logo URLs (e.g. `static.spotapps.co`); `tsLogoInkDone=1` with empty `transform` |

Ink bbox measurement cannot run in-browser on NYC fixture logos without same-origin bytes or server-computed `logoInkCenterY` on `thingOverrides` (chief brief: measure where logos are fetched/stored). Not fixed this round.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `cd apps/vacation-client && npm test` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=migrate/trek-source node scripts/check-code-ratchet.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |

## Verdict

390px tab regression addressed on branch tip; logo-centre Gate B still blocked on cross-origin canvas taint until server-side ink metadata or a same-origin logo fetch path lands. Not self-certified; CI + Gate B on published head are authority.

**Tip sha:** (set at commit)
