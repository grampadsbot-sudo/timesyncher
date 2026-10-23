# vkfill-569 — Gate B list-row name line fix

Host rowcheck rejected DONE: events/restaurants rows with logos failed `logo not centred with name` with **missing visible name line (fail closed)**.

**Fix:** `data-ts-list-row-name` rows now expose a leaf `<strong>` for capture `first_text`; emoji-only logo chips nudged so ink centre matches the name line within 1.5px.

**Local proof:** `rowcheck-verify-2` ROWCHECK-PASS on worktree at starting HEAD `e46d1e1f8e5767cc2dd1ba16f2b0a20ca72546ca`.

**Uncommitted files:** `src/vacation/trek-live-product-patches.mjs`, `public/assets/index-BKun7ofk.js`, `apps/vacation-client/src/components/ListRow.tsx`.
