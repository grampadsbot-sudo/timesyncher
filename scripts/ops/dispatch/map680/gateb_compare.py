#!/usr/bin/env python3
"""Gate B screenshot compare: approved baseline vs PR staging screenshots.

pixelmatch first; a cheap OpenRouter vision model only for close calls.
Verdicts: PASS / FAIL / NEEDS_JUDGMENT. Exit 0 / 1 / 3.

usage:
  gateb_compare.py --baselines DIR|FILE --candidates DIR|FILE [--target owner/repo#N]
                   [--out DIR] [--no-vision] [--pass-max 0.0001] [--fail-min 0.02] [--iso-max 0]
Auto-PASS needs 0 changed pixels (dr eggbot 2026-10-07 3:55 PM PT; captures are deterministic, 0 px run to run on all 32
screens). --iso-max N tolerates up to N ISOLATED single changed pixels (antialias); default 0 because the stability runs
showed none. Any connected cluster (2+ touching changed pixels), or more than N pixels, is at least a close call for the
judge, and a FAIL at >= --fail-min. A 0.006% change (e.g. the header pill's '8 days' removed) no longer passes unseen.
Dir mode pairs files by name (e.g. hotels-390.png). Baselines: ~/tsv-baselines/{nyc,tsv-chips-sort}.
No secrets are printed. OpenRouter key from $OPENROUTER_API_KEY or ~/.local/bin/openrouter-key.
GitHub token (for --target) from $GH_TOKEN/$GITHUB_TOKEN or ~/.config/tsv-gateb/gh-token (mode 600).
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request, shutil

HERE = os.path.dirname(os.path.realpath(__file__))
sys.path.insert(0, HERE)
from gateb_price import assess_price_effect
from gateb_pregate_map import (
    MAP_MASK_WHY,
    assess_daybyday_after_pixels,
    is_daybyday_full_shot,
    map_box_from_regions,
    masked_pair_paths,
)

def _load_regions(path):
    if not path:
        return None
    if os.path.isdir(path):
        path = os.path.join(path, "capture-regions.json")
    return json.load(open(path)) if path and os.path.isfile(path) else None
VISION_MODEL = os.environ.get("GATEB_VISION_MODEL", "google/gemini-3.1-flash-lite")
VISION_MAX_PRICE = {"prompt": 0.25, "completion": 1.50}

def sh(*a, **k):
    return subprocess.run(a, capture_output=True, text=True, **k)

def size(p):
    r = sh("identify", "-format", "%w %h", p + "[0]")
    w, h = r.stdout.split()
    return int(w), int(h)

def pairs(bas, cand):
    if os.path.isfile(bas) and os.path.isfile(cand):
        return [(os.path.basename(cand), bas, cand)], []
    out, missing = [], []
    for n in sorted(os.listdir(bas)):
        if not n.endswith(".png"): continue
        c = os.path.join(cand, n)
        (out.append((n, os.path.join(bas, n), c)) if os.path.isfile(c) else missing.append(n))
    return out, missing

def or_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k: return k
    h = os.path.expanduser("~/.local/bin/openrouter-key")
    if os.access(h, os.X_OK):
        r = sh(h)
        if r.returncode == 0 and r.stdout.strip(): return r.stdout.strip()
    return None

LAST_USAGE = {}

def vision(sbs):
    LAST_USAGE.clear()
    key = or_key()
    if not key: return "UNSURE", "no OpenRouter key available"
    small = sbs.replace(".png", "-small.png")
    sh("convert", sbs, "-resize", "1500x3000>", small)
    b64 = base64.b64encode(open(small, "rb").read()).decode()
    prompt = ("Side-by-side: LEFT = approved baseline screenshot, MIDDLE = new staging screenshot, "
              "RIGHT = pixel diff (red = changed pixels). Decide if the new screenshot keeps the SAME layout and "
              "content as the baseline (only anti-aliasing, font hinting or sub-pixel noise) or if something visible "
              "changed (moved, missing, added, resized, recolored element or different text). Reply ONLY JSON: "
              "{\"verdict\":\"PASS|FAIL|UNSURE\",\"why\":\"<one short sentence>\"}")
    body = {"model": VISION_MODEL, "temperature": 0, "max_tokens": 120, "usage": {"include": True},
            "provider": {"max_price": VISION_MAX_PRICE},
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64}}]}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + key,
        "Content-Type": "application/json", "X-Title": "tsv-gateb-compare"})
    try:
        resp = json.load(urllib.request.urlopen(req, timeout=60))
        LAST_USAGE.clear(); LAST_USAGE.update({"cost": (resp.get("usage") or {}).get("cost"), "provider": resp.get("provider")})
        txt = resp["choices"][0]["message"]["content"]
        s = txt[txt.find("{"): txt.rfind("}") + 1]
        j = json.loads(s)
        v = str(j.get("verdict", "UNSURE")).upper()
        return (v if v in ("PASS", "FAIL") else "UNSURE"), str(j.get("why", ""))[:200]
    except Exception as e:
        return "UNSURE", "vision error: " + type(e).__name__

def compare(name, base, cand, out, a, base_regs=None, cand_regs=None, price_ctx=None, base_dir=None, cand_dir=None):
    stem = name[:-4]
    r = {"file": name}
    breg = (base_regs or {}).get(name) if base_regs else None
    creg = (cand_regs or {}).get(name) if cand_regs else None
    (bw, bh), (cw, ch) = size(base), size(cand)
    r["baseline_size"], r["candidate_size"] = [bw, bh], [cw, ch]
    work = cand
    if (bw, bh) != (cw, ch):
        if abs(bw / bh - cw / ch) / (bw / bh) > 0.03:
            r.update(verdict="FAIL", reason="size/aspect changed (layout height or width drift)")
            sbs = os.path.join(out, stem + "-sbs.png")
            sh("convert", base, cand, "-resize", "x%d" % bh, "+append", sbs)
            r["sidebyside"] = sbs
            return r
        work = os.path.join(out, stem + "-cand-resized.png")
        sh("convert", cand, "-resize", "%dx%d!" % (bw, bh), work)
        r["resized"] = True
    pm_base, pm_cand = base, work
    map_box = None
    if is_daybyday_full_shot(name):
        map_box = map_box_from_regions(creg) or map_box_from_regions(breg)
    if map_box:
        pm_base, pm_cand = masked_pair_paths(base, work, map_box, out, stem)
        r["map_mask"] = {"box": map_box, "why": MAP_MASK_WHY}
    diff = os.path.join(out, stem + "-diff.png")
    p = sh("node", os.path.join(HERE, "pm.mjs"), pm_base, pm_cand, diff, cwd=HERE)
    m = json.loads(p.stdout)
    r.update(ratio=round(m["ratio"], 6), mismatched=m["mismatched"], diff=diff, clusters=m.get("clusters"),
             largest_cluster=m.get("largest_cluster"), isolated=m.get("isolated"), top_clusters=m.get("top_clusters"))
    clean = m["mismatched"] == 0 or ("largest_cluster" in m and m["largest_cluster"] <= 1 and m["mismatched"] <= a.iso_max)
    sbs = os.path.join(out, stem + "-sbs.png")
    sh("convert", pm_base, pm_cand, diff, "+append", sbs)
    r["sidebyside"] = sbs
    if clean and m["ratio"] <= a.pass_max:
        r.update(verdict="PASS", reason="0 changed pixels" if not m["mismatched"] else "%d isolated antialias pixel(s) (<= --iso-max %d)" % (m["mismatched"], a.iso_max))
    elif m["ratio"] >= a.fail_min:
        r.update(verdict="FAIL", reason="pixelmatch ratio >= %g" % a.fail_min)
    elif a.no_vision:
        r.update(verdict="NEEDS_JUDGMENT", reason="close call (%.4f; %d px in %s cluster(s), largest %s), vision disabled" % (m["ratio"], m["mismatched"], m.get("clusters"), m.get("largest_cluster")))
    else:
        v, why = vision(sbs)
        r["vision"] = {"model": VISION_MODEL, "verdict": v, "why": why, "cost_usd": LAST_USAGE.get("cost"),
                       "provider": LAST_USAGE.get("provider")}
        r.update(verdict={"PASS": "PASS", "FAIL": "FAIL"}.get(v, "NEEDS_JUDGMENT"),
                 reason="close call (%.4f; %d px in %s cluster(s), largest %s); vision %s: %s" % (m["ratio"], m["mismatched"], m.get("clusters"), m.get("largest_cluster"), v, why))
    if r.get("verdict") != "PASS" and base_regs and cand_regs and "size/aspect" not in (r.get("reason") or ""):
        why = assess_price_effect((base_regs or {}).get(name), (cand_regs or {}).get(name), name, price_ctx)
        if why:
            r.update(verdict="PASS", reason=why, price_effect=True)
    ok_map, map_reason = assess_daybyday_after_pixels(name, base_dir, cand_dir, breg, creg)
    if r.get("verdict") == "PASS" and not ok_map:
        r.update(verdict="FAIL", reason=map_reason)
    elif r.get("verdict") == "PASS" and map_box and map_reason:
        r["reason"] = "%s; %s" % (r.get("reason") or "PASS", map_reason)
    return r

def gh_token():
    for v in ("GH_TOKEN", "GITHUB_TOKEN"):
        if os.environ.get(v): return os.environ[v]
    f = os.path.expanduser("~/.config/tsv-gateb/gh-token")
    return open(f).read().strip() if os.path.isfile(f) else None

def gh(method, path, body, tok):
    req = urllib.request.Request("https://api.github.com" + path, method=method,
        data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + tok,
        "Accept": "application/vnd.github+json", "User-Agent": "tsv-gateb"})
    return urllib.request.urlopen(req, timeout=20).status

def pr_files(repo, num, tok):
    """Changed files of a PR, or None if the target is an issue (not a PR) or the API fails."""
    out, page = [], 1
    try:
        while True:
            req = urllib.request.Request("https://api.github.com/repos/%s/pulls/%s/files?per_page=100&page=%d" % (repo, num, page),
                headers={"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json", "User-Agent": "tsv-gateb"})
            r = json.load(urllib.request.urlopen(req, timeout=20)); out += [f["filename"] for f in r]
            if len(r) < 100 or page >= 30: return out
            page += 1
    except Exception:
        return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baselines", required=True); ap.add_argument("--candidates", required=True)
    ap.add_argument("--target"); ap.add_argument("--out"); ap.add_argument("--note")
    ap.add_argument("--no-post", action="store_true", help="dry run: never post the comment or labels, even with --target")
    ap.add_argument("--no-vision", action="store_true")
    ap.add_argument("--pass-max", type=float, default=0.0001); ap.add_argument("--fail-min", type=float, default=0.02)
    ap.add_argument("--iso-max", type=int, default=int(os.environ.get("GATEB_ISO_MAX", "0")))
    ap.add_argument("--force", action="store_true", help="screen-check a PR even if it touches no UI/render files")
    ap.add_argument("--data-snapshot", help="VK data pre-check: run skills/vk-thing-data-contract over this fixture JSON first; "
                    "a failure is a DATA fault (no compare, no kickback, no fix-it to the coder)")
    ap.add_argument("--baseline-regions", help="capture-regions.json for baselines (file or capture dir; default: capture-regions.json beside --baselines dir)")
    ap.add_argument("--candidate-regions", help="capture-regions.json for candidates (file or capture dir; default: beside --candidates dir)")
    a = ap.parse_args()
    if a.data_snapshot:
        chk = sh(sys.executable, "-I", os.path.join(HERE, "..", "tsv-dispatch", "vk_contract_check.py"), a.data_snapshot)
        if chk.returncode != 0:
            fault = [l for l in chk.stdout.splitlines() if l.startswith("DATA-CONTRACT:")]
            print(json.dumps({"overall": "DATA_FAULT", "files": 0, "missing": 0, "out": None, "share": None, "posted": None,
                              "verdicts": {}, "data_contract": fault or [(chk.stdout + chk.stderr).strip()[-300:]],
                              "why": "fixture fails the VK data contract; harness/data fault, no screen compare, no fix-it"}))
            sys.exit(4)
    if a.target and not a.force:
        repo, num = a.target.split("#")
        tok = gh_token()
        files = pr_files(repo, num, tok) if tok else None
        if files is not None:
            sys.path.insert(0, HERE)
            from ui_paths import render_files
            if not render_files(files):
                print(json.dumps({"overall": "SKIPPED_BACKEND_ONLY", "files": 0, "target": a.target, "posted": None,
                                  "why": "PR touches no UI/render files (%d files); no screen check, no labels" % len(files)}))
                sys.exit(0)
    run = time.strftime("%Y%m%d-%H%M%S")
    out = a.out or os.path.join(HERE, "runs", run); os.makedirs(out, exist_ok=True)
    base_regs = _load_regions(a.baseline_regions or a.baselines)
    cand_regs = _load_regions(a.candidate_regions or a.candidates)
    base_dir = a.baselines if os.path.isdir(a.baselines) else None
    cand_dir = a.candidates if os.path.isdir(a.candidates) else None
    prs, missing = pairs(a.baselines, a.candidates)
    prs.sort(key=lambda t: ("-top.png" in t[0], t[0]))
    price_ctx = {}
    rows = [compare(n, b, c, out, a, base_regs, cand_regs, price_ctx, base_dir, cand_dir) for n, b, c in prs]
    vs = [r["verdict"] for r in rows]
    overall = ("NEEDS_JUDGMENT" if not rows else "FAIL" if "FAIL" in vs
               else "NEEDS_JUDGMENT" if "NEEDS_JUDGMENT" in vs else "PASS")
    share = None
    if shutil.which("ssh") and sh("ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "tsvshare", "mkdir -p TSV-Share/outbox/gateb/" + run).returncode == 0:
        if sh("scp", "-q", "-o", "BatchMode=yes", *[r[k] for r in rows for k in ("diff", "sidebyside") if k in r] or [os.devnull],
              "tsvshare:TSV-Share/outbox/gateb/%s/" % run).returncode == 0:
            share = "MacBook ~/TSV-Share/outbox/gateb/%s/" % run
    lines = ([("> " + a.note), ""] if a.note else []) + ["### Gate B screenshot compare: **%s**" % overall, "",
             "Baselines `%s` vs candidates `%s` (pixelmatch threshold 0.1; PASS = 0 changed px (<= %d isolated antialias px), FAIL >= %g; any other change is a close call for `%s`)." %
             (a.baselines, a.candidates, a.iso_max, a.fail_min, VISION_MODEL), "",
             "| file | verdict | diff ratio | why |", "|---|---|---|---|"]
    for r in rows:
        lines.append("| %s | %s | %s | %s |" % (r["file"], r["verdict"], r.get("ratio", "-"), r.get("reason", "")))
    if missing: lines += ["", "Not captured (skipped): " + ", ".join(missing)]
    lines += ["", "Diff + side-by-side images: " + (share or ("Ubuntu `%s`" % out))]
    if overall == "NEEDS_JUDGMENT": lines += ["", "stuck: needs judgment (labelled `status:stuck` + `kickback`)."]
    if overall in ("FAIL", "NEEDS_JUDGMENT"):
        bad = [r["file"] for r in rows if r["verdict"] != "PASS"]
        lines += ["", "kickback: Hermes Gate B compare %s on %s" % (overall, ", ".join(bad) or "no comparable screenshots")]
    lines += ["", "_Hermes gateb_compare run %s_" % run]
    md = "\n".join(lines)
    open(os.path.join(out, "comment.md"), "w").write(md)
    summary = {"run": run, "overall": overall, "rows": rows, "missing": missing, "out": out, "share": share}
    posted = None
    if a.target and (a.no_post or os.environ.get("GATEB_SELFTEST") == "1"):
        posted = "NO_POST (dry run or selftest): not posted to %s" % a.target
    elif a.target:
        repo, num = a.target.split("#")
        tok = gh_token()
        if not tok:
            posted = "POST_SKIPPED: no GitHub token on this machine; comment.md left in " + out
        else:
            try:
                gh("POST", "/repos/%s/issues/%s/comments" % (repo, num), {"body": md}, tok)
                if overall in ("FAIL", "NEEDS_JUDGMENT"):
                    labels = ["kickback"] + (["status:stuck"] if overall == "NEEDS_JUDGMENT" else [])
                    gh("POST", "/repos/%s/issues/%s/labels" % (repo, num), {"labels": labels}, tok)
                posted = "posted to %s" % a.target
            except Exception as e:
                posted = "POST_FAILED: " + type(e).__name__
    summary["posted"] = posted
    json.dump(summary, open(os.path.join(out, "summary.json"), "w"), indent=1)
    print(json.dumps({"overall": overall, "files": len(rows), "missing": len(missing), "out": out,
                      "share": share, "posted": posted,
                      "verdicts": {r["file"]: [r["verdict"], r.get("ratio")] for r in rows}}))
    sys.exit({"PASS": 0, "FAIL": 1}.get(overall, 3))

if __name__ == "__main__":
    main()
