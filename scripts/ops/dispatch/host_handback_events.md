# Host handback events (`host_handback_events.py`)

Bounded producer/reader for **new** host-recorded handback events (#567 / #569). This
module is source-only in this round: it is **not** wired into `host_handback_evidence.py`,
`tsv_stall_alarm.py`, or live dispatch.

## Record schema (version 1)

| Field | Meaning |
|---|---|
| `version` | Always `1` for this schema |
| `item` | GitHub issue/PR number |
| `head` | Full 40-character current head SHA at event time |
| `event_at` | Unix timestamp when the host recorded the event |
| `state` | `pending` or `reviewed` |
| `receipt_path` | Absolute scoped `RECEIPT.md` under `/home/ubishere9995/tsv-work/...` or `/home/ubishere9995/gpt-.../...` |
| `receipt_sha256` | SHA-256 of receipt file bytes at record time |
| `gh_actor_id` | Numeric GitHub user id of the host comment author |
| `comment_id` | Exact issue/PR comment id |
| `comment_body_sha256` | SHA-256 of the exact comment body bytes (need not equal receipt bytes) |

Legacy `HOST_HANDOFF.json` shapes (`at` / `message` / `receipt_exists` only) are
**refused**. No backfill or silent upgrade.

## API

- `produce_event(path, ...)` — validate bindings, refuse overwrite, atomic JSON write.
- `load_event(path)` — parse and structural-check; refuse legacy.
- `verify_event(record, comment, current_head, now=...)` — re-read receipt bytes and
  match comment issue URL/item, id, actor id, body digest, head, and timestamps (`created_at` must equal
  `updated_at`). Events older than 900 seconds fail closed; callers may narrow that window.
- `verify_receipt_binding(record)` / `verify_comment_binding(record, comment)` — split checks.

## Unresolved (not implemented here)

Transition from `pending` to `reviewed` and how that feeds `host_handback_review.classify`
acceptance vs host-review events remain for a follow-on adapter. This slice only supplies
explicit storage and fail-closed verification.

## Example outer-host call

After the host posts the GitHub comment and writes `RECEIPT.md`, record the event with
explicit fields (no model, no inference):

```sh
python3 -B <<'PY'
import time
from pathlib import Path
import hashlib
from host_handback_events import produce_event, load_event, verify_event

receipt = Path("/home/ubishere9995/tsv-work/manager569-20261020-1640/job/RECEIPT.md")
receipt_bytes = receipt.read_bytes()
receipt_sha = hashlib.sha256(receipt_bytes).hexdigest()
comment_body = """…exact GH comment body…"""

produce_event(
    "/home/ubishere9995/tsv-work/manager569-20261020-1640/job/HOST_HANDOFF.json",
    item=569,
    head="04d05a0445ed4b94f7115c0bd6d5fc5782fae4d8",
    event_at=time.time(),
    state="pending",
    receipt_path=str(receipt),
    receipt_sha256=receipt_sha,
    gh_actor_id=259964401,
    comment_id=6297082727,
    comment_body=comment_body,
)

record = load_event("/home/ubishere9995/tsv-work/manager569-20261020-1640/job/HOST_HANDOFF.json")
verify_event(
    record,
    {
        "id": 6297082727,
        "user": {"id": 259964401},
        "issue_url": "https://api.github.com/repos/grampadsbot-sudo/timesyncher/issues/569",
        "body": comment_body,
        "created_at": "2026-10-20T17:33:10Z",
        "updated_at": "2026-10-20T17:33:10Z",
    },
    current_head="04d05a0445ed4b94f7115c0bd6d5fc5782fae4d8",
)
PY
```

Run from `scripts/ops/dispatch` with `PYTHONPATH=.` or as part of host tooling that
imports the module from the published tree.
