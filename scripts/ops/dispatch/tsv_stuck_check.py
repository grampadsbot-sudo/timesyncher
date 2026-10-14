"""Zero-AI 'is anything stuck' check (dr eggbot, 2026-10-14, Craig OK 6:20 AM PT). Called at the end of every
tsv_dispatch.py run (10-min cron). No model calls. Craig sees each ring as one line in his existing Telegram PR feed (tell_craig, same as tsv_notify.py); FYI only.
STUCK rules (repo grampadsbot-sudo/timesyncher):
  A. open PR: head unchanged AND issue updated_at (comments/labels) older than 60 min, not labelled done/awaiting-craig-review
  B. hold label (hold:*, needs-dr-eggbot, status:stuck) on a PR/issue for > 60 min
  C. zero merges in the last 4 h while there are ready (open, non-draft, unheld) PRs
  D. issue status:ready + executor:* with no agent comment / linked PR within 60 min
On STUCK: `tincan ask claude-code --notify` (cheap lane, the managing dr Claude Code on the MacBook), one line.
Dr scorecard (skills/tsv-manager v1.8.0): a ring on an item with no PR/issue comment or label/state event since the previous ring is a miss.
Each miss appends a -2 logged-only event to the owning dr's section of bot-admin/lanes/dr-scorecard and prints `score: <dr> <total>`.
Three misses on one item escalate to dr eggbot via `tincan ask grokbot`, naming the dr. Unknown owner is recorded as dr `unknown`.
Same item still stuck after 3 h -> also one OpenClaw doorbell ring (kind vk-stuck, same webhook as escalation_bell.py).
Telegram feed lines go out on EVERY run while stuck (no dedup). Claude Code Tincan bell also rings every run while stuck (Craig 6:25 AM PT); dr eggbot OpenClaw doorbell 60 min after first detection, then at most hourly (Craig 6:28 AM PT) (state stuck-check-state.json). Silent when nothing stuck.
Report grouping (Craig 2026-10-14): one entry per job, joining a PR with its explicit owning issue; dependency mentions do not join jobs. Valid named future-phase pairs remain visible as PARKED and do not ring action bells. Tracker objects and launch/merge guards remain unchanged.
One log line per run: logs/stuck-YYYYMMDD.log.  Usage: python3 tsv_stuck_check.py [--dry-run]   Stop: touch STUCK_STOP"""
import datetime as dt, json, os, re, subprocess, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsv_common import GH, REPO, D, PT, load_json, save_json, scrub, tell_craig
from work_groups import consolidate
from dr_scorecard import ASSESS_SLUG, owner_of, read_page, record_miss, should_escalate
STATE = D + "/stuck-check-state.json"; SEC = D + "/.drEgg-doorbell.json"
QUIET_S = 60 * 60; HOLD_S = 60 * 60; MERGE_S = 4 * 3600; READY_S = 60 * 60; ESC_S = 60 * 60; ESC_EVERY = 60 * 60; RING_EVERY = 0; SCOPE_S = 7 * 86400; IDLE_S = 10 * 60
DONE = {"done", "awaiting-craig-review"}
def is_hold(l): return l.startswith("hold:") or l in ("needs-dr-eggbot", "status:stuck")
def iso(s): return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp()
def mins(s): return int(s // 60)
def hm(t): return dt.datetime.fromtimestamp(t, PT).strftime("%-m/%-d %-I:%M %p PT")
INFO = {}   # key -> {kind, age, why, last, labels, sha} for the Telegram copy-paste lines
def logline(m):
    os.makedirs(D + "/logs", exist_ok=True)
    open("%s/logs/stuck-%s.log" % (D, time.strftime("%Y%m%d")), "a").write(
        "[%s] %s\n" % (dt.datetime.now(PT).strftime("%Y-%m-%d %-I:%M %p PT"), scrub(m)))
def label_since(gh, n, labels):
    """Latest 'labeled' event time per label still on the item."""
    out = {}
    for e in gh.pages("/repos/%s/issues/%d/events" % (REPO, n)):
        if e.get("event") == "labeled" and e.get("label", {}).get("name") in labels:
            out[e["label"]["name"]] = iso(e["created_at"])
    return out
def is_flag(l): return l.startswith("hold:") or l.startswith("needs-") or l in ("status:stuck", "kickback")
def ci_fail_since(gh, sha):
    """Earliest completed_at of a failed check run on this head, or None."""
    try: runs = gh.req("GET", "/repos/%s/commits/%s/check-runs?per_page=100" % (REPO, sha)).get("check_runs", [])
    except Exception: return None, []
    bad = [r for r in runs if r.get("conclusion") in ("failure", "timed_out", "startup_failure") and r.get("completed_at")]
    return (min(iso(r["completed_at"]) for r in bad), sorted({r["name"] for r in bad})) if bad else (None, [])
def find(gh, st, now):
    """v2 (Craig 6:35 AM PT): no 60-min wait. One item per PR/issue; flagged at once if it has a flag label, failing CI,
    or no head/comment/label change since the previous run (>= 10 min). Age = time since the oldest condition began."""
    INFO.clear()
    items = []
    # v2.1 (Craig 6:38 AM PT): ALL open non-draft PRs regardless of age (no 7-day window), listed in full however many.
    # v2.3 (Craig 8:17 AM PT): drafts stay listed as PARKED; only merged/closed PRs leave the list.
    prs = gh.pages("/repos/%s/pulls?state=open" % REPO)
    heads = st.setdefault("heads", {})
    for p in prs:
        n = p["number"]; labs = {l["name"] for l in p["labels"]}; sha = p["head"]["sha"]
        if labs & DONE: continue
        h = heads.get(str(n))
        if not h or h["sha"] != sha:
            try: t0 = iso(gh.req("GET", "/repos/%s/commits/%s" % (REPO, sha))["commit"]["committer"]["date"])
            except Exception: t0 = now
            h = heads[str(n)] = {"sha": sha, "since": t0}
        upd = iso(p["updated_at"]); last_t = max(h["since"], upd)
        last = ("head push %s" % hm(h["since"])) if h["since"] >= upd else ("comment/label change %s" % hm(upd))
        conds = []   # (since, text)
        if p.get("draft"):
            pk = st.setdefault("parked", {}).get(str(n))
            if not pk or pk.get("upd") != p["updated_at"]:   # cached until the PR changes (keeps the run fast)
                ev = [e for e in gh.pages("/repos/%s/issues/%d/events" % (REPO, n)) if e.get("event") == "convert_to_draft"]
                ds = iso(ev[-1]["created_at"]) if ev else iso(p["created_at"])
                try:
                    cm = [c for c in gh.pages("/repos/%s/issues/%d/comments" % (REPO, n))
                          if (c.get("user") or {}).get("type") != "Bot" and not (c.get("body") or "").startswith("[vc]")]
                    why = re.sub(r"\s+", " ", cm[-1]["body"])[:140] if cm else ""
                except Exception: why = ""
                pk = st["parked"][str(n)] = {"upd": p["updated_at"], "ds": ds, "why": why}
            ds, why = pk["ds"], pk["why"]
            conds.append((ds, "PARKED (draft) since %s%s" % (hm(ds), ("; last comment: " + why) if why else "")))
        flags = sorted(l for l in labs if is_flag(l))
        if flags:
            since = label_since(gh, n, set(flags))
            for l in flags: conds.append((since.get(l, upd), l))
        cf, names = ci_fail_since(gh, sha)
        if cf: conds.append((cf, "CI failing (%s)" % ",".join(names[:3])))
        if now - last_t >= IDLE_S and not p.get("draft"): conds.append((last_t, "no change since last run"))
        if not conds: continue
        start = min(c[0] for c in conds)
        INFO["pr%d" % n] = {"kind": "PR", "draft": bool(p.get("draft")), "age": max(0, now - start), "why": "; ".join(c[1] for c in sorted(conds)), "last": last,
                           "labels": ",".join(sorted(labs)) or "none", "sha": sha[:7]}
        items.append(("pr%d" % n, n, "PR #%d %s" % (n, INFO["pr%d" % n]["why"])))
    for k in [k for k in heads if int(k) not in {p["number"] for p in prs}]: heads.pop(k)
    def linked_pr(n):
        for p in prs:
            txt = "%s %s" % (p.get("title") or "", p.get("body") or "")
            if re.search(r"#%d\b" % n, txt) or re.search(r"(^|\D)%d(\D|$)" % n, p["head"]["ref"]): return p["number"]
        return None
    # v2.4 (Craig 8:21 AM PT): ALL open project:tsv issues that are status:ready OR carry a flag label (superset of the morning check)
    issues = gh.pages("/repos/%s/issues?state=open&labels=project:tsv" % REPO)
    for i in issues:
        if "pull_request" in i: continue
        n = i["number"]; labs = {l["name"] for l in i["labels"]}
        if labs & DONE: continue
        if "status:ready" not in labs and not any(is_flag(l) for l in labs): continue
        upd = iso(i["updated_at"]); conds = []
        flags = sorted(l for l in labs if is_flag(l))
        if flags:
            since = label_since(gh, n, set(flags))
            for l in flags: conds.append((since.get(l, upd), l))
            wk = st.setdefault("waits", {}).get(str(n))
            if not wk or wk.get("upd") != i["updated_at"]:
                try:
                    cm = [c for c in gh.pages("/repos/%s/issues/%d/comments" % (REPO, n))
                          if (c.get("user") or {}).get("type") != "Bot" and not (c.get("body") or "").startswith("[vc]")]
                    w = re.sub(r"\s+", " ", cm[-1]["body"])[:140] if cm else ""
                except Exception: w = ""
                wk = st["waits"][str(n)] = {"upd": i["updated_at"], "w": w}
            if wk["w"]: conds.append((now, "waits on: " + wk["w"]))
        if "status:ready" not in labs: lp = None; ready = False
        else: lp = linked_pr(n); ready = True
        if lp:
            pi = INFO.get("pr%d" % lp)
            if not flags and not pi: continue        # its PR is moving: issue not stuck
            if not flags: conds.append((now - pi["age"], "handled by PR #%d, which is stuck" % lp))
        elif ready and now - upd >= IDLE_S: conds.append((upd, "no change since last run (ready, no PR yet)"))
        if not conds: continue
        start = min(c[0] for c in conds)
        INFO["is%d" % n] = {"kind": "issue", "age": max(0, now - start), "why": "; ".join(c[1] for c in sorted(conds)),
                           "last": "update %s" % hm(upd), "labels": ",".join(sorted(labs)), "sha": "-"}
        items.append(("is%d" % n, n, "issue #%d %s" % (n, INFO["is%d" % n]["why"])))
    return consolidate(items, INFO, prs, issues)
def short(key, n):
    """Copy-paste line: VK PR #N | stuck Xm | reason | last action + when | labels | head sha"""
    f = INFO[key]
    who = f.get("who") or ("VK repo" if f["kind"] == "repo" else "VK %s #%d" % (f["kind"], n))
    age = "PARKED" if f.get("parked_job") else "stuck %dm" % mins(f["age"])
    return " | ".join([who, age, f["why"], "last: " + f["last"], "labels: " + f["labels"], "head " + f["sha"]])
LIST_SLUG = "bot-admin/lanes/vk-stuck-list"
def write_list_page(items, now):
    """Current stuck list -> GBrain page via the local gbrain CLI (same as nightly_log.py). Never raises."""
    try:
        md = "# VK stuck list\n\nUpdated %s by Ubuntu tsv_stuck_check.py (zero-AI, every 10 min). Data only.\n\n" % hm(now)
        md += "\n".join("- " + short(k, n) for k, n, _ in items) if items else "Nothing stuck."
        r = subprocess.run([os.path.expanduser("~/.local/bin/gbrain"), "put", LIST_SLUG, "--source-id", "default", "--force"],
                           input=md + "\n", capture_output=True, text=True, timeout=120)
        return r.returncode
    except Exception as e: return type(e).__name__
def ring_claude(msg, dry):
    if dry: return "dry"
    try:
        r = subprocess.run(["tincan", "ask", "claude-code", "--notify", msg], capture_output=True, text=True, timeout=40)
        return "ok" if r.returncode == 0 else "rc%d" % r.returncode
    except Exception as e: return type(e).__name__
def ring_grok(msg, dry):
    if dry: return "dry"
    try:
        r = subprocess.run(["tincan", "ask", "grokbot", "--notify", msg], capture_output=True, text=True, timeout=40)
        return "ok" if r.returncode == 0 else "rc%d" % r.returncode
    except Exception as e: return type(e).__name__
ACTION_EVENTS = {"labeled", "unlabeled", "closed", "reopened", "merged", "ready_for_review", "convert_to_draft"}
def posted_since(gh, n, since):
    """True if PR/issue n got a comment or a label/state event after epoch `since`, i.e. the last ring was answered."""
    if any(iso(c["created_at"]) > since for c in gh.pages("/repos/%s/issues/%d/comments" % (REPO, n))): return True
    return any(e.get("event") in ACTION_EVENTS and iso(e["created_at"]) > since for e in gh.pages("/repos/%s/issues/%d/events" % (REPO, n)))
ASSESS = {}   # running-assessment text, read at most once per run and only when a miss needs an owner
def score_miss(key, n, s, now, gh):
    """Miss bookkeeping for a ring on an item that was rung before. Returns a 'score: <dr> <total>' piece, or None if answered."""
    if posted_since(gh, n, s["last_ring"]):
        s["misses"] = 0; return None
    s["misses"] = s.get("misses", 0) + 1
    if "text" not in ASSESS:
        try: ASSESS["text"] = read_page(ASSESS_SLUG)
        except Exception: ASSESS["text"] = ""
    dr = owner_of(n, ASSESS["text"])
    label = INFO[key].get("who") or ("PR #%d" % n if key.startswith("pr") else "issue #%d" % n)
    total = record_miss(dr, label, now)
    out = "score: %s %d" % (dr, total)
    if should_escalate(s["misses"]):
        res = ring_grok("[ubuntu stuck-check] spin escalation: %s has %d rings with no PR/issue post. Missed dr: %s (score %d). Name the one concrete action." % (label, s["misses"], dr, total), False)
        out += " escalated(%d misses)=%s" % (s["misses"], res)
    return out
def ring_openclaw(n, key, reason, dry, maxlen=300):
    if dry: return "dry"
    try:
        sec = json.load(open(SEC))
        body = {"kind": "vk-escalation", "pr": int(n), "label": key, "status_slug": LIST_SLUG, "reason": reason[:maxlen],
                "job_id": "vk-stuck-%s-%s" % (re.sub(r"\W", "-", key), time.strftime("%Y%m%d%H%M")),
                "created_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        r = urllib.request.Request(sec["webhookUrl"], data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + sec["webhookBearer"], "X-Automation-Key": sec["webhookBearer"]})
        try: return urllib.request.urlopen(r, timeout=8).status
        except urllib.error.HTTPError as e: return e.code
    except Exception as e: return type(e).__name__
def main():
    dry = "--dry-run" in sys.argv
    if os.path.exists(D + "/STUCK_STOP") and not dry: logline("STUCK_STOP present; skipped"); return
    try:
        st = load_json(STATE, {}); now = time.time(); gh = GH()
        items = find(gh, st, now)
        seen = st.setdefault("items", {}); rang = []; esc = []; tg = []; scores = []
        for key, n, reason in items:
            s = seen.setdefault(key, {"first": now, "last_ring": 0, "escalated": 0})
            tg.append(short(key, n))   # Telegram feed: every run, no dedup (Craig 6:24 AM PT)
            if not INFO[key].get("parked_job") and now - s["last_ring"] >= RING_EVERY:
                if not dry and s["last_ring"]:
                    try:
                        sc = score_miss(key, n, s, now, gh)
                        if sc: scores.append(sc)
                    except Exception as e: scores.append("%s score error %s" % (key, type(e).__name__))
                res = ring_claude("[ubuntu stuck-check] " + short(key, n) + ". Please unstick or say why it waits.", dry)
                rang.append("%s:%s" % (key, res))
                if not dry: s["last_ring"] = now
        # dr eggbot OpenClaw doorbell (Craig 6:39 AM PT): ONE ring per run listing every item stuck >= 60 min, at most once per hour total
        if not dry: write_list_page(items, now)
        old = [(k, n) for k, n, _ in items if INFO[k]["age"] >= ESC_S and not INFO[k].get("draft") and not INFO[k].get("parked_job")]
        if old and now - st.get("esc_last", 0) >= ESC_EVERY:
            body = "%d VK items stuck >= 60m: " % len(old) + " || ".join(short(k, n) for k, n in old)
            res = ring_openclaw(old[0][1], "stuck-list", body, dry, maxlen=4000)
            esc.append("list(%d):%s" % (len(old), res))
            if not dry: st["esc_last"] = now
        if tg:
            ok = tell_craig("VK stuck list %s\n" % dt.datetime.now(PT).strftime("%-I:%M %p PT") + "\n".join(tg), "tsv-stuck-%d" % int(now), dry=dry, log=lambda m: None)
            rang.append("telegram:%s" % ("dry" if dry else ok))
        live = {k for k, _, _ in items}
        for k in [k for k in seen if k not in live]: seen.pop(k)
        if not dry: save_json(STATE, st)
        parked_count = sum(bool(INFO[k].get("parked_job")) for k, _, _ in items)
        line = "%s jobs=%d stuck=%d parked=%d [%s] rang=[%s] escalated=[%s] %s" % ("DRY" if dry else "LIVE", len(items), len(items) - parked_count, parked_count,
               "; ".join(r for _, _, r in items), ", ".join(rang), ", ".join(esc), "; ".join(scores))
        logline(line)
        if dry: print(line); print("TELEGRAM would post:\nVK stuck list %s\n" % dt.datetime.now(PT).strftime("%-I:%M %p PT") + "\n".join(tg))
    except Exception as e:
        logline("error %s: %s" % (type(e).__name__, str(e)[:200]))
if __name__ == "__main__":
    main()
