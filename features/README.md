# TimeSyncher Vacation verification map

This directory is the maintained source of truth for verifying user-facing TimeSyncher Vacation behavior. Read this index before driving the app, then use the matching feature file as the recipe.

The shared edit pipeline (`vacation-edit-pipeline`) is the target for Telegram text, Telegram voice, and shared-page voice: STT transcript or text → bounded parser → deterministic matcher → validated writes → per-item response. A receipt that proves only one entry point is incomplete when a feature lists siblings.

## Baseline preconditions

- Work in this repo (`grampadsbot-sudo/timesyncher`), the Vacation product on Vercel (`timesyncher` / timesyncher.com). Do not drive `timesyncher-travel-trek` unless inspection shows the pipeline actually lives there.
- Put the repo root on `PATH` for helper scripts, or invoke them as `node scripts/control-vacation.mjs`.
- Run `node scripts/control-vacation.mjs doctor` and require the Feature Map, skill, pipeline syntax, and fixture catalog to be present.
- Use fixture trip `trip-vegas-live-001` / `Las Vegas Strip Vacation` unless a recipe names another synthetic account.
- Default mode is dry-run JSON. `--apply` mutates only the local snapshot under `artifacts/vacation-verify/<job_id>/`.
- Do not start customer simulation, mint Grok bots, touch production Stripe, or auto-merge.

## Driving conventions

- Start every recipe from the baseline fixture state unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run pipeline actions through `control-vacation dry-run` or `vacation-edit-pipeline --dry-run --json`.
- Shared-page list microphones must pass every visible item as context, not only the current day.
- Restore fixture snapshots after `--apply`. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final reply.
- Mutation proof is a before/after snapshot hash plus the named item movement.
- No-match wording must be exact: `I heard "...", couldn't find a match, what do you mean?`
- A success reply must name the change. Acknowledgement without state movement is a failure.
- Existing-itinerary edits must not use first-pass language such as "turning this into an itinerary."
- Record the feature ID, surface, and entry point with every artifact.
- Required later customer-run artifacts (named, not produced by this lever): whole-experience screenshot / customer-flow PDF, customer-story PDF with generated pictures, and final keepsake PDF.
- Report an unreachable path with the attempted command and the unmet precondition.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-vacation` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Checkout](./checkout.md) covers single/unlimited plans, photo/video add-ons, coupons, and synthetic entitlement proof.
- [Onboarding](./onboarding.md) covers post-purchase session, EULA accept, Telegram `/start`, and first voice-note intake.
- [Telegram-style messages](./telegram-messages.md) covers owner text edits through the shared pipeline.
- [Voice notes](./voice-notes.md) covers Telegram voice and shared-page voice, including list-page context.
- [Collaborator edits](./collaborator-edits.md) covers paid Telegram collaborators versus view-only public links.
- [Media uploads](./media-uploads.md) covers live `trip_id` binding and unauthorized upload reject.
- [Timeline / Thing media](./timeline-thing-media.md) covers attaching media to a day or Thing on the locked trip.
- [Keepsake PDFs](./keepsake-pdfs.md) names the required PDF proofs a later dry-run or customer run must emit.
