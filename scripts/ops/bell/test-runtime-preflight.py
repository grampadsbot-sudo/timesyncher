import os,pathlib,subprocess,tempfile
s=pathlib.Path(__file__).with_name('gbrain-bell-job').read_text()
code=s.split("<<'CODEX_RUNTIME_PREFLIGHT'\n",1)[1].split('\nCODEX_RUNTIME_PREFLIGHT',1)[0]
for mode in ('writable','readonly'):
 with tempfile.TemporaryDirectory() as td:
  root=pathlib.Path(td)/'.codex';root.mkdir();(root/'tmp').mkdir();(root/'log').mkdir()
  if mode=='readonly': root.chmod(0o555)
  try:
   r=subprocess.run(['python3','-c',code],env={**os.environ,'HOME':td},capture_output=True,text=True)
   assert r.returncode==(0 if mode=='writable' else 97),(mode,r)
   assert ('CODEX_RUNTIME_OK' if mode=='writable' else 'CODEX_RUNTIME_READ_ONLY') in r.stdout
  finally:root.chmod(0o755)
print('runtime positive/readonly refusal PASS')
r=subprocess.run(['python3','-c',code],capture_output=True,text=True);assert r.returncode==0;print(r.stdout.strip())
assert s.index('CODEX_RUNTIME_READ_ONLY STOP')<s.index('codex start')
assert 'job_timeout=10800' in s and 'policy STOP' in s and 'last_file=' in s
print('pre-dispatch stop/timeout/output/ban retained PASS')
