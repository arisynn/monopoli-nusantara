import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
/** Retains the original server handlers unchanged, without Next.js or a bundler. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(specifier.slice(2), root);
      for (const candidate of [
        url,
        new URL(url.href + ".ts"),
        new URL(url.href + ".mjs"),
      ]) {
        if (existsSync(fileURLToPath(candidate)))
          return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
