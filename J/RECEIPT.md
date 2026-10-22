# VK PR #610 (cursor-ubuntu vkfill-610, 2026-10-22)

Host merged `origin/migrate/trek-source` at `fb95a6306b16ea71cfc1adc6fc76a5779ec47403` into PR head `a907df5df0f4da54d5f00337e8bab8e08f2eb7a9` (base-merge round).

**Tip sha:** (filled after commit)

**Change:** #607 — hotel `rowSummary` treats neighborhood-only stubs (`Neighborhood: …;`) like thin rating lines; `pickHotelListDescriptionFromLongCopy` keeps absorbing clauses until the line is not a stub, so UWS hotels no longer share one list description.

**Check:** `CHROME_PATH=/usr/bin/chromium-browser npm test` (apps/vacation-client) — pending; pre-DONE gates — pending.

**Left alone:** Price gaps, Romer Hell's Kitchen on live staging (data), baselines, Gate B config, `trip-thing-enrichment.mjs` (file-size ratchet).

**Verdict:** Pending local checks; CI + Gate B on pushed head are authority.
