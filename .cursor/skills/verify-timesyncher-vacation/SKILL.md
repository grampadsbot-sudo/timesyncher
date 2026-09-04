---
name: verify-timesyncher-vacation
description: Drive TimeSyncher Vacation verification through the shared edit pipeline and Feature Map. Use for vacation-edit-pipeline dry-runs, Kim-class voice-note gates, and pre-customer proof. Do not start customer simulation.
---

# Verify TimeSyncher Vacation

TimeSyncher Vacation is the Vercel product in this repo (`grampadsbot-sudo/timesyncher`, timesyncher.com). Users buy a plan, onboard in Telegram, and edit a shared itinerary by text or voice. TREK is the hosted itinerary runtime this repo syncs to; do not switch to `timesyncher-travel-trek` unless inspection shows the pipeline actually lives there.

The Feature Map at `features/README.md` is the source of truth. This skill is the lever: a control CLI plus `vacation-edit-pipeline` dry-run JSON that emits a stable `job_id`, `events.jsonl`, artifact directory, and stop rules.

## Launch

There is no long-lived Vacation server required for this gate. Launch means install nothing extra (Node is enough) and make the helpers executable once:

```bash
chmod +x scripts/control-vacation.mjs scripts/vacation-edit-pipeline.mjs scripts/test_vacation_edit_pipeline.mjs
node scripts/control-vacation.mjs doctor
```

Ready when doctor prints `PASS` and exits `0`. Teardown is unnecessary for doctor. Each dry-run is a short-lived Node process; start a fresh process per drive.

Do not launch `scripts/telegram-vacation-intake-bot.mjs`, Stripe checkout, or a customer journey from this skill.

## Doctor

Read-only check that the instance is worth driving:

```bash
node scripts/control-vacation.mjs doctor --json
```

Require `ok: true`, Feature Map present, this skill present, pipeline syntax valid, the fixture catalog complete, workflow `run:` steps that actually invoke the five reviewer commands, and SHA-bound `vacation-verify`, `vacation-verify-doctor`, `vacation-verify-gate`, `vacation-verify-attest`, and `vacation-verify-bind` jobs with `conclusion=success`. Default `doctor` requires `ci_attestation`; produce flags cannot bypass that. CI runs default doctor in `vacation-verify-bind`. Doctor JSON must include required checks and job/digest fields (including `bind_job_id` / bind digest once bind is complete), not shallow `{ok:true}`. Mid-bind uploaded JSON may omit the bind digest while `bind_conclusion=in_progress`. `doctor_job_id` is the `vacation-verify-doctor` job. Gate fails if doctor exits non-zero. Harness green or marker-only is not attestation. Mid-job `in_progress` or a null gate/attest digest is not attestation. Deleting or skipping attest fails attestation. A committed CI receipt at `features/proof/vac-verify-ci/receipt.json` is required. Missing or mismatched run_id / job conclusions / harness-gate-attest-bind digests, or a receipt that omits `vacation-verify-bind`, fail-closed. Two-proof attest: the receipt SHA must be HEAD or the direct parent of HEAD (one-commit lag max). Deeper ancestors fail-closed. Doctor JSON must name both proofs (`receipt_lag` plus `committed_receipt` digests). Same-SHA receipts must match live HEAD bind digest; parent-lag receipts must not alias that digest. Completed parent-lag fails if the live HEAD bind digest or run is missing; mid-bind `in_progress` may omit the live bind digest. `doctor_artifact_*` is the gate zip (`doctor_artifact_kind=gate`). The `vacation-verify-doctor` zip is marker-only (`doctor_job_artifact_kind=marker`). The current tree receipt binds `18ca973` / run `33823889530`. Do not rewrite the receipt onto every new HEAD. The receipt cannot skip live HEAD attestation and cannot stand in for a live HEAD bind. Hosted Vercel `timesyncher` is a deploy status, not a remote doctor/dry-run target. If doctor fails, stop. Do not dry-run a broken catalog.

## Drive

Use `control-vacation`. Commands are literal.

```bash
node scripts/control-vacation.mjs dry-run --fixture features/fixtures/telegram-text-single-edit.json --json
node scripts/control-vacation.mjs dry-run --all-fixtures
node scripts/control-vacation.mjs apply --local-snapshot --fixture features/fixtures/telegram-text-single-edit.json --json
node scripts/control-vacation.mjs apply --trek-db /tmp/vacation-trek-verify.db --fixture features/fixtures/telegram-text-single-edit.json --json
node scripts/vacation-edit-pipeline.mjs --dry-run --json --fixture features/fixtures/telegram-text-single-edit.json
```

Surfaces in every fixture `surface` field: `telegram-text`, `telegram-voice`, `shared-page-voice`. The pipeline is shared: transcript or text → bounded parser → deterministic matcher → validated writes → per-item response.

Drive the mapped features from `features/README.md`. Sibling entry points for the same behavior all have to be proven before a receipt is complete.

## Evidence

The inspectable dry-run receipt an attacker can read from the repo is `features/proof/vac-verify-telegram-text-single-edit/` (`receipt.json`, `events.jsonl`, `dry-run.json`). Refresh it with `node scripts/control-vacation.mjs commit-proof` or `dry-run` of `telegram-text-single-edit`. Do not treat a gitignored `artifacts/` run as in-tree proof.

Scratch artifacts also land in `artifacts/vacation-verify/<job_id>/` and survive cleanup:

- `events.jsonl` — one JSON object per step (`initialize`, `lock_identity`, `parse`, `validate`, `copy_check`, `complete`)
- `dry-run.json` — full pipeline receipt
- `receipt.json` — compact verification receipt
- `before.json` / `after.json` — itinerary snapshots

Standards:

- Exercise the fixture path the user would use (Telegram text, Telegram voice, shared-page voice). Do not call internal TREK writers and call that done.
- Capture the action and the resulting planned write or explicit no-op, not only the reply string.
- Bare `--apply` is refused (exit 2). `--apply --local-snapshot` is labeled hold and is not product/TREK state. `--apply --trek-db` must move TREK place/assignment ids and keep the trip id-set/row-count stable for a move, or reject a split that would duplicate TREK rows.
- Dry-run skips Stripe, Telegram send, TREK SQLite, and network STT. Confirm skipped I/O by seeing no payment-intent calls and a local artifact dir only.
- No-match copy must be exactly `I heard "...", couldn't find a match, what do you mean?`
- Dry-run `customer_facing_response` must be the no-apply sentence when planned writes were not applied. Success copy (Moved/Removed naming old/new state) is only honest after `--apply` actually wrote.

Required later customer-run artifacts (named on every compact receipt, not produced here): whole-experience screenshot / customer-flow PDF, customer-story PDF with generated pictures, final keepsake PDF.

## Cleanup

Kill only Node processes this run started (the dry-run CLIs exit on their own). Do not `pkill` Telegram bots or Vite.

Remove scratch copies of fixture snapshots you created outside `artifacts/`. Never delete `artifacts/vacation-verify/<job_id>/`. After cleanup, confirm `events.jsonl` is still at the named path.

## Helpers

All helpers are executable and invoked as follows:

```bash
node scripts/control-vacation.mjs doctor
node scripts/control-vacation.mjs commit-proof
node scripts/control-vacation.mjs dry-run --all-fixtures --json
node scripts/control-vacation.mjs apply --local-snapshot --fixture features/fixtures/telegram-text-single-edit.json --json
node scripts/control-vacation.mjs apply --trek-db /tmp/vacation-trek-verify.db --fixture features/fixtures/telegram-text-single-edit.json --json
node scripts/control-vacation.mjs receipt --job-id vac-verify-telegram-text-single-edit
node scripts/vacation-edit-pipeline.mjs --dry-run --json --all-fixtures
node scripts/test_vacation_edit_pipeline.mjs
node scripts/test_vacation_trek_apply.mjs
node scripts/test_vacation_intake_pipeline_seam.mjs
```

`src/vacation/edit-pipeline.mjs` is the shared library. Live Telegram / shared-page intake calls `src/vacation/intake-edit-bridge.mjs`. Fixtures live in `features/fixtures/`. Original voice-note audio is real OggS under `features/fixtures/audio/` plus a sibling transcript.

## Stop rules

A dry-run receipt is green only when stop rules are `pass` or `hold`:

- no customer simulation
- no production billing
- no unvalidated writes
- stale-trip media fail-closed
- unauthorized / public-link / logged-out / unpaid-collaborator upload fail-closed from a second identity
- split-trip TREK uniqueness fail-closed (id-set and row-count, not a UI hash)
- multi-request voice fail-closed if a clause drops
- exact no-match copy
- prove TREK/backend state movement on `--apply --trek-db` (local-snapshot is hold)
- no first-pass creation language on existing-itinerary edits
- live intake must call the pipeline; empty Thing list / unmatched must fail closed and must not call applyTrekItineraryEdit
- fail-closed means no write and editApplied false
- media actors come from live session context; never hardcode canUpload:true
- FORCE/agent edit applies planned_writes only; no utterance re-parse
- Thing list is live-locked trip_things, not client payload.things
- Thing-scoped media fail-closes when thing_id is on another trip or missing from page context
- multi-intent no-apply heard joins every spoken clause, not intents[0] only
- staging_bypass is not entitlement proof and must not set canUpload
- customer_id alone is not owner/canEdit
- trek-* live files must not keep inferFallbackPlan / planWithGrok / extractQuotedAdds
- once the turn gate has planned_writes, do not queue a write worker and do not send Moved/Removed success copy (apply_not_on_turn)
- dry-run receipt customer_facing_response must use the same no-apply copy; do not store Moved/Removed when writes_applied is empty
- live TREK apply is a separate entry (queued first-pass worker or control-vacation --apply --trek-db / --local-snapshot), not the telegram turn
- doctor must see committed proofs at features/proof/vac-verify-telegram-text-single-edit/, vac-verify-thing-media-stale/, and vac-verify-thing-media-visible/
- doctor freshness is a live re-exec proof_digest match, not COMMITTED_PROOF_NOW stamp equality
- reviewer commands must run as GitHub Actions vacation-verify on the SHA; doctor binds harness + doctor-job + gate job success and the gate doctor.json digest via the GitHub API (marker digest is not doctor proof); Vercel deploy status is not that evidence
- fail_closed_thing_id fail-closes on thing_not_visible / thing_id_cross_trip even when write is null; it does not treat bound-trip stale_trip_media as a thing_id stop
- dry-run trees hold prove_state_movement; TREK apply is --apply --trek-db or worker first-pass
- events.jsonl appends one event per handoff and never overwrites

## Anti-patterns

- Starting a synthetic customer after Bot 0 before this lever has a passing dry-run receipt
- Feeding the parser only a day when the microphone was on a list page
- Letting Telegram and shared-page voice use different matcher orders
- Closing a Kim-class issue with reply-copy changes when itinerary state did not move
- Creating Grok bots, touching production billing, or auto-merging

Keep the map honest with `/maintain-verification-skill` as the product changes.
