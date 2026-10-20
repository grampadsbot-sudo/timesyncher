"""HOST-HANDBACK-REVIEW: deterministic review routing, never a coder/Gate B action.

The host adapter must read current GH objects and canonical shared ownership/action,
review and process evidence. Missing evidence raises EvidenceError; a plan, label,
comment or local manifest is not process/guard evidence. This module has no I/O.
Authority: bot-admin/requests/eggbot-host-supervisor-gapratchet-549-562-20261020-0200
item 10(c). See host_handback_review.md for the deliberately uninstalled hook.
"""
from dataclasses import dataclass
import hashlib
import json
import re

REVIEW_S = 20 * 60
ACTION_S = 60 * 60
EVIDENCE_S = 60
BLOCKER_RE = re.compile(r"^\s*(?:blocked-by|waits-on)\s*:?\s*#(\d+)\s*$", re.I | re.M)
HOST_RE = re.compile(r"(?:^|[;\n])\s*host review required\s*[.!]?\s*(?:$|\n)", re.I)
ACCEPT_RE = re.compile(r"^\s*(?:paired real candidate/reference capture )?acceptance\s*:?\s+NOT RUN\s*[.!]?\s*$", re.I | re.M)


class EvidenceError(ValueError):
    pass


def snapshot_key(item, comments):
    """Bind canonical evidence to the exact current objects, not just a PR number."""
    raw = json.dumps([item, sorted(comments, key=lambda c: c['id'])], sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(raw.encode()).hexdigest()


@dataclass(frozen=True)
class Evidence:
    snapshot: str
    checked_at: float
    source: str
    owner: str
    action_item: int
    last_action_at: float | None
    guarded_craig: bool
    running_items: frozenset
    handback_ids: frozenset
    acceptance_pending: bool
    acceptance_at: float | None

    def __post_init__(self):
        if self.acceptance_pending and type(self.acceptance_at) not in (float, int):
            raise EvidenceError('canonical acceptance event time required')
        if type(self.guarded_craig) is not bool or type(self.acceptance_pending) is not bool:
            raise EvidenceError('review proof must be a verified boolean, not prose')
        for values in (self.running_items, self.handback_ids):
            if not isinstance(values, frozenset) or any(type(v) is not int or v <= 0 for v in values):
                raise EvidenceError('exact live item/receipt identities required')


@dataclass(frozen=True)
class Decision:
    state: str
    reason: str
    fingerprint: str = ''
    action_item: int = 0
    event: str = ''

    @property
    def handled(self):
        return self.state != 'UNRELATED'


def _time(value):
    from datetime import datetime
    try:
        t = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if t.tzinfo is None:
            raise ValueError('timezone required')
        return t.timestamp()
    except (AttributeError, TypeError, ValueError) as exc:
        raise EvidenceError('invalid source timestamp') from exc


def classify(item, comments, evidence, now, trusted_actors, sent):
    """Return a decision without mutating state. `sent` is persistent notification state.

    Trusted actors are exact GH logins from the host's canonical source policy, never
    extracted from prose. handback_ids must come from actual host completion records.
    All callback/read errors must stop the caller before generic stall remediation.
    """
    if not isinstance(evidence, Evidence) or not trusted_actors:
        raise EvidenceError('canonical evidence and exact source actors required')
    if evidence.snapshot != snapshot_key(item, comments):
        raise EvidenceError('evidence does not match current objects')
    if not 0 <= now - evidence.checked_at <= EVIDENCE_S:
        raise EvidenceError('canonical evidence stale or future')
    if not evidence.source or not evidence.owner or evidence.action_item <= 0:
        raise EvidenceError('canonical ownership/action record missing')
    n = item['number']



    if evidence.action_item != n:
        raise EvidenceError('action ownership is not explicit')
    if item.get('state') != 'open':
        return Decision('UNRELATED', 'not open')
    labels = {l['name'] for l in item.get('labels', [])}
    if 'needs-craig' in labels and evidence.guarded_craig:
        return Decision('WAIT', 'guarded Craig review on current head')

    trusted = [c for c in comments if c.get('user', {}).get('login') in trusted_actors]
    newest = max(trusted, key=lambda c: (_time(c['created_at']), c['id']), default=None)


    event = None
    if (newest and newest['id'] in evidence.handback_ids
            and HOST_RE.search(newest.get('body') or '')):
        event = ('host-review', str(newest['id']), _time(newest['created_at']))
    elif (item.get('draft') is True and evidence.acceptance_pending
          and item.get('user', {}).get('login') in trusted_actors
          and ACCEPT_RE.search(item.get('body') or '')):
        event = ('host-acceptance', item['head']['sha'], evidence.acceptance_at)


    texts = [item.get('body') or '' if item.get('user', {}).get('login') in trusted_actors else '',
             newest.get('body') or '' if newest else '']
    blockers = {int(x) for text in texts for x in BLOCKER_RE.findall(text)}
    if n in evidence.running_items or blockers & evidence.running_items:
        return Decision('OWNED', 'verified running job on item or explicit prerequisite')
    if event is None:
        return Decision('UNRELATED', 'no current authenticated host review event')
    if any(l in {'hold', 'parked', 'status:parked', 'do-not-merge'}
           or l.startswith(('hold:', 'parked:')) for l in labels):
        return Decision('WAIT', 'existing hold or parked guard')
    kind, source_id, at = event
    if at > now:
        raise EvidenceError('host event timestamp is in the future')
    identity = [n, (item.get('head') or {}).get('sha'), kind, source_id]
    fp = hashlib.sha256(json.dumps(identity).encode()).hexdigest()
    if now - at < REVIEW_S:
        return Decision('OWNED', 'fresh handback (under 20 minutes)', fp, evidence.action_item, kind)
    if evidence.last_action_at is not None:
        if evidence.last_action_at > now:
            raise EvidenceError('management action timestamp is in the future')
        if now - evidence.last_action_at < ACTION_S:
            return Decision('WAIT', 'shared rolling-hour management budget', fp, evidence.action_item, kind)
    if fp in sent:
        return Decision('WAIT', 'duplicate host review fingerprint', fp, evidence.action_item, kind)
    return Decision('DUE', 'host reviewer action due', fp, evidence.action_item, kind)


def route(item, decision, sent, ring, *, dry=False):
    """Offer one deduplicated action request to existing bell_gate, managing dr first.

    Caller holds its existing state lock through classify/route/persist. ring is the
    existing bell_gate.ring, injected so tests/dry classification never contact it.
    This is notification only: reviewer must claim the shared action budget before
    acceptance/review. No guard, action record, lane, CI or Gate B state is modified.
    """
    if decision.state != 'DUE':
        return decision.state
    if decision.fingerprint in sent:
        return 'duplicate'
    if dry:
        return 'dry'
    ref = item.get('html_url')
    if not ref:
        raise EvidenceError('checkable item URL missing')
    msg = ('HOST-HANDBACK-REVIEW: %s %s; %s. Active managing dr/host reviewer: '
           'claim shared action #%d, review the receipt or run pending host acceptance '
           'and post the verdict. Preserve all guards and the action-hour budget.'
           % (ref, (item.get('head') or {}).get('sha', ''), decision.event, decision.action_item))
    result = ring('host-handback-review', msg, 'stuck_stall', meta={
        'item_key': 'host-review:%d' % decision.action_item,
        'item_state': decision.fingerprint})


    if result in ('ok', 'bundled'):
        sent[decision.fingerprint] = {'item': item['number'], 'source': ref}
    return result


class ReviewScan:
    """One alarm pass, under the host's existing serialized state ownership.

    read_evidence(item, comments, now) must use the canonical shared records and
    actual process/receipt proofs, returning Evidence or raising EvidenceError.
    Scan first, notify only after *all* objects/evidence were read successfully.
    """
    def __init__(self, read_evidence, trusted_actors):
        self.read_evidence = read_evidence
        self.trusted_actors = frozenset(trusted_actors)
        self.pending = []
        self.failed = False

    def consider(self, item, comments, now, sent):
        try:
            ev = self.read_evidence(item, comments, now)
            decision = classify(item, comments, ev, now, self.trusted_actors, sent)
        except EvidenceError:
            self.failed = True
            raise
        except Exception as exc:
            self.failed = True
            raise EvidenceError('canonical evidence reader failed: ' + type(exc).__name__) from exc
        if decision.state == 'DUE':
            self.pending.append((item, decision))
        return decision

    def flush(self, sent, ring, *, dry=False):
        if self.failed:
            raise EvidenceError('incomplete canonical scan; notification refused')
        return [route(item, decision, sent, ring, dry=dry)
                for item, decision in self.pending]
