# VK PR #610 BASE-MERGE + scope cut (cursor-ubuntu vkfill-610, 2026-10-22)

**Tip sha:** `8100b20ed974dd01ff6eabca0735707c615dc1df` (local; host publishes to `vkfill/607-20261021175801`).

**Merge:** host merged `origin/migrate/trek-source` at `6edb0791` into `75cb1caa`; fixture conflict → base.

**Scope cut:** #607 hotel list copy only in `listTabModel.mjs` / `trip-thing-enrichment.mjs`; trek/flight/budget patches and PR-only evidence removed; base detail evidence restored.

**Checks (local):** `apps/vacation-client` npm test 0; pre-DONE gates 0 at tip above. `node scripts/run-offline-tests.mjs` stops on env (`test_live_transcript_dialog_pdf.mjs` / gbrain path) — lane env, not this diff.

**Verdict:** Ready for host push; CI + Gate B on pushed head are authority (not self-certified).
