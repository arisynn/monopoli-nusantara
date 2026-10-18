// Generate only the Edge worker's dependency tree; lib/ remains the source of truth.
import { cp, rm, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { moduleGraph, projectRoot } from "./module-graph.mjs";
const shared = resolve(projectRoot, "supabase/functions/monopoli-bots/_shared");
const entry = await readFile(
  resolve(projectRoot, "supabase/functions/monopoli-bots/index.ts"),
  "utf8",
);
if (!entry.includes("./_shared/lib/server/bot-worker.mjs"))
  throw Error("Unexpected Edge entrypoint");
const graph = await moduleGraph(
  [
    "lib/server/supabase-store.mjs",
    "lib/server/bot-worker.mjs",
    "lib/groq.ts",
    "lib/bot/contracts.ts",
  ],
  { preserveTypes: true },
);
await rm(shared, { recursive: true, force: true });
for (const filename of graph.keys()) {
  const path = relative(projectRoot, filename);
  if (!path.startsWith("lib/"))
    throw Error(`Unexpected Edge dependency: ${path}`);
  const target = resolve(shared, path);
  await mkdir(dirname(target), { recursive: true });
  await cp(filename, target);
}
console.log(`Prepared ${graph.size} reachable Edge modules from lib/.`);
