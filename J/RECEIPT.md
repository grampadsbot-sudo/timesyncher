# VK PR #604 / issue #601 receipt (cursor-ubuntu vkfill-604, rethink round)

**Handoff:** `bot-admin/lanes/vk-pr-handoff/pr-604` (chief dr brief 2026-10-21 6:55 PM PT).

**Start sha:** `8b2ba628b2520ced218d4af903028c0870bd3667`

**Base merge:** Host merged `origin/migrate/trek-source` at `53130bbc2a855c86b97c447c674782101fb6d7c7` into PR head `bd4d0caaea620353fea0622388e740616d51d003` (2026-10-22 cursor-ubuntu vkfill-604 base-merge round).

## Change

1. Reverted `OE_ROW_SR_LOGO_ALIGN_*` flex row in `shared-trip-oe-list-row-patch.mjs` (row/name axis back to base `e3364ac` grid).
2. Per-image ink centring: `thing-logo-ink-center.mjs` injects `tsCenterThingLogoInk` into served TREK bundle; `dc()` `tiny-logo` images get onLoad/ref ink-bbox `translateY` inside the chip only.

## Checks (local)

| Command | Exit |
| --- | --- |
| `node scripts/rebake_served_trek_bundle.mjs` | 0 |
| `node scripts/test_thing_logo_ink_center.mjs` | 0 |
| `node scripts/test_shared_logo_chip_center_bundle.mjs` | 0 |
| `node scripts/test_itinerary_fresh_daybyday_bundle.mjs` | 0 |
| `node scripts/check-no-comments.mjs` | 0 |
| `node scripts/test_offline_manifest.mjs` | 0 |
| `BASE=codex/ruling95-consolidated-logo node scripts/check-code-ratchet.mjs` | 0 |
| `cd apps/vacation-client && CHROME_PATH=/usr/bin/chromium-browser npm test` | 0 |
| `scripts/offline-tests.txt` full loop (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`) | **fail** `scripts/test_live_transcript_dialog_pdf.mjs:651` — `actual 'gbrain-cli-get_page' expected 'bundled-get_page'`; host CI expected |

## Verdict

Base-merge round: resolved `J/RECEIPT.md`, merged `origin/migrate/trek-source` @ `53130bbc` into `bd4d0caa`; `node scripts/rebake_served_trek_bundle.mjs` left `public/assets` byte-identical to pre-merge PR head (ink-centre bundle preserved). Not self-certified; CI + Gate B on pushed head are authority.

**Tip sha:** `f8ae5691cd402d35c6f13728e78937535352466f` (merge `origin/migrate/trek-source` @ `53130bbc` into `bd4d0caa`; rebake unchanged served bundle vs `bd4d0caa`).
