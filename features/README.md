# TimeSyncher Vacation verification map

This directory is the maintained source of truth for verifying user-facing TimeSyncher Vacation behavior. Read this index before driving the app, then use the matching feature file as the recipe.

The shared edit pipeline (`vacation-edit-pipeline`) is the target for Telegram text, Telegram voice, and shared-page voice: STT transcript or text → bounded parser → deterministic matcher → validated writes → per-item response. A receipt that proves only one entry point is incomplete when a feature lists siblings.

## Baseline preconditions

- Work in this repo (`grampadsbot-sudo/timesyncher`), the Vacation product on Vercel (`timesyncher` / timesyncher.com). Do not drive `timesyncher-travel-trek` unless inspection shows the pipeline actually lives there.
- Put the repo root on `PATH` for helper scripts, or invoke them as `node scripts/control-vacation.mjs`.
- Run `node scripts/control-vacation.mjs doctor` and require the Feature Map, skill, pipeline syntax, and fixture catalog to be present.
- Use fixture trip `trip-vegas-live-001` / `Las Vegas Strip Vacation` unless a recipe names another synthetic account.
- Default mode is dry-run JSON. `--apply` is refused unless you pass `--local-snapshot` (JSON only; not product state) or `--apply --trek-db <path>` (local TREK SQLite id-set / row-count proof).
- Do not start customer simulation, mint Grok bots, touch production Stripe, or auto-merge.

## Driving conventions

- Start every recipe from the baseline fixture state unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run pipeline actions through `control-vacation dry-run` or `vacation-edit-pipeline --dry-run --json`.
- Shared-page list microphones must pass every visible item as context, not only the current day.
- Restore fixture snapshots after `--apply`. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final reply.
- Mutation proof for product state is a TREK id-set and row-count before vs after (`--apply --trek-db`). A local fixture hash is labeled `apply_local_snapshot` and is not product state.
- No-match wording must be exact: `I heard "...", couldn't find a match, what do you mean?`
- Dry-run and other unapplied receipts store the no-apply sentence (`I heard "…", but I did not change the itinerary from this message.`). `planned_writes` still names the validated change. Moved/Removed success copy is only honest after writes were applied (`--apply`). Telegram `plannedWritesReplied` uses the same no-apply copy (`apply_not_on_turn`). A reply that claims an update without TREK id-set movement is a failure. Before/after hashes stay equal on dry-run.
- Existing-itinerary edits must not use first-pass language such as "turning this into an itinerary."
- Record the feature ID, surface, and entry point with every artifact.
- A committed inspectable dry-run receipt lives at [features/proof/vac-verify-telegram-text-single-edit/receipt.json](./proof/vac-verify-telegram-text-single-edit/receipt.json) with `events.jsonl` and `dry-run.json` beside it. Doctor requires that path. Do not treat a gitignored `artifacts/` run as in-tree proof.
- Required later customer-run artifacts (named, not produced by this lever): whole-experience screenshot / customer-flow PDF, customer-story PDF with generated pictures, and final keepsake PDF.
- Report an unreachable path with the attempted command and the unmet precondition.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-vacation` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

Sibling rows. Each recipe file is required. Entry points are from that file's "How to get to it" section, not invented here.

| Feature | Recipe | Sibling entry points in repo |
| --- | --- | --- |
| Checkout | [checkout.md](./checkout.md) | storefront checkout, `/addons-checkout.html`, `/owner-media-checkout.html`, Telegram entitlement questions, synthetic entitlement fixtures |
| Onboarding | [onboarding.md](./onboarding.md) | `/order-success.html`, EULA accept URL, Telegram `/start <token>`, first voice/text after microphone intro |
| Telegram-style messages | [telegram-messages.md](./telegram-messages.md) | owner Telegram text, paid collaborator Telegram text, `control-vacation` fixtures |
| Voice notes | [voice-notes.md](./voice-notes.md) | Telegram voice, shared-page day mic, shared-page list mic, stored `.ogg` + transcript replay |
| Collaborator edits | [collaborator-edits.md](./collaborator-edits.md) | collaborator checkout, paid Telegram start token, public shared URL (view-only), website editor magic link |
| Media uploads | [media-uploads.md](./media-uploads.md) | Telegram photo/video, owner-media checkout then upload, public-link attempt, stale/unauthorized fixtures |
| Timeline / Thing media | [timeline-thing-media.md](./timeline-thing-media.md) | shared day attach, shared list attach, Telegram caption that names a Thing, list/stale fixtures |
| Keepsake PDFs | [keepsake-pdfs.md](./keepsake-pdfs.md) | Photo Memories checkout (later customer run), TREK Journey/book export, compact receipt `required_artifacts` |

## Fail-closed goldens

Catalog IDs in `features/fixtures/catalog.json` `required_goldens`. Voice goldens keep real OggS `.ogg` plus sibling `.txt` transcripts.

Present (pipeline dry-run observables):

- Multi-request voice: `telegram-voice-audio`, `telegram-voice-multi-intent`, `telegram-voice-clause-drop` (audio + transcript + before/after).
- Stale-trip media: `stale-trip-media`.
- Thing-scoped attach: `thing-media-stale` (thing_id on another trip), `thing-media-visible` (thing_id missing from page context).
- Split-trip no duplicate TREK rows: `split-trip-trek-uniqueness`.
- Unauthorized / public-link / logged-out / unpaid collaborator upload: `unauthorized-upload`, `unauthorized-upload-logged-out`, `unauthorized-upload-unpaid-collaborator`.
- Checkout entitlements: `checkout-entitlements`, `checkout-entitlements-missing`.
- Also present: `telegram-text-single-edit`, `shared-page-voice-day`, `shared-page-voice-list`, `alias-omeke`, `unsupported-research`, `incomplete-move`, `authorized-owner-upload`, `exact-no-match`, `successful-edit-wording`.

Named in feature files but not a vacation-edit-pipeline golden (do not fake):

- Onboarding EULA / `/start` — `npm run test:eula` and `node scripts/test_vacation_telegram_intake.mjs`; not an edit-pipeline fixture.
- Keepsake PDF bytes — compact receipt names the three PDF contracts; this lever does not render them.

## Live TREK apply entries

Telegram `plannedWritesReplied` does not queue a write worker and must not send Moved/Removed success copy. Apply is not on that turn (`apply_not_on_turn` fail-closed). A second customer message must re-enter the gate.

Separate apply entries (do not invent a second writer on the turn):

- Worker `applyExistingTripEdit` in `scripts/product-gbrain-dispatch.mjs` — only when a job is queued (first-pass / non-edit setup). Re-gates; writes `planned_writes` only.
- Verification lever `control-vacation apply --trek-db <path>` (local TREK SQLite id-set) or `apply --local-snapshot` (JSON hold, not product state).
- Shared-page `POST vacation_edit` on `api/vacation-itinerary.mjs` is gate-only (returns `plannedWrites`; fail-closed is 403).
