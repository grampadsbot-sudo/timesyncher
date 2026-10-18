"""Shared helpers for the TSV independence watchers on Ubuntu (Craig OK 2026-10-07 2:25 PM PT).
NO LLM, zero Grok Bot usage. Secrets are read from files into memory only; never printed, logged or put in argv.
Process page: GBrain bot-admin/process/tsv-issue-intake-when-grok-away."""
import datetime as dt, json, os, re, subprocess, time, urllib.request, urllib.error, fcntl
from zoneinfo import ZoneInfo

os.umask(0o002)
D = os.environ.get("TSV_DISPATCH_ROOT", os.path.dirname(os.path.abspath(__file__)))
REPO = "grampadsbot-sudo/timesyncher"
BASE = "cursor/jev-quality-r20-1128"
GH_TOKEN_FILE = "/home/ubishere9995/.config/tsv-gateb/gh-token"
PT = ZoneInfo("America/Los_Angeles")
IMAC_HOSTS = ["192.168.1.18", "100.76.12.8"]   # iMac: home LAN first, Tailscale fallback (same as tsv_dispatch.py)
READY_LABELS = ["project:tsv", "executor:cursor", "status:ready"]
_SECRETS = []

def read_secret(path, sudo_user=None):
    """Read a one-line secret from a file (optionally via `sudo -n -u USER cat`, for files owned by the other cron user)."""
    if sudo_user and os.geteuid() != _uid(sudo_user):
        r = subprocess.run(["sudo", "-n", "-u", sudo_user, "cat", path], capture_output=True, text=True, timeout=20)
        if r.returncode: raise RuntimeError("cannot read %s as %s (rc=%d)" % (path, sudo_user, r.returncode))
        s = r.stdout.strip()
    else:
        s = open(path).read().strip()
    if s: _SECRETS.append(s)
    return s

def _uid(user):
    import pwd
    return pwd.getpwnam(user).pw_uid

def scrub(x):
    x = str(x)
    for s in _SECRETS:
        if s: x = x.replace(s, "***")
    return x

def pt_now(): return dt.datetime.now(PT).strftime("%-I:%M %p PT")
def pt_stamp(): return dt.datetime.now(PT).strftime("%Y-%m-%d %-I:%M %p PT")

def logs_dir():
    return os.environ.get("TSV_DISPATCH_LOGS", D + "/logs")

class Log:
    def __init__(self, name):
        ld = logs_dir()
        os.makedirs(ld, exist_ok=True)
        self.f = open("%s/%s-%s.log" % (ld, name, time.strftime("%Y%m%d")), "a")
    def __call__(self, msg):
        line = "[%s | %s] %s" % (dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), pt_now(), scrub(msg))
        self.f.write(line + "\n"); self.f.flush()
        print(line)

def load_json(path, default):
    try: return json.load(open(path))
    except Exception: return default

def save_json(path, obj):
    tmp = path + ".tmp"
    json.dump(obj, open(tmp, "w"), indent=1, sort_keys=True); os.replace(tmp, path)
    try: os.chmod(path, 0o664)
    except Exception: pass

class FileLock:
    def __init__(self, path, timeout=60): self.path, self.timeout = path, timeout
    def __enter__(self):
        self.fd = open(self.path, "a")
        t0 = time.time()
        while True:
            try: fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB); return self
            except BlockingIOError:
                if time.time() - t0 > self.timeout: raise TimeoutError("lock %s busy" % self.path)
                time.sleep(1)
    def __exit__(self, *a):
        fcntl.flock(self.fd, fcntl.LOCK_UN); self.fd.close()

class GH:
    def __init__(self, token=None):
        self.tok = token or read_secret(GH_TOKEN_FILE, sudo_user="ubishere9995")
    def req(self, method, path, data=None, ok404=False, raw=False, accept="application/vnd.github+json", timeout=60):
        url = path if path.startswith("http") else "https://api.github.com" + path
        r = urllib.request.Request(url, method=method, data=None if data is None else json.dumps(data).encode(),
            headers={"Authorization": "Bearer " + self.tok, "Accept": accept, "User-Agent": "tsv-independence",
                     "X-GitHub-Api-Version": "2022-11-28"})
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                b = resp.read()
                if raw: return b
                return json.loads(b) if b else {}
        except urllib.error.HTTPError as e:
            if ok404 and e.code == 404: return None
            raise RuntimeError(scrub("GitHub %s %s -> HTTP %s %s" % (method, path.split("?")[0], e.code, e.read()[:200].decode("utf-8", "replace"))))
    def pages(self, path, key=None):
        out, page = [], 1
        while True:
            sep = "&" if "?" in path else "?"
            r = self.req("GET", "%s%sper_page=100&page=%d" % (path, sep, page))
            items = r.get(key, []) if key else r
            out += items
            if len(items) < 100 or page >= 10: return out
            page += 1

def _ssh_key():
    home = os.path.expanduser("~")
    return home + "/.ssh/bot-host-access"

def imac(cmd, timeout=120, stdin=None, retries=1):
    """Run a command on the iMac: home LAN 192.168.1.18 first, Tailscale 100.76.12.8 fallback, ConnectTimeout 8 s,
    and one full retry of both hosts after 5 s. Only connection failures (ssh rc 255) are retried; a timeout is not,
    so a slow-but-sent message is never sent twice. Returns (rc, output)."""
    base = ["-i", _ssh_key(), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
            "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3", "-o", "StrictHostKeyChecking=accept-new"]
    last = (255, "iMac unreachable")
    for attempt in range(retries + 1):
        if attempt: time.sleep(5)
        for h in IMAC_HOSTS:
            try:
                r = subprocess.run(["ssh", *base, "grampadsbot@" + h, cmd], input=stdin, capture_output=True, text=True, timeout=timeout)
            except subprocess.TimeoutExpired:
                return 254, "ssh %s: timed out after %ss (not retried: the send may have gone out)" % (h, timeout)
            except Exception as e:
                last = (254, "ssh %s: %s" % (h, str(e)[:120])); continue
            if r.returncode == 255: last = (255, "ssh %s: %s" % (h, (r.stderr or "").strip()[-160:])); continue
            return r.returncode, r.stdout + r.stderr
    return last

def shq(x):
    import shlex
    return shlex.quote(str(x))

class TellCraigResult:
    OK = "ok"
    BLOCKED = "blocked"
    FAILED = "failed"

    def __init__(self, status, reason=""):
        self.status = status
        self.reason = reason or ""

    def __bool__(self):
        return self.status == self.OK


def tell_craig(text, tag, dry=False, log=print):
    """ONE Telegram message to Craig via the iMac's ~/bin/imac-tell-craig.sh --no-note: mechanical `openclaw message send`,
    NO model turn (the old context-note turn is what made sends take >45 s). The text travels on ssh STDIN, so quotes,
    parentheses and newlines need no shell quoting. LAN first, Tailscale fallback, one retry. Truthy only on RESULT ok."""
    if dry:
        log("DRY would tell Craig: %s" % text)
        return TellCraigResult(TellCraigResult.OK)
    try:
        import craig_guard as cg
        ok, reason = cg.guard_before_send(text, tag, dry=False, log=log)
        if not ok:
            return TellCraigResult(TellCraigResult.BLOCKED, reason)
    except Exception as e:
        log("craig-guard error %s; blocked send" % type(e).__name__)
        return TellCraigResult(TellCraigResult.BLOCKED, "guard error")
    tag = re.sub(r"[^A-Za-z0-9._-]", "-", tag)[:80]
    rc, out = imac('~/bin/imac-tell-craig.sh --no-note --tag %s "$(cat)"' % tag, timeout=100, stdin=text)
    ok = rc == 0 and "RESULT ok" in out
    log("tell Craig %s rc=%s %s" % ("ok" if ok else "FAILED", rc, (out.strip().splitlines() or [""])[-1][:200]))
    return TellCraigResult(TellCraigResult.OK if ok else TellCraigResult.FAILED)

class Alerts:
    """Per-problem cooldown + one recovery message. state: {problem: {"since","last_sent","text","sent"}}"""
    def __init__(self, path, cooldown_h, label, dry=False, log=print):
        self.path, self.cool, self.label, self.dry, self.log = path, cooldown_h * 3600, label, dry, log
        self.st = load_json(path, {})
    def problem(self, key, text, already_sent_at=None):
        now = time.time(); rec = self.st.get(key) or {"since": now, "last_sent": 0, "sent": False}
        rec["text"] = text
        if already_sent_at and already_sent_at > rec.get("last_sent", 0):   # another script already alerted on this
            rec["last_sent"] = already_sent_at; rec["sent"] = True
        if now - rec.get("last_sent", 0) >= self.cool:
            if tell_craig(text, "%s-%s-%d" % (self.label, key, now), self.dry, self.log):
                rec["last_sent"] = now; rec["sent"] = True
        else:
            self.log("alert %s suppressed (cooldown; last sent %s)" % (key, time.strftime("%H:%M UTC", time.gmtime(rec["last_sent"]))))
        self.st[key] = rec
    def ok(self, key, text):
        rec = self.st.pop(key, None)
        if rec and rec.get("sent"):
            if not tell_craig(text, "%s-%s-recovered-%d" % (self.label, key, time.time()), self.dry, self.log):
                self.st[key] = rec   # retry the recovery note next run
    def save(self):
        if not self.dry: save_json(self.path, self.st)

# ------------------------------------------------------------------ screenshot attachments (no gist scope on the token)
ATTACH_BRANCH = "cursor/tsv-attachments"   # cursor/* => Vercel git deploys disabled by vercel.json; never merged, no PR
def commit_images(g, files, prefix, log=print):
    """Commit image files [(name, bytes)] to ATTACH_BRANCH under tsv-attachments/<prefix>/ via the contents API.
    Returns [(name, raw_url, blob_url)]. The repo is public, so raw URLs render inline in issues."""
    import base64 as b64, re as _re, urllib.parse as up
    if not files: return []
    br = g.req("GET", "/repos/%s/branches/%s" % (REPO, up.quote(ATTACH_BRANCH, safe="")), ok404=True)
    if br is None:
        base_sha = g.req("GET", "/repos/%s/branches/%s" % (REPO, up.quote(BASE, safe="")))["commit"]["sha"]
        g.req("POST", "/repos/%s/git/refs" % REPO, {"ref": "refs/heads/" + ATTACH_BRANCH, "sha": base_sha})
        log("created attachments branch %s from %s" % (ATTACH_BRANCH, base_sha[:7]))
    out = []
    for i, (name, data) in enumerate(files):
        safe = _re.sub(r"[^A-Za-z0-9._-]+", "-", name)[-60:] or "image.png"
        path = "tsv-attachments/%s/%02d-%s" % (prefix, i + 1, safe)
        ex = g.req("GET", "/repos/%s/contents/%s?ref=%s" % (REPO, up.quote(path), up.quote(ATTACH_BRANCH, safe="")), ok404=True)
        body = {"message": "tsv attachment %s (no code; never merged) [skip ci]" % path, "branch": ATTACH_BRANCH,
                "content": b64.b64encode(data).decode()}
        if ex and ex.get("sha"): body["sha"] = ex["sha"]
        g.req("PUT", "/repos/%s/contents/%s" % (REPO, up.quote(path)), body)
        out.append((name, "https://raw.githubusercontent.com/%s/%s/%s" % (REPO, ATTACH_BRANCH, up.quote(path)),
                    "https://github.com/%s/blob/%s/%s" % (REPO, ATTACH_BRANCH, up.quote(path))))
    log("committed %d image(s) to %s under tsv-attachments/%s" % (len(out), ATTACH_BRANCH, prefix))
    return out

def find_open_marker(g, marker):
    """Open project:tsv issues whose body contains the marker (no search-index lag: lists issues directly)."""
    return [i for i in g.pages("/repos/%s/issues?state=open&labels=project:tsv" % REPO)
            if "pull_request" not in i and marker in (i.get("body") or "")]
