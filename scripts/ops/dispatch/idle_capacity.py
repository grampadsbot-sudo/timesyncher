import base64
import datetime as dt
import glob
import json
import math
import os
import re
import socket
import subprocess
import sys
from urllib.parse import quote
import urllib.request
from zoneinfo import ZoneInfo

from tsv_common import D, REPO
from dr_scorecard import read_page, record_miss

LANES = {'claude': 100, 'codex': 90, 'cursor_models': 100,
         'other_models': 100, 'supergrok': 100, 'grok_build': 100}
METERS_SLUG = 'bot-admin/meters/lanes-latest'
FRESH = 6 * 3600
HEARTBEAT = 30 * 60
RESCOPE = 15 * 60
RERING = 30 * 60
GBRAIN = os.path.expanduser('~/.local/bin/gbrain')
DISCOVER_PAGES = 10
DRY_DISCOVER_PAGES = 2
WORKER_CMD = re.compile(r'(?:^|[ /])(?:codex|claude|grok|cursor-agent)(?:[ /.-]|$)', re.I)
INSPECTOR_CMD = re.compile(r'(?:tsv_stuck_check|idle_capacity)', re.I)
CURSOR_ACTIVE_RUN = frozenset({'RUNNING', 'CREATING'})
CLOUD_ACTIVE = frozenset({'running', 'active', 'creating'})
PT = ZoneInfo('America/Los_Angeles')
PT_STAMP = re.compile(r'^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::\d{2})? (PDT|PST|PT)$')
LANE_RUN = re.compile(r'vk-lane-run\.sh', re.I)


def stamp(value):
    if isinstance(value, (int, float)): return float(value)
    text = str(value).strip()
    match = PT_STAMP.match(text)
    if match:
        date_s, time_s, abbrev = match.groups()
        naive = dt.datetime.strptime('%s %s' % (date_s, time_s), '%Y-%m-%d %H:%M')
        if abbrev == 'PT':
            matches = []
            for fold in (0, 1):
                try: matches.append(naive.replace(tzinfo=PT, fold=fold))
                except Exception: pass
            if len(matches) != 1: raise ValueError('ambiguous pt')
            return matches[0].timestamp()
        offset = dt.timedelta(hours=-7 if abbrev == 'PDT' else -8)
        aware = naive.replace(tzinfo=dt.timezone(offset))
        if aware.astimezone(PT).strftime('%Z') != abbrev: raise ValueError('abbrev mismatch')
        return aware.timestamp()
    date = dt.datetime.fromisoformat(text.replace('Z', '+00:00'))
    if date.tzinfo is None: raise ValueError('timezone required')
    return date.timestamp()


def utc(now):
    return dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat()


def run(argv, timeout=45):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    if result.returncode: raise OSError('reader rc%d' % result.returncode)
    return result.stdout


def json_text(text):
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    return json.loads(match.group(1) if match else text)


def file_json(path):
    with open(path) as source: return json.load(source)


def command(env):
    value = json.loads(os.environ[env])
    if not isinstance(value, list) or not value or not all(isinstance(x, str) for x in value):
        raise ValueError('reader must be JSON argv')
    return value


def lane_jobs_path(root):
    return root + '/lane-worker-jobs.json'


def load_lane_jobs(root):
    try: raw = file_json(lane_jobs_path(root))
    except Exception: return {}
    if not isinstance(raw, dict): return {}
    jobs = {}
    for tag, meta in raw.items():
        if not isinstance(meta, dict): continue
        try: item = int(meta['item'])
        except Exception: continue
        entry = dict(item=item)
        if 'pr' in meta:
            try: entry['pr'] = int(meta['pr'])
            except Exception: pass
        worktree = meta.get('worktree')
        if isinstance(worktree, str) and worktree: entry['worktree'] = worktree
        jobs[str(tag)] = entry
    return jobs


def bind_worktree(jobs, cwd):
    if not cwd: return None
    for meta in jobs.values():
        worktree = meta.get('worktree')
        if not worktree: continue
        if cwd == worktree or cwd.startswith(worktree.rstrip('/') + '/'):
            return meta
    return None


def lane_slots_dir(root):
    return os.environ.get('VK_LANES', root + '/lanes') + '/slots'


def parse_slot_fields(path):
    fields = {}
    try:
        with open(path) as source:
            for line in source:
                if '=' not in line: continue
                key, value = line.strip().split('=', 1)
                fields[key] = value
    except OSError: return None
    return fields if fields.get('tag') and fields.get('pid') else None


def live_pid(pid):
    try: os.kill(int(pid), 0); return True
    except Exception: return False


def proc_cmdline(pid):
    try:
        with open('/proc/%s/cmdline' % int(pid), 'rb') as source:
            return source.read().decode(errors='replace').replace('\0', ' ')
    except OSError: return ''


def cursor_issue_stale(meta):
    if not isinstance(meta, dict): return True
    if str(meta.get('status', '')).lower() == 'finished': return True
    if str(meta.get('last_status', '')).upper() == 'FINISHED': return True
    return False


def slot_pid_binds(fields, meta):
    cmd = proc_cmdline(fields['pid'])
    if not cmd: return False
    tag, lane = fields.get('tag', ''), fields.get('lane', '')
    if not tag or not lane: return False
    worktree = meta.get('worktree')
    if LANE_RUN.search(cmd):
        if tag not in cmd or lane not in cmd: return False
        return not worktree or worktree in cmd
    if 'cursor-agent' in cmd:
        if not worktree: return False
        try: cwd = os.readlink('/proc/%s/cwd' % int(fields['pid']))
        except OSError: return False
        return cwd == worktree or cwd.startswith(worktree.rstrip('/') + '/')
    return False


def lane_slot_workers(root, jobs):
    host = socket.gethostname(); workers = []
    for path in glob.glob(lane_slots_dir(root) + '/*.slot'):
        fields = parse_slot_fields(path)
        if not fields: continue
        if fields.get('host') != host: continue
        if not live_pid(fields['pid']): continue
        tag = fields['tag']; meta = jobs.get(tag)
        if not meta or not slot_pid_binds(fields, meta): continue
        workers.append(dict(kind='lane', tag=tag, item=meta['item'], pr=meta.get('pr'), worktree=meta.get('worktree')))
    return workers


def meter_rows_from_page(text):
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text or '')
    body = match.group(1) if match else (text or '')
    rows = []
    for line in body.splitlines():
        line = line.strip()
        if not line: continue
        try:
            row = json.loads(line)
            if isinstance(row, dict) and row.get('lane'): rows.append(row)
        except Exception: pass
    if rows: return rows
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict) and parsed.get('lane'): return [parsed]
    except Exception: pass
    return []


def legacy_lanes_map(text):
    try:
        parsed = json_text(text)
        lanes = parsed.get('lanes') if isinstance(parsed, dict) else None
        return lanes if isinstance(lanes, dict) else {}
    except Exception: return {}


def lane_readings_from_rows(rows):
    readings = {}
    for row in rows:
        if not isinstance(row, dict): continue
        lane = row.get('lane'); as_of = row.get('as_of', 'unknown')
        if lane in ('claude-pro', 'chatgpt-plus-codex'):
            key = 'claude' if lane == 'claude-pro' else 'codex'
            windows = []
            if row.get('pct_5h') is not None:
                windows.append(dict(pct_used=row['pct_5h'], reset=row.get('reset_5h', 'unknown'), as_of=as_of))
            if row.get('pct_week') is not None:
                windows.append(dict(pct_used=row['pct_week'], reset=row.get('reset_week', 'unknown'), as_of=as_of))
            if windows: readings[key] = dict(windows=windows, as_of=as_of)
        elif lane == 'cursor':
            for bar in row.get('bars') or []:
                if not isinstance(bar, dict) or bar.get('pct') is None: continue
                label = str(bar.get('label', '')).lower()
                if 'other' in label: readings['other_models'] = dict(pct_used=bar['pct'], reset=bar.get('reset', 'monthly'), as_of=as_of)
                elif 'cursor' in label: readings['cursor_models'] = dict(pct_used=bar['pct'], reset=bar.get('reset', 'monthly'), as_of=as_of)
        elif lane == 'supergrok' and row.get('pct_week') is not None:
            readings['supergrok'] = dict(pct_used=row['pct_week'], reset=row.get('reset_week', 'unknown'), as_of=as_of)
        elif lane == 'grokbot' and row.get('pct_week') is not None:
            readings['grok_build'] = dict(pct_used=row['pct_week'], reset=row.get('reset_week', 'unknown'), as_of=as_of)
    return readings


def normalize(raw, now, hard_stop):
    try:
        windows = raw.get('windows') or [raw]
        pct = max(float(w['pct_used']) for w in windows)
        times = [stamp(w.get('as_of', raw.get('as_of'))) for w in windows]
        fresh = not raw.get('stale', False) and all(0 <= now - t <= FRESH for t in times)
        if not math.isfinite(pct) or not 0 <= pct <= 100: raise ValueError('bad pct')
        return dict(pct_used=pct, as_of=raw.get('as_of', utc(min(times))),
                    reset=re.sub(r'\s+', ' ', str(raw.get('reset') or ', '.join(str(w.get('reset', 'unknown')) for w in windows))),
                    stale=not fresh, available=not fresh or pct < hard_stop)
    except Exception:
        return dict(pct_used=None, as_of=raw.get('as_of', 'unknown') if isinstance(raw, dict) else 'unknown',
                    reset='unknown', stale=True, available=True)


def read_meters(now, root=D, reader=read_page, dry=False):
    page = ''
    try: page = reader(METERS_SLUG)
    except Exception: pass
    cached = legacy_lanes_map(page)
    cached.update(lane_readings_from_rows(meter_rows_from_page(page)))
    try:
        with open(root + '/meters/lanes-latest.json') as source:
            cached.update(lane_readings_from_rows(meter_rows_from_page(source.read())))
    except Exception: pass
    readings = {}
    for lane, stop in LANES.items():
        candidates = [cached.get(lane, {})]
        try: candidates.append(file_json(root + '/meters/' + lane + '.json'))
        except Exception: pass
        try:
            if lane == 'codex' and not dry:
                raw = json_text(run([sys.executable, root + '/bin/codex-quota.py'], timeout=20))
                windows = [dict(pct_used=w['usedPercent'], reset=w.get('resetsAt', 'unknown'), as_of=utc(now))
                           for w in raw.values() if isinstance(w, dict) and 'usedPercent' in w]
                if windows: candidates.append(dict(windows=windows, as_of=utc(now)))
        except Exception:
            if not any(isinstance(w, dict) and (w.get('windows') or w.get('pct_used') is not None) for w in candidates):
                candidates.append(dict(as_of=utc(now), stale=True))
        if lane in ('cursor_models', 'other_models'):
            try:
                raw = file_json(root + '/meters/cursor.json')
                candidates.append(dict(pct_used=raw[lane + '_pct'], as_of=raw['as_of'], reset=raw.get('reset', 'monthly')))
            except Exception: pass
        def observed(raw):
            try: return stamp(raw['as_of'])
            except Exception: return float('-inf')
        latest = max(reversed(candidates), key=observed)
        readings[lane] = normalize(latest, now, stop)
    return readings


def publish_meters(readings, now):
    return None


def project_tsv(item):
    return any((x.get('name') if isinstance(x, dict) else x) == 'project:tsv' for x in item.get('labels', []))


def mentions(text, n):
    return bool(re.search(r'(?<!\d)%d(?!\d)' % n, text))


def cursor_agents(root=D):
    from tsv_common import read_secret
    key = read_secret(os.path.expanduser('~/.config/tsv-cursor/api-key'))
    auth = 'Basic ' + base64.b64encode((key + ':').encode()).decode()
    def get(path):
        request = urllib.request.Request('https://api.cursor.com' + path,
                                         headers={'Authorization': auth, 'User-Agent': 'tsv-stuck-check'})
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    try: issues = file_json(root + '/cursor-state.json').get('issues', {})
    except Exception: issues = {}
    mapping = {}
    for n, meta in issues.items():
        if not isinstance(meta, dict) or not meta.get('agent'): continue
        if str(meta.get('status', '')).lower() == 'finished': continue
        if str(meta.get('last_status', '')).upper() == 'FINISHED': continue
        try: mapping[meta['agent']] = int(n)
        except Exception: pass
    workers = []; cursor = None; seen = set(); pages = 0
    while pages < 5:
        page = get('/v1/agents?limit=100&includeArchived=false' + ('&cursor=' + quote(cursor, safe='') if cursor else ''))
        pages += 1
        for agent in page.get('items', []):
            if agent.get('status', '').upper() != 'ACTIVE': continue
            aid = agent['id']; run_info = {}
            if agent.get('latestRunId'):
                run_info = get('/v1/agents/%s/runs/%s' % (quote(aid, safe=''), quote(agent['latestRunId'], safe='')))
                if run_info.get('status', '').upper() not in CURSOR_ACTIVE_RUN: continue
            numbers = set()
            if aid in mapping:
                mapped = mapping[aid]
                meta = issues.get(str(mapped)) or issues.get(mapped)
                if not cursor_issue_stale(meta):
                    numbers.add(mapped)
            numbers.update(int(x) for x in re.findall(r'#(\d+)\b', agent.get('name') or ''))
            for branch in (run_info.get('git') or {}).get('branches') or []:
                numbers.update(int(x) for x in re.findall(r'/pull/(\d+)\b', branch.get('prUrl') or ''))
            workers.extend(dict(kind='cursor', item=n) for n in numbers)
        cursor = page.get('nextCursor')
        if not cursor or cursor in seen: break
        seen.add(cursor)
    return workers


def read_workers(now, root=D, dry=False):
    workers = []; jobs = load_lane_jobs(root)
    if not dry:
        workers.extend(lane_slot_workers(root, jobs))
        for path in glob.glob('/proc/[0-9]*/cmdline'):
            try:
                with open(path, 'rb') as source: cmd = source.read().decode(errors='replace').replace('\0', ' ')
                if not WORKER_CMD.search(cmd): continue
                if INSPECTOR_CMD.search(cmd): continue
                if os.path.basename(os.path.dirname(path)) == str(os.getpid()): continue
                try: cwd = os.readlink(os.path.dirname(path) + '/cwd')
                except OSError: cwd = ''
                bound = bind_worktree(jobs, cwd)
                if 'cursor-agent' in cmd and bound:
                    entry = dict(kind='process', item=bound['item'], worktree=bound.get('worktree'))
                    if bound.get('pr') is not None: entry['pr'] = bound['pr']
                    workers.append(entry)
                elif 'cursor-agent' not in cmd:
                    workers.append(dict(kind='process', text=cmd + ' ' + cwd))
            except OSError: pass
        for scope in ([], ['--user']):
            try:
                units = run(['systemctl', *scope, 'list-units', '--state=running', '--no-legend', '--plain'], timeout=20)
                names = [line.split()[0] for line in units.splitlines() if line.split()]
                if names:
                    detail = run(['systemctl', *scope, 'show', *names, '-p', 'Id', '-p', 'ExecStart', '-p', 'WorkingDirectory'], timeout=20)
                    for block in detail.split('\n\n'):
                        fields = dict(re.findall(r'^(Id|ExecStart|WorkingDirectory)=(.*)$', block, re.M))
                        executable = fields.get('ExecStart', '')
                        if 'argv[]=' in executable:
                            executable = ' '.join(re.findall(r'argv\[\]=(.*?);', executable))
                        workers.append(dict(kind='unit', text=' '.join([fields.get('Id', ''), executable, fields.get('WorkingDirectory', '')])))
            except Exception: pass
    try:
        for worker in file_json(root + '/worker-heartbeats.json')['workers']:
            if 0 <= now - stamp(worker['heartbeat']) <= HEARTBEAT:
                workers.append(dict(kind='heartbeat', item=int(worker['item']), heartbeat=worker['heartbeat']))
    except Exception: pass
    if not dry:
        try:
            if 'TSV_CURSOR_AGENTS_CMD' in os.environ:
                for agent in json_text(run(command('TSV_CURSOR_AGENTS_CMD')))['agents']:
                    if agent.get('status', '').lower() not in CLOUD_ACTIVE: continue
                    try: workers.append(dict(kind='cursor', item=int(agent['item'])))
                    except Exception: pass
            else: workers.extend(cursor_agents(root))
        except Exception: pass
    return workers


def running(n, workers):
    return any(w.get('item') == n or w.get('pr') == n or
               (w.get('kind') in ('process', 'unit') and mentions(w.get('text', ''), n)) for w in workers)


class Brain:
    def __init__(self): self.pages = {}; self.searched = set()
    def get(self, slug):
        if slug not in self.pages: self.pages[slug] = read_page(slug)
        return self.pages[slug]
    def discover(self, n, dry=False):
        if dry or n in self.searched: return
        self.searched.add(n)
        offset = 0; pages = 0; cap = DRY_DISCOVER_PAGES if dry else DISCOVER_PAGES
        while pages < cap:
            text = run([GBRAIN, 'search', '"#%d"' % n, '--match', 'keyword', '--snippet-chars', '0', '--limit', '100', '--offset', str(offset)], timeout=25)
            slugs = set(re.findall(r'bot-admin/(?:requests|inbox/time-syncher)/[a-zA-Z0-9_-]+', text))
            for slug in slugs:
                try: self.get(slug)
                except Exception: pass
            pages += 1
            if len(slugs) < 100: break
            offset += 100


def hold_line(line):
    return bool(re.search(r'\b(?:blocked[- ]by|waits[- ]on|HELD(?:\s+on)?)\b', line, re.I))


def hold_text(body, latest):
    seen = set(); lines = []
    for block in (body or '', latest or ''):
        for line in block.splitlines():
            if hold_line(line) and line not in seen:
                seen.add(line); lines.append(line)
    return '\n'.join(lines)


def issue_refs_in_tail(tail):
    issues = set()
    for a, b in re.findall(r'#(\d+)\s*[-–]\s*#(\d+)', tail):
        if 0 <= int(b) - int(a) < 100: issues.update(range(int(a), int(b) + 1))
    issues.update(int(x) for x in re.findall(r'#(\d+)\b', tail))
    return issues


def references(text, n):
    issues, slugs = set(), set()
    for line in (text or '').splitlines():
        if not hold_line(line): continue
        blocked = re.search(r'\bblocked[- ]by\s*:?\s*', line, re.I)
        waits = re.search(r'\bwaits[- ]on\s*:\s*', line, re.I)
        held = re.search(r'\bHELD(?:\s+on)?\s+', line, re.I)
        if blocked:
            issues.update(issue_refs_in_tail(line[blocked.end():]))
        elif waits:
            tail = line[waits.end():]
            slugs.update(re.findall(r'bot-admin/requests/[\w-]+', tail))
            head = tail.strip().split(None, 1)[0] if tail.strip() else ''
            if re.match(r'^#\d+$', head): issues.add(int(head[1:]))
        elif held:
            issues.update(issue_refs_in_tail(line[held.end():]))
    return issues - {n}, slugs


def dependency(text):
    return bool(re.search(r'\b(?:shared|same) files?\s*[:\w./`]|\b(?:needed result|needs? (?:the )?(?:result|output)|requires? (?:the )?(?:result|output))\b', text, re.I))


def dispatch(n, item, brain, workers):
    if running(n, workers): return True
    pages = [(slug, body) for slug, body in brain.pages.items() if re.search(r'#%d\b' % n, body)]
    requests = [(slug, body) for slug, body in pages if slug.startswith('bot-admin/requests/')]
    for slug, body in requests:
        if any(s.startswith('bot-admin/inbox/time-syncher/') and
               (slug in b or re.search(r'#%d\b' % n, b)) and
               re.search(r'\b(?:action|dispatch(?:ed)?|launch(?:ed)?|assigned|pickup)\s*[:\w-]', b, re.I)
               for s, b in brain.pages.items()): return True
        labels = {x['name'] for x in item.get('labels', [])}
        if 'status:ready' in labels and re.search(r'\b(?:scope:|acceptance|done[- ]means)', body, re.I) and re.search(r'\blauncher[- ]pickup\s*:', body, re.I): return True
    return False


def dr_post(comment):
    author = (comment.get('user') or {}).get('login', '').lower()
    return author in {'grokbot', 'dr-eggbot', 'claude-code', 'claude-code-bot'} or bool(re.match(
        r'\s*(?:dr eggbot|managing dr|claude-code|chief dr|ruling\s*\d+|diagnosis update|hold restamp[^\n]*dr eggbot)\b',
        comment.get('body') or '', re.I))


def assess_hold(item, latest, gh, brain, workers, dry=False):
    n = item['number']; body = item.get('body') or ''
    text = body + '\n' + latest
    labels = [x['name'] for x in item.get('labels', []) if x['name'].startswith('hold:') or x['name'] in ('needs-dr-eggbot', 'status:stuck')]
    hold_source = hold_text(body, latest)
    refs, slugs = references(hold_source, n)
    if not refs and not slugs and hold_source:
        for line in hold_source.splitlines():
            waits = re.search(r'\bwaits[- ]on\s*:\s*(\S.+)', line, re.I)
            if waits and waits.group(1).strip():
                return 'HELD waits-on: ' + waits.group(1).strip(), [], ''
    pending = re.search(r'(?:pending[- ]decision|decision needed)\s*:\s*(\S[^\n]*)', text, re.I)
    decider = re.search(r'(?:decider|who decides|decides[- ]by|decision owner)\s*:\s*(\S[^\n]*)', text, re.I)
    natural_decision = re.search(r'\b(?:awaiting|pending|waiting for)\s+(Craig|dr eggbot|managing dr|chief dr|claude-code)\s+(?:to\s+)?(?:decide|approve|choose)\s+(\S[^\n]*)', text, re.I)
    decision_line = r'(?:^|\n)\s*(?:(?:dr eggbot|managing dr|chief dr|claude-code)[^\n:]*:\s*)?decision(?:\s+(?:recorded|resolved|made))?\s*:\s*\S'
    decided = bool(re.search(decision_line, latest, re.I) or
                   re.search(r'\b(?:Craig|dr eggbot|managing dr|chief dr)\s+decided\s*:\s*\S', latest, re.I))
    if not decided:
        if pending and decider: return 'HELD pending decision: ' + pending.group(1).strip(), [], ''
        if natural_decision: return 'HELD pending decision: ' + natural_decision.group(0), [], ''
    open_refs, closed_refs = [], []
    for ref in sorted(refs):
        try:
            blocker = gh.req('GET', '/repos/%s/issues/%d' % (REPO, ref))
            if blocker.get('state') == 'closed': closed_refs.append(ref)
            elif blocker.get('state') == 'open': open_refs.append(ref)
        except Exception: pass
    written = text + '\n' + '\n'.join(b for s, b in brain.pages.items() if s.startswith('bot-admin/requests/') and re.search(r'#%d\b' % n, b))
    rescoped = False; rescoped_pieces = set()
    for ref in sorted(refs):
        try:
            blocker = gh.req('GET', '/repos/%s/issues/%d' % (REPO, ref))
            cs = gh.pages('/repos/%s/issues/%d/comments' % (REPO, ref))
            pieces = rescope_refs(blocker.get('body') or '')
            for comment in cs:
                if dr_post(comment):
                    pieces.update(rescope_refs(comment['body']))
            if not pieces: continue
            rescoped = True; rescoped_pieces.update(pieces)
            for piece in pieces:
                try: brain.discover(piece, dry)
                except Exception: pass
            requests = [(slug, body) for slug, body in brain.pages.items() if slug.startswith('bot-admin/requests/')]
            all_dispatched = all(dispatch(piece, {}, brain, workers) for piece in pieces)
            live = [(slug, piece) for slug, body in requests for piece in pieces
                    if re.search(r'#%d\b' % piece, body) and running(piece, workers)]
            if all_dispatched and live and dependency(written):
                return 'HELD waits-on: ' + live[0][0], [], ''
        except Exception: pass
    if rescoped:
        try:
            if not open_refs and not slugs and len(closed_refs) == len(refs) and rescoped_pieces and all(gh.req('GET', '/repos/%s/issues/%d' % (REPO, piece)).get('state') == 'closed' for piece in rescoped_pieces):
                return None, labels, 'rescoped blocker pieces closed/merged'
        except Exception: pass
        return None, [], 'UNRESOLVED: rescoped blocker has no running dispatched job'
    if decided and not open_refs and not slugs: return None, labels, 'pending decision recorded'
    if closed_refs and not open_refs and not slugs and len(closed_refs) == len(refs):
        return None, labels, 'blocker(s) closed/merged: ' + ', '.join('#%d' % ref for ref in closed_refs)
    if (refs or slugs) and not dependency(written): return None, [], 'UNRESOLVED: serialization has no written dependency'
    for ref in open_refs:
        return 'HELD on #%d' % ref, [], ''
    for slug in slugs:
        try:
            request = brain.get(slug)
            numbers = [int(x) for x in re.findall(r'#(\d+)\b', request)]
            if any(running(ref, workers) for ref in numbers): return 'HELD waits-on: ' + slug, [], ''
        except Exception: pass
    return None, [], 'UNRESOLVED: no valid named hold'


HOLD_MAX_S = 2 * 3600
DR_HOLD = re.compile(r"^\s*(?:dr eggbot|managing dr|claude-code|chief dr|ruling\s*\d+|diagnosis update)\b", re.I)


def _hold_label_names(item):
    return [x["name"] for x in item.get("labels", []) if x["name"].startswith("hold:")]


def _label_since(gh, n, labels, dry, item=None):
    if dry:
        if item is not None:
            return {l: stamp(item.get("updated_at")) for l in labels}
        cached = getattr(gh, "items", None)
        if cached is not None:
            it = cached.get(n)
            if it:
                return {l: stamp(it.get("updated_at")) for l in labels}
        return {}
    out = {}
    for e in gh.pages("/repos/%s/issues/%d/events" % (REPO, n)):
        if e.get("event") == "labeled" and e.get("label", {}).get("name") in labels:
            out[e["label"]["name"]] = stamp(e["created_at"])
    return out


def _dr_comments_after(gh, n, since):
    rows = []
    for c in gh.pages("/repos/%s/issues/%d/comments" % (REPO, n)):
        if stamp(c["created_at"]) <= since:
            continue
        if dr_post(c) or DR_HOLD.match(c.get("body") or ""):
            rows.append(c)
    return rows


def _hold_renewed(gh, n, hold_since, body, latest):
    if not re.search(r"\bblocked[- ]by\b", hold_text(body, latest), re.I):
        return False
    return any(re.search(r"\bblocked[- ]by\b", c.get("body") or "", re.I) for c in _dr_comments_after(gh, n, hold_since))


def _ref_is_open(ref, open_map, gh, pass_state):
    if open_map is not None:
        if ref in open_map:
            return open_map[ref].get("state", "open") == "open"
        closed = (pass_state or {}).get("closed_issues") or {}
        if closed.get(str(ref)) == "closed":
            return False
        if pass_state is not None:
            pass_state.setdefault("closed_issues", {})[str(ref)] = "closed"
        return False
    try:
        state = gh.req("GET", "/repos/%s/issues/%d" % (REPO, ref)).get("state")
    except Exception:
        return False
    if state == "closed" and pass_state is not None:
        pass_state.setdefault("closed_issues", {})[str(ref)] = "closed"
    return state == "open"


def extra_hold_removals(gh, item, latest, now, dry=False, workers=None, open_map=None, pass_state=None):
    workers = workers or []
    labels = _hold_label_names(item)
    if not labels:
        return []
    n = item["number"]
    body = item.get("body") or ""
    since = _label_since(gh, n, set(labels), dry, item=item)
    out = []
    for lab in labels:
        hold_since = since.get(lab, stamp(item.get("updated_at", utc(now))))
        hold_src = hold_text(body, latest)
        text = (body or "") + "\n" + (latest or "")
        refs, slugs = references(hold_src, n)
        has_bb = bool(re.search(r"\bblocked[- ]by\b", text, re.I))
        if not has_bb:
            if re.search(r"\bwaits[- ]on\s*:", text, re.I) or re.search(r"pending[- ]decision", text, re.I):
                continue
            if not refs and not slugs:
                out.append((lab, "no named open blocker"))
            continue
        open_refs = []
        for ref in sorted(refs):
            if _ref_is_open(ref, open_map, gh, pass_state):
                open_refs.append(ref)
        if refs and not open_refs and not slugs:
            pieces = set()
            for ref in refs:
                try:
                    if open_map is not None and ref not in open_map:
                        blocker = {"body": ""}
                    else:
                        blocker = gh.req("GET", "/repos/%s/issues/%d" % (REPO, ref))
                    pieces.update(rescope_refs(blocker.get("body") or ""))
                    if open_map is None or ref in open_map:
                        for c in gh.pages("/repos/%s/issues/%d/comments" % (REPO, ref)):
                            if dr_post(c):
                                pieces.update(rescope_refs(c.get("body") or ""))
                except Exception:
                    pass
            if pieces and any(running(p, workers) for p in pieces):
                continue
            out.append((lab, "blocker closed or merged"))
            continue
        if open_refs and now - hold_since < HOLD_MAX_S:
            continue
        if open_refs and _hold_renewed(gh, n, hold_since, body, latest or ""):
            continue
        if open_refs:
            out.append((lab, "hold older than 2h without dr renewal"))
    return out


def rescope_refs(text):
    result = set()
    for line in re.split(r'[\n!?]|\.(?=\s|$)', text):
        match = re.search(r'\b(?:rescop(?:ed|ing)|split(?:\s+work)?(?:\s+into)?|split into)\b', line, re.I)
        if match and not re.match(r'\s+from\b', line[match.end():], re.I):
            tail = line[match.end():]
            for a, b in re.findall(r'#(\d+)\s*[-–]\s*#(\d+)', tail):
                if 0 <= int(b) - int(a) < 100: result.update(range(int(a), int(b) + 1))
            result.update(int(x) for x in re.findall(r'#(\d+)\b', tail))
    return result


def audit(gh, now, brain, workers, dry=False):
    vk = gh.pages('/repos/%s/issues?state=open&labels=project:tsv' % REPO)
    if not isinstance(vk, list): return dict(idle={}, removals=[], misses=[], covered=set(), items={})
    items = {i['number']: i for i in vk if isinstance(i, dict) and 'number' in i and project_tsv(i)}
    comments = {}; rulings = []
    errors = []; pending = list(items); inspected = set()
    while pending:
        n = pending.pop(0)
        if n in inspected: continue
        inspected.add(n); item = items[n]
        cs = gh.pages('/repos/%s/issues/%d/comments' % (REPO, n))
        drs = [c for c in cs if dr_post(c)]
        drs.sort(key=lambda c: stamp(c['created_at']))
        comments[n] = drs[-1]['body'] if drs else ''
        combined = (item.get('body') or '') + '\n' + comments[n]
        refs, _ = references(hold_text(item.get('body') or '', comments[n]), n)
        parents = {int(x) for x in re.findall(r'\brescoped from\s+#(\d+)', combined, re.I)}
        for ref in refs | parents:
            if ref in items: continue
            if dry: continue
            try:
                blocker = gh.req('GET', '/repos/%s/issues/%d' % (REPO, ref))
                if blocker.get('state') == 'open' or ref in parents:
                    items[ref] = blocker; pending.append(ref)
            except Exception: errors.append('blocker lookup unavailable #%d' % ref)
        for c in drs + [dict(body=item.get('body') or '', created_at=item.get('updated_at', utc(now)))]:
            refs = rescope_refs(c['body']) - {n}
            if refs: rulings.append((n, c, refs))
        try: brain.discover(n, dry)
        except Exception: errors.append('GBrain lookup unavailable #%d' % n)
    idle = {}; removals = []; misses = []; holds = {}
    for parent, ruling, refs in rulings:
        for n in sorted(refs):
            try:
                if n not in items:
                    child = gh.req('GET', '/repos/%s/issues/%d' % (REPO, n))
                    if child.get('state') != 'open': continue
                    items[n] = child
                brain.discover(n, dry)
            except Exception: errors.append('rescope lookup unavailable #%d' % n)
            if n not in items: continue
            if now - stamp(ruling['created_at']) >= RESCOPE and not dispatch(n, items[n], brain, workers):
                idle[n] = 'rescope from #%d has no dispatch after 15m' % parent
                signature = ruling['body'].splitlines()[0]
                author = (ruling.get('user') or {}).get('login', '')
                if re.match(r'\s*(?:dr eggbot|chief dr)', signature, re.I): owner = 'dr-eggbot'
                elif re.match(r'\s*(?:managing dr|claude-code)', signature, re.I): owner = 'claude-code'
                else: owner = 'dr-eggbot' if re.search(r'eggbot|grokbot', author, re.I) else 'claude-code' if re.search(r'claude-code', author, re.I) else 'unknown'
                misses.append((owner, n, parent, ruling['created_at']))
    for n, item in items.items():
        if item.get('state') == 'closed': continue
        if not project_tsv(item): continue
        valid, labels, reason = assess_hold(item, comments.get(n, ''), gh, brain, workers, dry=dry)
        if valid: holds[n] = valid
        if labels: removals.append((n, labels, reason))
        already = {lab for n0, labs, _ in removals if n0 == n for lab in labs}
        for lab, why in extra_hold_removals(gh, item, comments.get(n, ''), now, dry=dry, workers=workers):
            if lab in already:
                continue
            already.add(lab)
            removals.append((n, [lab], why))
        if not valid and not running(n, workers): idle.setdefault(n, reason)
    return dict(idle=idle, removals=removals, misses=misses, covered=set(items), errors=errors, holds=holds, items=items)


def stop_files(root=D):
    paths = glob.glob(root + '/*STOP') + glob.glob(os.path.expanduser('~') + '/*STOP')
    result = []
    for path in sorted(set(paths)):
        try:
            with open(path) as source: reason = re.sub(r'\s+', ' ', source.read(1000)).strip()
        except Exception: reason = 'unreadable'
        result.append(path + (': ' + reason if reason else ''))
    return result


def format_dry_plan(meters, result, stops):
    lines = ['DRY PLAN lanes: ' + ', '.join(sorted(LANES))]
    lines.append('DRY PLAN meters: ' + '; '.join(
        '%s pct=%s stale=%s available=%s' % (name, m['pct_used'], m['stale'], m['available']) for name, m in sorted(meters.items())))
    if result.get('idle'):
        lines.append('DRY PLAN idle: ' + '; '.join('#%d %s' % pair for pair in sorted(result['idle'].items())))
    else:
        lines.append('DRY PLAN idle: none')
    available = {name: reading for name, reading in meters.items() if reading['available']}
    if result.get('idle') and available:
        ring = '[ubuntu idle-capacity] dr eggbot: ' + '; '.join('#%d %s' % pair for pair in sorted(result['idle'].items()))
        ring += ' | quota: ' + '; '.join('%s %s%% used reset=%s as-of=%s%s' % (
            name, m['pct_used'] if m['pct_used'] is not None else 'unknown', m['reset'], m['as_of'],
            ' meter stale' if m['stale'] else '') for name, m in available.items())
        ring += ' | stop files: ' + ('; '.join(stops) or 'none')
        lines.append('DRY PLAN ring: ' + ring)
    for n, labels, reason in result.get('removals', []):
        lines.append('DRY would remove #%d %s: %s' % (n, ','.join(labels), reason))
        lines.append('DRY would comment #%d Hold cleared: %s.' % (n, re.sub(r'\s+', ' ', reason)))
    for owner, n, parent, posted in result.get('misses', []):
        lines.append('DRY would score miss %s #%d (rescope #%d)' % (owner, n, parent))
    for err in result.get('errors', []):
        lines.append('DRY note: ' + err)
    lines.append('DRY PLAN stops: ' + ('; '.join(stops) if stops else 'none'))
    return lines


def cycle(gh, state, now, dry, ring, meters=None, brain=None, workers=None, stops=None):
    meters = read_meters(now, dry=dry) if meters is None else meters
    brain = Brain() if brain is None else brain
    workers = read_workers(now, dry=dry) if workers is None else workers
    stop_list = stop_files() if stops is None else stops
    result = audit(gh, now, brain, workers, dry=dry)
    notes = list(result.get('errors', []))
    items = result.get('items', {})
    for n, labels, reason in result['removals']:
        item = items.get(n)
        if not item or not project_tsv(item):
            continue
        notes.append('%sremove #%d %s: %s' % ('would ' if dry else '', n, ','.join(labels), reason))
        if not dry:
            try:
                if not project_tsv(gh.req('GET', '/repos/%s/issues/%d' % (REPO, n))):
                    notes.append('hold cleanup skipped #%d: not project:tsv' % n)
                    continue
                for label in labels:
                    gh.req('DELETE', '/repos/%s/issues/%d/labels/%s' % (REPO, n, quote(label, safe='')))
                if not project_tsv(gh.req('GET', '/repos/%s/issues/%d' % (REPO, n))):
                    notes.append('hold cleanup skipped #%d: not project:tsv' % n)
                    continue
                gh.req('POST', '/repos/%s/issues/%d/comments' % (REPO, n), {'body': 'Hold cleared: ' + re.sub(r'\s+', ' ', reason) + '.'})
            except Exception: notes.append('hold cleanup write failed #%d' % n)
    for owner, n, parent, posted in result['misses']:
        key = '%d:%d:%s' % (parent, n, posted)
        if key in state.get('rescope_misses', {}): continue
        notes.append('%sscore miss %s #%d (rescope #%d)' % ('would ' if dry else '', owner, n, parent))
        if not dry:
            try:
                record_miss(owner, 'issue #%d undispatched rescope of #%d' % (n, parent), now)
                state.setdefault('rescope_misses', {})[key] = now
            except Exception: notes.append('score miss write failed #%d' % n)
    available = {name: reading for name, reading in meters.items() if reading['available']}
    if result['idle'] and available:
        if 'idle_ring_at' not in state or now - state['idle_ring_at'] >= RERING:
            message = '[ubuntu idle-capacity] dr eggbot: ' + '; '.join('#%d %s' % pair for pair in sorted(result['idle'].items()))
            message += ' | quota: ' + '; '.join('%s %s%% used reset=%s as-of=%s%s' % (name, m['pct_used'] if m['pct_used'] is not None else 'unknown', m['reset'], m['as_of'], ' meter stale' if m['stale'] else '') for name, m in available.items())
            message += ' | stop files: ' + ('; '.join(stop_list) or 'none')
            notes.append('idle ring: ' + message)
            if not dry:
                response = ring(message, False)
                if response == 'ok': state['idle_ring_at'] = now
                else: notes.append('idle ring failed: ' + str(response))
    elif not dry:
        state.pop('idle_ring_at', None)
    if dry:
        for line in format_dry_plan(meters, result, stop_list): print(line)
    result['notes'] = notes
    return result
