import "./verify-learning-artifact.mjs";
import "./build-server.mjs";
import { mkdir, readFile, writeFile, cp, readdir, rm } from "node:fs/promises";
import { outputFingerprint } from "./build-fingerprint.mjs";
import { moduleGraph, projectRoot } from "./module-graph.mjs";
import { relative } from "node:path";
import {
  APP_VERSION,
  APP_RELEASE,
  ENGINE_SCHEMA_VERSION,
  RULEPACK_VERSION,
} from "../lib/version.mjs";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url),
  dist = new URL("dist/", root);
// Only the generated output directory is replaced; source, saves and server files are untouched.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL("public/", root), dist, { recursive: true });
await mkdir(new URL("frontend/", dist), { recursive: true });
await cp(new URL("frontend/index.html", root), new URL("index.html", dist));
await cp(
  new URL("frontend/styles.css", root),
  new URL("frontend/styles.css", dist),
);
const allowed = [];
const graph = await moduleGraph(["frontend/app.mjs"]);
for (const [filename, module] of graph) {
  const path = relative(projectRoot, filename).replace(/\.ts$/, ".mjs");
  if (!/^(frontend|lib)\//.test(path) || path.startsWith("lib/server/"))
    throw Error(`Unexpected public module: ${path}`);
  const target = new URL(path, dist);
  await mkdir(new URL(".", target), { recursive: true });
  let source = module.source;
  for (const [spec, dependency] of module.dependencies)
    if (dependency.endsWith(".ts"))
      source = source.replaceAll(spec, spec.replace(/\.ts$/, ".mjs"));
  await writeFile(target, source);
  allowed.push(path);
}
await cp(
  new URL("frontend/service-worker.js", root),
  new URL("nusantara-sw.js", dist),
);
const hash = await outputFingerprint(dist);
const workerURL = new URL("nusantara-sw.js", dist);
await writeFile(
  workerURL,
  (await readFile(workerURL, "utf8")).replace("__BUILD_ID__", hash),
);
const html = (await readFile(new URL("index.html", dist), "utf8"))
  .replace("/frontend/styles.css", `/frontend/styles.css?v=${hash}`)
  .replace("/frontend/app.mjs", `/frontend/app.mjs?v=${hash}`);
await writeFile(new URL("index.html", dist), html);
await writeFile(
  new URL("build.json", dist),
  JSON.stringify(
    {
      version: APP_VERSION,
      release: APP_RELEASE,
      engineSchemaVersion: ENGINE_SCHEMA_VERSION,
      rulepackVersion: RULEPACK_VERSION,
      frontend: "classic",
      build: hash,
      serverModulesExposed: false,
    },
    null,
    2,
  ) + "\n",
);
async function assetPaths(dir, prefix) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory())
      paths.push(
        ...(await assetPaths(
          new URL(entry.name + "/", dir),
          prefix + entry.name + "/",
        )),
      );
    else paths.push(prefix + entry.name);
  }
  return paths.sort();
}
const precache = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/frontend/styles.css",
  ...allowed.map((p) => "/" + p),
  ...(await assetPaths(new URL("assets/", dist), "/assets/")),
];
for (const path of precache)
  await readFile(new URL(path === "/" ? "index.html" : path.slice(1), dist));
await writeFile(new URL("precache.json", dist), JSON.stringify(precache));
// Avoid leaking any backend module or historical metadata through the static root.
console.log(
  `Built ${fileURLToPath(dist)} — ${allowed.length} reachable browser modules; no server secrets/modules or dependency install.`,
);
