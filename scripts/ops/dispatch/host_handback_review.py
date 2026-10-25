import datetime as dt
import hashlib
import re

HOST_LOGINS = frozenset({'grampadsbot-sudo'})
REVIEW_S = 20 * 60
BUDGET_S = 60 * 60
REVIEW_RE = re.compile(r'(?<![\w-])(?<!no )(?<!not )host review required\b', re.I)
ACCEPT_RE = re.compile(r'\bacceptance\b[^\n]{0,40}?\bNOT RUN\b', re.I)
RESOLVED_RE = re.compile(r'\breview(?:ed| verdict)\s*[:=]|\bacceptance\s*[:=]\s*(?:PASS|FAIL|completed)\b', re.I)


def _host(obj):
    return ((obj.get('user') or {}).get('login')) in HOST_LOGINS


def _timestamp(value):
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.timestamp() if parsed.tzinfo else None
    except (AttributeError, TypeError, ValueError, OverflowError):
        return None


def handback_event(item, comments):
    if item.get('state', 'open') != 'open':
        return None
    host = [c for c in comments if _host(c)]
    newest = max(host, key=lambda c: (c.get('created_at') or '', c.get('id') or 0), default=None)
    if newest and REVIEW_RE.search(newest.get('body') or ''):
        return dict(kind='host-review', source='comment %s' % newest.get('id'),
                    at=_timestamp(newest.get('updated_at') or newest.get('created_at')),
                    url=newest.get('html_url') or item.get('html_url') or '')
    if newest and RESOLVED_RE.search(newest.get('body') or ''):
        return None
    if item.get('draft') is True and _host(item) and ACCEPT_RE.search(item.get('body') or ''):
        body_hash = hashlib.sha256(item['body'].encode()).hexdigest()[:16]
        return dict(kind='host-acceptance', source='draft body %s' % body_hash,
                    at=_timestamp(item.get('updated_at')),
                    url=item.get('html_url') or '')
    return None


def fingerprint(n, head, event):
    raw = '%d|%s|%s|%s' % (n, head, event['kind'], event['source'])
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def route(n, event, head, labels, running, last, now, ring, dry=False):
    if any(l == 'needs-craig' or l == 'hold' or l.startswith(('hold:', 'parked'))
           or l in {'status:parked', 'do-not-merge'} for l in labels):
        return 'host handback held; no acceptance action or retry', None
    at = event.get('at')
    if at is None or at > now:
        return 'host handback timestamp missing or future; no retry', None
    if now - at < REVIEW_S:
        return 'host handback owned for 20 minutes; acceptance not overdue', None
    if running:
        return 'host handback owned by a live lane process; no retry', None
    fp = fingerprint(n, head, event)
    if last and last.get('fp') == fp:
        return 'host acceptance already routed; no repeat or retry', None
    if last and now - last['at'] < BUDGET_S:
        return 'hourly action budget; acceptance waits without coder/Gate B retry', None
    msg = ('HOST-HANDBACK-REVIEW #%d %s head %s: %s (%s) overdue 20+ min. '
           'Managing dr: run host acceptance or review the handback receipt and post the verdict. '
           'Preserve holds and hourly action budget. No app/coder/Gate B retry.'
           % (n, event['url'], head or '-', event['kind'], event['source']))
    if dry:
        return 'DRY would route to managing dr: ' + msg, None
    try:
        rc = ring('stall-alarm', msg, 'stuck_stall',
                  meta={'item_key': 'host-review:%d' % n, 'item_state': fp})
    except Exception as ex:
        return 'host acceptance relay failed (%s); no fallback retry' % type(ex).__name__, None
    if rc not in {'ok', 'bundled', 'wait'}:
        return 'host acceptance relay not accepted (%s); no fallback retry' % rc, None
    return 'host acceptance routed to managing dr via bell_gate (%s)' % rc, dict(at=now, fp=fp, rc=rc)
