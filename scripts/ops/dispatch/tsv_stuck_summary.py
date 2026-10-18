#!/usr/bin/env python3
"""tsv_stuck_summary.py: ONE morning Telegram (about 8:07 AM PT) listing TSV items stuck 24 h+ (Craig OK 2026-10-07 2:25 PM PT).
NO LLM, zero Grok Bot usage. Lists open project:tsv issues and PRs that are labelled status:stuck or kickback, or have had
no update for 24 h or more. Skips parked / do-not-merge items, and drafts older than 7 days unless labelled stuck/kickback.
Shows number, title, age and last event. Second line: per-dr scorecard totals from bot-admin/lanes/dr-scorecard (v1.8.0). Every morning sends three sections: 1 stuck (hold:* and superseded
excluded), 2 on hold (label, age, what it waits for), 3 open but superseded (to close). Empty sections read "none".
Cron runs at 15:07 and 16:07 UTC; the script only acts in the 8 AM PT hour (Ubuntu's clock is UTC; this covers PDT and PST).
  tsv_stuck_summary.py [--dry-run] [--any-hour]
Process page: GBrain bot-admin/process/tsv-issue-intake-when-grok-away."""
import datetime as dt, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsv_common import D, REPO, GH, Log, PT, tell_craig, load_json, save_json
from dr_scorecard import morning_line

DRY = "--dry-run" in sys.argv
STATE = D + "/stuck-summary-state.json"
SKIP = {"parked", "status:parked", "do-not-merge"}
FLAG = {"status:stuck", "kickback"}
RR = {}
log = Log("stuck-summary")

def age_txt(sec):
    h = sec / 3600
    return "%dh" % h if h < 48 else "%dd" % (h / 24)

def last_event(g, n):
    try:
        ev = g.req("GET", "/repos/%s/issues/%d/timeline?per_page=100" % (REPO, n), accept="application/vnd.github+json")
        ev = [e for e in ev if e.get("event") not in ("subscribed", "mentioned")]
        if ev:
            e = ev[-1]; kind = e.get("event") or "?"
            who = (e.get("actor") or e.get("user") or {}).get("login", "")
            if kind == "commented":
                first = ((e.get("body") or "").strip().splitlines() or [""])[0][:70]
                return "comment by %s: \"%s\"" % (who, first)
            if kind in ("labeled", "unlabeled"): return "%s %s" % (kind, (e.get("label") or {}).get("name", ""))
            return "%s%s" % (kind, (" by " + who) if who else "")
    except Exception as e: return "timeline unavailable (%s)" % str(e)[:60]
    return "-"

def hold_wait(g, n):
    """What a hold:* item waits for: the newest comment that mentions hold or wait, else the newest comment."""
    try:
        cs = g.pages("/repos/%s/issues/%d/comments?per_page=100" % (REPO, n))
        if not cs: return "no comment"
        pick = next((c for c in reversed(cs) if any(w in (c.get("body") or "").lower() for w in ("hold", "wait"))), cs[-1])
        return "\"%s\"" % ((pick.get("body") or "").strip().splitlines() or [""])[0][:70]
    except Exception as e: return "comments unavailable (%s)" % str(e)[:60]

def main():
    now = dt.datetime.now(PT)
    if now.hour != 8 and "--any-hour" not in sys.argv: return
    st = load_json(STATE, {})
    if st.get("last_day") == now.date().isoformat() and "--any-hour" not in sys.argv:
        log("already sent/checked today"); return
    global RR
    RR = load_json(D + "/rereview-state.json", {})
    g = GH(); rows = []; hold_rows = []; sup_rows = []
    items = g.pages("/repos/%s/issues?state=open&labels=project:tsv&sort=updated&direction=asc" % REPO)
    utc = dt.datetime.now(dt.timezone.utc)
    for i in items:
        labels = {l["name"] for l in i["labels"]}
        held = sorted(l for l in labels if l.startswith("hold:"))
        created = dt.datetime.fromisoformat(i["created_at"].replace("Z", "+00:00"))
        age = age_txt((utc - created).total_seconds())
        # Sections 2 and 3 always list these, whatever else the item carries
        if held: hold_rows.append("#%d %s (%s; age %s; waits: %s)" % (i["number"], i["title"][:70], ",".join(held), age, hold_wait(g, i["number"])))
        if "superseded" in labels: sup_rows.append("#%d %s (age %s; close it)" % (i["number"], i["title"][:70], age))
        if labels & SKIP: continue
        # Section 1 excludes hold:* and superseded items; closed issues are already excluded by state=open
        if "superseded" in labels or held: continue
        # Craig 3:24 PM PT: the Gate B re-review loop and its needs-dr-eggbot stops are dr eggbot's, not Craig's (nightly log only)
        if "needs-dr-eggbot" in labels: continue
        if (RR.get(str(i["number"])) or {}).get("active") and not (labels & {"status:stuck"}): continue
        is_pr = "pull_request" in i
        upd = dt.datetime.fromisoformat(i["updated_at"].replace("Z", "+00:00"))
        created = dt.datetime.fromisoformat(i["created_at"].replace("Z", "+00:00"))
        idle = (utc - upd).total_seconds()
        flagged = labels & FLAG
        if not flagged and idle < 86400: continue
        if is_pr and i.get("draft") and (utc - created).days > 7 and not flagged: continue
        if is_pr and "draft" not in i:
            try:
                if g.req("GET", "/repos/%s/pulls/%d" % (REPO, i["number"])).get("draft") and (utc - created).days > 7 and not flagged: continue
            except Exception: pass
        why = ",".join(sorted(flagged)) if flagged else "no update %s" % age_txt(idle)
        rows.append("%s#%d %s (%s; age %s; idle %s; last: %s)" % ("PR " if is_pr else "", i["number"], i["title"][:70], why,
                    age_txt((utc - created).total_seconds()), age_txt(idle), last_event(g, i["number"])))
    def section(title, lines):
        if not lines: return "%s: none" % title
        return "%s (%d):\n- " % (title, len(lines)) + "\n- ".join(lines[:25]) + ("\n(+%d more)" % (len(lines) - 25) if len(lines) > 25 else "")
    msg = "\n\n".join([
        "VK morning check (%s)" % now.strftime("%Y-%m-%d"),
        morning_line(),
        *(["#451 ops PR (Grok Build --pr wrapper, already live) is green and ready to merge"]
          if now.date().isoformat() == "2026-10-17" else []),
        section("1. Stuck / kickback / idle 24h+", rows),
        section("2. On hold", hold_rows),
        section("3. Open but superseded, to close", sup_rows),
    ]) + "\nhttps://github.com/%s/issues?q=is%%3Aopen+label%%3Aproject%%3Atsv+sort%%3Aupdated-asc" % REPO
    log("summary stuck=%d hold=%d superseded=%d" % (len(rows), len(hold_rows), len(sup_rows)))
    if tell_craig(msg, "tsv-stuck-%s" % now.strftime("%Y%m%d"), DRY, log) and not DRY:   # failed send retries at the 2nd cron slot
        st["last_day"] = now.date().isoformat(); st["last_count"] = len(rows); save_json(STATE, st)

if __name__ == "__main__":
    main()
