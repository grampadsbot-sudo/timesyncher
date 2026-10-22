# VK PR #610 (cursor-ubuntu vkfill-610, 2026-10-22)

Host merged `migrate/trek-source` at `6800a3b` (base #621 snapshot-key fixture hardening included).

**Tip sha:** (set after commit)

**Change:** #607 — hotel `rowSummary` treats neighborhood-only stubs (`Neighborhood: …;`) like thin rating lines; `pickHotelListDescriptionFromLongCopy` keeps absorbing clauses until the line is not a stub, so UWS hotels no longer share one list description.

**Check:** `node apps/vacation-client/test/listRows.unit.mjs` — 0; `gate-b-nyc-shared-staging.json` hotel list — 0 duplicate description groups (was 3+). Pre-DONE gates — 0.

**Left alone:** Price gaps, Romer Hell's Kitchen on live staging (data), baselines, Gate B config, `trip-thing-enrichment.mjs` (file-size ratchet).

**Verdict:** Ready for host push; CI + Gate B on pushed head are authority.
