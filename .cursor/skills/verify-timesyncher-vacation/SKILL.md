---
name: verify-timesyncher-vacation
description: "Re-runnable TimeSyncher Vacation verification. Drives the real shared app on vacation-staging and overwrites a per-feature PASS/FAIL/GAP table. Use for /maintain-verification-skill, after an app merge, or the weekly verification pass."
---

# Verify TimeSyncher Vacation

The target is the real TimeSyncher app: Day-by-Day itinerary, Vacation Day View timeline bars, and Thing detail pages. Reference UI: `https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/` (the staging copy of travel.timesyncher.com shared vacation-3). Never drive the deleted Onboarding/Itinerary card shell.

Prove the customer path in `features/post-purchase-email-eula.md`. The purchase email is the launch. Order-success Open App and standalone `/accept` are retired for this path. After a trip has a shared site, the app iframe is that real itinerary.

## Launch

Staging is already the instance. Do not start a second host.

- Alias: `https://vacation-staging.timesyncher.com`
- Ready when `node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor` prints `doctor ok`.

No local server. Teardown is not a process kill.

## Doctor

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --doctor
```

Doctor GETs `/order-success.html` and `/vacation-app.html` on the staging alias. It fails if order-success still offers a primary Open App control or an in-page EULA accept, or if the app document no longer loads the vacation app script.

## Drive

Source gate (no network):

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs
```

Evidence gate. The launch URL is read from the captured purchase email, not typed from a success page:

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --evidence /opt/cursor/artifacts/craig-811-email-eula-20260925
```

Live read of that email's app URL plus the staging doctor:

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --evidence /opt/cursor/artifacts/craig-811-email-eula-20260925 --live
```

Fail-closed self-check (missing email, email that opens order-success, email that opens `/accept`):

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs --self-check
```

The harness exits non-zero when:

- the evidence directory has no purchase email HTML or text (the run skipped email);
- the email launch link is order-success or `/accept` instead of `vacation-app.html?session=`;
- EULA acceptance is only on order-success (`#acceptEula` or an `/accept/` customer link) and the app URL did not show `#eulaScreen` first;
- onboarding chat proof is missing after that EULA screen.

## Evidence

Keep proof in the directory passed to `--evidence`. This path uses `/opt/cursor/artifacts/craig-811-email-eula-20260925/`. Required captures: `purchase-email.html` or `purchase-email.txt`, and `browser-notes.json` with `email`, `eula-first`, and `onboarding` steps. Screenshots in that folder are the human proof. The harness does not delete them.

## Cleanup

The harness only writes under a temp directory during `--self-check`, and it removes that directory before exit. It does not delete evidence, coupons, or staging data.

## Helpers

`node .cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs` checks the email launch. Flags: `--doctor`, `--evidence <dir>`, `--live`, `--self-check`.

## Live composer Jev tier

Prove `features/live-app-jev-tier.md`. The composer reply is Jev, then that model tier, then the stored text. Same shared producer as Dialog.

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs --self-check
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs --transcript <live-transcript.json>
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs --session <token>
```

The harness exits non-zero when the source path skips Jev, stamps a dialog fingerprint onto the customer reply, or a live app turn lacks `jevRan` plus tier and route. A skipped classify must be `jevRan: false` with a reason and no invented tier. `--session` only reads stored turns.

## Feature map drive

This is the command `/maintain-verification-skill` re-runs after every app merge and weekly. It is idempotent: it overwrites `<out>/VERIFY.md` and `<out>/verify/*.png`, and it does not redeem a coupon or insert staging rows.

```bash
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-feature-map.mjs --self-check
node .cursor/skills/verify-timesyncher-vacation/scripts/verify-feature-map.mjs --out <dir>
```

`<dir>` defaults to `.cursor/skills/verify-timesyncher-vacation/output`, which is not committed. The same input overwrites the same table. QA reads that table: one row per feature file, result `PASS`, `FAIL`, or `GAP`.

The real-app gate is required. The command runs `npm run test:real-app-entry` first and refuses a clean table when that gate fails. A doctor failure overwrites the same table with `Doctor FAIL` so a later run cannot leave an older PASS table in place. A product gap stays a `GAP` row. Do not delete or soften the feature file.

A missing feature file in the checker list fails `--self-check`. Pass `TIMESYNCHER_VERIFY_SESSION` only when a pending app URL should be opened again. Omit it on a routine re-run.
