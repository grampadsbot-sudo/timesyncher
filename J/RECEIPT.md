# VK PR #610 (cursor-ubuntu vkfill-610, 2026-10-22)

Host merged `migrate/trek-source` at `6800a3b` (base #621 snapshot-key fixture hardening included).

**Tip sha:** `39d8f9d0`

**Change:** #607 — hotel `rowSummary` treats neighborhood-only stubs (`Neighborhood: …;`) like thin rating lines; `pickHotelListDescriptionFromLongCopy` keeps absorbing clauses until the line is not a stub, so UWS hotels no longer share one list description.

**Check:** `CHROME_PATH=/usr/bin/chromium-browser npm test` (apps/vacation-client) — 0; `node scripts/test_pr336_vk_search_places_snapshot_keys.mjs` — 0; `node apps/vacation-client/test/listRows.unit.mjs` — 0; pre-DONE (`check-no-comments`, `test_offline_manifest`, `check-code-ratchet` ×2) — 0.

**Left alone:** Price gaps, Romer Hell's Kitchen on live staging (data), baselines, Gate B config, `trip-thing-enrichment.mjs` (file-size ratchet).

**Verdict:** Ready for host push; CI + Gate B on pushed head are authority.
