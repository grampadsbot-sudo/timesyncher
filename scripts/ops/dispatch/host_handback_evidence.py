"""Read-only host collector. Unsupported canonical evidence is an error, never absence."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from host_handback_events import (EVENT_VERSION, EVENT_VERSION_REGISTERED, EventError,
                                  is_acceptance_record, is_resolution_record, load_event,
                                  verify_acceptance_event, verify_acceptance_observation, verify_event,
                                  verify_observation, verify_resolution_event,
                                  verify_resolution_observation)
from host_handback_observation import (ObservationError, load_observation,
                                       locate_current_section, validate_observation_path,
                                       verify_assessment_observation, verify_item_observation)
from host_handback_launch_identity import authenticate_issue_launch_identity
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
CURSOR_LIVE_RUN = frozenset({'RUNNING', 'CREATING'})
CURSOR_TERMINAL_RUN = frozenset({'FINISHED', 'FAILED', 'CANCELLED', 'STOPPED', 'IDLE', 'EXPIRED'})
VKFILL_TAG_RE = re.compile(r'^vkfill-(\d+)$')
VKFILL_JOB_BASENAME_RE = re.compile(r'^vkfill-\d+(?:-\d{12}(?:\d{2})?)?(?:-\d+)?-job$')
AUTOMATIC_WORK_ROOT = Path(os.path.expanduser(os.environ.get('TSV_WORK_ROOT', '~/tsv-work')))
AUTOMATIC_DEFAULT_BASE = 'cursor/jev-quality-r20-1128'


def lane_run_binding(argv):
    """Return lane, job_dir, tag, worktree argv fields from a vk-lane-run.sh process."""
    for index, part in enumerate(argv):
        if not (part.endswith('/vk-lane-run.sh') or part == 'vk-lane-run.sh'):
            continue
        if index + 5 >= len(argv):
            return None
        return argv[index + 1], argv[index + 2], argv[index + 3], argv[index + 4], argv[index + 5]
    return None


def proc_starttime_jiffies(stat_bytes):
    return stat_bytes.split(b') ', 1)[1].split()[19]


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


def current_section(text, now, observation=None):
    try:
        section, at = locate_current_section(text)
    except ObservationError as exc:
        raise EvidenceError(str(exc)) from exc
    if now < at:
        raise EvidenceError('assessment current section stale or future')
    if now - at <= ASSESSMENT_S:
        return section
    require(observation is not None, 'assessment current section stale or future')
    return section


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
    """Outer-host only. All methods read; injected equivalents make tests offline.

    New host handback events use an explicitly supplied path map or event root.
    Paths are never inferred from GBrain prose or receipt text.
    """
    def __init__(self, root, proc_root='/proc', handback_event_root=None, handback_event_paths=None,
                 acceptance_event_root=None, acceptance_event_paths=None,
                 resolution_event_root=None, resolution_event_paths=None,
                 host_observation_path=None, cursor_api_get=None, github_get=None):
        self.root = Path(root)
        self.host_observation_path = host_observation_path
        self.proc_root = Path(proc_root)
        self.handback_event_root = Path(handback_event_root) if handback_event_root else None
        self.handback_event_paths = dict(handback_event_paths or {})
        self.acceptance_event_root = Path(acceptance_event_root) if acceptance_event_root else None
        self.acceptance_event_paths = dict(acceptance_event_paths or {})
        self.resolution_event_root = Path(resolution_event_root) if resolution_event_root else None
        self.resolution_event_paths = dict(resolution_event_paths or {})
        self._cursor_api_get = cursor_api_get
        self._github_get = github_get

    def automatic_item(self, number):
        require(self._github_get is not None, 'automatic lane job requires authenticated GitHub source')
        item = self._github_get('issues/%d' % number)
        require(item.get('number') == number and item.get('state') == 'open',
                'automatic lane item identity or state mismatch')
        if 'pull_request' in item:
            item = self._github_get('pulls/%d' % number)
            require(item.get('number') == number and item.get('state') == 'open',
                    'automatic lane PR identity or state mismatch')
            return 'pr', item
        require('head' not in item, 'automatic lane item source unknown')
        return 'issue', item

    def _validate_automatic_start_time(self, fields, stat_bytes):
        boot = [line.split()[1] for line in (self.proc_root / 'stat').read_text().splitlines()
                if line.startswith('btime ')]
        require(len(boot) == 1, 'automatic lane boot time missing')
        process_at = int(boot[0]) + int(proc_starttime_jiffies(stat_bytes)) / os.sysconf('SC_CLK_TCK')
        raw = fields['started']
        try:
            stamp, zone = raw.rsplit(' ', 1)
            parsed = datetime.strptime(stamp, '%Y-%m-%d %H:%M:%S').replace(tzinfo=PT)
            require(parsed.tzname() == zone, 'automatic lane slot timezone mismatch')
            started = parsed.timestamp()
        except (ValueError, TypeError) as exc:
            raise EvidenceError('automatic lane slot started time invalid') from exc
        require(-1 <= started - process_at <= 120 and started <= time.time() + 1,
                'automatic lane slot started time contradicts process start')

    def cursor_api_get(self, path):
        """Read-only Cursor Cloud Agents API (same key route as cursor_launch / idle_capacity)."""
        if self._cursor_api_get is not None:
            return self._cursor_api_get(path)
        from tsv_common import read_secret
        key = read_secret(os.path.expanduser('~/.config/tsv-cursor/api-key'))
        require(key, 'Cursor API key missing for authenticated live job proof')
        auth = 'Basic ' + base64.b64encode((key + ':').encode()).decode()
        request = urllib.request.Request(
            'https://api.cursor.com' + path,
            headers={'Authorization': auth, 'User-Agent': 'host-handback-evidence'})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            raise EvidenceError('Cursor API read failed for live job proof: HTTP %d' % exc.code) from exc
        except Exception as exc:
            raise EvidenceError('Cursor API read failed for live job proof: %s' % type(exc).__name__) from exc

    @staticmethod
    def _run_commit_sha(run):
        git = run.get('git') if isinstance(run.get('git'), dict) else {}
        for branch in git.get('branches') or []:
            if not isinstance(branch, dict):
                continue
            for key in ('commitSha', 'sha', 'headSha'):
                value = branch.get(key)
                if isinstance(value, str) and HEAD_RE.fullmatch(value):
                    return value
        for key in ('commitSha', 'sha', 'headSha'):
            value = git.get(key) if isinstance(git, dict) else None
            if isinstance(value, str) and HEAD_RE.fullmatch(value):
                return value
        return None

    def _cloud_job_running(self, number, cloud_rec, cursor_issues, heads, cursor_meta=None):
        """Authenticate agent/run against Cursor API; True only for live runs."""
        cursor_meta = dict(cursor_meta or cursor_issues.get(str(number)) or {})
        agent = cloud_rec.get('agent') or cursor_meta.get('agent')
        issue_n = cloud_rec.get('issue')
        if issue_n is not None:
            linked = cursor_issues.get(str(issue_n)) or {}
            if linked.get('agent'):
                require(not agent or agent == linked['agent'],
                        'cloud cursor agent identity mismatch #%d' % number)
                agent = agent or linked['agent']
                if not cursor_meta.get('agent'):
                    cursor_meta = linked
        require(agent, 'active cloud flag lacks authenticated agent binding #%d' % number)
        agent_obj = self.cursor_api_get('/v1/agents/' + urllib.parse.quote(agent, safe=''))
        require(agent_obj.get('id') == agent, 'authenticated Cursor agent id mismatch #%d' % number)
        latest_run_id = agent_obj.get('latestRunId')
        require(latest_run_id, 'authenticated Cursor latest run id missing #%d' % number)
        stored_run_id = cloud_rec.get('followup_run') or cursor_meta.get('run')
        agent_q = urllib.parse.quote(agent, safe='')
        if stored_run_id and stored_run_id != latest_run_id:
            stored_run = self.cursor_api_get('/v1/agents/%s/runs/%s' % (
                agent_q, urllib.parse.quote(stored_run_id, safe='')))
            require(stored_run.get('id') == stored_run_id,
                    'authenticated Cursor stored run id mismatch #%d' % number)
            stored_status = (stored_run.get('status') or '').upper()
            if stored_status in CURSOR_LIVE_RUN:
                raise EvidenceError(
                    'authenticated stored follow-up still live but not latest #%d' % number)
            if stored_status not in CURSOR_TERMINAL_RUN:
                raise EvidenceError(
                    'authenticated stored follow-up run status unknown #%d: %s'
                    % (number, stored_status or '?'))
        elif stored_run_id:
            require(stored_run_id == latest_run_id,
                    'authenticated Cursor follow-up run mismatch #%d' % number)
        run_id = latest_run_id
        run = self.cursor_api_get('/v1/agents/%s/runs/%s' % (
            agent_q, urllib.parse.quote(run_id, safe='')))
        require(run.get('id') == run_id, 'authenticated Cursor run id mismatch #%d' % number)
        status = (run.get('status') or '').upper()
        if status in CURSOR_LIVE_RUN:
            if heads and heads.get(number):
                expected = heads[number]
                actual = self._run_commit_sha(run)
                require(actual and HEAD_RE.fullmatch(actual),
                        'authenticated Cursor run lacks verifiable head #%d' % number)
                require(actual == expected, 'authenticated Cursor run head mismatch #%d' % number)
            return True
        if status in CURSOR_TERMINAL_RUN:
            return False
        raise EvidenceError('authenticated Cursor run status unknown #%d: %s' % (number, status or '?'))

    def handback_event_configured(self, number):
        return number in self.handback_event_paths or self.handback_event_root is not None

    def handback_event_path(self, number):
        """Return the configured on-disk event record path for this item, if any."""
        if number in self.handback_event_paths:
            return Path(self.handback_event_paths[number])
        if self.handback_event_root is not None:
            return self.handback_event_root / ('%d.json' % number)
        return None

    def acceptance_event_configured(self, number):
        return number in self.acceptance_event_paths or self.acceptance_event_root is not None

    def acceptance_event_path(self, number):
        if number in self.acceptance_event_paths:
            return Path(self.acceptance_event_paths[number])
        if self.acceptance_event_root is not None:
            return self.acceptance_event_root / ('%d.json' % number)
        return None

    def resolution_event_configured(self, number):
        return number in self.resolution_event_paths or self.resolution_event_root is not None

    def resolution_event_path(self, number):
        if number in self.resolution_event_paths:
            return Path(self.resolution_event_paths[number])
        if self.resolution_event_root is not None:
            return self.resolution_event_root / ('%d.json' % number)
        return None

    def authenticate_resolution_event(self, path, item, head, handback_comment_id, comment, now,
                                      observed_at=None):
        require(head and HEAD_RE.fullmatch(head), 'resolution event requires exact current head')
        try:
            record = load_event(path)
        except EventError as exc:
            raise EvidenceError(str(exc)) from exc
        require(is_resolution_record(record), 'configured host event is not a resolution record')
        require(record['item'] == item, 'resolution event item mismatch')
        require(record['state'] == 'pending',
                'unsupported reviewed host handback resolution; explicit acceptance contract required')
        try:
            if record['version'] == EVENT_VERSION_REGISTERED:
                require(observed_at is not None, 'resolution event observation time missing')
                verify_resolution_observation(record, comment, handback_comment_id, head,
                                            observed_at, now=now)
            elif record['version'] == EVENT_VERSION:
                verify_resolution_event(record, comment, handback_comment_id, head, now=now)
            else:
                raise EventError('unsupported host handback event version')
        except EventError as exc:
            raise EvidenceError(str(exc)) from exc
        return record

    def authenticate_acceptance_event(self, path, item, head, now, observed_at=None):
        require(head and HEAD_RE.fullmatch(head), 'acceptance event requires exact current head')
        try:
            record = load_event(path)
        except EventError as exc:
            raise EvidenceError(str(exc)) from exc
        require(is_acceptance_record(record), 'configured host event is not a pending-acceptance record')
        require(record['item'] == item['number'], 'acceptance event item mismatch')
        require(record['state'] == 'pending',
                'unsupported reviewed acceptance resolution; explicit acceptance contract required')
        author = item.get('user') or {}
        require(author.get('id') == record['gh_actor_id'], 'acceptance event GH actor mismatch')
        try:
            if record['version'] == EVENT_VERSION_REGISTERED:
                require(observed_at is not None, 'acceptance event observation time missing')
                verify_acceptance_observation(record, item, head, observed_at, now=now)
            elif record['version'] == EVENT_VERSION:
                verify_acceptance_event(record, item, head, now=now)
            else:
                raise EventError('unsupported host handback event version')
        except EventError as exc:
            raise EvidenceError(str(exc)) from exc
        return record

    def authenticate_handback_event(self, path, item, head, comment, now, observed_at=None):
        """Bind a HOST_HANDOFF record to live comment bytes and current head."""
        require(head and HEAD_RE.fullmatch(head), 'host handback event requires exact current head')
        try:
            record = load_event(path)
        except EventError as exc:
            raise EvidenceError(str(exc)) from exc
        require(record['item'] == item, 'host handback event item mismatch')
        require(record['state'] == 'pending',
                'unsupported reviewed host handback resolution; explicit acceptance contract required')
        try:
            if record['version'] == EVENT_VERSION_REGISTERED:
                require(observed_at is not None, 'host handback observation time missing')
                verify_observation(record, comment, head, observed_at, now=now)
            elif record['version'] == EVENT_VERSION:
                verify_event(record, comment, head, now=now)
            else:
                raise EventError('unsupported host handback event version')
        except EventError as exc:
            raise EvidenceError(str(exc)) from exc
        return record

    def host_observation(self):
        if not self.host_observation_path:
            return None
        validate_observation_path(self.host_observation_path)
        return load_observation(self.host_observation_path)

    def page(self, slug):
        from dr_scorecard import read_page
        return read_page(slug)

    def json(self, relative):
        return json.loads((self.root / relative).read_text())

    def _read_automatic_job_file(self, job_dir, name):
        path = Path(job_dir) / name
        require(path.is_file(), 'automatic lane job metadata missing %s' % name)
        text = path.read_text().strip()
        require(text, 'automatic lane job metadata empty %s' % name)
        return text

    def _authenticate_vkfill_job(self, fields, argv):
        tag = fields.get('tag') or ''
        match = VKFILL_TAG_RE.fullmatch(tag)
        if not match:
            return None
        number = int(match.group(1))
        binding = lane_run_binding(argv)
        require(binding is not None,
                'automatic lane slot lacks vk-lane-run argv binding: ' + tag)
        runners = [part for part in argv if part.endswith('/vk-lane-run.sh') or part == 'vk-lane-run.sh']
        require(len(runners) == 1 and Path(runners[0]).resolve() ==
                (self.root / 'lanes/vk-lane-run.sh').resolve(),
                'automatic lane process runner source unknown')
        lane, job_dir, argv_tag, argv_brief, argv_worktree = binding
        require(argv_tag == tag, 'automatic lane slot tag disagrees with process argv')
        require(lane == fields.get('lane'), 'automatic lane slot lane disagrees with process argv')
        require(fields.get('started'), 'automatic lane slot started time missing')
        job_path = Path(job_dir).resolve(strict=True)
        require(VKFILL_JOB_BASENAME_RE.fullmatch(job_path.name),
                'automatic lane job dir name invalid: ' + job_path.name)
        require(re.match(r'^vkfill-%d(?:-|$)' % number, job_path.name),
                'automatic lane job dir does not bind item: ' + job_path.name)
        try:
            job_path.relative_to(AUTOMATIC_WORK_ROOT.resolve())
        except ValueError:
            raise EvidenceError('automatic lane job dir outside work root')
        worktree = Path(self._read_automatic_job_file(job_path, 'worktree.txt')).resolve(strict=True)
        fingerprint = self._read_automatic_job_file(job_path, 'fingerprint.txt')
        argv_wt = Path(argv_worktree).resolve(strict=True)
        require(worktree == argv_wt, 'automatic lane worktree disagrees with process argv')
        brief_path = Path(argv_brief).resolve(strict=True)
        require(brief_path == job_path / ('vkfill-%d-brief.md' % number),
                'automatic lane argv brief does not bind canonical launch brief')
        brief = brief_path.read_text()
        kind, item = self.automatic_item(number)
        titles = re.findall(r'^# TSV (PR|issue) #(\d+): .+$', brief, re.M)
        require(titles == [('PR' if kind == 'pr' else 'issue', str(number))],
                'automatic lane brief item source mismatch')
        starts = re.findall(r'^## Start commit\nStart from `([0-9a-f]{40})`\.', brief, re.M)
        require(len(starts) == 1, 'automatic lane brief start commit missing or ambiguous')
        start_sha = starts[0]
        if kind == 'pr':
            head = (item.get('head') or {}).get('sha')
            require(HEAD_RE.fullmatch(fingerprint) and fingerprint == head == start_sha,
                    'live automatic job belongs to a different current head')
        else:
            base = authenticate_issue_launch_identity(
                job_path, number, fingerprint, start_sha, item, AUTOMATIC_DEFAULT_BASE)
            policy = ('## Base branch policy\nBranch from `%s` at the start commit and open ONE '
                      'pull request into `%s`. Never merge or rebase any other branch into yours.' % (base, base))
            require(policy in brief and ('That is the head of `%s` when this brief was written.' % base) in brief,
                    'automatic issue brief base disagrees with authenticated issue')
            comparison = self._github_get('compare/%s...%s' % (
                start_sha, urllib.parse.quote(base, safe='')))
            require(comparison.get('status') in {'ahead', 'identical'} and
                    (comparison.get('merge_base_commit') or {}).get('sha') == start_sha,
                    'automatic issue launch SHA does not belong to authenticated base')
            first = subprocess.run(['git', '--no-optional-locks', '-C', str(worktree),
                                    'reflog', 'show', '--format=%H', 'HEAD'],
                                   capture_output=True, text=True, timeout=10, check=True)
            history = first.stdout.splitlines()
            require(history and history[-1] == start_sha,
                    'automatic issue launch SHA disagrees with initial worktree HEAD')
        return {'item': number, 'worktree': str(worktree), 'job_dir': str(job_path),
                'fingerprint': fingerprint, 'kind': kind, 'start_sha': start_sha,
                'source': 'lane_autofill'}

    def _resolve_lane_job_meta(self, jobs, fields, argv):
        tag = fields.get('tag')
        meta = jobs.get(tag) if tag else None
        if isinstance(meta, dict):
            return meta
        return self._authenticate_vkfill_job(fields, argv)

    def _validate_lane_process(self, fields, meta, argv, cwd):
        worktree = Path(meta['worktree']).resolve(strict=True)
        require(cwd == worktree or worktree in cwd.parents, 'live PID worktree contradicts job registry')
        tag, lane = fields.get('tag'), fields.get('lane')
        if meta.get('source') == 'lane_autofill':
            binding = lane_run_binding(argv)
            require(binding is not None, 'PID is not the exact registered lane job')
            bind_lane, job_dir, bind_tag, _, _ = binding
            require(bind_tag == tag and bind_lane == lane, 'PID is not the exact registered lane job')
            require(str(Path(job_dir).resolve(strict=True)) == meta['job_dir'],
                    'automatic lane job dir disagrees with authenticated metadata')
        require(any(x.endswith('/vk-lane-run.sh') or x == 'vk-lane-run.sh' for x in argv)
                and tag in argv and lane in argv, 'PID is not the exact registered lane job')

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
            tag = fields.get('tag') or ''
            if tag not in jobs and not VKFILL_TAG_RE.fullmatch(tag):
                raise EvidenceError('slot has no canonical job mapping: ' + path.name)
            manual = jobs.get(tag)
            if isinstance(manual, dict) and not ({manual.get('item'), manual.get('pr')} - {None}) & numbers:
                continue
            require(fields.get('host') == socket.gethostname(), 'scoped slot belongs to a different host')
            pid = fields.get('pid', '')
            require(pid.isdigit() and int(pid) > 0, 'scoped slot PID missing')
            proc = self.proc_root / pid
            try:
                before = (proc / 'stat').read_bytes()
                argv = (proc / 'cmdline').read_bytes().decode().split('\0')
                cwd = (proc / 'cwd').resolve(strict=True)
                meta = self._resolve_lane_job_meta(jobs, fields, argv)
                require(isinstance(meta, dict), 'slot has no canonical job mapping: ' + path.name)
                self._validate_lane_process(fields, meta, argv, cwd)
                if meta.get('source') == 'lane_autofill':
                    self._validate_automatic_start_time(fields, before)
                require(proc_starttime_jiffies(before) == proc_starttime_jiffies((proc / 'stat').read_bytes()),
                        'PID reused during collection')
                identities = {meta.get('item'), meta.get('pr')} - {None}
                if not identities & numbers:
                    continue
                expected = {heads[n] for n in identities if heads and heads.get(n)}
                if expected:
                    if meta.get('source') == 'lane_autofill' and meta.get('kind') == 'pr':
                        require(expected == {meta['fingerprint']},
                                'live automatic job belongs to a different current head')
                    wt = Path(meta['worktree']).resolve(strict=True)
                    result = subprocess.run(['git', '--no-optional-locks', '-C', str(wt), 'rev-parse', 'HEAD'],
                                            capture_output=True, text=True, timeout=10, check=True)
                    require(expected == {result.stdout.strip()}, 'live job belongs to a different current head')
            except FileNotFoundError as exc:
                require(not proc.exists(), 'live scoped job has missing process/worktree evidence: ' + str(exc.filename))
                continue
            running.update(identities)
        cloud = self.json('rereview-state.json')
        cursor = self.json('cursor-state.json')
        issues = cursor.get('issues')
        require(isinstance(cloud, dict) and isinstance(issues, dict), 'cloud job records unreadable')
        for number in numbers:
            cloud_rec = cloud.get(str(number))
            cloud_rec = cloud_rec if isinstance(cloud_rec, dict) else {}
            if cloud_rec.get('active'):
                if self._cloud_job_running(number, cloud_rec, issues, heads):
                    running.add(number)
                continue
            meta = issues.get(str(number)) or {}
            if not meta.get('agent'):
                continue
            local = str(meta.get('last_status', meta.get('status', ''))).upper()
            if local == 'FINISHED' or str(meta.get('status', '')).lower() == 'finished':
                continue
            if self._cloud_job_running(number, {}, issues, heads, cursor_meta=meta):
                running.add(number)
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
        if isinstance(readers, HostReaders) and getattr(readers, '_github_get', None) is None:
            readers._github_get = lambda path: gh.req('GET', '/repos/%s/%s' % (repo, path))
        self.started = clock()
        try:
            actor = gh.req('GET', '/user')
            require(isinstance(actor.get('id'), int) and actor.get('login'), 'authenticated host GH identity missing')
            self.actor = actor
            self.actors = frozenset({actor['login']})
            self.assessment = readers.page(ASSESSMENT)
            observation_path = getattr(readers, 'host_observation_path', None)
            self.observation = readers.host_observation() if observation_path else None
            self.section = current_section(self.assessment, self.started,
                                           observation=self.observation)
            slugs = set(SOURCE_RE.findall(self.section))
            require(slugs, 'current assessment has no canonical receipt source')
            self.pages = {slug: readers.page(slug) for slug in sorted(slugs)}
            if self.observation is not None:
                require(str(Path(readers.root).resolve()) ==
                        str(Path(self.observation['runtime_root']).resolve()),
                        'host observation runtime root mismatch')
                verify_assessment_observation(self.observation, self.assessment, self.pages,
                                                now=self.started)
        except EvidenceError:
            raise
        except ObservationError as exc:
            raise EvidenceError(str(exc)) from exc
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
            snapshot_at = self.clock()
            checked = self.clock()
            require(0 <= checked - self.started <= 60, 'complete canonical scan exceeded freshness window')
            require(abs(checked - now) <= 60, 'alarm clock disagrees with collector clock')
            n = item['number']
            owner = ownership(self.section, n)
            action = last_action(self.assessment, n, checked)
            head = (item.get('head') or {}).get('sha')
            require(not head or bool(HEAD_RE.fullmatch(head)), 'invalid current head SHA')
            if self.observation is not None and head:
                try:
                    verify_item_observation(self.observation, n, owner, head, checked)
                except ObservationError as exc:
                    raise EvidenceError(str(exc)) from exc
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
            if self.readers.handback_event_configured(n):
                event_path = self.readers.handback_event_path(n)
                require(event_path is not None, 'authenticated host handback event path missing')
                require(event_path.is_file(), 'authenticated host handback event file not found')
                try:
                    record = load_event(event_path)
                except EventError as exc:
                    raise EvidenceError(str(exc)) from exc
                require(record['item'] == n, 'host handback event item mismatch')
                bound_id = record['comment_id']
                bound = [c for c in comments if c.get('id') == bound_id]
                require(len(bound) == 1, 'event comment id missing from current snapshot')
                comment = bound[0]
                require(HOST_RE.search(comment.get('body') or ''),
                        'bound host handback comment lacks host review trigger')
                require(comment.get('user', {}).get('id') == self.actor['id']
                        and comment['user'].get('login') in self.actors, 'host receipt GH actor mismatch')
                self.readers.authenticate_handback_event(
                    event_path, n, head, comment, checked, observed_at=snapshot_at)
                handbacks.add(bound_id)
            else:
                for comment in comments:
                    if not HOST_RE.search(comment.get('body') or ''):
                        continue
                    require(comment.get('user', {}).get('id') == self.actor['id']
                            and comment['user'].get('login') in self.actors, 'host receipt GH actor mismatch')
                    url = comment.get('html_url')
                    sources = [page for page in self.pages.values() if url and url in page]
                    require(sources, 'host-review comment lacks canonical host receipt reference')
                    require(comment.get('created_at') == comment.get('updated_at'),
                            'edited host event requires new authenticated receipt')
                    require(any(comment['body'] == self.readers.receipt(page, n, head) for page in sources),
                            'host comment differs from authenticated scoped receipt bytes')
                    handbacks.add(comment['id'])
            authenticated_host_ids = set(handbacks)
            if handbacks:
                newest = max((c for c in comments if c.get('user', {}).get('login') in self.actors),
                             key=lambda c: (_time(c['created_at']), c['id']))
                if newest['id'] not in authenticated_host_ids:
                    require(self.readers.resolution_event_configured(n) is True,
                            'newer host comment needs authenticated resolution proof; generic retry refused')
                    resolution_path = self.readers.resolution_event_path(n)
                    require(resolution_path is not None, 'authenticated resolution event path missing')
                    require(resolution_path.is_file(), 'authenticated resolution event file not found')
                    try:
                        resolution = load_event(resolution_path)
                    except EventError as exc:
                        raise EvidenceError(str(exc)) from exc
                    require(resolution['resolve_comment_id'] == newest['id'],
                            'resolution event does not bind newest host comment')
                    bound_handback = resolution['handback_comment_id']
                    require(bound_handback in handbacks,
                            'resolution handback comment not authenticated')
                    self.readers.authenticate_resolution_event(
                        resolution_path, n, head, bound_handback, newest, checked,
                        observed_at=snapshot_at)
                    authenticated_host_ids.add(newest['id'])
                require(newest['id'] in authenticated_host_ids,
                        'newer host comment needs authenticated resolution proof; generic retry refused')
            handbacks = frozenset(authenticated_host_ids)
            acceptance_pending, acceptance_at = False, None
            if item.get('draft') and ACCEPT_RE.search(item.get('body') or ''):
                require(item.get('user', {}).get('login') in self.actors,
                        'draft acceptance author is not an authenticated host actor')
                if not self.readers.acceptance_event_configured(n):
                    raise EvidenceError(
                        'authenticated pending-acceptance event reader/schema not supplied for #%d' % n)
                acceptance_path = self.readers.acceptance_event_path(n)
                require(acceptance_path is not None, 'authenticated pending-acceptance event path missing')
                require(acceptance_path.is_file(), 'authenticated pending-acceptance event file not found')
                record = self.readers.authenticate_acceptance_event(
                    acceptance_path, item, head, checked, observed_at=snapshot_at)
                acceptance_pending = True
                acceptance_at = record['event_at']
            require(self.readers.page(ASSESSMENT) == self.assessment, 'shared assessment changed during collection')
            for slug, page in self.pages.items():
                require(self.readers.page(slug) == page, 'canonical host receipt changed during collection')
            require(0 <= self.clock() - self.started <= 60, 'complete host evidence collection exceeded freshness window')
            return Evidence(snapshot_key(item, comments), checked, ASSESSMENT + '@sha256:' +
                            hashlib.sha256(self.assessment.encode()).hexdigest(), owner, n, action,
                            guarded, running, frozenset(handbacks), acceptance_pending, acceptance_at)
        except EvidenceError:
            raise
        except Exception as exc:
            raise EvidenceError('canonical host evidence failed #%d: %s' % (item['number'], type(exc).__name__)) from exc

    def scan(self):
        return ReviewScan(self, self.actors, clock=self.clock)
