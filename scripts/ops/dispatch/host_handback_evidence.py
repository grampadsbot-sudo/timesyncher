"""Read-only host collector. Unsupported canonical evidence is an error, never absence."""
import hashlib
import json
from pathlib import Path
import re
import socket
import subprocess
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from host_handback_review import (ACCEPT_RE, BLOCKER_RE, HOST_RE, Evidence,
                                 EvidenceError, ReviewScan, _time, snapshot_key)

ASSESSMENT = 'bot-admin/lanes/vk-running-assessment'
PT = ZoneInfo('America/Los_Angeles')
ASSESSMENT_S = 15 * 60
SOURCE_RE = re.compile(r'\[\[(bot-admin/receipts/[^\]\s]+)\]\]')
HEAD_RE = re.compile(r'\b[0-9a-f]{40}\b')
LOOK_OK_RE = re.compile(
    r'\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z[^\]]*\] PR #(\d+) look request sent via iMac '
    r'rc=(\d+) RESULT (\S+).*?\bin_history=(\S+) media=(\d+)')
LOOK_TAG_RE = re.compile(r'^tsv-look-pr(\d+)-\d{12}$')
LOOK_LOG = 'dispatch-%s.log'
LOOK_KEYS = frozenset({'sent_at', 'sent_ms', 'sha', 'tag', 'media'})


def require(condition, reason):
    if not condition:
        raise EvidenceError(reason)


def _look_log_path(root, sent_at):
    from datetime import timezone
    day = datetime.fromtimestamp(sent_at, timezone.utc).strftime('%Y%m%d')
    return Path(root) / 'logs' / (LOOK_LOG % day)


def _validate_look_record(n, head, record):
    require(isinstance(record, dict), 'guarded Craig look state must be an object')
    extra = set(record) - LOOK_KEYS - {'baseline_candidates'}
    require(not extra, 'guarded Craig look state has unknown fields')
    require(LOOK_KEYS <= set(record), 'guarded Craig look state missing required fields')
    sha = record['sha']
    require(isinstance(sha, str) and HEAD_RE.fullmatch(sha), 'guarded Craig look state sha invalid')
    if sha != head:
        return None
    sent_at = record['sent_at']
    sent_ms = record['sent_ms']
    require(isinstance(sent_at, (int, float)) and sent_at > 0, 'guarded Craig look sent_at invalid')
    require(isinstance(sent_ms, int) and sent_ms > 0, 'guarded Craig look sent_ms invalid')
    require(abs(sent_ms - int(sent_at * 1000)) <= 1, 'guarded Craig look sent_ms disagrees with sent_at')
    media = record['media']
    require(isinstance(media, int) and media > 0, 'guarded Craig look media invalid')
    tag = record['tag']
    require(isinstance(tag, str), 'guarded Craig look tag invalid')
    match = LOOK_TAG_RE.fullmatch(tag)
    require(match and int(match.group(1)) == n, 'guarded Craig look tag does not bind item')
    return sha, sent_at, sent_ms, media, tag


def _match_look_log_line(n, sent_at, media, line):
    match = LOOK_OK_RE.search(line)
    if not match:
        return False
    stamp, pr, rc, result, history, delivered = match.groups()
    if int(pr) != n:
        return False
    if rc != '0' or result != 'ok' or history != 'yes':
        return False
    if int(delivered) != media:
        return False
    from datetime import timezone
    at = datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc).timestamp()
    return abs(at - sent_at) <= 1.0


def authenticate_guarded_look_send(root, n, head):
    path = Path(root) / 'state.json'
    require(path.is_file(), 'authenticated guarded Craig dispatch state not found')
    try:
        state = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise EvidenceError('guarded Craig dispatch state unreadable') from exc
    require(isinstance(state, dict), 'guarded Craig dispatch state invalid')
    look = state.get('look')
    require(isinstance(look, dict), 'guarded Craig dispatch look map missing')
    record = look.get(str(n))
    if not record:
        return False
    parsed = _validate_look_record(n, head, record)
    if not parsed:
        return False
    _, sent_at, _, media, _ = parsed
    log_path = _look_log_path(root, sent_at)
    require(log_path.is_file(), 'guarded Craig dispatch log missing for look event')
    try:
        text = log_path.read_text()
    except OSError as exc:
        raise EvidenceError('guarded Craig dispatch log unreadable') from exc
    matches = [line for line in text.splitlines() if _match_look_log_line(n, sent_at, media, line)]
    require(len(matches) == 1, 'guarded Craig look log event missing or ambiguous')
    return True


def current_section(text, now):
    sections = re.split(r'(?m)^(?=## )', text)
    for section in sections:
        header = section.splitlines()[0] if section else ''
        if not re.search(r'^## (?:Current (?:manager )?pass|Managing-dr pass)\b', header, re.I):
            continue
        utc = re.search(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) UTC', header)
        pt = re.search(r'(\d{4}-\d\d-\d\d) (\d\d:\d\d) PT', header)
        require(utc or pt, 'assessment current section has no unambiguous event time')
        at = (_time(utc[1].replace(' ', 'T') + 'Z') if utc else
              datetime.strptime(pt[1] + ' ' + pt[2], '%Y-%m-%d %H:%M').replace(tzinfo=PT).timestamp())
        require(0 <= now - at <= ASSESSMENT_S, 'assessment current section stale or future')
        return section
    raise EvidenceError('current canonical assessment section not found')


def ownership(section, number):
    rows = []
    header = None
    for line in section.splitlines():
        if not line.startswith('|'):
            header = None
            continue
        cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if cells[0].lower() == 'job':
            header = [cell.lower() for cell in cells]
            continue
        if re.search(r'#%d\b' % number, cells[0]):
            rows.append((header, cells))
    require(len(rows) == 1, 'exact current assessment item row required #%d' % number)
    header, cells = rows[0]
    if header and 'owner' in header:
        require(header.count('owner') == 1 and len(cells) == len(header),
                'unambiguous current canonical owner column required')
        owner = cells[header.index('owner')]
        require(owner and owner.lower() not in {'unknown', 'not found', 'n/a', '-', '—', '?'},
                'explicit current canonical row owner required')
        return owner
    owners = re.findall(r'\bOwner\s+([^,;\n.]+)', section)
    require(len(set(owners)) == 1, 'unambiguous current canonical owner required')
    return owners[0].strip()


def last_action(text, number, now):
    """Only dated Action record entries count; head SHA is deliberately irrelevant."""
    events = []
    for section in re.split(r'(?m)^(?=## )', text):
        if not section.startswith('## Action record'):
            continue
        for line in section.splitlines()[1:]:
            if not re.search(r'#%d\b' % number, line):
                continue
            match = re.match(r'- (\d{4}-\d\d-\d\d) (\d\d:\d\d)(?:[–−-](\d\d:\d\d))? PT \|', line)
            require(match, 'unparseable applicable shared action record #%d' % number)
            at = datetime.strptime(match[1] + ' ' + (match[3] or match[2]), '%Y-%m-%d %H:%M').replace(tzinfo=PT).timestamp()
            require(at <= now, 'future canonical management action')
            events.append(at)
    require(events, 'checked assessment has no explicit dated action record #%d' % number)
    return max(events)


class HostReaders:
    """Outer-host only. All methods read; injected equivalents make tests offline."""
    def __init__(self, root, proc_root='/proc'):
        self.root = Path(root)
        self.proc_root = Path(proc_root)

    def page(self, slug):
        from dr_scorecard import read_page
        return read_page(slug)

    def json(self, relative):
        return json.loads((self.root / relative).read_text())

    def running(self, numbers, heads=None):
        jobs = self.json('lane-worker-jobs.json')
        require(isinstance(jobs, dict), 'invalid canonical lane job registry')
        slots = self.root / 'lanes/slots'
        require(slots.is_dir(), 'canonical lane slot directory unreadable')
        running = set()
        for path in slots.iterdir():
            if path.suffix != '.slot':
                continue
            fields = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
            meta = jobs.get(fields.get('tag'))
            require(isinstance(meta, dict), 'slot has no canonical job mapping: ' + path.name)
            identities = {meta.get('item'), meta.get('pr')} - {None}
            if not identities & numbers:
                continue
            require(fields.get('host') == socket.gethostname(), 'scoped slot belongs to a different host')
            pid = fields.get('pid', '')
            require(pid.isdigit() and int(pid) > 0, 'scoped slot PID missing')
            proc = self.proc_root / pid
            try:
                before = (proc / 'stat').read_bytes()
                argv = (proc / 'cmdline').read_bytes().decode().split('\0')
                cwd = (proc / 'cwd').resolve(strict=True)
                worktree = Path(meta['worktree']).resolve(strict=True)
                require(cwd == worktree or worktree in cwd.parents, 'live PID worktree contradicts job registry')
                require(any(x.endswith('/vk-lane-run.sh') or x == 'vk-lane-run.sh' for x in argv)
                        and fields.get('tag') in argv and fields.get('lane') in argv,
                        'PID is not the exact registered lane job')
                require(before.split(b') ', 1)[1].split()[19] ==
                        (proc / 'stat').read_bytes().split(b') ', 1)[1].split()[19], 'PID reused during collection')
                expected = {heads[n] for n in identities if heads and heads.get(n)}
                if expected:
                    result = subprocess.run(['git', '--no-optional-locks', '-C', str(worktree), 'rev-parse', 'HEAD'],
                                            capture_output=True, text=True, timeout=10, check=True)
                    require(expected == {result.stdout.strip()}, 'live job belongs to a different current head')
            except FileNotFoundError as exc:
                require(not proc.exists(), 'live scoped job has missing process/worktree evidence: ' + str(exc.filename))
                continue
            running.update(identities)
        cloud = self.json('rereview-state.json')
        cursor = self.json('cursor-state.json')
        require(isinstance(cloud, dict) and isinstance(cursor.get('issues'), dict), 'cloud job records unreadable')
        for number in numbers:
            require(not (cloud.get(str(number)) or {}).get('active'),
                    'active cloud flag requires authenticated live job proof #%d' % number)
            meta = cursor['issues'].get(str(number)) or {}
            require(not meta.get('agent') or str(meta.get('last_status', meta.get('status', ''))).upper() == 'FINISHED',
                    'Cursor job requires authenticated current run proof #%d' % number)
        return frozenset(running)

    def receipt(self, page, number, head):
        """Authenticate actual scoped receipt bytes using the canonical receipt's hash.

        No file path, SHA or completion/guard format is inferred from worker prose.
        Existing receipts without this evidence remain unsupported, visibly.
        """
        paths = re.findall(r'(/home/ubishere9995/(?:tsv-work|gpt-[^/\s]+)/[^\s`<>]*RECEIPT\.md)', page)
        require(len(set(paths)) == 1, 'canonical scoped host receipt path not found')
        path = Path(paths[0])
        require(path.resolve(strict=True) == path, 'host receipt path cannot traverse symlinks')
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        require(re.search(r'\b' + digest + r'\b', page), 'canonical host receipt byte hash not found or mismatched')
        body = data.decode()
        require(re.search(r'#%d\b' % number, body), 'host receipt item mismatch')
        if head:
            require(head in body and head in page, 'host receipt does not bind exact current head')
        return body

    def guarded_craig(self, item, pages):
        n = item['number']
        head = (item.get('head') or {}).get('sha')
        require(head and HEAD_RE.fullmatch(head), 'guarded Craig proof requires exact current head')
        return authenticate_guarded_look_send(self.root, n, head)


class CanonicalCollector:
    def __init__(self, gh, repo, readers, clock=time.time):
        self.gh, self.repo, self.readers, self.clock = gh, repo, readers, clock
        self.started = clock()
        try:
            actor = gh.req('GET', '/user')
            require(isinstance(actor.get('id'), int) and actor.get('login'), 'authenticated host GH identity missing')
            self.actor = actor
            self.actors = frozenset({actor['login']})
            self.assessment = readers.page(ASSESSMENT)
            self.section = current_section(self.assessment, self.started)
            slugs = set(SOURCE_RE.findall(self.section))
            require(slugs, 'current assessment has no canonical receipt source')
            self.pages = {slug: readers.page(slug) for slug in sorted(slugs)}
        except EvidenceError:
            raise
        except Exception as exc:
            raise EvidenceError('canonical collector initialization failed: ' + type(exc).__name__) from exc

    def current_objects(self, item):
        n = item['number']
        kind = 'pulls' if 'head' in item or 'pull_request' in item else 'issues'
        path = '/repos/%s/%s/%d' % (self.repo, kind, n)
        fresh = self.gh.req('GET', path)
        comments = list(self.gh.pages('/repos/%s/issues/%d/comments' % (self.repo, n)))
        again = self.gh.req('GET', path)
        again_comments = list(self.gh.pages('/repos/%s/issues/%d/comments' % (self.repo, n)))
        require(snapshot_key(fresh, comments) == snapshot_key(again, again_comments), 'GitHub object changed during collection')
        require(fresh.get('number') == n, 'GitHub object identity mismatch')
        return fresh, comments

    def __call__(self, item, comments, now):
        try:
            checked = self.clock()
            require(0 <= checked - self.started <= 60, 'complete canonical scan exceeded freshness window')
            require(abs(checked - now) <= 60, 'alarm clock disagrees with collector clock')
            n = item['number']
            owner = ownership(self.section, n)
            action = last_action(self.assessment, n, checked)
            head = (item.get('head') or {}).get('sha')
            require(not head or bool(HEAD_RE.fullmatch(head)), 'invalid current head SHA')
            prerequisites = {int(x) for text in [item.get('body') or ''] +
                             [c.get('body') or '' for c in comments
                              if c.get('user', {}).get('login') in self.actors]
                             for x in BLOCKER_RE.findall(text)}
            heads = {n: head}
            for dependency in prerequisites:
                dep = self.gh.req('GET', '/repos/%s/issues/%d' % (self.repo, dependency))
                if 'pull_request' in dep:
                    dep = self.gh.req('GET', '/repos/%s/pulls/%d' % (self.repo, dependency))
                    heads[dependency] = dep['head']['sha']
            running = self.readers.running({n} | prerequisites, heads)
            guarded = False
            if any(x['name'] == 'needs-craig' for x in item.get('labels', [])):
                guarded = self.readers.guarded_craig(item, self.pages)
                require(type(guarded) is bool, 'Craig guard must be authenticated boolean proof')
            handbacks = set()
            for comment in comments:
                if not HOST_RE.search(comment.get('body') or ''):
                    continue
                url = comment.get('html_url')
                sources = [page for page in self.pages.values() if url and url in page]
                require(sources, 'host-review comment lacks canonical host receipt reference')
                require(comment.get('user', {}).get('id') == self.actor['id']
                        and comment['user'].get('login') in self.actors, 'host receipt GH actor mismatch')
                require(comment.get('created_at') == comment.get('updated_at'), 'edited host event requires new authenticated receipt')
                require(any(comment['body'] == self.readers.receipt(page, n, head) for page in sources),
                        'host comment differs from authenticated scoped receipt bytes')
                handbacks.add(comment['id'])
            if handbacks:
                newest = max((c for c in comments if c.get('user', {}).get('login') in self.actors),
                             key=lambda c: (_time(c['created_at']), c['id']))
                require(newest['id'] in handbacks,
                        'newer host comment needs authenticated resolution proof; generic retry refused')
            pending, at = False, None
            if item.get('draft') and ACCEPT_RE.search(item.get('body') or ''):
                raise EvidenceError('authenticated pending-acceptance event reader/schema not supplied for #%d' % n)
            require(self.readers.page(ASSESSMENT) == self.assessment, 'shared assessment changed during collection')
            for slug, page in self.pages.items():
                require(self.readers.page(slug) == page, 'canonical host receipt changed during collection')
            require(0 <= self.clock() - self.started <= 60, 'complete host evidence collection exceeded freshness window')
            return Evidence(snapshot_key(item, comments), checked, ASSESSMENT + '@sha256:' +
                            hashlib.sha256(self.assessment.encode()).hexdigest(), owner, n, action,
                            guarded, running, frozenset(handbacks), pending, at)
        except EvidenceError:
            raise
        except Exception as exc:
            raise EvidenceError('canonical host evidence failed #%d: %s' % (item['number'], type(exc).__name__)) from exc

    def scan(self):
        return ReviewScan(self, self.actors)
