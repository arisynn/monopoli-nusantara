import subprocess,time,json,pathlib,os
root=pathlib.Path(__file__).resolve().parents[4];out=root/'docs/qa/follow-up/evidence'
env=dict(os.environ,MN_BROWSER_MODULE='/tmp/nusa-qa-browser/node_modules/playwright',MN_CHROMIUM_PATH='/home/agent/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',MN_BROWSER_OUTPUT=str(out/'recheck-screenshots'),MN_PORTRAIT_REPORT=str(out/'portrait-final.json'))
commands=['npm test','npm run test:portrait','npm run test:auction','npm run test:stability','npm run test:bank','npm run typecheck','npm run check:source','node scripts/verify-speed-model.mjs']
results=[]
for i,cmd in enumerate(commands):
 t=time.monotonic();log=out/f'recheck-{i:02d}.log'
 try:
  with log.open('w') as f:p=subprocess.run(cmd,shell=True,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240)
  code=p.returncode
 except subprocess.TimeoutExpired:code=124
 results.append(dict(command=cmd,exitCode=code,durationSeconds=round(time.monotonic()-t,3),log=str(log.relative_to(root))));(out/'rechecks.json').write_text(json.dumps(results,indent=2));print(json.dumps(results[-1]),flush=True)
