import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { DiceAudit, diceStatistics } from "../lib/dice-audit.mjs";
import { secureRandomInt } from "../lib/random.mjs";
const args = process.argv.slice(2),
  files = [];
let count = 100000,
  output = "docs/audits/DICE_4115_AUDIT.json",
  source =
    "User-supplied committed logs; generator not established by this tool.";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--count") count = Number(args[++i]);
  else if (args[i] === "--output") output = args[++i];
  else if (args[i] === "--source") source = args[++i];
  else if (args[i] === "--input") files.push(args[++i]);
  else
    throw Error(
      "Use --input FILE (repeatable), --count 100000, --output FILE, --source DESCRIPTION",
    );
}
if (!Number.isInteger(count) || count < 100 || count > 1000000)
  throw Error("Count must be 100–1000000.");
const audit = new DiceAudit();
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (Buffer.byteLength(text) > 32 * 1024 * 1024)
    throw Error("Input exceeds 32 MiB.");
  if (/\.(?:jsonl|ndjson)$/i.test(file)) {
    for (const row of text.split(/\r?\n/)) {
      if (row.trim()) audit.ingest(JSON.parse(row), resolve(file));
    }
  } else audit.ingest(JSON.parse(text), resolve(file));
}
const start = performance.now(),
  rows = Array.from({ length: count }, (_, id) => ({
    match: "csprng-baseline",
    id,
    dice: [secureRandomInt(6) + 1, secureRandomInt(6) + 1],
  }));
const generatedMs = performance.now() - start;
const report = {
  generatedAt: new Date().toISOString(),
  source,
  logs: files.length ? audit.result() : null,
  baseline: {
    source:
      "Current Web Crypto rejection sampling, independent of hold duration and persona.",
    generatedMs,
    checkpoints: Object.fromEntries(
      [100, 1000, 10000, 100000, 1000000]
        .filter((n) => n <= count)
        .map((n) => [n, diceStatistics(rows.slice(0, n))]),
    ),
  },
  limits: [
    "Baseline is a fresh local CSPRNG sample, not production online latency or a proof of fairness.",
    "Checkpoint samples are nested; they are not independent experiments.",
    "No production Supabase/Auth/Realtime service was contacted.",
  ],
};
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
const actual = report.logs?.overall;
console.log(
  JSON.stringify(
    {
      output,
      logs: actual
        ? {
            rolls: actual.rolls,
            sum6to8: actual.sum6to8,
            duplicates: report.logs.duplicates,
            conflicts: report.logs.conflicts,
          }
        : null,
      baseline: {
        rolls: count,
        milliseconds: generatedMs,
        sum6to8: diceStatistics(rows).sum6to8,
      },
    },
    null,
    2,
  ),
);
