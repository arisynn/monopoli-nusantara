import subprocess,time,json,pathlib,os
root=pathlib.Path(__file__).resolve().parents[3];out=root/'docs/qa/evidence';env=dict(os.environ,MN_BROWSER_MODULE='/tmp/nusa-qa-browser/node_modules/playwright',MN_BROWSER_OUTPUT=str(out/'extra-suite-screenshots'))
commands=['node --experimental-strip-types --import ./adapters/node/aliases.mjs --test --test-isolation=none tests/online.test.mjs tests/online-client.test.mjs tests/auth-proxy.test.mjs tests/online-api.test.mjs tests/online-bots.test.mjs','npm run test:hold:batch:browser','npm run test:online:rooms','node scripts/verify-speed-model.mjs']
results=[]
for i,cmd in enumerate(commands):
 t=time.monotonic();log=out/f'extra-suite-{i:02d}.log'
 try:
  with log.open('w') as f:p=subprocess.run(cmd,shell=True,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=180)
  code=p.returncode
 except subprocess.TimeoutExpired:code=124
 results.append(dict(command=cmd,exitCode=code,durationSeconds=round(time.monotonic()-t,3),log=str(log.relative_to(root))));(out/'extra-commands.json').write_text(json.dumps(results,indent=2));print(json.dumps(results[-1]),flush=True)
