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
The published `Current manager pass` heading is recognized alongside the existing
`Current pass` and `Managing-dr pass` headings. A `job | owner | ...` table supplies
each item's owner, including grouped `#N/#M` rows; mentions in evidence cells do
not supply ownership. Missing, duplicate or malformed owner cells stop collection.
Legacy tables without an owner column retain their unique explicit Owner prose rule.
Only dated entries in the shared Action record supply action times, independent of
head SHA; missing/unparseable action evidence is an error, not an empty budget.

Scoped process checks read the existing `lane-worker-jobs.json`, lane slot files,
`rereview-state.json` and `cursor-state.json`. Manual lane jobs bind through
`lane-worker-jobs.json`. Automatic `vkfill-N` jobs launched by `lane_autofill.py`
authenticate from the live `vk-lane-run.sh` argv (lane, job dir, tag, worktree),
`~/tsv-work/vkfill-*-job/{worktree,fingerprint}.txt`, slot `started=`, PID cwd,
stable starttime, and an authenticated read-only GitHub item lookup. PR fingerprints must
match the canonical PR head and exact launch-brief start commit. Issue fingerprints
are canonical issue `updated_at` timestamps; their launch brief must name the exact
issue and configured base, and the start commit must match the initial worktree HEAD
reflog and a GitHub-authenticated ancestor of that base. This supports a moving base
without rebinding the launch SHA. The implicit base mirrors the launcher
(`cursor/jev-quality-r20-1128`) for identity only and grants no merge authority.
The canonical argv brief path, runner source and exact job-number boundary are
checked; `vkfill-5690` cannot bind `vkfill-569`. Slot started time must fall within
120 seconds of the same live process start (the bounded host preflight), using
Linux boot time and clock ticks. Unknown GitHub sources and all mismatches refuse.
Unknown slot tags still fail closed before process reads. Lane jobs need the actual
PID, exact lane/tag argv, matching worktree, stable process start identity and current head.
An active `rereview-state.json` cloud flag or a non-finished `cursor-state.json`
entry is authenticated read-only through the Cursor Cloud Agents API (same key route
as `cursor_launch` / `idle_capacity`): the authenticated agent `latestRunId` is the
authoritative newest run; a stored follow-up run that differs must reconcile explicitly
(terminal stored run, then evaluate latest). Live `RUNNING`/`CREATING` on latest counts
as running; terminal `FINISHED`/`IDLE`/etc. on latest is an honest not-running result.
Run head proof uses API commit bytes only, not local `fixit_sha`. Missing bindings,
API failure, identity mismatch, unknown status, stale stored run still live, or a live
run whose head disagrees with the current GitHub head fail closed. The collector never scans host
processes globally,
uses systemctl, calls a model, writes records or performs a privileged operation.

A handback requires its exact GitHub permalink in a currently referenced canonical
receipt, an authenticated host actor, and identical scoped receipt bytes. The strict
file verifier accepts an explicit absolute RECEIPT.md path and matching SHA256 in
that canonical receipt, bound to the item and full current head; it does not create
or backfill those records. Existing receipt formats without these bindings are
unsupported and raise an error. Edited events and newer comments without authenticated
resolution proof also stop the scan. Collection and canonical rereads must remain
within 60 seconds; concurrent assessment/receipt/object changes stop the scan.

## Guarded Craig look-send reader

`HostReaders.guarded_craig` authenticates the original dispatcher `look_request`
contract: `state.json` `look[N]` is written only after `rc=0`, `RESULT ok`, and
delivered `media` equals the chosen image count. The reader requires that record on
the exact current full head, consistent `sent_at`/`sent_ms`/`tag`/`media`, and
exactly one matching `logs/dispatch-YYYYMMDD.log` line with `rc=0`,
`RESULT ok`, `in_history=yes`, and the same `media` count at the original event
time. A missing look entry for the current head returns `False`; malformed state,
missing log proof, failed delivery, or ambiguous matches raise `EvidenceError`.
GBrain narrative, `needs-craig` alone, and assessment prose are not proof.

## Evidence still required

Source now includes an explicit pending-acceptance record/reader in
`host_handback_events.py` (draft body digest, receipt binding, version 2 observation
clock) wired through `HostReaders.acceptance_event_*` and `CanonicalCollector`. Runtime
installation and host dry-run remain separate. No phrase-only acceptance, label-only Craig proof,
new fabricated canonical record, or guessed source actor was substituted. Host must
supply/review that actual reader before the complete current-object dry-run can meet
the acceptance criterion.
The earlier diagnosis that 12:14:33 UTC was the newest canonical section was a parser
error: it skipped `Current manager pass`. The canonical read on October 20 at about
17:34 UTC starts with a 09:59 PT section and a per-row owner table. That section is
also stale for this pass; recognizing its format does not refresh its event time.

## Canonical schema inventory (#567 / #569 continuation)

Published `get_skill tsv-manager` requires PR, owner, last action/time, next decision/
deadline and source evidence in `bot-admin/lanes/vk-running-assessment`. It does not
require a globally unique Owner sentence. The existing GBrain CLI/default route
returned the actual table; independent host receipt
`bot-admin/receipts/gpt-manager-pass-20261020-1031` also identifies the heading/owner
parser fault. Only that demonstrated heading/table correction is implemented here.
Regression values are synthetic; no canonical page content is a test fixture.

| Actual source pointer | Observed format / remaining reader evidence |
|---|---|
| `bot-admin/lanes/vk-running-assessment`, `Current manager pass — 2026-10-20 09:59 PT` | `job`, `owner`, `last action/evidence PT`, `next action/deadline PT`; different owners per grouped row. No receipt wikilink in this current section. The collector's required receipt source therefore remains unavailable even if freshness were established. No historical link is borrowed. |
| `bot-admin/receipts/gpt-manager-pass-20261020-1031` | Narrative source review, full publication SHA, abbreviated comment IDs and next host deadline. Page metadata says `trust_tier: agent_written`, `source_kind: mcp:put_page`. These are not an authenticated GH actor identity, a hash of worker receipt bytes or a machine event-resolution contract. |
| [#567 handback comment 6296654317](https://github.com/grampadsbot-sudo/timesyncher/issues/567#issuecomment-6296654317) | Original created/updated time 17:11:24Z; short artifact-directory pointer, owner and review request. It is not the worker RECEIPT.md body and does not contain its byte hash. Public API actor is `grampadsbot-sudo`, numeric ID 259964401; host still must authenticate its identity through the existing reader. |
| [#569 review comment 6297082727](https://github.com/grampadsbot-sudo/timesyncher/pull/569#issuecomment-6297082727) | Original created/updated time 17:33:10Z; independent live acceptance failed, source preparation continues, next review 11:10 PT. This is the traceable unresolved review source, not a new acceptance event. It does not match the classifier's standalone `host review required` grammar. No classifier expansion is included. |
| `bot-admin/receipts/gpt-manager-pass-20261020-0453`; [#565 comment 6290584774](https://github.com/grampadsbot-sudo/timesyncher/pull/565#issuecomment-6290584774) | Narrative acceptance evidence and next decision, using abbreviated heads and artifact paths. The public PR is now closed/merged; its historical draft/body is not a current pending-acceptance event. An original authenticated pending event with an explicit current-head binding and resolution semantics is still not found. Body `updated_at` cannot substitute for that event. |
| `bot-admin/receipts/gpt-manager-pass-20261020-0233`, #560 entry | Reports guarded relay at 09:37:04Z, rc0, in_history yes, media6, head98e7e124. This traces the review claim but does not supply the actual guarded send receipt path/schema or full-head/media/delivery binding. The supplied runtime `tsv_guard.py:escalate` stores only `escalated.at/why`; its escalation message is not screenshot review proof. `needs-craig` remains insufficient. |

The receipt-file hash/full-head/comment-equality checks are stricter than these
observed records. They remain refusal boundaries in this patch because receipt
authentication is out of scope. Do not fabricate hashes, expand abbreviated heads
from guesses, edit old comments/pages, or treat planned work as a live process to
make the scan succeed. The smallest subsequent adapter work needs the host's actual
authenticated event/receipt and guarded-send contracts, with explicit resolution
semantics, before replacing those assumptions. Unsupported original acceptance,
guarded review and remote running-job formats still raise `EvidenceError`.

## Host-review resolution records (#569 continuation)

When a registered handoff event authenticates an older host comment and a newer host
actor comment exists, `CanonicalCollector` requires an explicit resolution record
(`handback_comment_id`, `resolve_comment_id`, resolve body digest, receipt binding)
via `HostReaders.resolution_event_*`. Resolution registration time does not rewrite
pending-acceptance `event_at` used for the 20-minute review-age clock.

`CANONICAL-HANDBACK-SCHEMA` requires independent host verification of the actual
current section/row owners, stale/future/missing/ambiguous refusals and traceable
unresolved review source. Offline schema regressions alone do not meet that check.
`HOST-HANDBACK-LIVE-DRYRUN` and installation remain NOT RUN by this worker.

## Host-recorded event producer (source only, #569)

`host_handback_events.py` plus `host_handback_events.md` define an explicit version-1
producer/reader for **new** `HOST_HANDOFF.json` records (head, receipt path+hash, GH
actor id, comment id, body digest, `pending`/`reviewed`). Legacy `at`/`message`/
`receipt_exists` files are refused. The collector and alarm are unchanged in this round;
wiring that reader into `CanonicalCollector` is follow-on host work.

## Zero-model host observation (`host_handback_observation.py`)

When the published Current-pass header is older than 900 seconds, `current_section`
still refuses unless `host-handback-entrypoint.json` names a scoped
`host_observation_path` JSON artifact. The outer host produces that file with
`produce_observation(...)` after live reads of assessment/receipt bytes, GitHub
heads, and `runtime_root`. `CanonicalCollector` verifies freshness (900s),
assessment/receipt digests, immutable `section_event_at`, and per-item owner/head
bindings. Management `last_action_at` and host event clocks are unchanged.

Outer-host producer (after live reads; path under `/home/ubishere9995/tsv-work/...`):

```sh
PYTHONPATH=/path/to/source/scripts/ops/dispatch python3 - <<'PY'
from host_handback_observation import produce_observation
# supply assessment_text, receipt_pages dict, items list [(n, owner, head), ...], runtime_root
produce_observation("/home/ubishere9995/tsv-work/.../HOST_OBSERVATION.json", ...)
PY
```

Alarm dry-run with observation configured:

```sh
PYTHONPATH=/home/ubishere9995/tsv-dispatch python3 -B scripts/ops/dispatch/tsv_stall_alarm.py --dry
```

(`host-handback-entrypoint.json` must include `host_observation_path` when the
assessment header is stale.)

## Stall-alarm entrypoint config (`host-handback-entrypoint.json`)

The tracked `tsv_stall_alarm.py` CLI loads `host_handback_entrypoint.py` on every
invocation. The runtime root (`tsv_common.D`, usually `~/tsv-dispatch`) must contain
`host-handback-entrypoint.json` with `version: 1` and explicit scoped event paths.
Per-item maps (`handback_event_paths`, `acceptance_event_paths`,
`resolution_event_paths`) or directory roots (`handback_event_root`, etc.) match
`HostReaders` in `host_handback_evidence.py`. Paths must be absolute under
`/home/ubishere9995/tsv-work/...` or `/home/ubishere9995/gpt-.../...`. Missing,
malformed or empty config raises `EvidenceError` before GitHub scan or generic retry.
`--dry` wraps GitHub in a read-only adapter, runs `CanonicalCollector`, prints scan
decisions, and skips legacy fix, ring and state writes. `--handback-config` overrides
the default file path for tests only.

## Outer-host proof command

Run this only on the independent supervisor's outer host, as the ordinary authorized
host user, after reviewing the source and providing the missing real readers:

```sh
PYTHONPATH=/home/ubishere9995/tsv-dispatch python3 -B scripts/ops/dispatch/tsv_stall_alarm.py --dry
```

Named alternate proof (same collector wiring, explicit source tree):

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
