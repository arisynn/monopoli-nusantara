# NUSA Benchmark — guard-smoke-2p

- Source: NUSA V23 (unchanged policy)
- Mode: bankruptcy; deadline/safety time: 0.75 minutes
- Games: 2/2; natural bankruptcy wins: 2; timed wealth wins: 0; draws: 0; unresolved: 0
- Illegal actions: 0; loop games: 0
- Average actions: 494.5
- Winners (bankruptcy or timed wealth, separately labelled in matches/*/summary.json): {"nusa":1,"kresna":1,"apex":0,"raka":0,"bima":0,"sari":0}
- Stop reasons: {"finished":2}

All event histories: matches/*/events.jsonl. Full terminal saves: matches/*/final-save.json.
Timed results use engine worth() (cash + owned assets at rules valuation + building value), with mortgage assets at mortgage value. Equal top worth is a draw. Stops due to loop, error, safety cap or interruption have no winner. Bankruptcy results require phase 'won'.
