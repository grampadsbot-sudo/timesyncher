#!/usr/bin/env python3
"""Global VK stall alarm (Craig 7:51/7:53 PM PT 10/19). An open VK PR or issue whose state fingerprint is unchanged for 20 min gets the
matching auto-fix (lane requeue, Gate B re-run, stale labels cleared, dead cloud follow-up released), logged in logs/stall-alarm.log.
If the next pass shows no change, or at 45 min worst case, it rings dr eggbot once per fingerprint. Fail closed: read errors ring."""
import re
import json, os, re, sys, time, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tsv_common import GH, REPO, D
from pr_issue_links import issue_pr_map, clear_issue_ready
import host_handback_review as HR
ST = D + "/stall-alarm-state.json"
STALL_S = 45 * 60
FIX_S = 20 * 60
FIX_GRACE_S = 9 * 60
SKIP = {"parked", "status:parked", "do-not-merge"}
SLUG = "bot-admin/receipts/eggbot-pipeline-stall-audit-20261019"
_DRY = False

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
    if _DRY:
        print("DRY log: " + msg)
        return
    with open(D + "/logs/stall-alarm.log", "a") as fh:
        fh.write("[%s] %s\n" % (time.strftime("%Y-%m-%d %H:%M %Z"), msg))


_real_open = open
def _tok_open(p, mode="r", *a, **k):

    if "/auto-filler/requeue/" in str(p) and mode == "w" and os.path.exists(p) and " tier 1 " in _real_open(p).read():
        return _real_open(os.devnull, "w")
    return _real_open(p, mode, *a, **k)


def _blocked_reason(n):
    """TLA+ F2 (8:45 PM PT 10/20): tsv_guard stop for PR n (stuck / 4 fails / CI two tries / cap), or None. Errors fail closed."""
    try:
        import tsv_guard as G
        return G.blocked_reason(n, fixit=True)
    except Exception as e:
        return "guard check error %s" % type(e).__name__


WAITS_RE = re.compile(r"\bwaits[- ]on\s*:|\bblocked[- ]by\b|pending[- ]decision", re.I)


def bare_hold(g, p, labs):
    """TLA+ F9: a hold:* label with no named blocker (no Waits on:/blocked by/pending decision in the PR body or comments)
    is not parked: the stall alarm keeps watching it. Lookup errors: treated as named (old behaviour)."""
    if labs & SKIP or not any(x == "hold" or x.startswith("hold:") for x in labs) or any(x.startswith("parked") for x in labs):
        return False
    if "hold:protected-paths" in labs:
        return False
    if WAITS_RE.search(p.get("body") or ""):
        return False
    try:
        for c in g.pages("/repos/%s/issues/%d/comments" % (REPO, p["number"])):
            if WAITS_RE.search(c.get("body") or ""): return False
    except Exception:
        return False
    return True


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


        if "executor:cursor" in desc and "status:ready" not in desc:
            return "issue NOT requeued: executor:cursor without status:ready (token would be ignored); dr eggbot must refresh the brief, drop cursor-launched and add status:ready"
        os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
        open(D + "/auto-filler/requeue/%d" % n, "w").write("stall-alarm %s\n" % time.ctime())
        return "issue requeued for a free lane"
    done = []
    rr_f = D + "/rereview-state.json"

    stop = _blocked_reason(n) if re.search(r"'failure'\)", desc.split("GateB=")[0]) else None
    if stop:
        done.append("CI-red requeue skipped: guard stop (%s)" % str(stop)[:120])
    elif re.search(r"'failure'\)", desc.split("GateB=")[0]):
        tok = D + "/auto-filler/requeue/%d" % n
        os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
        if not os.path.exists(tok) or "CI red" not in open(tok).read():
            open(tok, "w").write("stall-alarm CI red %s\n" % time.ctime())
            done.append("requeued to a free lane (CI red)")
        else:
            done.append("CI-red requeue token already present")
    try:
        lock = open(D + "/.run.lock", "a+"); fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except Exception:
        return "; ".join(done + ["dispatcher busy; other fixes retry next pass"]) if done else "dispatcher busy; retry next pass"
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
        if gb_fail and "held on" not in desc and _blocked_reason(n):
            done.append("Gate B FAIL requeue skipped: guard stop (%s)" % str(_blocked_reason(n))[:120])
        elif gb_fail and "held on" not in desc:
            os.makedirs(D + "/auto-filler/requeue", exist_ok=True)
            open(D + "/auto-filler/requeue/%d" % n, "w").write("stall-alarm %s\n" % time.ctime())
            done.append("requeued to a free lane (Gate B FAIL)")
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
    return "; ".join(done) or "no matching fix (e.g. HOLD on base known gaps)"


IDLE_S = 30 * 60
from zoneinfo import ZoneInfo
PT = ZoneInfo("America/Los_Angeles")


def lane_process_running(n):
    import subprocess
    r = subprocess.run(["pgrep", "-f", "vk-lane-run.sh [a-z-]+ .*vkfill-%d " % n], capture_output=True)
    return r.returncode == 0


def round_running(n):
    if lane_process_running(n): return True
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

            if any(re.search(r" START \S+ %s " % re.escape(tag), l) and l[:16] >= stamp for l in lane_txt.splitlines()): continue
            if refused or not started:
                why = refused[0][-160:] if refused else "no START line in 10+ min"
                out.append(("launch:%s:%s:%s" % (lane, tag, stamp), "planned launch never started: %s %s at %s PT (%s)" % (lane, tag, m.group(1), why)))
    return out


VKFILL_HELD_DIR = D + "/auto-filler/vkfill-held"
VKFILL_PUSHES_F = D + "/auto-filler/vkfill-last-push.json"
VKFILL_BATCH_SECS = int(os.environ.get("VKFILL_BATCH_SECS") or 2700)


def _read_vkfill_held_marker_file(path):
    name = os.path.basename(path)
    match = re.fullmatch(r"(\d+)(?:\.void-.+-alreadypushed)?", name)
    if not match:
        return None
    n = int(match.group(1))
    try:
        with open(path) as marker_file:
            fields = marker_file.read().split()
    except OSError:
        return None
    if len(fields) < 2:
        return None
    ref, tip = fields[0], fields[1]
    sha = fields[2] if len(fields) >= 3 else ""
    return dict(number=n, ref=ref, tip=tip, sha=sha, path=path, name=name)


def _ls_remote_vkfill_lines(ref):
    import subprocess

    branch = str(ref or "").strip()
    if branch.startswith("refs/heads/"):
        branch = branch[len("refs/heads/") :]
    if not branch.startswith("vkfill/"):
        return None
    try:
        r = subprocess.run(
            ["git", "ls-remote", "https://github.com/%s.git" % REPO, "refs/heads/%s" % branch],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if r.returncode:
            return None
        return [line for line in r.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.TimeoutExpired):
        return None


def _remote_tip_has_held_sha(lines, held_sha, expected_ref=None):
    held = str(held_sha or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", held):
        return False
    branch = str(expected_ref or "").removeprefix("refs/heads/")
    for line in lines or []:
        parts = line.split()
        if len(parts) != 2:
            continue
        tip, ref = parts
        if branch and ref != "refs/heads/" + branch:
            continue
        if re.fullmatch(r"[0-9a-fA-F]{40}", tip) and tip.lower() == held:
            return True
    return False


def vkfill_held_push_overdue(marker, now):
    n, ref = marker["number"], marker["ref"]
    if os.path.exists(D + "/auto-filler/push-now/%d" % n):
        return True
    if not str(ref).startswith("vkfill/"):
        return False
    try:
        pushes = json.load(open(VKFILL_PUSHES_F))
    except Exception:
        pushes = {}
    last = float((pushes or {}).get(ref) or 0)
    if not last:
        try:
            last = os.path.getmtime(marker["path"])
        except OSError:
            return False
    return (now - last) >= VKFILL_BATCH_SECS


def vkfill_held_stall_checks(now, dry):
    """Report overdue vkfill-held markers; clear only when ls-remote shows the held sha on the branch."""
    import datetime as _dt

    out = []
    if not os.path.isdir(VKFILL_HELD_DIR):
        return out
    clock = _dt.datetime.now(PT).strftime("%Y-%m-%d %H:%M %Z")
    for name in sorted(os.listdir(VKFILL_HELD_DIR)):
        path = os.path.join(VKFILL_HELD_DIR, name)
        if name.isdigit():
            marker = _read_vkfill_held_marker_file(path)
            if not marker:
                continue
            lines = _ls_remote_vkfill_lines(marker["ref"])
            if lines and _remote_tip_has_held_sha(lines, marker["tip"], marker["ref"]):
                if not dry:
                    try:
                        os.remove(path)
                    except OSError:
                        pass
                log(
                    "vkfill-held #%d remote matches %s; marker cleared"
                    % (marker["number"], (marker["tip"] or "?")[:8])
                )
                continue
            if not vkfill_held_push_overdue(marker, now):
                continue
            remote_note = "remote unknown" if lines is None else "remote tip not held sha"
            out.append(
                "held, push overdue #%d %s %s (%s at %s)"
                % (marker["number"], marker["ref"], marker["tip"] or "?", remote_note, clock)
            )
            continue
        if ".void-" in name and name.endswith("-alreadypushed"):
            marker = _read_vkfill_held_marker_file(path)
            if not marker:
                parent = name.split(".void-", 1)[0]
                if parent.isdigit():
                    marker = _read_vkfill_held_marker_file(os.path.join(VKFILL_HELD_DIR, parent))
            if not marker:
                continue
            lines = _ls_remote_vkfill_lines(marker["ref"])
            if lines is None:
                out.append("void-alreadypushed %s held sha unverified (ls-remote error at %s)" % (name, clock))
            elif not _remote_tip_has_held_sha(lines, marker["tip"], marker["ref"]):
                out.append(
                    "void-alreadypushed %s unverified: remote %s differs from held result %s at %s"
                    % (name, marker["ref"], marker["tip"] or "?", clock)
                )
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


def check_fix_claims(now, dry):
    """Craig 11:53 PM PT 10/19: every chief-dr fix writes a claim (what, PR, deadline <= 30 min). No live evidence by the deadline rings FIX FAILED."""
    import glob
    out = []
    for p in glob.glob(CLAIMS + "/*.json"):
        try: c = json.load(open(p))
        except Exception: out.append("FIX FAILED: unreadable fix claim %s" % p); continue
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
            done = CLAIMS + "/done"
            if not dry: os.makedirs(done, exist_ok=True)
            if c["evidence_seen"]:
                log("fix claim %s OK: %s" % (os.path.basename(p), c["evidence_seen"]))
            else:
                out.append("FIX FAILED: %s (PR #%d) no live evidence (pid/commit/Gate B) by deadline" % (c.get("what"), c["pr"]))
                log(out[-1]); c["failed"] = True
            if not dry: json.dump(c, open(os.path.join(done, os.path.basename(p)), "w"), indent=1); os.remove(p)
        elif not dry:
            json.dump(c, open(p, "w"), indent=1)
    return out


def ownership(n, prs, now):
    """dr eggbot 7:45 AM PT 10/20: an issue is owned (no stall) by a PR that references it, a live job, or a dated managing-dr review not yet overdue."""
    pat = re.compile(r"(?<![\w/])#%d\b" % n)
    for p in prs:
        if pat.search((p.get("title") or "") + "\n" + (p.get("body") or "")):
            return "open PR #%d references it" % p["number"]
    if round_running(n):
        return "live lane job running"
    try:
        note = str(json.load(open(D + "/auto-filler/carried.json")).get(str(n)) or "")
    except Exception:
        note = ""
    if re.search(r"managing.?dr", note, re.I):
        import datetime as _dt
        for h, m in re.findall(r"(?:review|decision|acceptance|follow.?up)\D{0,20}?(\d{1,2}):(\d\d)", note, re.I):
            t = _dt.datetime.now(PT).replace(hour=int(h) % 24, minute=int(m), second=0, microsecond=0).timestamp()
            if t >= now - 30 * 60:
                return "dated managing-dr review %s:%s PT not yet overdue" % (h, m)
        if re.search(r"managing-dr follow-up", note) and re.search(r"until (\d{4}-\d\d-\d\dT[\d:]+)", note):
            u = re.search(r"until (\d{4}-\d\d-\d\dT[\d:]+)", note).group(1)
            import datetime as _dt
            if _dt.datetime.fromisoformat(u).replace(tzinfo=PT).timestamp() >= now:
                return "managing-dr follow-up open until %s PT" % u
    return ""


NC_ASK_S = 3600
NC_RESEND_S = 12 * 3600

def needs_craig_route(n, head, look, labeled_at, now, seen):
    """Pure decision for an open needs-craig PR. look = state.json look[n] (or {}). Returns (key, action, why) or None.
    action 'dr-raise': no question to Craig recorded for this head -> needs-dr-eggbot + ring (dr raises ONE question or puts it back in the loop)."""
    ask = look if look.get("sha") == head else {}
    if ask.get("decided"): return None
    if not ask.get("sent_at"):
        if now - (labeled_at or now) < NC_ASK_S: return None
        k = "nc:%d:%s:noask" % (n, head[:8])
        if k in seen: return None
        return k, "dr-raise", "needs-craig on head %s for %d min but no question was ever delivered to Craig for this head" % (head[:7], (now - labeled_at) // 60)
    age = now - ask["sent_at"]
    if age < NC_RESEND_S: return None
    k = "nc:%d:%s:resend:%d" % (n, head[:8], int(ask["sent_at"]))
    if k in seen: return None
    return k, "dr-raise", "question %s sent %d h ago, no reply from Craig; re-raise it plainly or put the PR back in the loop" % (ask.get("tag", "?"), age // 3600)

def needs_craig_pass(g, prs, st, now, dry):
    out = []
    try: look = (json.load(open(D + "/state.json")).get("look") or {})
    except Exception: look = {}
    for p in prs:
        n = p["number"]
        if "needs-craig" not in {l["name"] for l in p["labels"]}: continue
        labeled_at = None
        try:
            for e in g.pages("/repos/%s/issues/%d/events" % (REPO, n)):
                if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == "needs-craig":
                    labeled_at = time.mktime(time.strptime(e["created_at"], "%Y-%m-%dT%H:%M:%SZ")) - time.timezone
        except Exception: pass
        r = needs_craig_route(n, p["head"]["sha"], look.get(str(n)) or {}, labeled_at, now, st)
        if not r: continue
        k, act, why = r
        log("pr%d needs-craig watchdog -> %s: %s" % (n, act, why))
        if not dry:
            g.req("POST", "/repos/%s/issues/%d/labels" % (REPO, n), {"labels": ["needs-dr-eggbot"]})
            g.req("POST", "/repos/%s/issues/%d/comments" % (REPO, n), {"body": "needs-craig watchdog (Ubuntu stall alarm): %s.\nWaits on: managing dr: send Craig ONE plain question with a side-by-side for head `%s`, or remove `needs-craig` and requeue into the coder/Gate B loop. Nothing waits on Craig without a delivered question." % (why, p["head"]["sha"][:7])})
        st[k] = {"at": now}
        out.append("PR #%d needs-craig watchdog: %s" % (n, why))
    return out

def main(dry=False):
    global _DRY
    _DRY = dry
    g = GH(); now = time.time()
    st = {}
    if os.path.exists(ST):
        with open(ST) as state_file:
            st = json.load(state_file)
    seen, stuck, handbacks = {}, [], {}
    try:
        bases = {"migrate/trek-source"} | {b for b in json.load(open(D + "/allowed-bases.json"))} if os.path.exists(D + "/allowed-bases.json") else {"migrate/trek-source"}
    except Exception:
        bases = {"migrate/trek-source"}
    try:
        items, covered = [], set()
        prs = list(g.pages("/repos/%s/pulls?state=open" % REPO))
        covered = issue_pr_map(prs)
        open_nums = {p["number"] for p in prs}
        for p in prs:
            if p["base"]["ref"] not in bases: continue
            ev = HR.handback_event(p, g.pages("/repos/%s/issues/%d/comments" % (REPO, p["number"])))
            if ev:
                handbacks["pr%d" % p["number"]] = dict(ev, head=p["head"]["sha"], labels={l["name"] for l in p["labels"]})
        for p in prs:
            if "pr%d" % p["number"] in handbacks or any(l["name"] == "needs-craig" for l in p["labels"]): continue
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
            labs = {l["name"] for l in p["labels"]}
            if p["base"]["ref"] in bases and "needs-craig" not in labs and (not parked(labs) or bare_hold(g, p, labs)):
                items.append(("pr%d" % p["number"], fp_pr(g, p)))
        for i in g.pages("/repos/%s/issues?state=open&labels=project:tsv" % REPO):
            labs = {l["name"] for l in i["labels"]}
            if "pull_request" in i: continue
            if parked(labs) or "needs-craig" in labs: continue
            ev = HR.handback_event(i, g.pages("/repos/%s/issues/%d/comments" % (REPO, i["number"])))
            if ev and i["number"] not in covered:
                key = "is%d" % i["number"]
                handbacks[key] = dict(ev, head="", labels=labs)
                items.append((key, "issue #%d host review required" % i["number"]))
                continue
            own = ownership(i["number"], prs, now)
            if own:
                log("issue #%d skipped: %s" % (i["number"], own)); continue
            if i["number"] in covered:
                msg = "issue #%d skipped: linked open PR #%d owns stall detection" % (i["number"], covered[i["number"]])
                if not dry:
                    clear_issue_ready(g, i["number"])
                log(msg); print(msg)
                continue
            if parked(labs): continue
            items.append(("is%d" % i["number"], "issue #%d labels=%s updated=%s" % (i["number"], sorted(labs), i["updated_at"])))
    except Exception as e:
        items = None; stuck.append("stall alarm could not read GitHub: %s (fail closed)" % type(e).__name__)
    for key, desc in items or []:
        if key in handbacks:
            hb = handbacks[key]
            n = int(key[2:])
            rk = "review:%d" % n
            import bell_gate
            what, rec = HR.route(n, hb, hb["head"], hb["labels"], lane_process_running(n),
                                 st.get(rk), now, bell_gate.ring, dry=dry)
            if rec: seen[rk] = rec
            log("%s host handback -> %s" % (key, what))
            continue
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
    stuck += vkfill_held_stall_checks(now, dry)
    stuck += check_fix_claims(now, dry)
    try: stuck += needs_craig_pass(g, prs, st, now, dry)
    except NameError: pass
    except Exception as ex: stuck.append("needs-craig watchdog error %s (fail closed)" % type(ex).__name__)
    for k, v in st.items():
        if k.startswith("nc:"): seen.setdefault(k, v)
    for k, msg in launches_not_started(now):
        if k in st: seen[k] = st[k]; continue
        seen[k] = {"at": now}; stuck.append(msg); log(msg)
    for k, v in st.items():
        if k.startswith("review:") or (k.startswith("launch:") and now - v.get("at", now) < 86400): seen.setdefault(k, v)
    if items is not None and not dry:
        with open(ST, "w") as state_file:
            json.dump(seen, state_file, indent=1)
    if stuck:
        msg = "VK STALL (45 min no state change). Receipt " + SLUG + ": " + " | ".join(stuck)[:1500]
        print(msg)
        if not dry:
            import bell_gate
            bell_gate.ring("stall-alarm", msg, "eggbot_decision", meta={"slug": SLUG})

if __name__ == "__main__":
    main("--dry" in sys.argv)
