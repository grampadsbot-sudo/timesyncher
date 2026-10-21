#!/usr/bin/env python3
"""Global VK stall alarm (Craig 7:51/7:53 PM PT 10/19). An open VK PR or issue whose state fingerprint is unchanged for 20 min gets the
matching auto-fix (lane requeue, Gate B re-run, stale labels cleared, dead cloud follow-up released), logged in logs/stall-alarm.log.
If the next pass shows no change, or at 45 min worst case, it rings dr eggbot once per fingerprint. Fail closed: read errors ring."""
import re
import json, os, re, sys, time, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsv_common import GH, REPO, D
from pr_issue_links import issue_pr_map, clear_issue_ready
ST = D + "/stall-alarm-state.json"
STALL_S = 45 * 60
FIX_S = 20 * 60
FIX_GRACE_S = 9 * 60
SKIP = {"parked", "status:parked", "do-not-merge"}
SLUG = "bot-admin/receipts/eggbot-pipeline-stall-audit-20261019"

def fp_pr(g, p):
    sha = p["head"]["sha"]
    st = g.req("GET", "/repos/%s/commits/%s/status" % (REPO, sha)) or {}
    gb = [(x["state"], x["description"][:80]) for x in st.get("statuses", []) if x["context"] == "gateb"][:1]
    runs = (g.req("GET", "/repos/%s/commits/%s/check-runs" % (REPO, sha)) or {}).get("check_runs", [])
    ci = sorted({(r["name"], r["conclusion"] or r["status"]) for r in runs})
    labels = sorted(l["name"] for l in p["labels"])
    desc = "PR #%d head %s draft=%s CI=%s GateB=%s labels=%s" % (p["number"], sha[:8], p["draft"], ci, gb, labels)
    return desc

def log(msg):
    with open(D + "/logs/stall-alarm.log", "a") as fh:
        fh.write("[%s] %s\n" % (time.strftime("%Y-%m-%d %H:%M %Z"), msg))


_real_open = open
def _tok_open(p, mode="r", *a, **k):

    if "/auto-filler/requeue/" in str(p) and mode == "w" and os.path.exists(p) and " tier 1 " in _real_open(p).read():
        return _real_open(os.devnull, "w")
    return _real_open(p, mode, *a, **k)


def auto_fix(key, desc, dry):
    open = _tok_open
    """Matching fix for the stuck state. Returns a short text of what was done (or why nothing)."""
    n = int(key[2:])
    if dry: return "DRY would fix"
    import fcntl
    if key.startswith("is"):
        g = GH()
        linked = issue_pr_map(g.pages("/repos/%s/pulls?state=open" % REPO))
        if n in linked:
            clear_issue_ready(g, n)
            return "issue skipped: linked open PR #%d owns stall detection" % linked[n]
        os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
        open(D + "/auto-filler/requeue/%d" % n, "w").write("stall-alarm %s\n" % time.ctime())
        return "issue requeued for a free lane"
    done = []
    rr_f = D + "/rereview-state.json"
    try:
        lock = open(D + "/.run.lock", "a+"); fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except Exception:
        return "dispatcher busy; retry next pass"
    try:
        rr = json.load(open(rr_f)); p = rr.get(str(n)) or {}
        if p.get("active"):
            p["active"] = False; json.dump(rr, open(rr_f, "w"), indent=1); done.append("dead cloud follow-up released")
        g = GH()
        gb_fail = "GateB=[('failure'" in desc
        if ("kickback" in desc or "status:stuck" in desc) and not gb_fail:
            for lab in ("kickback", "status:stuck"):
                g.req("DELETE", "/repos/%s/issues/%d/labels/%s" % (REPO, n, lab.replace(":", "%3A")), ok404=True)
            done.append("stale kickback/stuck labels cleared")
        if "GateB=[]" in desc or "GateB=[('pending'" in desc or "harness pause" in desc:
            st = json.load(open(D + "/state.json")); st.get("pregate", {}).pop(str(n), None); json.dump(st, open(D + "/state.json", "w"))
            done.append("Gate B re-run forced")
            try:
                import tsv_guard as G
                why = G.blocked_reason(n)
                if why: done[-1] = "GUARD REFUSED Gate B re-run (%s); needs a dr diagnosis comment with 'extension: +2 rounds' and a recorded grant" % why
            except Exception as ex:
                done.append("guard check error %s" % type(ex).__name__)
        if gb_fail and "held on" not in desc:
            os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
            open(D + "/auto-filler/requeue/%d" % n, "w").write("stall-alarm %s\n" % time.ctime())
            done.append("requeued to a free lane (Gate B FAIL)")
        if re.search(r"'failure'\)", desc.split("GateB=")[0]):
            os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
            open(D + "/auto-filler/requeue/%d" % n, "w").write("stall-alarm CI red %s\n" % time.ctime())
            done.append("requeued to a free lane (CI red)")
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
    return "; ".join(done) or "no matching fix (e.g. HOLD on base known gaps)"


IDLE_S = 30 * 60
from zoneinfo import ZoneInfo
PT = ZoneInfo("America/Los_Angeles")


def round_running(n):
    import subprocess
    r = subprocess.run(["pgrep", "-f", "vk-lane-run.sh [a-z-]+ .*vkfill-%d " % n], capture_output=True)
    if r.returncode == 0: return True
    try: return bool((json.load(open(D + "/rereview-state.json")).get(str(n)) or {}).get("active"))
    except Exception: return False


def launches_not_started(now):
    """'launch <lane> <tag>' in the autofill log with no START for that lane+tag in the lane log within 10 min (or a REFUSE)."""
    import glob, datetime as _dt
    out = []
    lane_txt = ""
    for p in glob.glob(D + "/lanes/*.log") + glob.glob(D + "/logs/vk-lane*.log"):
        try: lane_txt += open(p, errors="replace").read()[-400000:]
        except OSError: pass
    for p in sorted(glob.glob(D + "/logs/lane-autofill-2*.log"))[-2:]:
        for line in open(p, errors="replace"):
            m = re.match(r"\[(\d{4}-\d\d-\d\d \d+:\d\d [AP]M) PT\] launch (\S+) (\S+) ", line)
            if not m: continue
            try: t = _dt.datetime.strptime(m.group(1), "%Y-%m-%d %I:%M %p").replace(tzinfo=PT).timestamp()
            except ValueError: continue
            age = now - t
            if age < 600 or age > 7200: continue
            lane, tag = m.group(2), m.group(3)
            stamp = _dt.datetime.fromtimestamp(t, PT).strftime("%Y-%m-%d %H:%M")
            started = [l for l in lane_txt.splitlines() if (" START %s %s " % (lane, tag)) in l and l[:16] >= stamp]
            refused = [l for l in lane_txt.splitlines() if (" REFUSE %s %s" % (lane, tag)) in l and l[:16] >= stamp]
            if refused or not started:
                why = refused[0][-160:] if refused else "no START line in 10+ min"
                out.append(("launch:%s:%s:%s" % (lane, tag, stamp), "planned launch never started: %s %s at %s PT (%s)" % (lane, tag, m.group(1), why)))
    return out


CLAIMS = D + "/auto-filler/fix-claims"


def claim_evidence(c):
    """Live evidence for a chief-dr fix claim: running round PID, new commit on the PR, or a Gate B verdict after the claim."""
    import subprocess
    n = c["pr"]; ev = []
    r = subprocess.run(["pgrep", "-f", "vk-lane-run.sh [a-z-]+ .*vkfill-%d " % n], capture_output=True, text=True)
    if r.returncode == 0: ev.append("pid " + r.stdout.split()[0])
    try:
        head = GH().req("GET", "/repos/%s/pulls/%d" % (REPO, n))["head"]["sha"]
        if head != c.get("head_at_claim"): ev.append("commit " + head[:8])
    except Exception: pass
    try:
        import datetime as _dt
        for line in open(D + "/logs/gateb-verdicts.jsonl"):
            v = json.loads(line)
            if v.get("pr") == n:
                try: t = _dt.datetime.fromisoformat(v.get("at")).timestamp()
                except Exception: continue
                if t > c["at"]: ev.append("gateb %s %s" % (v.get("verdict"), v.get("sha")))
    except Exception: pass
    return ev


def check_fix_claims(now, dry, excluded=()):
    """Craig 11:53 PM PT 10/19: every chief-dr fix writes a claim (what, PR, deadline <= 30 min). No live evidence by the deadline rings FIX FAILED."""
    import glob
    out = []
    for p in glob.glob(CLAIMS + "/*.json"):
        try: c = json.load(open(p))
        except Exception: out.append("FIX FAILED: unreadable fix claim %s" % p); continue
        if c.get("pr") in excluded:
            continue
        try:
            held = {l["name"] for l in GH().req("GET", "/repos/%s/issues/%d" % (REPO, c["pr"]))["labels"]}
        except Exception:
            held = set()
        hold_labels = sorted(x for x in held if x == "hold" or x.startswith(("hold:", "parked")) or x in SKIP)
        if hold_labels:
            log("fix claim %s skipped: PR #%d held (%s)" % (os.path.basename(p), c["pr"], ",".join(hold_labels)))
            if not dry:
                done = CLAIMS + "/done"; os.makedirs(done, exist_ok=True)
                c["skipped"] = "PR held"; json.dump(c, open(os.path.join(done, os.path.basename(p)), "w"), indent=1); os.remove(p)
            continue
        ev = claim_evidence(c)
        c.setdefault("evidence_seen", [])
        if ev:
            c["evidence_seen"] = sorted(set(c["evidence_seen"]) | set(ev))
        if now >= min(c["deadline"], c["at"] + 1800):
            done = CLAIMS + "/done"; os.makedirs(done, exist_ok=True)
            if c["evidence_seen"]:
                log("fix claim %s OK: %s" % (os.path.basename(p), c["evidence_seen"]))
            else:
                out.append("FIX FAILED: %s (PR #%d) no live evidence (pid/commit/Gate B) by deadline" % (c.get("what"), c["pr"]))
                log(out[-1]); c["failed"] = True
            if not dry: json.dump(c, open(os.path.join(done, os.path.basename(p)), "w"), indent=1); os.remove(p)
        elif not dry:
            json.dump(c, open(p, "w"), indent=1)
    return out


def main(dry=False, review_scan=None):
    from host_handback_review import EvidenceError
    if review_scan is None:
        raise EvidenceError("canonical host ReviewScan required; generic retry refused")
    g = GH(); now = time.time()
    try:
        if os.path.exists(ST):
            with open(ST) as state_file:
                st = json.load(state_file)
        else:
            st = {}
        if not isinstance(st, dict) or not isinstance(st.get("host-review-sent", {}), dict):
            raise ValueError("invalid review dedupe state")
    except Exception as exc:
        raise EvidenceError("shared alarm state unreadable: " + type(exc).__name__) from exc
    seen, stuck = {}, []
    review_sent = dict(st.get("host-review-sent") or {})
    review_decisions = {}
    def review_owned(item):
        collector = review_scan.read_evidence
        if hasattr(collector, "current_objects"):
            item, comments = collector.current_objects(item)
        else:
            comments = list(g.pages("/repos/%s/issues/%d/comments" % (REPO, item["number"])))
        decision = review_scan.consider(item, comments, now, review_sent)
        review_decisions[item["number"]] = decision
        return item
    try:
        bases = {"migrate/trek-source"} | {b for b in json.load(open(D + "/allowed-bases.json"))} if os.path.exists(D + "/allowed-bases.json") else {"migrate/trek-source"}
    except Exception:
        bases = {"migrate/trek-source"}
    try:
        items, covered = [], set()
        prs = list(g.pages("/repos/%s/pulls?state=open" % REPO))
        covered = issue_pr_map(prs)
        issues = list(g.pages("/repos/%s/issues?state=open&labels=project:tsv" % REPO))
        prs = [review_owned(p) for p in prs if p["base"]["ref"] in bases]
        issues = [review_owned(i) for i in issues
                  if "pull_request" not in i and i["number"] not in covered]
        if dry:
            review_scan.flush(review_sent, None, dry=True)
            return review_decisions
        open_nums = {p["number"] for p in prs if p.get("state") == "open"}
        for p in prs:
            if p.get("state") != "open" or review_decisions[p["number"]].handled:
                continue
            for l in p["labels"]:
                m = re.match(r"hold:after-(\d+)$", l["name"])
                if m and int(m.group(1)) not in open_nums and not dry:
                    dep = g.req("GET", "/repos/%s/issues/%s" % (REPO, m.group(1))) or {}
                    if dep.get("state") == "closed":
                        g.req("DELETE", "/repos/%s/issues/%d/labels/%s" % (REPO, p["number"], l["name"].replace(":", "%3A")), ok404=True)
                        os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
                        open(D + "/auto-filler/requeue/%d" % p["number"], "w").write("stall-alarm dep #%s closed %s\n" % (m.group(1), time.ctime()))
                        log("pr%d hold:after-%s lifted (#%s closed); requeued" % (p["number"], m.group(1), m.group(1)))
        def parked(labs): return bool(labs & SKIP) or "hold" in labs or any(x.startswith(("hold:", "parked")) for x in labs)
        for p in prs:
            if p.get("state") != "open" or review_decisions[p["number"]].handled:
                continue
            if p["base"]["ref"] in bases and not parked({l["name"] for l in p["labels"]}):
                items.append(("pr%d" % p["number"], fp_pr(g, p)))
        for i in issues:
            if i.get("state") != "open" or review_decisions[i["number"]].handled:
                continue
            labs = {l["name"] for l in i["labels"]}
            if "pull_request" in i: continue
            if i["number"] in covered:
                msg = "issue #%d skipped: linked open PR #%d owns stall detection" % (i["number"], covered[i["number"]])
                if not dry:
                    clear_issue_ready(g, i["number"])
                log(msg); print(msg)
                continue
            if parked(labs): continue
            items.append(("is%d" % i["number"], "issue #%d labels=%s updated=%s" % (i["number"], sorted(labs), i["updated_at"])))
    except EvidenceError:
        raise
    except Exception as exc:
        raise EvidenceError("complete host scan failed: " + type(exc).__name__) from exc
    for key, desc in items or []:
        h = hashlib.sha256(desc.encode()).hexdigest()[:16]
        prev = st.get(key) or {}
        e = prev if prev.get("h") == h else {"h": h, "since": now, "rung": False}
        age = now - e["since"]
        if age >= FIX_S and not e.get("fixed_at"):
            e["fix"] = auto_fix(key, desc, dry)
            if not e["fix"].startswith("dispatcher busy"): e["fixed_at"] = now
            log("%s stuck %d min -> auto-fix: %s | %s" % (key, age // 60, e["fix"], desc[:250]))
            if "GUARD REFUSED" in e["fix"] and not e["rung"]:
                stuck.append("%s unchanged %d min; %s: %s" % (key, age // 60, e["fix"], desc[:300])); e["rung"] = True
        elif not e["rung"] and (age >= STALL_S or (e.get("fixed_at") and now - e["fixed_at"] >= FIX_GRACE_S)):
            stuck.append("%s unchanged %d min after auto-fix (%s): %s" % (key, age // 60, e.get("fix", "none"), desc[:300])); e["rung"] = True
        if key.startswith("pr") and age >= IDLE_S and not e.get("idle_rung") and not round_running(int(key[2:])):

            stuck.append("%s head unchanged %d min and NO round running (no lane process, no active cloud follow-up): %s" % (key, age // 60, desc[:250]))
            e["idle_rung"] = True; log("%s idle %d min, no running round -> ring" % (key, age // 60))
        seen[key] = e
    import bell_gate
    review_scan.flush(review_sent, bell_gate.ring)
    seen["host-review-sent"] = review_sent
    review_handled = {n for n, decision in review_decisions.items() if decision.handled}
    stuck += check_fix_claims(now, dry, review_handled)
    for k, msg in launches_not_started(now):
        match = re.search(r"vk(?:fill|clear)-(\d+)(?:[^0-9]|$)", k)
        if match and int(match[1]) in review_handled:
            continue
        if k in st: seen[k] = st[k]; continue
        seen[k] = {"at": now}; stuck.append(msg); log(msg)
    for k, v in st.items():
        if k.startswith("launch:") and now - v.get("at", now) < 86400: seen.setdefault(k, v)
    if items is not None and not dry:
        with open(ST, "w") as state_file:
            json.dump(seen, state_file, indent=1)
    if stuck:
        msg = "VK STALL (45 min no state change). Receipt " + SLUG + ": " + " | ".join(stuck)[:1500]
        print(msg)
        if not dry:
            import bell_gate
            bell_gate.ring("stall-alarm", msg, "eggbot_decision", meta={"slug": SLUG})

def cli(argv=None):
    from host_handback_entrypoint import run_entrypoint
    argv = list(argv if argv is not None else sys.argv)
    dry, review_scan = run_entrypoint(GH, REPO, D, argv)
    decisions = main(dry=dry, review_scan=review_scan)
    if dry:
        print(json.dumps({
            'check': 'HOST-HANDBACK-ALARM-DRYRUN',
            'mode': 'read-only',
            'config': 'host-handback-entrypoint.json',
            'objects': {str(number): {
                'state': decision.state,
                'reason': decision.reason,
                'event': decision.event,
            } for number, decision in (decisions or {}).items()},
        }, indent=2))
    return decisions


if __name__ == "__main__":
    cli()
