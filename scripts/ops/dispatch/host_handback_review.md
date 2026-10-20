# Host handback review source handoff (#567)

Authority: `bot-admin/requests/eggbot-host-supervisor-gapratchet-549-562-20261020-0200`,
item 10(c). Current policy must be read with `get_skill tsv-manager` and
`get_skill tsv-routine-budget`, source `default`; no frozen skill-page substitution.

`host_handback_review.py` is a deterministic helper. It requests host review/acceptance
through the existing `bell_gate.ring(..., "stuck_stall", ...)` managing-dr ladder,
never a coder requeue, forced Gate B, action-budget reset or guard grant.
Under-20-minute handbacks count as ownership; older handbacks become reviewer action
requests. Guarded Craig waits, actual running prerequisites and recent management
actions remain quiet. A plan is never running evidence. Existing holds remain holds.

**Not installed.** `tsv_stall_alarm.py` is the explicitly authorized first tracked
source of the exact supplied 265-line runtime preimage, SHA256
`59ea2c023e1cb20931810dac4873753fc4a00040d6ec176d80910847cf50de40`.
It intentionally remains byte-identical here. Its generic fix behavior is not claimed
repaired by merely tracking it. The proposed integration is in the job directory's
`host-handback-integration.patch`, tested against precisely that preimage. Source
lacks runtime `pr_issue_links`, `bell_gate` and the canonical action/process/receipt
readers. No replacement readers or runtime libraries were guessed or vendored.
This is the brief's authorized standalone-helper + job-local-patch fallback.

## Exact host integration hooks

1. Review source/helper, the supplied runtime preimage and the job-local integration
   patch. Check the preimage hash before applying the patch to an **isolated review
   checkout**, never directly to live runtime. Run the focused tests below.
2. Supply a real canonical `read_evidence(item, comments, now) -> Evidence` adapter
   and exact GitHub source login policy from host records. Neither an arbitrary
   comment's `dr:` text nor GitHub `author_association` grants authority.
   `handback_ids` must identify actual completed host-job handbacks for this current
   object/head, still unresolved; `acceptance_pending` must match the actual host
   acceptance record on this head. `acceptance_at` is its original event time;
   incidental GitHub updates must not restart its 20-minute clock. Do not make
   these proofs true by matching a phrase.
3. Read current ownership and the rolling-hour action record from
   `bot-admin/lanes/vk-running-assessment`. Its newest applicable section supersedes
   older sections. Evidence binds to `snapshot_key(item, comments)`, a checkable
   canonical reference, the named current owner, current item action identity, and
   a collection time no older than 60 seconds. `last_action_at=None` means the
   record was checked and has no action, never an unreadable record.
4. Verify guarded Craig review against the exact current head. `running_items`
   contains verified actual live item jobs only, with exact ownership and PID/job
   identity; planned/active flags and named-but-idle blockers are insufficient.
   The helper only follows explicit `blocked-by #N` / `waits-on #N` lines from exact
   trusted source actors. Existing `issue_pr_map` keeps explicitly covered issues
   out of standalone-issue remediation and preserves the owning PR's budget.
5. Under the host's existing serialized alarm/state ownership, create a **new**
   `ReviewScan(read_evidence, exact_source_logins)` for every pass. Invoke patched
   `tsv_stall_alarm.main(dry=True, review_scan=scan)` for acceptance first. The
   patch preflights objects before generic hold-release/fix paths, excludes every
   handled object, and flushes review requests only after a complete scan. Missing
   adapters/evidence fail closed, without a generic fix or fallback ring.
6. For a later approved runtime pass, persist `host-review-sent` in the existing
   alarm state under that same lock. Keep bell_gate's existing quota selection,
   managing-dr-first routing, delivery bundling, caps and retry state. Do not replay
   historical comments or bells. Reviewers must atomically claim the shared action
   budget before actual review/acceptance; a notification is no action grant.

Host must independently review/test and prove the live dry-run against exact current
objects, canonical records and receipts before any installation. A manifest is
untrusted offline input, not a permission or live-evidence attestation. No autonomous
installation, merge, deploy or real ring is part of this source handoff.

## Checks and offline command

From the source root:

```sh
python3 -B -m unittest discover -s scripts/ops/dispatch -p test_host_handback_review.py -v
```

Job-local harness, after independently reviewing the patch builder and patch:

```sh
python3 -B /home/ubishere9995/gpt-pass0453-watchdog/job/test_alarm_integration.py
```

Offline classification of a host-collected manifest, with the collection UTC epoch:

```sh
python3 -B scripts/ops/dispatch/host_handback_review_offline.py /path/to/current-manifest.json --now COLLECTION_EPOCH
```

Manifest schema 1: `trusted_actors` (exact canonical GH logins), `sent` (optional
persisted fingerprint map), `objects` (each has raw current `item`, `comments`, and
all `Evidence` fields; sets serialized as integer arrays). Use exact source timestamps
and snapshots; do not synthesize live objects or evidence to make an example pass.
The offline command never reads GH, notifies, writes state or proves live readiness.
