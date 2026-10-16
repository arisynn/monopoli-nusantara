import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

/** Hash every emitted path and byte, in stable order, before generated metadata. */
export async function outputFingerprint(root) {
  const hash = createHash("sha256");
  async function visit(directory, prefix = "") {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const path = prefix + entry.name;
      if (entry.isDirectory())
        await visit(new URL(entry.name + "/", directory), path + "/");
      else
        hash
          .update(path)
          .update("\0")
          .update(await readFile(new URL(entry.name, directory)))
          .update("\0");
    }
  }
  await visit(root);
  return hash.digest("hex").slice(0, 16);
}
