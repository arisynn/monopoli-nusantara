import subprocess,time,json,pathlib,os
root=pathlib.Path(__file__).resolve().parents[3]
out=root/'docs/qa/evidence';out.mkdir(exist_ok=True)
env=dict(os.environ,MN_BROWSER_MODULE='/tmp/nusa-qa-browser/node_modules/playwright',MN_BROWSER_OUTPUT=str(out/'suite-screenshots'))
commands=['npm test','npm run typecheck','npm run check:source','npm run test:online','npm run test:browser','npm run test:portrait','npm run test:auction','npm run test:trade:results','npm run test:trade:results:browser','npm run test:hold:batch','npm run test:pwa:browser','npm run audit:dice','npm run diagnose:deployment -- --origin=https://monopoli-nusantara-eight.vercel.app','npm run test:stability','npm run test:bank','npm run test:termux']
results=[]
for i,cmd in enumerate(commands):
 t=time.monotonic();log=out/f'suite-{i:02d}.log'
 try:
  with log.open('w') as f:p=subprocess.run(cmd,shell=True,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240)
  code=p.returncode
 except subprocess.TimeoutExpired:code=124
 results.append(dict(command=cmd,exitCode=code,durationSeconds=round(time.monotonic()-t,3),log=str(log.relative_to(root))))
 (out/'commands.json').write_text(json.dumps(results,indent=2))
 print(json.dumps(results[-1]),flush=True)
