#!/usr/bin/env python3
"""tsv_rereview.py: automatic Gate B re-review loop for Cursor PRs (dr eggbot 2026-10-07, Craig 3:24 PM PT). NO LLM.
Imported by tsv_dispatch.py (pregate hook + per-run tick); also `python3 tsv_rereview.py status`.

- Every pre-merge Gate B verdict (any PR) is appended to logs/gateb-verdicts.jsonl: PR, issue, head, round, raw + effective
  verdict, reference, per-screen diff %, total diff %, side-by-side dir/paths. nightly_log.py includes it (dr eggbot audit).
- Cursor PRs (a cursor-state.json agent linked by 'Closes #N'): on FAIL the checker posts a fix-it comment (+kickback) and
  sends ONE follow-up run to the SAME agent (Cloud Agents API v1 POST /v1/agents/{id}/runs) with the worst side-by-sides
  and the diff %. New head -> Gate B re-runs (pregate is keyed by head sha). Follow-up finished with no new commit -> counts
  as a round with no improvement and the fix-it is re-sent.
- No round cap. It stops only after STALL_ROUNDS (6) consecutive rounds without the total diff % improving: then
  status:stuck + needs-dr-eggbot (NOT Craig's job: kept out of the morning summary, listed in the nightly log). No Telegram.
- Restore / new-look PRs are compared to the NYC reference screens (NOT approved) (tsv_dispatch.baseline_only). Their deliberate changes are
  allowed per issue in gateb-allow.json, REGION-SCOPED ONLY (Craig 2026-10-07 3:37 PM PT): pixels may differ only inside the
  DOM regions capture.mjs records at capture time (list-row hulls `li[data-list-row]` for the two-line rows, icon boxes
  `[data-ts-logo-chip]`/`[data-ts-category-tab-icon]` spanning their row/button height for the centering). Everything outside
  must stay at Gate B's PASS level (0 changed px since 3:55 PM PT; outside_iso_max); >= outside_fail_pct (2%) is a FAIL, and the band in between
  (which normal Gate B sends to vision) also fails here: this loop has no model and Craig never sees a visibly failing screen.
  Region detection failure (no capture-regions.json, no rows/icons found) = FAIL, never a pass. Effective PASS -> label
  new-look + the dispatcher's look_request (side-by-sides to Craig via the iMac, yes/no). They are never marked ready or
  merged until Craig's craig-approved (cursor_launch.py undraft + tsv_dispatch approval_valid enforce that).
Secrets: Cursor key ~/.config/tsv-cursor/api-key, read from file, never printed or logged."""
import base64, fnmatch, json, os, re, subprocess, sys, time, urllib.request, urllib.error, datetime as dt
from zoneinfo import ZoneInfo

HOME = "/home/ubishere9995"; D = os.environ.get("TSV_DISPATCH_ROOT", HOME + "/tsv-dispatch")
sys.path.insert(0, D); import tsv_guard as G
REPO = "grampadsbot-sudo/timesyncher"
CURSOR_STATE = D + "/cursor-state.json"
RR_STATE = D + "/rereview-state.json"
VERDICTS = D + "/logs/gateb-verdicts.jsonl"
ALLOW_F = D + "/gateb-allow.json"
KEY_FILE = HOME + "/.config/tsv-cursor/api-key"
PM = HOME + "/tsv-gateb/pm.mjs"
RPM = HOME + "/tsv-gateb/region-pm.mjs"
STOP_F = D + "/CURSOR_STOP"
PR_SRC = D + "/pr-src"
STAGING_ORIGIN = os.environ.get("TSV_STAGING_ORIGIN", "https://vacation-staging.timesyncher.com")
_DISPATCH_PKG = os.path.dirname(os.path.abspath(__file__))
if _DISPATCH_PKG not in sys.path:
    sys.path.insert(0, _DISPATCH_PKG)
from capture_replay_binding import (  # noqa: E402
    CaptureReplayError,
    capture_subprocess_env,
    staging_manifest_inventory_ok,
)
NORMAL_MODEL = "composer-2.5"
V6_DEFAULT = "_v6_default"
STALL_ROUNDS = 6
IMPROVE_EPS = 0.05
MAX_IMAGES = 5
PT = ZoneInfo("America/Los_Angeles")

def pt_now(): return dt.datetime.now(PT).strftime("%-I:%M %p PT")
def now_iso(): return dt.datetime.now(PT).isoformat(timespec="seconds")
def _load(p, d):
    try: return json.load(open(p))
    except Exception: return d
def _save(p, obj):
    json.dump(obj, open(p + ".tmp", "w"), indent=1); os.replace(p + ".tmp", p)
def key():
    try: return open(KEY_FILE).read().strip()
    except Exception: return ""

class Ctx:
    """Callbacks from tsv_dispatch.py: api(method, path, data), write(method, path, data, what), log(msg), DRY flag."""
    def __init__(self, api, write, log, dry, scrub=None, dispatch_state=None):
        self.api, self.write, self.log, self.dry = api, write, log, dry
        self.dispatch_state = dispatch_state if dispatch_state is not None else {"pregate": {}}
        self.scrub = scrub or (lambda s: s)


class CursorErr(Exception):
    def __init__(self, code, text): super().__init__("HTTP %s %s" % (code, text)); self.code = code
def cur(method, path, data=None):
    from lane_policy import require_cursor_start
    require_cursor_start(method, path)
    k = key()
    if not k: raise CursorErr(0, "no Cursor API key")
    req = urllib.request.Request("https://api.cursor.com" + path, method=method, data=None if data is None else json.dumps(data).encode(),
        headers={"Authorization": "Basic " + base64.b64encode((k + ":").encode()).decode(), "Content-Type": "application/json", "User-Agent": "tsv-rereview"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            b = r.read(); return json.loads(b) if b else {}
    except urllib.error.HTTPError as e:
        raise CursorErr(e.code, e.read()[:300].decode("utf-8", "replace").replace(k, "***"))
    except Exception as e:
        raise CursorErr(-1, "network: %s" % type(e).__name__)
def agent_run(agent):
    a = cur("GET", "/v1/agents/%s" % agent)
    r = cur("GET", "/v1/agents/%s/runs/%s" % (agent, a["latestRunId"])) if a.get("latestRunId") else {}
    return a, r


def linked_issues(pr):
    return sorted({int(x) for x in re.findall(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", (pr.get("body") or "") + " " + (pr.get("title") or ""), re.I)})
def agent_for(pr):
    """(issue, agent_id) if this PR belongs to a Cursor agent the launcher launched or adopted, else None."""
    cs = _load(CURSOR_STATE, {}).get("issues", {})
    for n, rec in cs.items():
        if rec.get("pr") == pr["number"] and rec.get("agent"): return int(n), rec["agent"]
    if not (pr.get("head") or {}).get("ref", "").startswith("cursor/"): return None
    for n in linked_issues(pr):
        rec = cs.get(str(n)) or {}
        if rec.get("agent") and rec.get("status") in ("running", "finished", "adopted") and not rec.get("pr"): return n, rec["agent"]
    return None
def agent_busy(agent):
    try:
        _, r = agent_run(agent); return (r.get("status") or "").upper() in ("CREATING", "RUNNING")
    except CursorErr: return True


def allowance(issue):
    a = _load(ALLOW_F, {}).get(str(issue))
    return a if isinstance(a, dict) else None
def screen_allow(a, f):
    for pat, mx in (a.get("screens") or {}).items():
        if fnmatch.fnmatch(f, pat): return float(mx), True
    return float(a.get("default_max_pct", 0.0)), False

def _h(p):
    try: return int(subprocess.run(["identify", "-format", "%h", p + "[0]"], capture_output=True, text=True).stdout.split()[0])
    except Exception: return None

def region_check(allow, f, reference, cand_dir, workdir):
    """Region-scoped verdict for ONE screen of a restore/new-look PR. ok=True only if every pixel difference outside the
    allowed DOM regions is at Gate B's PASS level. Anything missing or odd -> ok=False (fail closed)."""
    out = {"ok": False, "band": "FAIL"}
    kinds = [k for k, pats in sorted((allow.get("regions") or {}).items()) if fnmatch_any(f, pats)]
    out["kinds"] = kinds
    if not kinds: out["error"] = "no allowed regions for this screen"; return out
    regs = _load(os.path.join(cand_dir, "capture-regions.json"), None)
    if not isinstance(regs, dict): out["error"] = "region detection failed: capture-regions.json missing"; return out
    r = regs.get(f)
    if not isinstance(r, dict) or not r.get("ok"): out["error"] = "region detection failed: %s" % ((r or {}).get("error") or "no entry for this shot"); return out
    rects = []
    for k in kinds:
        if k == "rows":
            if not r.get("rows") and not fnmatch_any(f, allow.get("rows_optional", [])):
                out["error"] = "region detection failed: no list rows (%s)" % r.get("row_selector"); return out
            rects += [g["box"] for g in r.get("rows") or []]
        elif k == "icons":
            if not r.get("icons"): out["error"] = "region detection failed: no icons (%s)" % r.get("icon_selector"); return out
            rects += r["icons"]
        else: out["error"] = "unknown region kind %s" % k; return out
    base, cand = os.path.join(reference, f), os.path.join(cand_dir, f)
    if not (os.path.isfile(base) and os.path.isfile(cand)): out["error"] = "baseline or candidate missing"; return out
    spec = {"rects": rects, "pad": int(allow.get("region_pad_px", 2))}
    if "rows" in kinds and fnmatch_any(f, allow.get("shift_below_rows", [])) and r.get("rows_bottom") is not None:
        full = f.replace("-top.png", ".png")
        bh, ch = _h(os.path.join(reference, full)), _h(os.path.join(cand_dir, full))
        if bh is None or ch is None: out["error"] = "full-page heights unavailable for the row shift"; return out
        if ch != bh: spec["shift"] = {"dh": ch - bh, "from_y": r["rows_bottom"]}
    stem = f[:-4]
    sp, ov = os.path.join(workdir, "_regions-%s.json" % stem), os.path.join(workdir, "%s-regions.png" % stem)
    with open(sp, "w") as fh: json.dump(spec, fh)
    pr = subprocess.run(["node", RPM, base, cand, sp, ov], capture_output=True, text=True, cwd=os.path.dirname(RPM))
    try: m = json.loads(pr.stdout)
    except Exception: out["error"] = "region-pm failed: %s" % (pr.stderr.strip()[-200:] or pr.returncode); return out
    if 100.0 * m["mask_px"] / max(1, m["total_px"]) > float(allow.get("max_mask_pct", 85)):
        out["error"] = "region detection failed: allowed regions cover %.0f%% of the screen (implausible)" % (100.0 * m["mask_px"] / m["total_px"]); return out
    iso, fail_pct = int(allow.get("outside_iso_max", 0)), float(allow.get("outside_fail_pct", 2.0))
    o = m["outside_pct"]
    out.update({"outside_pct": o, "outside_px": m["outside_px"], "inside_px": m["inside_px"], "mask_px": m["mask_px"],
                "rects": len(rects), "shift": spec.get("shift"), "overlay": ov,
                "band": "PASS" if m["outside_px"] <= iso else ("FAIL" if o >= fail_pct else "CLOSE")})
    out["ok"] = out["band"] == "PASS"
    return out

def region_note(rc):
    if not rc: return ""
    if rc.get("error"): return rc["error"]
    return "outside allowed %s regions: %d px, %.3f%% (%s)" % ("+".join(rc["kinds"]), rc["outside_px"], rc["outside_pct"], {"PASS": "ok", "CLOSE": "close call, fails here", "FAIL": "fail"}[rc["band"]])

def padded_pct(base, cand, workdir):
    """pixelmatch % of two different-size PNGs, both padded with white to the larger box (ImageMagick + pm.mjs)."""
    try:
        wh = lambda p: tuple(int(x) for x in subprocess.run(["identify", "-format", "%w %h", p + "[0]"], capture_output=True, text=True).stdout.split())
        (bw, bh), (cw, ch) = wh(base), wh(cand); W, H = max(bw, cw), max(bh, ch)
        pa, pb, pd = [os.path.join(workdir, "_pad-%s-%s" % (t, os.path.basename(cand))) for t in ("a", "b", "d")]
        for src, dst in ((base, pa), (cand, pb)):
            subprocess.run(["convert", src, "-background", "white", "-gravity", "northwest", "-extent", "%dx%d" % (W, H), dst], check=True, capture_output=True)
        o = subprocess.run(["node", PM, pa, pb, pd], capture_output=True, text=True, cwd=os.path.dirname(PM)).stdout
        for p in (pa, pb, pd):
            try: os.remove(p)
            except Exception: pass
        return round(100 * json.loads(o)["ratio"], 3)
    except Exception:
        return None

def per_screen(summary_path, baselines_dir):
    """{file: {verdict, pct, size_changed, sbs}} from a gateb_compare run (summary.json)."""
    s = _load(summary_path, {}); out = {}
    for r in s.get("rows", []):
        f = r["file"]; size_changed = r.get("baseline_size") != r.get("candidate_size")
        pct = round(100 * r["ratio"], 3) if r.get("ratio") is not None and not (size_changed and not r.get("resized")) else None
        out[f] = {"verdict": r["verdict"], "pct": pct, "size_changed": size_changed, "sbs": r.get("sidebyside"),
                  "baseline_size": r.get("baseline_size"), "candidate_size": r.get("candidate_size"), "mismatched": r.get("mismatched")}
    return out, s


def v6_allow(issue):
    a = _load(ALLOW_F, {}); x = a.get(str(issue)) if issue else None
    if not (isinstance(x, dict) and x.get("mode") in ("v6", "structure")): x = a.get(V6_DEFAULT)
    return x if isinstance(x, dict) and x.get("mode") in ("v6", "structure") else None

CAPTURE_STAGING = D + "/capture-staging.sh"

def candidate_fixture(cand_dir):
    """The capture fixture the candidate's screens were rendered with (capture-manifest.json "fixture"), or None when unreadable."""
    try: fx = json.load(open(os.path.join(cand_dir, "capture-manifest.json"))).get("fixture")
    except Exception: return None
    return fx if fx and os.path.isfile(fx) else None

def staging_capture(ctx, pr, fixture, cand_dir=None):
    """Gate B part 3b feature parity needs the staging capture for the PR base tip, rendered with the CANDIDATE's fixture (2026-10-14:
    the static nyc-shared.json here made the base side differ from per-head candidates). Reuses gateb-cand/staging-<sha7> when it holds the
    struct inventory for every screen (post-deploy Gate B writes it); otherwise captures it now. Returns (dir, None) or (None, reason)."""
    base = pr["base"]["ref"]
    try: tip = ctx.api("GET", "/repos/%s/git/ref/heads/%s" % (REPO, base))["object"]["sha"]
    except Exception as e: return None, "staging tip unknown (%s)" % type(e).__name__
    if not fixture: return None, "candidate capture fixture unknown (no staging compare; fail closed)"
    try:
        import hashlib
        fixture_bytes = open(fixture, "rb").read()
        fixture_sha = hashlib.sha256(fixture_bytes).hexdigest()
        fixture_key = fixture_sha[:16]
        trip = json.loads(fixture_bytes)
        selected = sorted("place:%s" % p["id"] for p in trip["places"] if (trip.get("thingOverrides", {}).get("place:%s" % p["id"]) or {}).get("timeline") is True)
    except (OSError, ValueError, KeyError, TypeError) as e:
        return None, "staging fixture unreadable (%s)" % type(e).__name__
    try:
        candidate = json.load(open(os.path.join(cand_dir, "capture-manifest.json")))
        expected = candidate["timeline_replay"]
        valid = (candidate.get("fixture_sha256") == fixture_sha
                 and expected.get("source_fixture_sha256") == fixture_sha
                 and expected.get("fixture_sha256") == fixture_sha
                 and expected.get("policy") == "timeline-explicit-v1"
                 and expected.get("selected_place_keys") == selected
                 and bool(re.fullmatch(r"[0-9a-f]{64}", expected.get("served_payload_sha256") or "")))
    except (OSError, ValueError, KeyError, TypeError):
        valid = False
    if not valid: return None, "candidate selection binding missing or invalid (re-capture needed)"
    head_sha = (pr.get("head") or {}).get("sha") or ""
    if not re.fullmatch(r"[0-9a-f]{40}", head_sha or ""):
        return None, "candidate head sha unknown (fail closed)"
    d = os.path.join(D, "gateb-cand", "staging-" + tip[:7] + "-fixture-" + fixture_key + "-timeline-explicit-v1")
    def bound_inventory():
        if not _staging_has_inventory(d): return False
        try:
            manifest = json.load(open(os.path.join(d, "capture-manifest.json")))
            binding = manifest["timeline_replay"]
            return staging_manifest_inventory_ok(manifest, expected, fixture_sha, tip, head_sha)
        except (OSError, ValueError, KeyError, TypeError):
            return False
    if bound_inventory(): return d, None
    if ctx.dry: return None, "staging capture for %s not present (dry run)" % tip[:7]
    try:
        cap_env = capture_subprocess_env(
            tip,
            PR_SRC,
            replay_producer_head=head_sha,
            remote_base=STAGING_ORIGIN,
            require_remote=True,
            fixture_path=fixture,
            fixture_sha256=fixture_sha,
        )
    except CaptureReplayError as ex:
        return None, "staging capture for %s producer binding failed (%s)" % (tip[:7], ex)
    try: r = subprocess.run([CAPTURE_STAGING, d, head_sha, tip], capture_output=True, text=True, timeout=900, env=cap_env)
    except subprocess.TimeoutExpired: return None, "staging capture for %s timed out" % tip[:7]
    if r.returncode or not bound_inventory(): return None, "staging capture for %s failed or selection binding missing (rc=%s)" % (tip[:7], r.returncode)
    return d, None

def _staging_has_inventory(d):
    """True when d/capture-regions.json has a struct inventory for every screen it records."""
    try: regions = json.load(open(os.path.join(d, "capture-regions.json")))
    except Exception: return False
    return bool(regions) and all(isinstance(v, dict) and isinstance(v.get("struct"), dict) for v in regions.values())

def v6_review(issue, reference, cand_dir, workdir, base_sha, sha, staging_dir=None, staging_why=None):
    """Model-free restore/new-look verdict: restore_check.check_dir on every screen + scan_diff(merge-base..head). Fail closed.
    staging_dir = the staging capture for feature parity; when it is None, staging_why names the harness cause (not the coder's build)."""
    allow = v6_allow(issue)
    if not allow: return {"overall": "FAIL", "per": {}, "failing": ["(no v6 allowance in gateb-allow.json)"], "flags": [], "allow": None}
    sys.path.insert(0, HOME + "/tsv-gateb"); import restore_check as rc6
    wd = os.path.join(workdir, "v6"); os.makedirs(wd, exist_ok=True)
    try:
        judge = rc6.DescJudge() if allow.get("mode") == "structure" or any(rc6.DETAIL_RE.match(x) for x in os.listdir(reference)) else None
        per = rc6.check_dir(allow, reference, cand_dir, wd, staging_dir=staging_dir, judge=judge)
    except Exception as e: return {"overall": "NO_VERDICT", "no_verdict": True, "per": {}, "failing": ["(v6 checker error %s: %s; harness fault, no verdict)" % (type(e).__name__, str(e)[:120])], "flags": [], "allow": allow}
    if not per: return {"overall": "NO_VERDICT", "no_verdict": True, "per": {}, "failing": ["(no per-screen results; harness fault, no verdict)"], "flags": [], "allow": allow}
    flags = rc6.scan_diff(PR_SRC, "%s..%s" % (base_sha, sha)) if base_sha else [{"what": "diff scan skipped: merge-base unknown (fail closed)", "where": "-"}]
    failing = [f for f, r in sorted(per.items()) if not r.get("ok")]
    named = {}
    if allow.get("mode") == "structure" and per:
        for f, r in sorted(per.items()):
            for why in r.get("reasons") or []:
                nm = structure_name(why); d = named.setdefault(nm, {"screens": [], "detail": why})
                d["screens"].append(f)
        if staging_why and not staging_dir:
            named["feature parity vs staging"] = {"screens": list(per), "detail": "HARNESS: %s (fail closed; not the coder's build)" % staging_why}
        failing = sorted(named)
    return {"overall": "PASS" if not failing and not flags else "FAIL", "per": per, "failing": failing, "flags": flags, "allow": allow,
            "structure": allow.get("mode") == "structure", "harness": staging_why if not staging_dir else None,
            "named": {k: "%s (on %d screen(s): %s)" % (v["detail"][:400], len(v["screens"]), ", ".join(v["screens"][:6]) + (" +%d" % (len(v["screens"]) - 6) if len(v["screens"]) > 6 else "")) for k, v in named.items()}}

STRUCT_NAMES = [("tab icons", "tab icons centred"), ("logo not vertically centred", "centred logos"), ("header logo", "centred logos"), ("header brand group", "centred logos"), ("row logos", "centred logos"), ("budget list", "budget complete"), ("header", "header"), ("tabs", "tabs"), ("day chips", "chips"),
                ("rows", "rows"), ("price sort", "price sort"), ("list does not start cheapest", "price sort"), ("map must be below", "map below the itinerary"), ("itinerary", "map below the itinerary"),
                ("feature lost", "feature parity vs staging"), ("feature parity", "feature parity vs staging"), ("hotels list empty", "feature parity vs staging"), ("flights list empty", "feature parity vs staging"),
                ("cars list empty", "feature parity vs staging"), ("restaurants list empty", "feature parity vs staging"), ("stores list empty", "feature parity vs staging"), ("events list empty", "feature parity vs staging"),
                ("timeline", "timeline icons centred with names"), ("row layout", "row layout: description on the name line, fills the row"), ("description", "description substance and quality"),
                ("overflow", "no overflow"), ("page errors", "no page errors"), ("day-by-day map", "colourful map"), ("structure", "capture data")]
def structure_name(why):
    w = why.lower()
    for pre, nm in STRUCT_NAMES:
        if w.startswith(pre): return nm
    return "other"

def structure_mode(pr):
    """True when this PR's issue is in Gate B structure mode (gateb-allow.json mode "structure"): no pixel compare at all."""
    af = agent_for(pr); issue = af[0] if af else (linked_issues(pr) or [None])[0]
    a = _load(ALLOW_F, {}).get(str(issue)) if issue else None
    return isinstance(a, dict) and a.get("mode") == "structure"

def ci_state(ctx, sha):
    """(failed, pending, n_checks) for a head sha: check runs + commit statuses other than our own gateb."""
    runs = (ctx.api("GET", "/repos/%s/commits/%s/check-runs?per_page=100" % (REPO, sha)) or {}).get("check_runs", [])
    sts = [x for x in (ctx.api("GET", "/repos/%s/commits/%s/status" % (REPO, sha)) or {}).get("statuses", []) if x.get("context") != "gateb"]
    bad = [r["name"] for r in runs if r.get("status") == "completed" and r.get("conclusion") not in ("success", "neutral", "skipped")]
    bad += [x["context"] for x in sts if x.get("state") in ("failure", "error")]
    pend = [r["name"] for r in runs if r.get("status") != "completed"] + [x["context"] for x in sts if x.get("state") == "pending"]
    return bad, pend, len(runs) + len(sts)

def cursor_paused(): return os.path.exists(STOP_F)


def after_gate(ctx, pr, rec, res, reference, cand_dir, bo, dispatch):
    """rec = pregate record, res = gateb_compare JSON, reference = baselines dir used, cand_dir = PR captures,
    bo = baseline_only reason or None, dispatch = tsv_dispatch module (look_request, gateb_status...)."""
    n = pr["number"]; sha = pr["head"]["sha"]
    if res.get("overall") == "SKIPPED_BACKEND_ONLY":
        ctx.log("rereview: PR #%d SKIPPED_BACKEND_ONLY is not a coder failure; no round" % n)
        return "SKIPPED_BACKEND_ONLY"
    st = _load(RR_STATE, {}); pst = st.setdefault(str(n), {"rounds": [], "best": None, "since_best": 0})
    rows, summ = per_screen(os.path.join(res["out"], "summary.json"), reference)
    for f, r in rows.items():
        if r["pct"] is None and os.path.isfile(os.path.join(reference, f)) and os.path.isfile(os.path.join(cand_dir, f)):
            r["pct"] = padded_pct(os.path.join(reference, f), os.path.join(cand_dir, f), res["out"])
    total = round(sum((r["pct"] or 0) for r in rows.values()), 3)
    af = agent_for(pr); issue, agent = (af if af else (None, None))
    if not issue: issue = (linked_issues(pr) or [None])[0]
    allow = allowance(issue) if (bo and issue) else None
    eff = res["overall"]; allowed = []; region = {}; bad = []; v6 = None
    if bo:
        allow = None
        s_dir, s_why = staging_capture(ctx, pr, candidate_fixture(cand_dir), cand_dir)
        v6 = v6_review(issue, reference, cand_dir, res["out"], rec.get("base_sha"), sha, s_dir, s_why)
        eff = v6["overall"]
        if v6.get("structure") and not v6.get("no_verdict"):
            import known_gaps as kg
            base_sha = rec.get("base_sha")
            bn, berr = kg.base_structure(v6_review, issue, reference, res["out"], base_sha, s_dir, s_why,
                                         candidate_fixture(cand_dir), dispatch, dry=ctx.dry, ref=pr["base"]["ref"])
            if berr:
                v6["failing"] = ["(base structure run failed: %s; fail closed)" % berr]; v6["overall"] = "FAIL"
            else:
                new, known = kg.split(v6.get("named") or {}, v6["failing"], bn)
                v6["head_all_failing"] = list(v6["failing"]); v6["failing"] = new; v6["known_gaps"] = known
                v6["overall"] = "PASS" if not new and not v6["flags"] else "FAIL"
                rec["known_gaps"] = known; rec["known_gaps_ledger"] = kg.ledger_slug(base_sha)
                try:
                    from tsv_common import GH
                    rec["known_gap_issues"] = kg.write_ledger(GH(), REPO, pr["base"]["ref"], base_sha, bn, ctx.log, dry=ctx.dry)
                except Exception as e: ctx.log("known-gaps: ledger/issues error %s" % type(e).__name__)
                ctx.log("rereview: PR #%d head %s new fails %d %s; known gaps on base %s: %s" % (n, sha[:7], len(new), new, base_sha[:7], known))
                if v6["overall"] == "PASS" and known:
                    r = kg.ratchet(rec.get("known_gap_issues") or {}, linked_issues(pr), v6["head_all_failing"])
                    rec["gap_ratchet"] = r
                    if r["verdict"] == "PASS":
                        ctx.log("rereview: PR #%d head %s gap ratchet PASS: own gap(s) %s absent on head; deploy stays held on %s" % (n, sha[:7], r["own"], [g for g in known if g not in r["own"]]))
                    elif r["verdict"] == "FAIL":
                        v6["failing"] = list(r["present"]); v6["overall"] = "FAIL"
                        ctx.log("rereview: PR #%d head %s gap ratchet FAIL: own gap(s) still present %s" % (n, sha[:7], r["present"]))
                    else:
                        ctx.log("rereview: PR #%d head %s has no new fails; HOLD_KNOWN_GAPS (owns no ledger gap; deploy held until the base ledger is empty)" % (n, sha[:7]))
                        return "HOLD_KNOWN_GAPS"
            eff = v6["overall"]
        if v6.get("no_verdict"):
            ctx.log("rereview: PR #%d head %s NO VERDICT (harness fault, not the coder's build): %s" % (n, sha[:7], "; ".join(v6["failing"])[:300]))
            if not ctx.dry:
                with open(VERDICTS, "a") as fh: fh.write(json.dumps({"at": now_iso(), "pr": n, "issue": issue, "agent": agent, "sha": sha[:7], "verdict_raw": res["overall"], "verdict": "NO_VERDICT", "reference": "NYC reference screens (NOT approved; %s)" % bo, "failing": v6["failing"]}) + "\n")
            return "NO_VERDICT"
        for f, r6 in v6["per"].items():
            note = "; ".join(r6.get("reasons") or [])[:700]
            if f not in rows: rows[f] = {"verdict": "PASS" if r6.get("ok") else "FAIL", "pct": None, "size_changed": False, "sbs": None, "baseline_size": None, "candidate_size": None}
            if not r6.get("ok"): rows[f]["note"] = note
        for f in v6["failing"]:
            rows.setdefault(f, {"verdict": "FAIL", "pct": None, "size_changed": False, "sbs": None, "baseline_size": None, "candidate_size": None, "note": (v6.get("named") or {}).get(f, f)})
        total = len(v6["failing"]) + len(v6["flags"])
    if allow and allow.get("mode") != "regions":
        ctx.log("rereview: PR #%d allowance for #%s is not region-scoped; ignored (raw verdict stands)" % (n, issue)); allow = None


    judged = lambda r: r["verdict"] != "PASS" or bool(r.get("mismatched")) or r["size_changed"]
    if allow and (res["overall"] != "PASS" or any(judged(r) for r in rows.values())):
        for f, r in rows.items():
            if not judged(r): continue
            rc = region_check(allow, f, reference, cand_dir, res["out"]); region[f] = rc; r["note"] = region_note(rc)
            (allowed if rc["ok"] else bad).append(f)
        eff = "PASS" if not bad else "FAIL"
    failing = sorted(set([f for f, r in rows.items() if r["verdict"] != "PASS" and f not in allowed]) | set(bad), key=lambda f: -(rows[f]["pct"] or 999))
    if v6 is not None: failing = list(v6["failing"])
    is_new_round = not pst["rounds"] or pst["rounds"][-1]["sha"] != sha
    rnd = len(pst["rounds"]) + (1 if is_new_round else 0)
    entry = {"at": now_iso(), "pr": n, "issue": issue, "agent": agent, "sha": sha[:7], "round": rnd, "verdict_raw": res["overall"],
             "verdict": eff, "reference": "NYC reference screens (NOT approved; %s)" % bo if bo else rec.get("reference"), "total_diff_pct": total,
             "allowance": allow.get("why") if allow else None, "allowed_screens": allowed, "failing": failing,
             "screens": {f: [r["verdict"], r["pct"]] for f, r in sorted(rows.items())}, "sbs_dir": res["out"],
             "regions": {f: {k: v for k, v in rc.items() if k != "ok"} for f, rc in sorted(region.items())},
             "sbs_failing": [rows[f]["sbs"] for f in failing if rows[f].get("sbs")]}
    if v6 is not None:
        entry["v6"] = {"failing": v6["failing"], "flags": v6["flags"], "issues": total, "structure": v6.get("structure", False), "named": v6.get("named") or {},
                       "notes": sorted({x for r6 in v6["per"].values() for x in (r6.get("notes") or []) if "logo box" in x or "pending" in x})[:6]}
        entry["allowance"] = "structure mode: named checks, pixel compare skipped" if v6.get("structure") else (v6.get("allow") or {}).get("why")
    if not ctx.dry:
        with open(VERDICTS, "a") as fh: fh.write(json.dumps(entry) + "\n")
    ctx.log("rereview: PR #%d round %d %s (raw %s) %s vs %s; failing %d%s" % (n, rnd, eff, res["overall"],
            ("v6 issues %d (code flags %d)" % (total, len(v6["flags"]))) if v6 is not None else "total %.2f%%" % total, entry["reference"], len(failing),
            "; allowed %d (%s)" % (len(allowed), allow.get("why")) if allowed else ""))
    if v6 is not None and eff == "PASS": pst["v6_pass"] = sha; _save_if(ctx, st)
    if not agent:
        return eff
    if is_new_round:
        pst["rounds"].append({"sha": sha, "total": total, "verdict": eff, "at": now_iso(), "failing": list(failing)})
    if eff == "PASS":
        pst.update({"passed": sha, "active": False})
        if v6 is not None: pst["v6_pass"] = sha
        _save_if(ctx, st)
        if res["overall"] != "PASS" and not ctx.dry:
            for lab in ("kickback", "status:stuck"):
                try: ctx.api("DELETE", "/repos/%s/issues/%d/labels/%s" % (REPO, n, lab.replace(":", "%3A")))
                except Exception: pass
        if bo:
            struct = (v6.get("allow") or {}).get("mode") == "structure"
            dispatch.gateb_status(sha, "success", ("Gate B structure PASS on %s (named checks + code scan, pixel compare skipped)" if struct else "Gate B v6 PASS on %s (32 screens vs the NYC reference screens, NOT approved; rules + code scan)") % sha[:7])
            ctx.write("POST", "/repos/%s/issues/%d/labels" % (REPO, n), {"labels": ["new-look"]}, "PR #%d add label new-look (restore passes with only the deliberate changes)" % n)
            ctx.write("POST", "/repos/%s/issues/%d/comments" % (REPO, n), {"body": ("Gate B structure mode round %d: PASS. Named checks hold (header, tabs, chips, rows, centred logos, price sort, map below the itinerary, no overflow, no page errors, colourful map) and the diff scan is clean. Pixel compare was skipped. The new-baseline candidate set goes to Craig. Still a draft; nothing merges until Craig's OK. Verdict log: Ubuntu `%s`.\n\n_Ubuntu cron re-review, %s_" if struct else "Gate B re-review round %d: only the deliberate, allowed changes remain (%s; allowed screens: %s; total diff %.2f%% vs the NYC reference screens, NOT approved). Side-by-sides go to Craig on Telegram (via the iMac) for yes/no. Still a draft; nothing merges until Craig's OK. Verdict log: Ubuntu `%s`.\n\n_Ubuntu cron re-review, %s_") % ((rnd, VERDICTS, pt_now()) if struct else (rnd, allow.get("why") if allow else "-", ", ".join(allowed) or "none", total, VERDICTS, pt_now()))}, "PR #%d re-review PASS note" % n)
            linked = [ctx.api("GET", "/repos/%s/issues/%d" % (REPO, issue))] if issue else []
            try: dispatch.look_request(pr, linked, ("PASS", None, os.path.basename(res["out"]), LOOK_SCREENS), structure=struct)
            except Exception as e: ctx.log("rereview: PR #%d look_request error %s" % (n, e))
        return eff

    pst["unit"] = "checks" if v6 is not None else "pct"
    if is_new_round:
        if pst["best"] is None or total < pst["best"] - IMPROVE_EPS: pst["best"], pst["since_best"] = total, 0
        else: pst["since_best"] += 1
    _save_if(ctx, st)
    if pst["since_best"] >= STALL_ROUNDS: return stop(ctx, st, pst, pr, issue, agent, rnd, total)
    same, streak, same_set = G.gateb_check(n)
    if same and not pst.get("stopped"): return stop_same_failure(ctx, st, pst, pr, issue, agent, rnd, streak, same_set)
    if G.gateb_tier(n)[0] == 1 and not pst.get("stopped"):
        ctx.log("rereview: PR #%d at %d Gate B fails -> tier 1 lane round (no Cursor fix-it)" % (n, streak)); pst["active"] = False; _save_if(ctx, st); return "FAIL"
    send_fixit(ctx, st, pst, pr, issue, agent, rnd, total, rows, failing, entry, bo)
    return eff

def capture_fail(ctx, pr, rec, reason, tail, shot, out, bo):
    """Craig 2026-10-08 11:15 AM PT: 2 consecutive capture failures on one head = Gate B (v6) FAIL. Same bookkeeping as
    after_gate, one failing item ('page') whose reason says exactly what didn't render, with the capture log tail and the
    screenshot of where it stopped (if any). Fires the normal fix-it (or a pending fixit-override.json strong-model round)."""
    n = pr["number"]; sha = pr["head"]["sha"]
    st = _load(RR_STATE, {}); pst = st.setdefault(str(n), {"rounds": [], "best": None, "since_best": 0})
    af = agent_for(pr); issue, agent = (af if af else (None, None))
    item = "page (did not render)"
    tail_txt = "\n".join((tail or "").strip().splitlines()[-25:])[-2000:]
    rows = {item: {"verdict": "FAIL", "pct": None, "size_changed": False, "sbs": shot, "baseline_size": None, "candidate_size": None,
                   "note": "%s. Capture log tail:\n```\n%s\n```%s" % (reason, tail_txt, "\nScreenshot of where it stopped is attached." if shot else "\nNo screenshot exists.")}}
    is_new_round = not pst["rounds"] or pst["rounds"][-1]["sha"] != sha
    rnd = len(pst["rounds"]) + (1 if is_new_round else 0)
    entry = {"at": now_iso(), "pr": n, "issue": issue, "agent": agent, "sha": sha[:7], "round": rnd, "verdict_raw": "CAPTURE_FAIL", "verdict": "FAIL",
             "reference": "NYC reference screens (NOT approved; %s)" % bo if bo else rec.get("reference"), "total_diff_pct": None, "allowance": None, "allowed_screens": [],
             "failing": [item], "reason": reason, "screens": {}, "sbs_dir": out, "regions": {}, "sbs_failing": [shot] if shot else [],
             "capture_fail": True, "notice": rec.get("notice")}
    if bo: entry["v6"] = {"failing": [item], "flags": [], "issues": 1, "notes": []}
    if not ctx.dry:
        with open(VERDICTS, "a") as fh: fh.write(json.dumps(entry) + "\n")
    if not agent: return "FAIL"
    if is_new_round:
        pst["rounds"].append({"sha": sha, "total": 32, "verdict": "FAIL", "at": now_iso(), "capture_fail": reason})
        if pst["best"] is None: pst["best"], pst["since_best"] = 32, 0
        else: pst["since_best"] += 1
    _save_if(ctx, st)
    if pst["since_best"] >= STALL_ROUNDS: return stop(ctx, st, pst, pr, issue, agent, rnd, 32)
    send_fixit(ctx, st, pst, pr, issue, agent, rnd, 32, rows, [item], entry, bo)
    return "FAIL"

LOOK_SCREENS = ["hotels-390.png", "flights-390.png", "cars-390.png", "daybyday-390.png", "hotels-1280.png", "budget-390.png"]
def fnmatch_any(f, pats): return any(fnmatch.fnmatch(f, p) for p in pats)
def _save_if(ctx, st):
    if not ctx.dry: _save(RR_STATE, st)

def fmt_total(pst, v):
    """Structure/v6 totals count failing screens + code flags; pixel-mode totals are a diff %."""
    if v is None: return "-"
    return ("%d failing checks" % v) if pst.get("unit") == "checks" else ("%.2f%% total diff" % v)

def stop(ctx, st, pst, pr, issue, agent, rnd, total):
    n = pr["number"]
    if pst.get("stopped"): return "FAIL"
    ctx.write("POST", "/repos/%s/issues/%d/labels" % (REPO, n), {"labels": ["status:stuck", "needs-dr-eggbot"]}, "PR #%d add status:stuck + needs-dr-eggbot" % n)
    ctx.write("POST", "/repos/%s/issues/%d/comments" % (REPO, n), {"body": "stuck: the Gate B re-review loop stopped after round %d. %s now, best %s; no improvement for %d rounds in a row, so no more fix-its are sent to Cursor agent %s. "
              "Labelled `status:stuck` + `needs-dr-eggbot` for dr eggbot (not Craig). Verdict history: Ubuntu `%s`.\n\n_Ubuntu cron re-review, %s_"
              % (rnd, fmt_total(pst, total), fmt_total(pst, pst["best"]), STALL_ROUNDS, agent, VERDICTS, pt_now())}, "PR #%d re-review stopped" % n)
    pst.update({"stopped": now_iso(), "active": False}); _save_if(ctx, st)
    ctx.log("rereview: PR #%d STOPPED after %d rounds without improvement (needs-dr-eggbot)" % (n, STALL_ROUNDS))
    return "FAIL"

def stop_same_failure(ctx, st, pst, pr, issue, agent, rnd, streak, failing):
    """Guardrail 1 (two tries, Craig 2026-10-13): the GATEB_STOP-th Gate B FAIL stops the PR. No more fix-its; status:stuck +
    needs-dr-eggbot, or + needs-craig when escalated (guardrail 5). The stuck page carries the failing set."""
    n = pr["number"]
    if pst.get("stopped"): return "FAIL"
    why = "Gate B failed %d times (tier 0 + tier 1 spent, stop at %d); rethink the brief" % (streak, G.TIER_STOP)
    slug = G.write_stuck_page(n, "gateb", failing, streak, why) if not ctx.dry else "(dry run: not written)"
    esc = G.mark_stuck(n, "gateb", failing, streak, why) if not ctx.dry else False
    labels = ["status:stuck", "needs-dr-eggbot"] + (["needs-craig"] if esc else [])
    ctx.write("POST", "/repos/%s/issues/%d/labels" % (REPO, n), {"labels": labels}, "PR #%d add %s (Gate B two fails)" % (n, " + ".join(labels)))
    ctx.write("POST", "/repos/%s/issues/%d/comments" % (REPO, n), {"body": "stuck: stopped after %d failed Gate B rounds (round %d), so no more fix-its are sent to Cursor agent %s. "
              "New commits, re-arms and smaller failing sets do not reset this. Root-cause review by dr eggbot.\n\nRepeated failing set:\n%s\n\nStuck page: `%s`. %s\n\n_Ubuntu cron re-review, %s_"
              % (streak, rnd, agent, "\n".join("- %s" % f for f in failing) or "- (none named)", slug,
                 "Labelled `status:stuck` + `needs-dr-eggbot` + `needs-craig`: stuck again after a diagnosis re-arm, so Craig has it now." if esc else
                 "Labelled `status:stuck` + `needs-dr-eggbot` for dr eggbot (not Craig). A `diagnosis:` comment with root cause and changed scope re-arms it once; stuck again goes to Craig.", pt_now())}, "PR #%d two-tries stop comment" % n)
    pst.update({"stopped": now_iso(), "active": False}); _save_if(ctx, st)
    ctx.log("rereview: PR #%d STOPPED: two fix-it tries used, %d failed rounds (%s)%s" % (n, streak, ", ".join(failing)[:300], "; escalated to Craig" if esc else ""))
    return "FAIL"

def pr_files(ctx, n):
    """Changed file names of the PR, or None (unknown: treated as in scope, so no pause)."""
    try: fs = ctx.api("GET", "/repos/%s/pulls/%d/files?per_page=100" % (REPO, n)) or []
    except Exception as e: ctx.log("rereview: PR #%d file list unreadable (%s); scope check skipped" % (n, type(e).__name__)); return None
    return [f["filename"] for f in fs] if len(fs) < 100 else None

def shrink(png, workdir):
    out = os.path.join(workdir, "_fixit-" + os.path.basename(png).replace(".png", ".jpg"))
    subprocess.run(["convert", png, "-resize", "2400x2400>", "-quality", "85", out], capture_output=True)
    return out if os.path.exists(out) and os.path.getsize(out) < 14_000_000 else None

def send_fixit(ctx, st, pst, pr, issue, agent, rnd, total, rows, failing, entry, bo):
    from lane_policy import block_new_round
    if block_new_round(ctx.log, "cursor"): return
    n = pr["number"]; sha = pr["head"]["sha"]
    if G.gateb_tier(n)[0] != 0:
        ctx.log("rereview: PR #%d tier %s; Cursor fix-it refused, tier-1 lane owns it" % (n, G.gateb_tier(n)[0])); pst["active"] = False; _save_if(ctx, st); return
    api = getattr(ctx, "api", None)
    if api is not None:
        import cursor_live as cl

        class _Gh:
            def req(self, method, path, **kw):
                return api(method, path)

        gh = _Gh()
        cache = getattr(ctx, "_live_cache", None)
        if cache is None or getattr(cache, "gh", None) is not gh:
            cache = cl.LiveCache(gh)
            ctx._live_cache = cache
        if cl.skip_if_closed(ctx.log, gh, issue_n=issue, pr_n=n, cache=cache):
            return
    if pst.get("fixit_sha") == sha and pst.get("fixit_round") == rnd: return
    why = G.blocked_reason(n, fixit=True)
    if why: G.refuse(ctx.log, n, "fix-it round %d" % rnd, why, dry=ctx.dry); return
    if failing:
        oos, areas, oos_why = G.out_of_scope(pr_files(ctx, n), failing)
        if oos:
            owners = ["#%s (%s)" % (G.owner_issue(a), a) if G.owner_issue(a) else "%s (owning issue not mapped in guard-owners.json)" % a for a in areas]
            if pst.get("scope_pause_sha") != sha:
                ctx.write("POST", "/repos/%s/issues/%d/comments" % (REPO, n), {"body": "paused: %s. Owning issue: %s. No fix-it sent for head `%s`; this PR's own changes do not touch those screens. "
                          "Fix them on the owning issue, or update this PR's scope.\n\n_Ubuntu cron re-review, %s_" % (oos_why, ", ".join(owners), sha[:7], pt_now())}, "PR #%d out-of-scope pause" % n)
                pst["scope_pause_sha"] = sha; _save_if(ctx, st)
            ctx.log("rereview: PR #%d round %d PAUSED (out of scope): %s; no fix-it" % (n, rnd, oos_why)); return
    holds = G.fresh_hold_labels(lambda p: ctx.api("GET", p), n)
    if holds:
        ctx.log("rereview: PR #%d round %d FAIL; fix-it NOT sent because the PR has a hold: label (%s)" % (n, rnd, ", ".join(holds)[:200])); return
    if cursor_paused():
        if pst.get("paused_sha") != sha:
            ctx.log("rereview: PR #%d round %d FAIL; fix-it NOT sent to %s because CURSOR_STOP is on (Cursor paused). Sent after `cursor_launch.py start`." % (n, rnd, agent))
            pst["paused_sha"] = sha; pst["fixit_round"] = None; _save_if(ctx, st)
        return
    try: ci_bad, ci_pend, _ = ci_state(ctx, sha)
    except Exception as e: ci_bad, ci_pend = ["(CI status unreadable: %s)" % type(e).__name__], []
    ci_txt = ("\n\nCI is RED on head %s: %s. Fix these too (unit tests must pass)." % (sha[:7], ", ".join(ci_bad[:8]))) if ci_bad else ""
    sz = lambda f: "size %s -> %s" % (tuple(rows[f]["baseline_size"] or []), tuple(rows[f]["candidate_size"] or [])) if rows[f]["size_changed"] else ""
    tbl = "\n".join("| %s | %s | %s |" % (f, "%.2f%%" % rows[f]["pct"] if rows[f]["pct"] is not None else "?", "; ".join(x for x in (sz(f), rows[f].get("note", "")) if x)) for f in failing)
    allow_txt = (" Allowed deliberate changes for this issue: %s. Only pixels inside the list rows and icon boxes may differ; everything else must match exactly." % entry["allowance"]) if entry.get("allowance") else ""
    ref_txt = "NYC reference screens (NOT approved: Craig 2026-10-08 12:19 PM PT)" if bo else entry["reference"]
    note = (pst.get("notes") or {}).get("next_fixit")
    body = ("### Gate B re-review round %d: **FAIL** (%d screens, %s; best so far %s, %d round(s) without improvement)\n\n"
            "Compared to %s.%s\n\n| screen | diff | note |\n|---|---|---|\n%s\n\nSide-by-sides (baseline | PR | diff): Ubuntu `%s`.\n\n"
            "kickback: one follow-up sent to the same Cursor agent %s with the worst screens.%s\n\n_Ubuntu cron re-review, %s_"
            % (rnd, len(failing), fmt_total(pst, total), fmt_total(pst, pst["best"] or total), pst["since_best"], ref_txt, allow_txt, tbl, entry["sbs_dir"], agent,
               ("\n\nGuidance for this round: " + note) if note else "", pt_now()))
    v6 = entry.get("v6")
    struct = bool(v6 and v6.get("structure"))
    if v6 and struct:
        flags_txt = "".join("\n- CODE FLAG: %s (%s)" % (x["what"], x["where"][:160]) for x in v6["flags"])
        body = ("### Gate B structure mode round %d: **FAIL** (%d named checks, %d code flags)\n\nPixel compare skipped. Named checks: header, tabs, chips, rows, centred logos, price sort, map below the itinerary, no overflow, no page errors, colourful map. Diff-scan bans still apply.\n\n| screen | failed checks |\n|---|---|\n%s%s%s\n\nkickback: one follow-up sent to the same Cursor agent %s.\n\n_Ubuntu cron re-review, %s_"
                % (rnd, len(failing), len(v6["flags"]), "\n".join("| %s | %s |" % (f, (rows.get(f, {}).get("note") or "")[:300].replace("|", "/")) for f in failing),
                   ("\n\nCode flags:" + flags_txt) if flags_txt else "", ci_txt, agent, pt_now()))
    elif v6:
        flags_txt = "".join("\n- CODE FLAG: %s (%s)" % (x["what"], x["where"][:160]) for x in v6["flags"])
        body = ("### Gate B v6 re-review round %d: **FAIL** (%d screens, %d code flags)\n\nCompared to the NYC reference screens (NOT approved: Craig 2026-10-08 12:19 PM PT) with the v6 rules "
                "(pixel-exact outside the hotels/cars/flights lists; rows judged by the approved design; icons may only move; no capture detection or bitmap stand-ins).\n\n"
                "| screen | why |\n|---|---|\n%s%s%s\n\nkickback: one follow-up sent to the same Cursor agent %s.\n\n_Ubuntu cron re-review, %s_"
                % (rnd, len(failing), len(v6["flags"]), "\n".join("| %s | %s |" % (f, (rows.get(f, {}).get("note") or "")[:300].replace("|", "/")) for f in failing),
                   ("\n\nCode flags:" + flags_txt) if flags_txt else "", ci_txt, agent, pt_now()))
        prompt = ("Follow-up on PR #%d (your branch %s, issue #%s), Gate B v6 re-review round %d. ONE fix-up pass: commit to the same branch, no new PR.\n\n"
                  "Ubuntu built head %s (sandboxed vite build + Playwright capture, NYC fixture) and checked it against the NYC reference screens (NOT approved: Craig 2026-10-08 12:19 PM PT). %d screens fail:\n%s%s%s\n\n"
                  "Rules: build the real UI. No capture/headless/webdriver detection and no bitmap stand-ins or sprites of baseline crops. Everything outside the hotels/cars/flights "
                  "lists must match the baseline pixel for pixel; icons may only be re-centred, never resized. Rows: any number of rows, sorted cheapest first ('Price \u2191' active); "
                  "every row inside the screen width with the right-hand control kept; airline names on flights; a real logo on every hotel and everything we have a logo for "
                  "(when one is missing, run a specific logo search for that item; never show a generic placeholder icon; an occasional missing logo is OK). "
                  "Don't touch baselines, thresholds or gate config; don't deploy or run vercel; don't merge; no force-push. Update the PR description, then stop.%s"
                  % (n, pr["head"]["ref"], issue, rnd, sha[:7], len(failing),
                     "\n".join("- %s: %s" % (f, (rows.get(f, {}).get("note") or "")[:400]) for f in failing), flags_txt, ci_txt, ("\n\nImportant: " + note) if note else ""))
    else:
      body = body + ci_txt
      prompt = ("Follow-up on PR #%d (your branch %s, issue #%s), Gate B re-review round %d. ONE fix-up pass: commit to the same branch, no new PR.\n\n"
              "Ubuntu's cron built head %s exactly like Gate B (sandboxed vite build + Playwright capture with the NYC fixture) and pixel-diffed it against %s. "
              "%d screens still fail (Gate B fails at >= 2%% pixel diff or a size/aspect change > 3%%); total diff %.2f%%.%s\n\nFailing screens (worst first):\n%s\n\n"
              "The attached images are baseline | your build | diff for the worst screens. Make them match.%s\n\n"
              "Rules: don't touch baselines, thresholds or gate config; one shared render module for web + PDF; don't deploy or run vercel; don't merge; "
              "no force-push. Update the PR description with what you changed, then stop."
              % (n, pr["head"]["ref"], issue, rnd, sha[:7], ref_txt, len(failing), total, allow_txt,
                 "\n".join("- %s: %s%s" % (f, "%.2f%%" % rows[f]["pct"] if rows[f]["pct"] is not None else "?", "".join(" (%s)" % x for x in (sz(f), rows[f].get("note", "")) if x)) for f in failing),
                 ("\n\nImportant: " + note) if note else "")) + ci_txt
    if entry.get("capture_fail"):
        body = "%s\n\nkickback: one follow-up sent to the same Cursor agent %s.\n\n_Ubuntu cron re-review, %s_" % (entry.get("notice") or "PR #%d: Gate B FAIL (%s)" % (n, entry.get("reason")), agent, pt_now())

    sys.path.insert(0, D); import brief as B
    if struct:
        fl = ["named check FAILED, %s: %s" % (f, (v6.get("named") or {}).get(f, "")[:2400]) for f in failing] + ["CODE FLAG: %s (%s)" % (x["what"], x["where"][:160]) for x in v6["flags"]]
    elif v6:
        fl = ["%s: %s" % (f, (rows.get(f, {}).get("note") or "fails the v6 rules")[:2400]) for f in failing] + ["CODE FLAG: %s (%s)" % (x["what"], x["where"][:160]) for x in v6["flags"]]
    else:
        fl = ["%s: %s%s" % (f, "%.2f%%" % rows[f]["pct"] if rows[f]["pct"] is not None else "?", "".join(" (%s)" % x for x in (sz(f), rows[f].get("note", "")) if x)) for f in failing]
    fl += ["CI is red on %s: %s" % (sha[:7], ", ".join(ci_bad[:8]))] if ci_bad else []
    if struct: fl += ["Structure mode: no pixel compare. Your build's screens are on Ubuntu `%s`; each named check above must hold on every screen it lists." % entry["sbs_dir"]]
    elif not entry.get("capture_fail"): fl += ["Attached: baseline | your build | diff for the worst screens (Ubuntu `%s`)." % entry["sbs_dir"]]
    fields = B.fixit_fields("gateb", n, pr["head"]["ref"], issue, sha, pr["base"]["ref"], fl)
    if struct:
        fields["done_check"] = ("Gate B structure PASS on your new head: Ubuntu builds it (sandboxed vite build, Playwright capture, NYC fixture) and runs the named "
                                "structure checks on all 32 screens: header, tabs (each tab icon's vertical centre within 2px of its label's), chips, rows, centred logos, price sort (cheapest first, 'Price \u2191' active), map below the itinerary, "
                                "no overflow, no page errors, and the colourful styled day-by-day map. No pixel compare. The diff scan of the PR must be clean (no capture detection, "
                                "no bitmap stand-ins). CI must be green on the same head.")
    if allow_txt: fields["task"] = fields["task"] + allow_txt
    if note: fields["task"] = fields["task"] + "\n\nImportant: " + note
    try: prompt = B.build(fields)
    except B.BriefError as e:
        ctx.log("rereview: PR #%d round %d fix-it NOT sent: %s" % (n, rnd, e)); return
    ov = B.pending_override(issue) if issue else None
    if ov and ov.get("pr") not in (None, n): ov = None
    if ov:
        try: models = (cur("GET", "/v1/models") or {}).get("items", [])
        except CursorErr as e: models = []; ctx.log("rereview: PR #%d /v1/models unreadable (%s)" % (n, e))
        ok, checks = B.preflight(fields, kind="gateb", base=pr["base"]["ref"], model_id=ov["model"], params=ov.get("params"), models=models,
                                 live_head=sha, paused=cursor_paused())
        why = "; ".join("%s: %s" % (c[0], c[2]) for c in checks if not c[1])
        if not ok:
            ctx.log("rereview: PR #%d round %d strong-model fix-it (%s) BLOCKED by preflight: %s. Nothing sent; override kept; retried next run." % (n, rnd, ov.get("label") or ov["model"], why))
            if not ctx.dry: pst["override_blocked"] = {"at": now_iso(), "sha": sha[:7], "why": why[:300]}; _save_if(ctx, st)
            return
    if ctx.dry:
        ctx.log("rereview: WOULD post fix-it on PR #%d round %d and send %s (%d failing; brief %d chars)" % (n, rnd,
                ("a FRESH agent on %s (preflight PASS)" % (ov.get("label") or ov["model"])) if ov else "a follow-up to %s" % agent, len(failing), len(prompt))); return
    try:
        a, r = agent_run(agent)
        if (r.get("status") or "").upper() in ("CREATING", "RUNNING"):
            ctx.log("rereview: PR #%d agent %s busy; fix-it waits for the next run" % (n, agent)); return
    except CursorErr as e:
        ctx.log("rereview: PR #%d agent %s status error %s; fix-it waits" % (n, agent, e)); return
    imgs = []
    for p in [rows[f]["sbs"] for f in failing if rows[f].get("sbs")][:MAX_IMAGES]:
        j = shrink(p, entry["sbs_dir"])
        if j: imgs.append({"data": base64.b64encode(open(j, "rb").read()).decode(), "mimeType": "image/jpeg"})


    cs = _load(CURSOR_STATE, {}); rec_c = (cs.get("issues") or {}).get(str(issue))
    trial = (rec_c or {}).get("trial") or {}
    kind = "fixit"
    try:
        if ov:
            label = ov.get("label") or ov["model"]
            body_a = {"prompt": {"text": prompt, "images": imgs}, "model": {"id": ov["model"], "params": ov.get("params") or []},
                      "name": ("TSV #%s fix-it r%d (%s)" % (issue, rnd, ov["model"]))[:100],
                      "repos": [{"url": "https://github.com/" + REPO, "prUrl": pr["html_url"]}], "workOnCurrentBranch": True, "autoCreatePR": False, "mode": "agent"}
            res = cur("POST", "/v1/agents", body_a); model = label; kind = "fixit-strong"
            new_agent = (res.get("agent") or {}).get("id")
            B.mark_override_used(issue, {"agent": new_agent, "run": (res.get("run") or {}).get("id"), "round": rnd, "sha": sha[:7], "at": now_iso()})
            if new_agent and rec_c is not None:
                rec_c.update({"agent": new_agent, "model": ov["model"], "trial": {"agent": new_agent, "model": ov["model"], "rounds": 1, "at": now_iso(),
                              "note": "one-time strong-model fix-it (fixit-override.json); the next fix-it goes to a fresh %s agent" % NORMAL_MODEL}})
            body = body.replace("one follow-up sent to the same Cursor agent %s" % agent, "a FRESH Cursor agent %s on %s got the full written brief" % (new_agent, label))
            agent = new_agent or agent
        elif trial.get("agent") == agent and not trial.get("keep_model"):
            body_a = {"prompt": {"text": prompt, "images": imgs}, "model": {"id": NORMAL_MODEL}, "name": ("TSV #%s fix-it r%d (normal model)" % (issue, rnd))[:100],
                      "repos": [{"url": "https://github.com/" + REPO, "prUrl": pr["html_url"]}], "workOnCurrentBranch": True, "autoCreatePR": False, "mode": "agent"}
            res = cur("POST", "/v1/agents", body_a); model = NORMAL_MODEL
            new_agent = (res.get("agent") or {}).get("id")
            if new_agent and rec_c is not None:
                trial["ended"] = now_iso(); trial["next_agent"] = new_agent
                rec_c.update({"agent": new_agent, "model": NORMAL_MODEL, "trial": trial})
            agent = new_agent or agent
        else:
            res = cur("POST", "/v1/agents/%s/runs" % agent, {"prompt": {"text": prompt, "images": imgs}})
            model = (rec_c or {}).get("model") or "agent default"
    except CursorErr as e:
        ctx.log("rereview: PR #%d follow-up to %s FAILED (%s); retried next run" % (n, agent, e)); return
    if rec_c is not None:
        rec_c.setdefault("rounds", []).append({"round": rnd, "agent": agent, "run": (res.get("run") or {}).get("id"), "model": model, "at": now_iso(), "kind": kind})
        _save(CURSOR_STATE, cs)
    run_id = (res.get("run") or res).get("id")
    ctx.write("POST", "/repos/%s/issues/%d/comments" % (REPO, n), {"body": body}, "PR #%d re-review fix-it round %d" % (n, rnd))
    ctx.write("POST", "/repos/%s/issues/%d/labels" % (REPO, n), {"labels": ["kickback"]}, "PR #%d kickback (re-review round %d)" % (n, rnd))
    pst.update({"fixit_sha": sha, "fixit_round": rnd, "followup_run": run_id, "followup_at": now_iso(), "active": True, "agent": agent, "issue": issue})
    _save(RR_STATE, st)
    ctx.log("rereview: PR #%d round %d fix-it posted; follow-up run %s sent to %s (%d images)" % (n, rnd, run_id, agent, len(imgs)))


def tick(ctx, prs_by_number, held_numbers=()):
    st = _load(RR_STATE, {}); changed = False
    for k, pst in st.items():
        if not pst.get("active") or not pst.get("followup_run") or pst.get("stopped"): continue
        if int(k) in held_numbers: continue
        pr = prs_by_number.get(int(k))
        if not pr: pst["active"] = False; changed = True; continue
        if any(l["name"].startswith("hold:") for l in pr.get("labels", [])): continue
        if pr["head"]["sha"] != pst.get("fixit_sha"): continue
        try: r = cur("GET", "/v1/agents/%s/runs/%s" % (pst["agent"], pst["followup_run"]))
        except CursorErr as e: ctx.log("rereview tick: PR #%s run status error %s" % (k, e)); continue
        s = (r.get("status") or "").upper()
        if s in ("CREATING", "RUNNING"): continue

        rnd = len(pst["rounds"]) + 1
        pst["rounds"].append({"sha": pst["fixit_sha"], "total": pst["rounds"][-1]["total"] if pst["rounds"] else None, "verdict": "NO_COMMIT", "at": now_iso(), "run_status": s})
        pst["since_best"] = pst.get("since_best", 0) + 1; changed = True
        ctx.log("rereview tick: PR #%s follow-up %s ended %s with no new commit (round %d, %d without improvement)" % (k, pst["followup_run"], s, rnd, pst["since_best"]))
        if not ctx.dry:
            with open(VERDICTS, "a") as fh: fh.write(json.dumps({"at": now_iso(), "pr": int(k), "issue": pst.get("issue"), "agent": pst["agent"], "sha": pst["fixit_sha"][:7], "round": rnd,
                                                                 "verdict": "NO_COMMIT", "run_status": s, "total_diff_pct": pst["rounds"][-2]["total"] if len(pst["rounds"]) > 1 else None}) + "\n")
        pst["fixit_round"] = None
        if not ctx.dry: _save(RR_STATE, st)
        if pst["since_best"] >= STALL_ROUNDS:
            stop(ctx, st, pst, pr, pst.get("issue"), pst["agent"], rnd, pst["rounds"][-1]["total"] or 0); continue

        ctx.dispatch_state["pregate"].pop(k, None); ctx.log("rereview tick: PR #%s Gate B will re-run on the same head and re-send the fix-it" % k)
    if changed and not ctx.dry: _save(RR_STATE, st)

def review_draft(pr, bo):
    """Draft PRs the pre-merge gate should still check: restore/new-look Cursor PRs (they stay drafts until Craig's OK)."""
    return bool(bo) and agent_for(pr) is not None

if __name__ == "__main__":
    if sys.argv[1:2] == ["status"]:
        print(json.dumps(_load(RR_STATE, {}), indent=1))
