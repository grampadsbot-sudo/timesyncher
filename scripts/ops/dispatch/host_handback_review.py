"""HOST-HANDBACK-REVIEW (#567; bot-admin/requests/eggbot-host-supervisor-gapratchet-549-562-20261020-0200 item 10(c)).

A host handback is either the newest host comment saying `host review required`, or a host-authored draft PR whose
body says acceptance is `NOT RUN`. When the stall alarm sees one unchanged for 20 minutes it routes ONE managing-dr
acceptance action through bell_gate (stuck_stall ladder: managing dr first). It is never a coder, lane or Gate B retry.
A needs-craig hold stays with the needs-craig watchdog. Only a live lane process owns the item; a planned launch,
requeue token or recorded cloud follow-up flag is a plan, not a running job. One ring per handback fingerprint and at
most one per item per rolling hour. No I/O here except the injected ring."""
import hashlib
import re

HOST_LOGINS = frozenset({"grampadsbot-sudo"})
BUDGET_S = 60 * 60
HOST_REVIEW_RE = re.compile(r"(?<![\w-])(?<!no )(?<!not )host review required\b", re.I)
ACCEPT_RE = re.compile(r"\bacceptance\b[^\n]{0,40}?\bNOT RUN\b", re.I)


def _login(obj):
    return ((obj or {}).get("user") or {}).get("login")


def handback_event(item, comments):
    """Current host handback on an open PR or issue, or None. A newer host comment without the marker supersedes it."""
    host = [c for c in comments or [] if _login(c) in HOST_LOGINS]
    newest = max(host, key=lambda c: (c.get("created_at") or "", c.get("id") or 0), default=None)
    if newest and HOST_REVIEW_RE.search(newest.get("body") or ""):
        return {"kind": "host-review", "source": "comment %s" % newest.get("id"),
                "url": newest.get("html_url") or item.get("html_url") or ""}
    if item.get("draft") is True and _login(item) in HOST_LOGINS and ACCEPT_RE.search(item.get("body") or ""):
        return {"kind": "host-acceptance", "source": "draft head %s" % ((item.get("head") or {}).get("sha") or "")[:12],
                "url": item.get("html_url") or ""}
    return None


def fingerprint(n, head, ev):
    return hashlib.sha256(("%d|%s|%s|%s" % (n, head or "", ev["kind"], ev["source"])).encode()).hexdigest()[:16]


def route(n, ev, head, labels, running, last, now, ring, dry=False):
    """Returns (what was done, settled, new review record or None). settled=False means look again next pass."""
    fp = fingerprint(n, head, ev)
    if "needs-craig" in labels:
        return "host handback on needs-craig hold: the needs-craig watchdog owns it; no review ring, no retry", True, None
    if running:
        return "host handback owned by a live lane process; no review ring, no retry", False, None
    if last and last.get("fp") == fp:
        return "host review already routed for %s; no repeat, no retry" % fp, True, None
    if last and now - float(last.get("at") or 0) < BUDGET_S:
        return ("hourly action budget: host review for #%d routed %d min ago; waits, no retry"
                % (n, (now - float(last["at"])) // 60)), False, None
    msg = ("HOST-HANDBACK-REVIEW #%d %s head %s: %s (%s) unchanged 20+ min. Managing dr: claim the action, run the "
           "host acceptance or review the handback receipt, and post the verdict. Not a coder, lane or Gate B retry; "
           "holds and the hourly action budget stand." % (n, ev["url"], (head or "-")[:8], ev["kind"], ev["source"]))
    if dry:
        return "DRY would route to managing dr: " + msg, True, None
    try:
        rc = ring("stall-alarm", msg, "stuck_stall", meta={"item_key": "host-review:%d" % n, "item_state": fp})
    except Exception as ex:
        return "host review ring failed (%s); retry next pass, no coder/Gate B fallback" % type(ex).__name__, False, None
    return "host review routed to managing dr via bell_gate (%s)" % rc, True, {"at": now, "fp": fp, "rc": str(rc)}
