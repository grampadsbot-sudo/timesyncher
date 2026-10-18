import io
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from test_idle_capacity import NOW, c


class Readers(unittest.TestCase):
    def test_canonical_jsonl_meter_claude100_codex5_32(self):
        rows=[dict(lane='claude-pro',pct_5h=100,pct_week=26,reset_5h='a',reset_week='b',as_of=c.utc(NOW)),
              dict(lane='chatgpt-plus-codex',pct_5h=5,pct_week=32,reset_5h='a',reset_week='b',as_of=c.utc(NOW))]
        source='```json\n'+'\n'.join(json.dumps(r) for r in rows)+'\n```'
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{},clear=True), patch.object(c,'run',side_effect=OSError):
            readings=c.read_meters(NOW,root,reader=lambda _:source)
        self.assertEqual(readings['claude']['pct_used'],100)
        self.assertFalse(readings['claude']['available'])
        self.assertEqual(readings['codex']['pct_used'],32)
        self.assertTrue(readings['codex']['available'])
    def test_real_canonical_meter_row_pt_as_of_claude100_not_available(self):
        row=dict(lane='claude-pro',pct_5h=100.0,pct_week=26.0,reset_5h='2026-10-18 02:59 PDT',
                 reset_week='2026-10-24 11:59 PDT',as_of='2026-10-18 01:39 PDT')
        now=c.stamp('2026-10-18 03:00 PDT')
        source='```json\n'+json.dumps(row)+'\n```'
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{},clear=True), patch.object(c,'run',side_effect=OSError):
            readings=c.read_meters(now,root,reader=lambda _:source)
        self.assertEqual(readings['claude']['as_of'],'2026-10-18 01:39 PDT')
        self.assertEqual(readings['claude']['pct_used'],100)
        self.assertFalse(readings['claude']['stale'])
        self.assertFalse(readings['claude']['available'])
    def test_stamp_pt_ambiguous_fails_closed(self):
        self.assertRaises(ValueError,c.stamp,'2020-11-01 01:30 PT')
    def test_malformed_meter_rows_fail_closed(self):
        source='```json\n{"lane":"claude-pro","pct_5h":10\n{bad\n```'
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{},clear=True), patch.object(c,'run',side_effect=OSError):
            readings=c.read_meters(NOW,root,reader=lambda _:source)
        self.assertTrue(all(m['stale'] and m['available'] for m in readings.values()))
    def test_lane_slot_live_pid_binds_issue_and_pr(self):
        wt='/san/vk-477-harness-20261018'
        lane_cmd='bash /lanes/vk-lane-run.sh cursor-ubuntu /job h477 brief.md %s' % wt
        with tempfile.TemporaryDirectory() as root:
            slot=root+'/lanes/slots/cursor-ubuntu-h477.slot'
            os.makedirs(os.path.dirname(slot))
            with open(slot,'w') as out:
                out.write('lane=cursor-ubuntu\nmeter=cursor\ntag=h477\nhost=testhost\npid=4242\n')
            with open(root+'/lane-worker-jobs.json','w') as out:
                json.dump({'h477':dict(item=479,pr=477,worktree=wt)},out)
            real=c.glob.glob
            def glob(pattern):
                if pattern.endswith('/*.slot'): return [slot]
                if pattern.startswith('/proc'): return []
                return real(pattern)
            def skip_heartbeats(path):
                if str(path).endswith('worker-heartbeats.json'): raise OSError
                with open(path) as source: return json.load(source)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.socket,'gethostname',return_value='testhost'), patch.object(c.os,'kill',return_value=None), patch.object(c,'proc_cmdline',return_value=lane_cmd), patch.object(c.glob,'glob',side_effect=glob), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=skip_heartbeats):
                workers=c.read_workers(NOW,root)
        self.assertTrue(c.running(479,workers));self.assertTrue(c.running(477,workers));self.assertFalse(c.running(478,workers))
    def test_lane_slot_missing_host_ignored(self):
        wt='/san/vk-477-harness-20261018'
        with tempfile.TemporaryDirectory() as root:
            slot=root+'/lanes/slots/cursor-ubuntu-h477.slot'
            os.makedirs(os.path.dirname(slot))
            with open(slot,'w') as out: out.write('lane=cursor-ubuntu\ntag=h477\npid=4242\n')
            with open(root+'/lane-worker-jobs.json','w') as out:
                json.dump({'h477':dict(item=479,pr=477,worktree=wt)},out)
            real=c.glob.glob
            def glob(pattern):
                if pattern.endswith('/*.slot'): return [slot]
                if pattern.startswith('/proc'): return []
                return real(pattern)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.socket,'gethostname',return_value='testhost'), patch.object(c.os,'kill',return_value=None), patch.object(c,'proc_cmdline',return_value='vk-lane-run.sh cursor-ubuntu tag h477 '+wt), patch.object(c.glob,'glob',side_effect=glob), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=OSError):
                workers=c.read_workers(NOW,root)
        self.assertFalse(c.running(479,workers))
    def test_lane_slot_reused_pid_wrong_lane_tag_ignored(self):
        wt='/san/vk-477-harness-20261018'
        with tempfile.TemporaryDirectory() as root:
            slot=root+'/lanes/slots/cursor-ubuntu-h477.slot'
            os.makedirs(os.path.dirname(slot))
            with open(slot,'w') as out:
                out.write('lane=cursor-ubuntu\ntag=h477\nhost=testhost\npid=4242\n')
            with open(root+'/lane-worker-jobs.json','w') as out:
                json.dump({'h477':dict(item=479,pr=477,worktree=wt)},out)
            real=c.glob.glob
            def glob(pattern):
                if pattern.endswith('/*.slot'): return [slot]
                if pattern.startswith('/proc'): return []
                return real(pattern)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.socket,'gethostname',return_value='testhost'), patch.object(c.os,'kill',return_value=None), patch.object(c,'proc_cmdline',return_value='vk-lane-run.sh cursor-ubuntu h999 other '+wt), patch.object(c.glob,'glob',side_effect=glob), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=OSError):
                workers=c.read_workers(NOW,root)
        self.assertFalse(c.running(479,workers))
    def test_stale_dead_lane_slot_ignored(self):
        with tempfile.TemporaryDirectory() as root:
            slot=root+'/lanes/slots/cursor-ubuntu-h477.slot'
            os.makedirs(os.path.dirname(slot))
            with open(slot,'w') as out: out.write('lane=cursor-ubuntu\ntag=h477\nhost=testhost\npid=4242\n')
            with open(root+'/lane-worker-jobs.json','w') as out:
                json.dump({'h477':dict(item=479,pr=477)},out)
            real=c.glob.glob
            def glob(pattern):
                if pattern.endswith('/*.slot'): return [slot]
                if pattern.startswith('/proc'): return []
                return real(pattern)
            def skip_heartbeats(path):
                if str(path).endswith('worker-heartbeats.json'): raise OSError
                with open(path) as source: return json.load(source)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.socket,'gethostname',return_value='testhost'), patch.object(c.os,'kill',side_effect=OSError), patch.object(c.glob,'glob',side_effect=glob), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=skip_heartbeats):
                workers=c.read_workers(NOW,root)
        self.assertFalse(c.running(479,workers))
    def test_cursor_agent_process_binds_explicit_worktree_job(self):
        with tempfile.TemporaryDirectory() as root:
            wt='/san/vk-477-harness-20261018'
            with open(root+'/lane-worker-jobs.json','w') as out:
                json.dump({'h477':dict(item=479,pr=477,worktree=wt)},out)
            real=c.glob.glob
            def glob(pattern):
                if pattern.startswith('/proc'): return ['/proc/4242/cmdline']
                if pattern.endswith('/*.slot'): return []
                return real(pattern)
            def readlink(path):
                if path.endswith('/cwd'): return wt
                raise OSError
            cmd=io.BytesIO(b'cursor-agent -p --trust --force\x00')
            def skip_heartbeats(path):
                if str(path).endswith('worker-heartbeats.json'): raise OSError
                with open(path) as source: return json.load(source)
            orig_open=open
            def fake_open(path,*a,**k):
                if 'cmdline' in str(path): return cmd
                return orig_open(path,*a,**k)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.glob,'glob',side_effect=glob), patch.object(c.os,'readlink',side_effect=readlink), patch.object(c.os,'kill',return_value=None), patch('builtins.open',fake_open), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=skip_heartbeats):
                workers=c.read_workers(NOW,root)
        self.assertTrue(c.running(479,workers));self.assertFalse(c.running(469,workers))
    def test_cursor_agent_without_binding_is_not_running(self):
        with tempfile.TemporaryDirectory() as root:
            real=c.glob.glob
            def glob(pattern):
                if pattern.startswith('/proc'): return ['/proc/4242/cmdline']
                if pattern.endswith('/*.slot'): return []
                return real(pattern)
            cmd=io.BytesIO(b'cursor-agent -p\x00')
            def skip_heartbeats(path):
                if str(path).endswith('worker-heartbeats.json'): raise OSError
                raise OSError
            orig_open=open
            def fake_open(path,*a,**k):
                if 'cmdline' in str(path): return cmd
                return orig_open(path,*a,**k)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.glob,'glob',side_effect=glob), patch.object(c.os,'readlink',return_value='/unbound/worktree'), patch('builtins.open',fake_open), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=skip_heartbeats):
                workers=c.read_workers(NOW,root)
        self.assertEqual(workers,[])
    def test_inspector_process_not_evidence(self):
        with tempfile.TemporaryDirectory() as root:
            real=c.glob.glob
            def glob(pattern):
                if pattern.startswith('/proc'): return ['/proc/4242/cmdline']
                if pattern.endswith('/*.slot'): return []
                return real(pattern)
            cmd=io.BytesIO(b'codex scripts/ops/dispatch/tsv_stuck_check.py\x00')
            orig_open=open
            def fake_open(path,*a,**k):
                if 'cmdline' in str(path): return cmd
                return orig_open(path,*a, **k)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.glob,'glob',side_effect=glob), patch.object(c.os,'readlink',return_value='/work/issue-469'), patch('builtins.open',fake_open), patch.object(c,'cursor_agents',return_value=[]), patch.object(c,'file_json',side_effect=OSError):
                workers=c.read_workers(NOW,root)
        self.assertFalse(c.running(469,workers))
    def test_finished_cloud_agent_not_running(self):
        state={'issues':{'463':dict(agent='agent-finished',status='finished',last_status='FINISHED',pr=478,launched_at='2026-10-18T01:00:00-07:00')}}
        agent=dict(id='agent-finished',name='VK #463',status='ACTIVE',latestRunId='run-f')
        responses=[{'items':[agent]}, {'status':'FINISHED'}]
        class Response:
            def __init__(self,data): self.data=data
            def __enter__(self): return io.StringIO(json.dumps(self.data))
            def __exit__(self,*args): pass
        with patch('tsv_common.read_secret',return_value='fake'), patch.object(c,'file_json',return_value=state), patch.object(c.urllib.request,'urlopen',side_effect=lambda req,timeout: Response(responses.pop(0))):
            workers=c.cursor_agents('/fake')
        self.assertFalse(c.running(463,workers));self.assertFalse(c.running(478,workers))
    def test_cloud_running_overrides_finished_cursor_mapping(self):
        state={'issues':{'480':dict(agent='agent-live',status='finished',last_status='FINISHED',launched_at='2026-10-17T01:00:00-07:00')}}
        agent=dict(id='agent-live',name='Fix #481',status='ACTIVE',latestRunId='run-live')
        responses=[{'items':[agent]}, {'status':'RUNNING','git':{'branches':[]}}]
        class Response:
            def __init__(self,data): self.data=data
            def __enter__(self): return io.StringIO(json.dumps(self.data))
            def __exit__(self,*args): pass
        with patch('tsv_common.read_secret',return_value='fake'), patch.object(c,'file_json',return_value=state), patch.object(c.urllib.request,'urlopen',side_effect=lambda req,timeout: Response(responses.pop(0))):
            workers=c.cursor_agents('/fake')
        self.assertFalse(c.running(480,workers));self.assertTrue(c.running(481,workers))
    def test_active_cloud_statuses_running_and_creating(self):
        with patch.object(c.glob,'glob',return_value=[]), patch.object(c,'file_json',side_effect=OSError), patch.dict(os.environ,{'TSV_CURSOR_AGENTS_CMD':'["agents"]'},clear=True), patch.object(c,'run',return_value=json.dumps({'agents':[dict(item=471,status='RUNNING'),dict(item=472,status='CREATING'),dict(item=473,status='FINISHED'),dict(item=474,status='weird')]})):
            workers=c.read_workers(NOW)
        self.assertTrue(c.running(471,workers));self.assertTrue(c.running(472,workers))
        self.assertFalse(c.running(473,workers));self.assertFalse(c.running(474,workers))
    def test_malformed_lane_job_binding_ignored(self):
        with tempfile.TemporaryDirectory() as root:
            slot=root+'/lanes/slots/cursor-ubuntu-h477.slot'
            os.makedirs(os.path.dirname(slot))
            with open(slot,'w') as out: out.write('lane=cursor-ubuntu\ntag=h477\nhost=testhost\npid=4242\n')
            with open(root+'/lane-worker-jobs.json','w') as out: out.write('{bad')
            real=c.glob.glob
            def glob(pattern):
                if pattern.endswith('/*.slot'): return [slot]
                if pattern.startswith('/proc'): return []
                return real(pattern)
            with patch.object(c,'run',side_effect=OSError), patch.object(c.socket,'gethostname',return_value='testhost'), patch.object(c.os,'kill',return_value=None), patch.object(c.glob,'glob',side_effect=glob), patch.object(c,'cursor_agents',return_value=[]):
                workers=c.read_workers(NOW,root)
        self.assertFalse(c.running(479,workers))

