import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { moduleGraph, projectRoot } from "./module-graph.mjs";

// Native ESM from the real Node/Vercel entries; browser-only modules stay out.
const out = resolve(projectRoot, "server-dist");
await rm(out, { recursive: true, force: true });
const graph = await moduleGraph([
  "adapters/node/server.mjs",
  "adapters/vercel/handler.ts",
]);
for (const [filename, module] of graph) {
  let source = module.source;
  for (const [spec, dependency] of module.dependencies) {
    let target = relative(dirname(filename), dependency)
      .replaceAll("\\", "/")
      .replace(/\.ts$/, ".mjs");
    if (!target.startsWith(".")) target = "./" + target;
    source = source.replaceAll(spec, target);
  }
  const output = resolve(
    out,
    relative(projectRoot, filename).replace(/\.ts$/, ".mjs"),
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, source);
}
console.log(
  `Built private server-dist — ${graph.size} reachable native ESM modules.`,
);
