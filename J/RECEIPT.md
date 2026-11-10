# Issue #902 — hide build-stamp bar from customers

**Outcome:** source-ready PATCH (host publication). **Start HEAD:** `0b03a5784354c1fcc52b3ad8234519901beed9e0`.

**This round:** fix CI eslint `react-hooks/set-state-in-effect` in `apps/vacation-client/src/components/BuildStampFooter.tsx` — lazy `useState` for `?debug=1` instead of `setState` in `useEffect`.

Full receipt: `/home/ubishere9995/tsv-work/vkfill-902-20261109165311-job/J/RECEIPT.md`.

**Uncommitted:** `apps/vacation-client/src/components/BuildStampFooter.tsx`.

**Checks (local):** vacation-client lint + tsc PASS; `test_build_stamp_customer_hidden.mjs` PASS; `test_purchase_launch_routes.mjs` PASS; pre-DONE manifest + ratchet PASS.

**Host:** commit, push `vkfill/902-20261109163213` (PR #906), run CI + Gate B.
