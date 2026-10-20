# Host handback review source handoff (#567 / #569)

Authority: `bot-admin/requests/eggbot-host-supervisor-gapratchet-549-562-20261020-0200`,
item 10(c). Published policies were read using `gbrain skill tsv-manager --source default`
and `gbrain skill tsv-routine-budget --source default`, not frozen skill pages.
This is source for independent supervisor review; it is not live acceptance or installation.

The existing `host_handback_review.py` classifier remains unchanged. The tracked
`tsv_stall_alarm.py` now requires a `ReviewScan`, reads every relevant current object
before remediation, excludes handled/closed objects from generic actions and scoped
fix-claim/launch alarms, and keeps reviewer notifications in existing `bell_gate`.
Dry mode returns the scan decisions before any legacy logging, fix, ring or state write.
No adapter or any incomplete scan raises `EvidenceError` before generic fallback.
Actual notifications still require the host's existing serialized state ownership;
this handoff does not authorize installation or a notification-enabled invocation.

`host_handback_evidence.py` reads the canonical shared assessment and its referenced
GBrain receipts through the existing `dr_scorecard.read_page`. It authenticates the
host GitHub login and numeric ID using `GET /user`; it does not infer source authority
from a comment's signature or association. Each object and all its paginated comments
are fetched twice and bound to the classifier's snapshot. The newest assessment
section must be current (15 minutes), with one exact item row and an explicit owner.
Only dated entries in the shared Action record supply action times, independent of
head SHA; missing/unparseable action evidence is an error, not an empty budget.

Scoped process checks read the existing `lane-worker-jobs.json`, lane slot files,
`rereview-state.json` and `cursor-state.json`. Lane jobs need the actual PID, exact
lane/tag argv, matching worktree, stable process start identity and current head.
A boolean cloud flag or a stale Cursor entry cannot prove a running job. Unsupported
active cloud evidence is an error. The collector never scans host processes globally,
uses systemctl, calls a model, writes records or performs a privileged operation.

A handback requires its exact GitHub permalink in a currently referenced canonical
receipt, an authenticated host actor, and identical scoped receipt bytes. The strict
file verifier accepts an explicit absolute RECEIPT.md path and matching SHA256 in
that canonical receipt, bound to the item and full current head; it does not create
or backfill those records. Existing receipt formats without these bindings are
unsupported and raise an error. Edited events and newer comments without authenticated
resolution proof also stop the scan. Collection and canonical rereads must remain
within 60 seconds; concurrent assessment/receipt/object changes stop the scan.

## Evidence still required

The six supplied runtime modules do **not** identify the authenticated original
pending-acceptance event reader/schema or the guarded Craig receipt reader/path.
The default host reader deliberately raises `EvidenceError` for those boundaries.
No phrase-only acceptance, label-only Craig proof, new fabricated canonical record,
or guessed source actor was substituted. Host must supply/review those actual readers
before the complete current-object dry-run can meet the acceptance criterion.
The supplied assessment snapshot's newest section is 2026-10-20 12:14:33 UTC; that
snapshot is stale for a 17:00 UTC pass and cannot serve as current ownership proof.

## Outer-host proof command

Run this only on the independent supervisor's outer host, as the ordinary authorized
host user, after reviewing the source and providing the missing real readers:

```sh
python3 -B /home/ubishere9995/vk569-adapter-20261020-1000/source/scripts/ops/dispatch/host_handback_live_dryrun.py --runtime-root /home/ubishere9995/tsv-dispatch
```

This named `HOST-HANDBACK-LIVE-DRYRUN` loads the tracked alarm explicitly, imports
existing runtime GH/link readers, and wraps GH to refuse writes. Missing collector,
missing hook, no current objects or unsupported evidence fails the command. The
command prints source hashes and decisions only; the independent supervisor decides
acceptance. Do not run the ordinary alarm CLI or install anything as this proof.

The source alarm started from an older runtime preimage. Its bounded hook is tracked
without importing unrelated newer runtime changes. The job directory contains
`current-runtime-hook.patch` and `runtime-patch-hashes.json`, reviewed against the
supplied current alarm while preserving its additional ownership logic. That patch
is for isolated supervisor review only; never overwrite live runtime from this repo.

## Offline verification and classification

```sh
python3 -B -m unittest discover -s scripts/ops/dispatch -p 'test_host_handback*.py' -v
```

All three Python suites are **offline behavioral regressions**, with synthetic objects,
clocks and injected host readers: the original 24 classifier tests, the original 10
integration cases now targeting the applied tracked hook plus additional integration
boundaries, and collector/file/process boundary cases. No live host proof, app round,
Gate B round, notification or GitHub write runs in these tests. The root offline
manifest covers `scripts/test_*.mjs`; these Python suites are classified here.

`host_handback_review_offline.py` remains available for inspecting untrusted manifests.
Its output is offline classification only and cannot substitute for the outer-host
collector/proof command or authorize installation.
