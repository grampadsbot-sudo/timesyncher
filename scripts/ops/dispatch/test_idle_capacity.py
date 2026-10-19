"""Hermetic capacity, dispatch, hold, and no-write regressions."""
import copy
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests"))
import dispatch_root
dispatch_root.insert_path()

import idle_capacity as c
import tsv_stuck_check as w

NOW = c.stamp('2026-10-18T03:00:00Z')
OLD = c.utc(NOW - 3600)
SLUG = 'bot-admin/requests/piece-469'
INBOX = 'bot-admin/inbox/time-syncher/piece-469'


def item(n, body='', labels=(), state='open', vk=True):
    labs = list(labels)
    if vk and 'project:tsv' not in labs:
        labs = ['project:tsv'] + labs
    return dict(number=n, body=body, labels=[{'name': x} for x in labs],
                created_at=OLD, updated_at=OLD, state=state)


class GH:
    def __init__(self, items, comments=None):
        self.items = {i['number']: i for i in items}
        self.comments = comments or {}
        self.writes = []
    def pages(self, path):
        if path.endswith('/comments'):
            return self.comments.get(int(path.split('/')[-2]), [])
        if '/pulls?' in path:
            return [i for i in self.items.values() if i['state'] == 'open' and i.get('pull_request')]
        if 'labels=project:tsv' in path:
            return [i for i in self.items.values() if i['state'] == 'open' and any(l['name'] == 'project:tsv' for l in i.get('labels', []))]
        return [i for i in self.items.values() if i['state'] == 'open']
    def req(self, method, path, data=None):
        if method != 'GET':
            self.writes.append((method, path, data)); return {}
        return self.items[int(path.rsplit('/', 1)[-1])]


class Brain:
    def __init__(self, pages=None): self.pages = pages or {}
    def discover(self, n): pass
    def get(self, slug): return self.pages[slug]


def meters(used=100):
    return {name: c.normalize(dict(pct_used=min(used, stop), as_of=c.utc(NOW), reset='tomorrow'), NOW, stop)
            for name, stop in c.LANES.items()}


def dr(body, at=OLD):
    return dict(body=body, created_at=at, user={'login': 'grokbot'})


class Capacity(unittest.TestCase):
    def setUp(self):
        self.bell = Mock(return_value='ok')
        self.put = patch.object(c, 'publish_meters').start()
        self.score = patch.object(c, 'record_miss', return_value=-2).start()
        self.addCleanup(patch.stopall)
    def cycle(self, gh, readings=None, state=None, dry=False, workers=None, brain=None, now=NOW):
        return c.cycle(gh, {} if state is None else state, now, dry, self.bell,
                       meters=meters() if readings is None else readings,
                       workers=[] if workers is None else workers,
                       brain=Brain() if brain is None else brain, stops=['/fake/CURSOR_STOP'])
    def available(self):
        readings = meters()
        readings['claude'] = c.normalize(dict(pct_used=29, as_of=c.utc(NOW)), NOW, 100)
        readings['codex'] = c.normalize(dict(pct_used=0, as_of=c.utc(NOW)), NOW, 90)
        return readings
    def test_a_first_occurrence_direct_to_eggbot_and_score_rescope(self):
        gh = GH([item(n) for n in [400,469,470,471]], {400:[dr('dr eggbot: rescoped into #469, #470, #471')]})
        result = self.cycle(gh, self.available(), workers=[dict(kind='process', text='codex issue-400')])
        self.bell.assert_called_once()
        text = self.bell.call_args.args[0]
        for value in ['dr eggbot', '#469', '#470', '#471', 'claude 29.0%', 'codex 0.0%', 'CURSOR_STOP']:
            self.assertIn(value, text)
        self.assertEqual(len(result['misses']), 3)
        self.assertEqual(self.score.call_count, 3)
        self.assertTrue(all(call.args[0] == 'dr-eggbot' for call in self.score.call_args_list))
    def test_b_all_hard_stops_no_alarm(self):
        self.cycle(GH([item(469)]))
        self.bell.assert_not_called()
    def test_c_stale_cursor_never_silences_alarm(self):
        readings = meters()
        readings['cursor_models'] = c.normalize(dict(pct_used=100, as_of=c.utc(NOW - c.FRESH - 1)), NOW, 100)
        self.cycle(GH([item(469)]), readings)
        self.assertIn('meter stale', self.bell.call_args.args[0])
    def test_d_merged_blocker_plans_label_removal_in_dry_run(self):
        gh = GH([item(469, 'blocked-by #470', ['hold:test']), item(470, state='closed')])
        result = self.cycle(gh, self.available(), dry=True)
        self.assertEqual(result['removals'][0][:2], (469, ['hold:test']))
        self.assertIn('would remove #469', ' '.join(result['notes']))
        self.assertEqual(gh.writes, [])
        self.bell.assert_not_called(); self.put.assert_not_called(); self.score.assert_not_called()
    def test_g_history_blockers_do_not_clear_dr_diagnosis_waits_on(self):
        body = ('conflicting after blockers #318-#322 and quality gate #323 merged\n'
                'waits-on: pending dr ruling 116\n'
                'bot-admin/requests/eggbot-vk-336-rebuild-a-20261017-2115')
        gh = GH([item(335, body, ['hold:dr-diagnosis']),
                 item(318, state='closed'), item(322, state='closed'), item(323, state='closed')])
        result = self.cycle(gh, self.available(), dry=True)
        self.assertEqual(result['removals'], [])
        self.assertNotIn(335, {n for n, _, _ in result['removals']})
        self.assertEqual(gh.writes, [])
        self.bell.assert_not_called()
    def test_h_explicit_blocked_by_merged_still_plans_removal(self):
        gh = GH([item(335, 'blocked-by #318\nwaits-on: pending dr ruling', ['hold:dr-diagnosis']),
                 item(318, state='closed')])
        result = self.cycle(gh, self.available(), dry=True)
        self.assertEqual(result['removals'][0][:2], (335, ['hold:dr-diagnosis']))
    def test_e_waits_on_running_request_quiet(self):
        gh = GH([item(469, 'waits-on: '+SLUG+'\nDependency: needs the output of #470', ['hold:worker']), item(470)])
        brain = Brain({SLUG: 'Scope: #470. Acceptance: tests.'})
        result = self.cycle(gh, self.available(), brain=brain, workers=[dict(kind='heartbeat', item=470)])
        self.assertEqual(result['idle'], {})
        self.bell.assert_not_called()
    def test_f_bare_hold_unresolved(self):
        result = self.cycle(GH([item(469, 'HELD', ['needs-dr-eggbot'])]), self.available())
        self.assertIn('UNRESOLVED', result['idle'][469])
        self.bell.assert_called_once()
    def test_rering_at_30m_not_every_run_and_retry_transport_failure(self):
        state = {}; gh = GH([item(469)])
        self.cycle(gh, self.available(), state=state)
        self.cycle(gh, self.available(), state=state, now=NOW+600)
        self.assertEqual(self.bell.call_count, 1)
        self.cycle(gh, self.available(), state=state, now=NOW+1800)
        self.assertEqual(self.bell.call_count, 2)
        self.bell.return_value = 'rc1'
        self.cycle(gh, self.available(), state=state, now=NOW+3600)
        self.assertEqual(state['idle_ring_at'], NOW+1800)
    def test_recovery_resets_first_ring(self):
        state = {}; gh = GH([item(469)])
        self.cycle(gh, self.available(), state=state)
        self.cycle(gh, state=state)
        self.cycle(gh, self.available(), state=state, now=NOW+600)
        self.assertEqual(self.bell.call_count, 2)
    def test_creation_brief_and_started_comment_are_not_evidence(self):
        fresh = item(469, 'Scope: fix icon. Test it.')
        fresh['created_at'] = c.utc(NOW-1)
        result = self.cycle(GH([fresh], {469:[dr('started codex job', c.utc(NOW-1))]}), self.available())
        self.assertIn(469, result['idle'])
    def test_open_blocker_itself_alarms(self):
        result = self.cycle(GH([item(469, 'blocked-by #470\nDependency: shared files foo.py'), item(470)]), self.available())
        self.assertNotIn(469, result['idle']); self.assertIn(470, result['idle'])
    def test_serialization_without_dependency_is_idle_even_when_blocker_runs(self):
        result = self.cycle(GH([item(469, 'blocked-by #470'), item(470)]), self.available(), workers=[dict(kind='cursor', item=470)])
        self.assertIn('written dependency', result['idle'][469])
    def test_pending_decision_needs_what_and_who(self):
        self.cycle(GH([item(469, 'Pending decision: choose design\nWho decides: dr eggbot')]), self.available())
        self.bell.assert_not_called()
        self.cycle(GH([item(469, 'HELD: waiting for Craig to decide which design to ship')]), self.available())
        self.bell.assert_not_called()
        self.cycle(GH([item(469, 'Pending decision: choose design')]), self.available())
        self.bell.assert_called_once()
    def test_pending_decision_in_latest_dr_post_is_not_a_recorded_decision(self):
        gh=GH([item(469, labels=['hold:design'])],
              {469:[dr('managing dr\nPending decision: design A or B\nWho decides: Craig')]})
        result=self.cycle(gh,self.available())
        self.assertEqual(result['removals'],[])
        self.assertEqual(result['idle'],{})
        self.bell.assert_not_called()
    def test_recorded_decision_clears_only_hold_labels_and_one_comment(self):
        gh = GH([item(469, 'Pending decision: choose design\nDecider: dr eggbot', ['hold:design', 'status:stuck', 'project:tsv'])],
                {469:[dr('dr eggbot\nDecision recorded: design A')]})
        self.cycle(gh, self.available())
        self.assertEqual([method for method, _, _ in gh.writes], ['DELETE', 'DELETE', 'POST'])
        self.assertTrue(gh.writes[0][1].endswith('hold%3Adesign'))
        self.assertNotIn('project%3Atsv', str(gh.writes))
        self.assertNotIn('\n', gh.writes[-1][2]['body'])
    def test_rescoped_blocker_covered_only_while_piece_job_runs(self):
        gh=GH([item(469, 'blocked-by #470\nDependency: needs the output of #471', ['hold:files']), item(470, state='closed'), item(471)],
              {470:[dr('dr eggbot: rescoped into #471')]})
        brain=Brain({SLUG:'Scope: #471', INBOX:'Action: dispatch '+SLUG})
        result=self.cycle(gh,self.available(),brain=brain,workers=[dict(kind='cursor',item=471)])
        self.assertNotIn(469,result['idle'])
        self.assertEqual(result['removals'],[])
        result=self.cycle(gh,self.available(),brain=brain)
        self.assertIn(469,result['idle'])
    def test_completed_rescope_pieces_allow_closed_blocker_hold_cleanup(self):
        gh=GH([item(469,'blocked-by #470',['hold:files']),item(470,state='closed'),item(471,state='closed')],
              {470:[dr('dr eggbot: rescoped into #471')]})
        result=self.cycle(gh,dry=True)
        self.assertEqual(result['removals'][0][:2],(469,['hold:files']))
    def test_hold_cleanup_failure_does_not_silence_idle_ring(self):
        gh=GH([item(469,'blocked-by #470',['hold:files']),item(470,state='closed')])
        original=gh.req
        def req(method,path,data=None):
            if method!='GET': raise OSError('fake write denied')
            return original(method,path,data)
        gh.req=req
        result=self.cycle(gh,self.available())
        self.bell.assert_called_once()
        self.assertIn('hold cleanup write failed #469',result['notes'])
    def test_closed_parent_ruling_discovered_from_child_body(self):
        parent=item(400,state='closed'); child=item(469,'Rescoped from #400')
        gh=GH([parent,child],{400:[dr('dr eggbot: rescoped into #469')]})
        result=self.cycle(gh)
        self.assertIn(469,result['idle'])
        self.assertNotIn(400,result['idle'])
        self.assertEqual(result['misses'][0][:3],('dr-eggbot',469,400))
    def test_bare_dependency_field_does_not_justify_serialization(self):
        self.assertFalse(c.dependency('waits-on: #470\nDependency: #470'))
    def test_multiple_blockers_one_open_prevents_clear(self):
        gh=GH([item(469, 'blocked-by #470 and #471\nDependency: shared files foo.py', ['hold:files']), item(470, state='closed'), item(471)])
        result=self.cycle(gh)
        self.assertEqual(result['removals'], [])
        self.assertNotIn(469, result['idle'])
    def test_rescope_grace_dispatch_and_miss_dedup(self):
        gh=GH([item(400), item(469)], {400:[dr('managing dr: rescoped into #469', c.utc(NOW-899))]})
        state={}
        result=self.cycle(gh, state=state)
        self.assertEqual(result['misses'], [])
        self.cycle(gh, state=state, now=NOW+1)
        self.cycle(gh, state=state, now=NOW+601)
        self.score.assert_called_once()
        self.assertEqual(self.score.call_args.args[0], 'claude-code')
    def test_request_plus_inbox_action_prevents_rescope_miss_but_not_idle_alarm(self):
        gh=GH([item(400), item(469)], {400:[dr('dr eggbot: split into #469')]})
        brain=Brain({SLUG:'Scope: #469. Test output.', INBOX:'Action: dispatch '+SLUG})
        result=self.cycle(gh, self.available(), brain=brain)
        self.assertEqual(result['misses'], [])
        self.assertIn(469, result['idle'])
    def test_dr_author_rescope_comment_needs_no_body_signature(self):
        gh=GH([item(400),item(469)],{400:[dr('Rescoped into #469')]})
        result=self.cycle(gh)
        self.assertEqual(result['misses'][0][:3],('dr-eggbot',469,400))
    def test_request_alone_is_not_dispatch(self):
        self.assertFalse(c.dispatch(469, item(469), Brain({SLUG:'Scope: #469'}), []))
    def test_ready_brief_requires_launcher_pickup(self):
        i=item(469, labels=['status:ready'])
        self.assertFalse(c.dispatch(469, i, Brain({SLUG:'Scope: #469'}), []))
        self.assertTrue(c.dispatch(469, i, Brain({SLUG:'Scope: #469\nlauncher-pickup: unit-469'}), []))
    def test_dry_run_does_not_mutate_state_or_call_any_writer(self):
        gh=GH([item(400), item(469, 'blocked-by #470', ['hold:files']), item(470, state='closed')],
              {400:[dr('dr eggbot: rescoping into #469')]})
        state={'rescope_misses':{}, 'idle_ring_at': NOW-3600}; before=copy.deepcopy(state)
        with patch('builtins.print') as output:
            self.cycle(gh, self.available(), state=state, dry=True)
        self.assertEqual(state, before); self.assertEqual(gh.writes, [])
        self.bell.assert_not_called(); self.put.assert_not_called(); self.score.assert_not_called()
        text=' '.join(str(a) for a in output.call_args_list)
        self.assertIn('DRY PLAN meters', text)
        self.assertIn('DRY would remove #469', text)
    def test_non_vk_pr_stale_hold_gets_no_github_writes(self):
        pr=item(500,'blocked-by #470',['hold:stale'],vk=False)
        pr['pull_request']={}
        gh=GH([pr, item(470, state='closed')])
        result=self.cycle(gh, self.available(), dry=True)
        self.assertEqual(gh.writes, [])
        self.assertNotIn(500, result.get('idle', {}))


class Readers(unittest.TestCase):
    def test_exact_thresholds_not_50_percent(self):
        for lane, stop in c.LANES.items():
            for pct, expected in [(0,True),(stop-0.01,True),(stop,False)]:
                self.assertEqual(c.normalize(dict(pct_used=pct, as_of=c.utc(NOW)), NOW, stop)['available'], expected)
    def test_all_windows_and_unknown_future_nan_fail_open(self):
        reading=dict(windows=[dict(pct_used=10), dict(pct_used=90)], as_of=c.utc(NOW))
        self.assertFalse(c.normalize(reading,NOW,90)['available'])
        for raw in [{},dict(pct_used=float('nan'),as_of=c.utc(NOW)),dict(pct_used=100,as_of=c.utc(NOW+1))]:
            self.assertTrue(c.normalize(raw,NOW,100)['stale'])
    def test_cursor_local_feed_has_source_time_and_no_claude_model_invocation(self):
        with tempfile.TemporaryDirectory() as root:
            os.mkdir(root+'/meters')
            with open(root+'/meters/cursor.json','w') as out:
                json.dump(dict(cursor_models_pct=55,other_models_pct=41,as_of=c.utc(NOW)),out)
            with patch.dict(os.environ,{},clear=True), patch.object(c,'run',return_value=json.dumps({'primary':{'usedPercent':89,'resetsAt':NOW+3600}})) as run:
                readings=c.read_meters(NOW,root,reader=lambda _: '{}')
            self.assertEqual(readings['cursor_models']['pct_used'],55)
            self.assertEqual(readings['other_models']['pct_used'],41)
            self.assertFalse(readings['cursor_models']['stale'])
            self.assertEqual(readings['codex']['pct_used'],89)
            self.assertEqual(run.call_count,1)
            self.assertTrue(readings['claude']['stale'])
    def test_stale_missing_cursor_and_unreadable_codex_are_available(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{},clear=True), patch.object(c,'run',side_effect=OSError):
            result=c.read_meters(NOW,root,reader=lambda _: '{}')
            self.assertTrue(all(m['stale'] and m['available'] for m in result.values()))
    def test_combined_feed_roundtrip_never_rejuvenates_stale_readings(self):
        readings=meters()
        source='```json\n'+json.dumps({'lanes':readings})+'\n```'
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{},clear=True), patch.object(c,'run',side_effect=OSError):
            result=c.read_meters(NOW+c.FRESH+1,root,reader=lambda _:source)
        self.assertTrue(all(m['stale'] and m['available'] for m in result.values()))
    def test_tsv_lane_meter_cmd_env_has_no_effect(self):
        with tempfile.TemporaryDirectory() as root:
            os.mkdir(root+'/meters')
            with open(root+'/meters/cursor.json','w') as out:
                json.dump(dict(cursor_models_pct=55,other_models_pct=41,as_of=c.utc(NOW),method='craig'),out)
            with patch.dict(os.environ,{'TSV_CURSOR_MODELS_METER_CMD':'["cursor-meter"]'},clear=True), patch.object(c,'run',side_effect=[json.dumps({'primary':{'usedPercent':10,'resetsAt':NOW+3600}})]) as reader:
                readings=c.read_meters(NOW,root,reader=lambda _: '{}')
            self.assertTrue(all('cursor-meter' not in str(a) for a in reader.call_args_list))
            self.assertEqual(readings['cursor_models']['pct_used'],55)
            self.assertEqual(readings['other_models']['pct_used'],41)
            self.assertFalse(readings['cursor_models']['stale'])
    def test_fresh_heartbeat_and_cursor_agents_only(self):
        raw={'workers':[dict(item=469,heartbeat=c.utc(NOW-1800)),dict(item=470,heartbeat=c.utc(NOW-1801))]}
        with patch.object(c.glob,'glob',return_value=[]), patch.object(c,'file_json',return_value=raw), patch.dict(os.environ,{'TSV_CURSOR_AGENTS_CMD':'["agents"]'},clear=True), patch.object(c,'run',side_effect=['','',json.dumps({'agents':[dict(item=471,status='RUNNING'),dict(item=472,status='FINISHED')]})]):
            workers=c.read_workers(NOW)
        for n, expected in [(469,True),(470,False),(471,True),(472,False),(46,False)]:
            self.assertEqual(c.running(n,workers),expected)
    def test_cursor_account_queries_match_live_runs_to_issue_and_pr(self):
        agent=dict(id='agent-one',name='Fix #469',status='ACTIVE',latestRunId='run-one')
        inactive=dict(id='agent-two',name='Fix #470',status='ACTIVE',latestRunId='run-two')
        responses=[{'items':[agent],'nextCursor':'page2'},
                   {'status':'RUNNING','git':{'branches':[{'prUrl':'https://github.com/x/y/pull/471'}]}},
                   {'items':[inactive]}, {'status':'FINISHED'}]
        class Response:
            def __init__(self, data): self.data=data
            def __enter__(self):
                import io
                return io.StringIO(json.dumps(self.data))
            def __exit__(self,*args): pass
        requests=[]
        def get(request,timeout):
            requests.append(request)
            return Response(responses.pop(0))
        with patch('tsv_common.read_secret',return_value='fake-test-token'), patch.object(c,'file_json',return_value={'issues':{'472':{'agent':'agent-one'}}}), patch.object(c.urllib.request,'urlopen',side_effect=get):
            workers=c.cursor_agents('/fake')
        for n, expected in [(469,True),(470,False),(471,True),(472,True)]:
            self.assertEqual(c.running(n,workers),expected)
        self.assertTrue(all(request.get_method()=='GET' for request in requests))
        self.assertIn('cursor=page2',requests[2].full_url)
    def test_generic_running_systemd_unit_counts_as_evidence(self):
        with patch.object(c.glob,'glob',return_value=[]), patch.object(c,'file_json',side_effect=OSError), patch.dict(os.environ,{},clear=True), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'run',side_effect=['worker-469.service loaded active running Worker', 'Id=worker-469.service\nExecStart=/opt/worker\nWorkingDirectory=/work/469', '']):
            workers=c.read_workers(NOW)
        self.assertTrue(c.running(469,workers))
    def test_systemd_metadata_pid_is_not_item_evidence(self):
        detail='Id=generic.service\nExecStart={ path=/opt/worker ; argv[]=/opt/worker ; pid=469 ; }\nWorkingDirectory=/work'
        with patch.object(c.glob,'glob',return_value=[]), patch.object(c,'file_json',side_effect=OSError), patch.dict(os.environ,{},clear=True), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'run',side_effect=['generic.service loaded active running Worker', detail, '']):
            workers=c.read_workers(NOW)
        self.assertFalse(c.running(469,workers))
    def test_process_number_boundaries(self):
        workers=[dict(kind='process',text='codex /work/issue-469')]
        self.assertTrue(c.running(469,workers));self.assertFalse(c.running(46,workers))
    def test_rescope_number_range_and_incidental_history(self):
        self.assertEqual(c.rescope_refs('History #99. Rescoped into #469-#471.'),{469,470,471})
    def test_stop_file_lifted_marker_does_not_block(self):
        with tempfile.TemporaryDirectory() as root:
            with open(root+'/CURSOR_STOP.lifted-20261017','w') as f: f.write('lifted')
            with open(root+'/CODEX_STOP','w') as f: f.write('Pending decision: budget; decider: dr eggbot')
            with patch('os.path.expanduser',return_value=root): paths=c.stop_files(root)
        self.assertEqual(len(paths),1);self.assertIn('CODEX_STOP',paths[0])


class Main(unittest.TestCase):
    def test_dry_main_has_no_log_state_transport_or_feed_writes(self):
        gh=GH([item(469)])
        with patch.object(w,'GH',return_value=gh), patch.object(w,'find',return_value=[]), patch.object(w,'load_json',return_value={}), patch.object(w,'save_json') as save, patch.object(w,'logline') as log, patch.object(w,'ring_grok') as ring, patch.object(w,'ring_claude') as managing, patch.object(w,'write_list_page') as put, patch.object(c,'read_meters',return_value=meters(29)), patch.object(c,'read_workers',return_value=[]), patch.object(c,'Brain',return_value=Brain()), patch.object(c,'stop_files',return_value=[]), patch.object(c,'publish_meters') as feed, patch.object(w.sys,'argv',['watcher','--dry-run']), patch('builtins.print') as output:
            w.main()
        for writer in [save,log,ring,managing,put,feed]: writer.assert_not_called()
        self.assertEqual(gh.writes,[])
        text=str(output.call_args_list)
        self.assertIn('DRY PLAN', text)
        self.assertIn('idle ring', text)
    def test_stuck_stop_skips_live_alarm_and_writes(self):
        real_exists=os.path.exists
        with patch.object(w.os.path,'exists',side_effect=lambda p: True if p == w.D + '/STUCK_STOP' else real_exists(p)), patch.object(w,'GH') as gh, patch.object(w,'find') as find, patch.object(w,'load_json',return_value={}), patch.object(w,'save_json') as save, patch.object(w,'logline') as log, patch.object(w,'ring_grok') as ring, patch.object(w.idle_capacity,'cycle') as cycle, patch.object(w.sys,'argv',['watcher']):
            w.main()
        log.assert_called_once()
        self.assertIn('STUCK_STOP', log.call_args.args[0])
        find.assert_not_called(); cycle.assert_not_called(); save.assert_not_called(); ring.assert_not_called(); gh.assert_not_called()
    def test_dry_run_path_hermetic_under_30s(self):
        gh=GH([item(469)])
        state={}
        import signal
        def alarm(signum, frame):
            raise TimeoutError('dry-run exceeded 30s')
        signal.signal(signal.SIGALRM, alarm)
        signal.alarm(30)
        try:
            with patch('builtins.print') as output:
                c.cycle(gh, state, NOW, True, Mock(), meters=meters(29), workers=[], brain=Brain(), stops=[])
            text=' '.join(str(a) for a in output.call_args_list)
            self.assertIn('DRY PLAN meters', text)
            self.assertIn('DRY PLAN idle', text)
            self.assertEqual(gh.writes, [])
            self.assertEqual(state, {})
        finally:
            signal.alarm(0)
    def test_exception_in_main_does_not_escape_or_write_dry_log(self):
        with patch.object(w,'load_json',return_value={}), patch.object(w,'GH',side_effect=OSError('fake')),patch.object(w,'logline') as log,patch.object(w.sys,'argv',['watcher','--dry-run']),patch('builtins.print') as output:
            w.main()
        log.assert_not_called(); output.assert_called_once()


if __name__=='__main__': unittest.main()
