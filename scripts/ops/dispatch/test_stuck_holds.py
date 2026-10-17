"""Behavioral regressions for chief-dr rulings 85+89; no network or notifications."""
import copy
import unittest
from unittest.mock import patch
import tsv_stuck_check as w

NOW = w.iso('2026-10-16T20:00:00Z')
OLD = '2026-10-16T17:00:00Z'
POST = '2026-10-16T18:00:00Z'
NEW = '2026-10-16T19:30:00Z'
SLUG = 'bot-admin/requests/example-request'

class FakeGH:
    def __init__(self, body='', comments=None):
        self.item = dict(created_at=OLD, updated_at=POST, body=body, labels=[], state='open')
        self.comments = comments or []
        self.events = []
        self.blocker = 'open'
    def req(self, method, path):
        if '/issues/10' == path[path.index('/issues/'):]: return self.item
        if path.endswith('/issues/20'):
            if self.blocker == 'error': raise OSError('lookup failed')
            return {'state': self.blocker}
        return {'check_runs': []}
    def pages(self, path):
        return self.comments if path.endswith('/comments') else self.events

def comment(body, at=POST): return {'body': body, 'created_at': at}
def request(status='open', deadline='2026-10-16T21:00:00Z'):
    return "---\ntype: request\nstatus: %s\nexpect_reply_by: '%s'\n---\n" % (status, deadline)

class Holds(unittest.TestCase):
    def setUp(self): w.REQUESTS.clear()
    def hold(self, gh, **kw): return w.hold_status(gh, 10, NOW, **kw)
    def test_real_waits_on_comment_forms(self):
        cases = [
            ('dr eggbot\nwaits-on: '+SLUG, 'HELD on '+SLUG),
            ('dr eggbot: parked. Waits on: the consolidated repair at `'+SLUG+'`.', 'HELD on '+SLUG),
            ('dr eggbot: waits-on: #20 (and `'+SLUG+'`).', 'HELD on #20'),
            ('dr eggbot\nwaits-on: `'+SLUG+'`', 'HELD on '+SLUG),
            ('dr eggbot: no waits marker; see #20 and '+SLUG, None),
        ]
        for body, expected in cases:
            with self.subTest(body=body), patch.object(w, 'read_page', return_value=request()):
                self.assertEqual(self.hold(FakeGH(comments=[comment(body)])), expected)
    def test_extract_all_blockers_without_incidental_later_sentence(self):
        body = 'Past #99. WAITs ON: #20, #30 (and `'+SLUG+'`). History #40.'
        self.assertEqual(w.named_refs(body, 30), ([20], [SLUG]))
        self.assertEqual(w.named_refs('blocked-by: #20 and #30', 10), ([20,30], []))
        self.assertEqual(w.named_refs('waits on: https://gbrain.example/bot-admin/requests/example-request',10), ([],[SLUG]))
    def test_closed_first_ref_does_not_mask_open_request(self):
        gh=FakeGH(comments=[comment('dr eggbot: blocked-by: #20 and `'+SLUG+'`')])
        gh.blocker='closed'
        with patch.object(w, 'read_page', return_value=request()):
            self.assertEqual(self.hold(gh), 'HELD on '+SLUG)
    def test_explicit_chief_hold_post_prefixes(self):
        for prefix in ['Ruling 95 keeps this draft held as a reference only.',
                       'Ruling 94 administrative hold.',
                       'hold restamp (dr eggbot, chief dr, 7:10 PM PT):',
                       'Chief dr hold:']:
            with self.subTest(prefix=prefix), patch.object(w, 'read_page', return_value=request()):
                self.assertEqual(self.hold(FakeGH(comments=[comment(prefix+'\nwaits-on: '+SLUG)])), 'HELD on '+SLUG)
    def test_open_and_closed_issue_blocker(self):
        gh=FakeGH(comments=[comment('managing dr\nblocked-by #20')])
        self.assertEqual(self.hold(gh), 'HELD on #20')
        gh.blocker='closed'; self.assertIsNone(self.hold(gh))
    def test_unknown_issue_fails_open(self):
        gh=FakeGH('blocked-by #20'); gh.blocker='error'
        self.assertIsNone(self.hold(gh))
    def test_incidental_issue_mention_does_not_hold(self):
        self.assertIsNone(self.hold(FakeGH(comments=[comment('dr eggbot: see #20 for history')])) )
    def test_body_and_latest_dr_comment_equivalent(self):
        for gh in [FakeGH('blocked-by #20'), FakeGH(comments=[comment('dr eggbot\nblocked-by #20')])]:
            self.assertEqual(self.hold(gh), 'HELD on #20')
    def test_latest_dr_only_and_non_dr_does_not_override(self):
        gh=FakeGH(comments=[comment('dr eggbot\nblocked-by #20', OLD),comment('managing dr: proceed', POST)])
        self.assertIsNone(self.hold(gh))
        gh.comments=[comment('dr eggbot\nblocked-by #20'),comment('user: hello',NEW)]
        self.assertEqual(self.hold(gh),'HELD on #20')
    def test_diagnosis_update_is_dr(self):
        self.assertEqual(self.hold(FakeGH(comments=[comment('Diagnosis update\nblocked-by #20')])), 'HELD on #20')
    def test_requests_body_and_comment_no_hold_label_needed(self):
        for gh in [FakeGH('waits-on: '+SLUG), FakeGH(comments=[comment('managing dr\nwaits-on: '+SLUG)])]:
            with patch.object(w,'read_page',return_value=request()):
                self.assertEqual(self.hold(gh),'HELD on '+SLUG)
    def test_closed_past_deadline_unknown_or_missing_deadline_not_held(self):
        for text in [request('done'),request(deadline=NEW),request('unknown'),'---\nstatus: open\n---\n']:
            w.REQUESTS.clear()
            with patch.object(w,'read_page',return_value=text):
                self.assertIsNone(self.hold(FakeGH('waits-on: '+SLUG)))
        with patch.object(w,'read_page',side_effect=OSError):
            self.assertIsNone(self.hold(FakeGH('waits-on: '+SLUG)))
    def test_creation_grace_boundary(self):
        gh=FakeGH();gh.item['created_at']=NEW
        self.assertIn('GRACE',self.hold(gh))
        gh.item['created_at']='2026-10-16T19:00:00Z'
        self.assertIsNone(self.hold(gh))
    def test_executable_brief_grace_but_plain_dr_post_not_grace(self):
        gh=FakeGH(comments=[comment('managing dr\nScope: fix icon. Report tests.',NEW)])
        self.assertIn('GRACE',self.hold(gh))
        gh.comments=[comment('managing dr: investigating',NEW)]
        self.assertIsNone(self.hold(gh))
    def test_claim_with_body_brief_grace(self):
        gh=FakeGH('Scope: fix icon. Report tests.')
        gh.events=[{'event':'assigned','created_at':NEW}]
        self.assertIn('GRACE',self.hold(gh))
        gh.item['body']='no executable brief';self.assertIsNone(self.hold(gh))
    def test_head_and_label_change_release_dr_hold_but_ci_does_not(self):
        gh=FakeGH(comments=[comment('dr eggbot\nblocked-by #20')])
        self.assertIsNone(self.hold(gh,head_since=w.iso(NEW)))
        gh.events=[{'event':'labeled','created_at':NEW}]
        self.assertIsNone(self.hold(gh))
        gh.events=[{'event':'commented','created_at':NEW}]
        self.assertEqual(self.hold(gh),'HELD on #20')
    def test_body_hold_head_and_label_change_persistently_invalidates(self):
        for field in ['head','labels']:
            gh=FakeGH('blocked-by #20');memory={}
            self.assertEqual(self.hold(gh,sha='a',memory=memory),'HELD on #20')
            if field=='labels': gh.item['labels']=[{'name':'hold:new'}]
            self.assertIsNone(self.hold(gh,sha='b' if field=='head' else 'a',memory=memory))
            self.assertIsNone(self.hold(gh,sha='b' if field=='head' else 'a',memory=memory))
    def test_ladder_preserves_active_worker_and_two_ring_escalation(self):
        self.assertEqual(w.ladder_action(True,False,9),('quiet',9,False))
        self.assertEqual(w.ladder_action(False,True,1),('agent',1,False))
        self.assertEqual(w.ladder_action(False,False,1),('ring',2,True))

class Cycle(unittest.TestCase):
    def run_cycle(self, held=None, escalate=False, lookup_error=False, draft=None):
        info={f'is{n}':dict(kind='issue',age=8000,why='hold',last='old',labels='hold:test',sha='-') for n in [10,11]}
        if draft is not None:
            for item in info.values(): item.update(kind='PR', draft=draft, labels='')
        state={'items':{f'is{n}':{'first':0,'last_ring':1,'stall':1 if escalate else 0} for n in [10,11]}}
        with patch.dict(w.INFO,info,clear=True), patch.object(w,'GH'), patch.object(w,'find',return_value=[('is10',10,''),('is11',11,'')]), patch.object(w,'load_json',return_value=state), patch.object(w,'answer_state',return_value=(0,0,False)), patch.object(w,'hold_status',return_value=held,side_effect=OSError if lookup_error else None), patch.object(w,'score_miss'), patch.object(w,'ring_claude',return_value='dry') as managing, patch.object(w,'ring_grok',return_value='dry') as chief, patch.object(w,'ring_openclaw') as oc, patch.object(w,'tell_craig'), patch.object(w,'logline'), patch.object(w.sys,'argv',['watcher','--dry-run']), patch('builtins.print'):
            w.main()
        return managing,chief,oc
    def test_unlabelled_draft_is_parked_but_nondraft_still_rings(self):
        for bell in self.run_cycle(draft=True): bell.assert_not_called()
        self.assertTrue(all(item.get('parked_job') for item in w.INFO.values()))
        managing,chief,_=self.run_cycle(draft=False)
        managing.assert_called_once();chief.assert_not_called()

    def test_one_bundle_all_due(self):
        managing,chief,_=self.run_cycle()
        managing.assert_called_once();chief.assert_not_called()
        self.assertIn('#10',managing.call_args.args[0]);self.assertIn('#11',managing.call_args.args[0])
    def test_one_bundle_when_escalating(self):
        managing,chief,_=self.run_cycle(escalate=True)
        managing.assert_not_called();chief.assert_called_once()
        self.assertIn('#10',chief.call_args.args[0]);self.assertIn('#11',chief.call_args.args[0])
    def test_held_and_grace_no_action_or_escalation(self):
        for held in ['HELD on #20','GRACE created <60m']:
            for bell in self.run_cycle(held=held): bell.assert_not_called()
    def test_unknown_lookup_rings(self):
        managing,chief,_=self.run_cycle(lookup_error=True)
        managing.assert_called_once();chief.assert_not_called()

if __name__=='__main__':unittest.main()
