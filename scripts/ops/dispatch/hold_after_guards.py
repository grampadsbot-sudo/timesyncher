"""Hold:after-<N> label blockers for idle_capacity extra_hold_removals (#685)."""
from __future__ import annotations

import re
from typing import Callable, Iterable, Mapping, MutableMapping, Sequence

IssueNum = int
Removal = tuple[str, str]
RefState = str

HOLD_AFTER_LABEL = re.compile(r"^hold:after-(\d+)$", re.I)
REPO_DEFAULT = "grampadsbot-sudo/timesyncher"


def parse_hold_after_issue(label_name: str, item_number: IssueNum) -> IssueNum | None:
    match = HOLD_AFTER_LABEL.match(str(label_name or "").strip())
    if not match:
        return None
    ref = int(match.group(1))
    if ref == int(item_number):
        return None
    return ref


def label_blocker_refs(label_names: Iterable[str], item_number: IssueNum) -> set[IssueNum]:
    out: set[IssueNum] = set()
    for name in label_names:
        ref = parse_hold_after_issue(name, item_number)
        if ref is not None:
            out.add(ref)
    return out


def ref_state(
    ref: IssueNum,
    open_map: Mapping | None,
    gh,
    pass_state: MutableMapping | None,
    repo: str,
) -> RefState:
    if open_map is not None:
        if ref in open_map:
            return "open" if open_map[ref].get("state", "open") == "open" else "closed"
        closed = (pass_state or {}).get("closed_issues") or {}
        if closed.get(str(ref)) == "closed":
            return "closed"
        return "unknown"
    try:
        state = gh.req("GET", "/repos/%s/issues/%d" % (repo, ref)).get("state")
    except Exception:
        return "unknown"
    if state == "closed":
        if pass_state is not None:
            pass_state.setdefault("closed_issues", {})[str(ref)] = "closed"
        return "closed"
    if state == "open":
        return "open"
    return "unknown"


def closed_blocker_removal_reason(label_name: str, closed_refs: Sequence[IssueNum]) -> str:
    match = HOLD_AFTER_LABEL.match(str(label_name or "").strip())
    label_ref = int(match.group(1)) if match else None
    if label_ref is not None and label_ref in closed_refs:
        return "blocker #%d closed or merged" % label_ref
    if closed_refs:
        return "blocker #%d closed or merged" % closed_refs[0]
    return "blocker closed or merged"


def extra_hold_removals(
    gh,
    item: Mapping,
    latest: str,
    now: float,
    *,
    dry: bool = False,
    workers=None,
    open_map=None,
    pass_state=None,
    hold_label_names: Callable[[Mapping], list[str]] | None = None,
    label_since: Callable | None = None,
    hold_renewed: Callable | None = None,
    hold_text: Callable[[str, str], str] | None = None,
    references: Callable[[str, IssueNum], tuple[set[IssueNum], set[str]]] | None = None,
    rescope_refs: Callable[[str], set[IssueNum]] | None = None,
    dr_post: Callable[[Mapping], bool] | None = None,
    running: Callable[[IssueNum, Sequence], bool] | None = None,
    stamp: Callable | None = None,
    utc: Callable[[float], str] | None = None,
    repo: str = REPO_DEFAULT,
    hold_max_s: float = 2 * 3600,
) -> list[Removal]:
    if (
        hold_label_names is None
        or label_since is None
        or hold_renewed is None
        or hold_text is None
        or references is None
        or rescope_refs is None
        or dr_post is None
        or running is None
        or stamp is None
        or utc is None
    ):
        raise RuntimeError("hold_after_guards.extra_hold_removals requires idle_capacity hooks")
    workers = workers or []
    labels = hold_label_names(item)
    if not labels:
        return []
    n = int(item["number"])
    body = item.get("body") or ""
    since = label_since(gh, n, set(labels), dry, item=item)
    out: list[Removal] = []
    for lab in labels:
        hold_since = since.get(lab, stamp(item.get("updated_at", utc(now))))
        hold_src = hold_text(body, latest)
        text = (body or "") + "\n" + (latest or "")
        refs, slugs = references(hold_src, n)
        label_ref = parse_hold_after_issue(lab, n)
        all_refs = set(refs)
        if label_ref is not None:
            all_refs.add(label_ref)
        label_gated = label_ref is not None
        has_bb = bool(re.search(r"\bblocked[- ]by\b", text, re.I))
        if not has_bb and not label_gated:
            if re.search(r"\bwaits[- ]on\s*:", text, re.I) or re.search(
                r"pending[- ]decision", text, re.I
            ):
                continue
            if not refs and not slugs:
                out.append((lab, "no named open blocker"))
            continue
        open_refs: list[IssueNum] = []
        unknown = False
        closed_refs: list[IssueNum] = []
        for ref in sorted(all_refs):
            state = ref_state(ref, open_map, gh, pass_state, repo)
            if state == "open":
                open_refs.append(ref)
            elif state == "unknown":
                unknown = True
            else:
                closed_refs.append(ref)
        if unknown:
            continue
        if all_refs and not open_refs and not slugs:
            pieces: set[IssueNum] = set()
            for ref in all_refs:
                try:
                    if open_map is not None and ref not in open_map:
                        blocker = {"body": ""}
                    else:
                        blocker = gh.req("GET", "/repos/%s/issues/%d" % (repo, ref))
                    pieces.update(rescope_refs(blocker.get("body") or ""))
                    if open_map is None or ref in open_map:
                        for c in gh.pages("/repos/%s/issues/%d/comments" % (repo, ref)):
                            if dr_post(c):
                                pieces.update(rescope_refs(c.get("body") or ""))
                except Exception:
                    pass
            if pieces and any(running(p, workers) for p in pieces):
                continue
            out.append((lab, closed_blocker_removal_reason(lab, closed_refs or list(all_refs))))
            continue
        if label_gated and label_ref is not None and label_ref in open_refs:
            continue
        if open_refs and now - hold_since < hold_max_s:
            continue
        if open_refs and hold_renewed(gh, n, hold_since, body, latest or ""):
            continue
        if open_refs:
            out.append((lab, "hold older than 2h without dr renewal"))
    return out
