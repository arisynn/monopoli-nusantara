import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { stripTypeScriptTypes } from "node:module";

export const projectRoot = resolve(import.meta.dirname, "..");

// Include literal dynamic imports and worker URLs as well as static imports.
export async function moduleGraph(entries, { preserveTypes = false } = {}) {
  const modules = new Map();
  async function visit(filename) {
    if (modules.has(filename)) return;
    let source = await readFile(filename, "utf8");
    if (filename.endsWith(".ts") && !preserveTypes)
      source = stripTypeScriptTypes(source, { mode: "strip" });
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const specs = new Set();
    for (const pattern of [
      /(?:^|[;\n])\s*(?:import|export)\s+(?:[\w$*{},\s]+?\s+from\s*)?["']([^"']+)["']/g,
      /\bimport\s*\(\s*["']([^"']+)["']/g,
      /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
    ])
      for (const match of code.matchAll(pattern)) {
        if (match[0].startsWith("new") && !/\.(?:mjs|js|ts)$/.test(match[1]))
          continue;
        specs.add(match[1]);
      }
    const dependencies = new Map();
    modules.set(filename, { source, dependencies });
    for (const spec of specs) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      let target = spec.startsWith("@/")
        ? resolve(projectRoot, spec.slice(2))
        : resolve(dirname(filename), spec);
      if (!target.startsWith(projectRoot + sep))
        throw Error(`Import outside project: ${spec}`);
      for (const candidate of [target, target + ".ts", target + ".mjs"]) {
        if (
          await stat(candidate).then(
            (s) => s.isFile(),
            () => false,
          )
        ) {
          target = candidate;
          break;
        }
      }
      dependencies.set(spec, target);
      await visit(target);
    }
  }
  for (const entry of entries) await visit(resolve(projectRoot, entry));
  return modules;
}
