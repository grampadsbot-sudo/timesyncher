"""Dr scorecard helpers (skills/tsv-manager "Dr scorecard", v1.8.0; spin breaker miss rule). Zero-AI, deterministic.
Page: bot-admin/lanes/dr-scorecard, one '## <dr>' section per dr with 'Total: <n> (since ...)' and a dated event log.
Event line: '- <date PT> | <PR/issue> | <points> | <reason>'. A logged-only ring is a miss (-2). Three misses on one item escalate.
Reads and writes go through the local gbrain CLI. Points never gate anything. Unknown data is reported as unknown, never 0.
  morning_line()            -> 'Dr scores: claude-code <n>, dr-eggbot <n>' or 'Dr scores: unknown (<reason>)'
  record_miss(dr, label, t) -> appends a -2 event to dr's section and returns the new total
  owner_of(n, assessment)   -> dr named as owner for PR/issue n in vk-running-assessment, else 'unknown'"""
import datetime as dt, os, re, subprocess
from tsv_common import PT, scrub

SLUG = "bot-admin/lanes/dr-scorecard"
ASSESS_SLUG = "bot-admin/lanes/vk-running-assessment"
GBRAIN = os.path.expanduser("~/.local/bin/gbrain")
MISS = -2
KNOWN_DRS = ("claude-code", "dr-eggbot")
ESCALATE_EVERY = 3
SEC_RE = re.compile(r"^## (\S+)\s*$")
TOTAL_RE = re.compile(r"^Total: (-?\d+)")

def _run(args, stdin=None):
    return subprocess.run([GBRAIN] + args, input=stdin, capture_output=True, text=True, timeout=120)

def body_of(raw):
    """Page text from its frontmatter on; anything printed before it (CLI upgrade banners) is dropped."""
    lines = raw.splitlines()
    i = next((k for k, l in enumerate(lines) if l.strip() == "---"), None)
    if i is None: raise ValueError("page has no frontmatter")
    return "\n".join(lines[i:]).rstrip() + "\n"

def read_page(slug=SLUG):
    r = _run(["get", slug])
    if r.returncode != 0: raise RuntimeError("gbrain get rc%d" % r.returncode)
    return body_of(r.stdout)

def parse_totals(body):
    """{dr: total} for every '## <dr>' section that has a 'Total: <n>' line (page order)."""
    totals = {}; cur = None
    for line in body.splitlines():
        m = SEC_RE.match(line)
        if m: cur = m.group(1); continue
        if cur and cur not in totals:
            t = TOTAL_RE.match(line)
            if t: totals[cur] = int(t.group(1))
    return totals

def morning_line():
    """The one scorecard line for the morning check. Missing or unreadable data is 'unknown', never 0."""
    try:
        totals = parse_totals(read_page())
    except Exception as e:
        return "Dr scores: unknown (%s)" % scrub(str(e) or type(e).__name__)[:120]
    missing = [d for d in KNOWN_DRS if d not in totals]
    if missing: return "Dr scores: unknown (no total for %s)" % ", ".join(missing)
    return "Dr scores: " + ", ".join("%s %d" % (d, n) for d, n in totals.items())

def should_escalate(misses):
    """Three misses on the same item escalate; later multiples of three escalate again."""
    return misses > 0 and misses % ESCALATE_EVERY == 0

def owner_of(n, assessment):
    """dr named on an 'owner' line of the running assessment that cites PR/issue n. Ambiguous or absent is 'unknown'."""
    found = set()
    for line in assessment.splitlines():
        if not re.search(r"owner", line, re.I): continue
        if not re.search(r"(?:#|\bPR\s?)%d\b" % n, line, re.I): continue
        if re.search(r"claude[- ]code", line, re.I): found.add("claude-code")
        if re.search(r"dr[ -]eggbot", line, re.I): found.add("dr-eggbot")
    return found.pop() if len(found) == 1 else "unknown"

def record_miss(dr, label, now_t):
    """Append one logged-only ring (-2) to dr's section, bump its Total, write the page back, and verify the write.
    Creates an 'unknown' section when dr is unknown. Returns the new total."""
    body = read_page()
    lines = body.splitlines()
    day = dt.datetime.fromtimestamp(now_t, PT)
    head = next((k for k, l in enumerate(lines) if SEC_RE.match(l) and SEC_RE.match(l).group(1) == dr), None)
    if head is None:
        lines += ["", "## %s" % dr, "Total: 0 (since %s)" % day.strftime("%Y-%m-%d"), ""]
        head = len(lines) - 3
    end = next((k for k in range(head + 1, len(lines)) if SEC_RE.match(lines[k])), len(lines))
    tot = next((k for k in range(head + 1, end) if TOTAL_RE.match(lines[k])), None)
    if tot is None: raise ValueError("section %s has no Total line" % dr)
    new_total = int(TOTAL_RE.match(lines[tot]).group(1)) + MISS
    lines[tot] = re.sub(r"^Total: -?\d+", "Total: %d" % new_total, lines[tot])
    event = "- %s | %s | %d | logged-only ring" % (day.strftime("%Y-%m-%d %H:%M PT"), label, MISS)
    filled = [k for k in range(head + 1, end) if lines[k].strip()]
    lines.insert((filled[-1] if filled else tot) + 1, event)
    r = _run(["put", SLUG, "--source-id", "default", "--force"], stdin="\n".join(lines) + "\n")
    if r.returncode != 0: raise RuntimeError("gbrain put rc%d" % r.returncode)
    if event not in read_page(): raise RuntimeError("scorecard write not visible on re-read")
    return new_total
