"""Test-only Redis command bridge. Requires: pip install 'fakeredis[lua]==2.40.0'.
Executes the application's Lua scripts via lupa; no production server credentials.
"""
import json, sys
import fakeredis
redis = fakeredis.FakeRedis(decode_responses=True)
for line in sys.stdin:
    try:
        message = json.loads(line)
        result = redis.execute_command(*message['command'])
        print(json.dumps({'id':message['id'], 'result':result}), flush=True)
    except Exception as error:
        print(json.dumps({'id':message.get('id'), 'error':str(error)}), flush=True)
