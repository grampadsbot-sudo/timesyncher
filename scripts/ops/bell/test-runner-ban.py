import os,pathlib,subprocess,tempfile
root=pathlib.Path(__file__).parent
for source,before,should_fallback in [('runner.before',True,True),('gbrain-bell-job',True,False),('gbrain-bell-job',False,True)]:
 with tempfile.TemporaryDirectory() as td:
  p=pathlib.Path(td);(p/'state').write_text('gpt');(p/'ask').write_text('test only')
  for name,body in {'date':f'if [ "$2" = +%s ]; then echo {1792263599 if before else 1792263600}; else echo TEST; fi','timeout':'exit 1','sudo':'if [[ " $* " == *" python3 "* ]]; then cat >/dev/null; exit 0; fi; exit 1','grok':'touch "'+str(p/'fallback')+'"; exit 0'}.items():
   f=p/name;f.write_text('#!/bin/bash\n'+body+'\n');f.chmod(0o700)
  s=(root/source).read_text().replace('log_dir=/home/timesyncher-agent/.openclaw/logs/gbrain-bell','log_dir='+td).replace('/home/timesyncher-agent/.openclaw/model-flip.state',str(p/'state')).replace('/home/timesyncher-agent/bin/grok-turn',str(p/'grok'))
  f=p/'runner';f.write_text(s)
  r=subprocess.run(['bash',str(f),'agent:main:gbrain-action-test',str(p/'ask')],env=dict(os.environ,PATH=td+':/usr/bin:/bin'),capture_output=True,text=True)
  assert (p/'fallback').exists()==should_fallback,(source,before,r.returncode)
  assert r.returncode==(0 if should_fallback else 1)
  print(source,'before_expiry='+str(before),'fallback='+str(should_fallback),'PASS')
