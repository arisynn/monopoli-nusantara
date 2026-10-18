import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";

// The supplied generator has unescaped template delimiters. Extract only its
// five model sources; never execute its file writes, manifests or tournament.
const sourcePath = process.argv[2];
if (!sourcePath)
  throw Error(
    "Usage: node scripts/import-nusa-v18.mjs <supplied-generator.js>",
  );
const source = await readFile(sourcePath, "utf8");
const root = resolve(import.meta.dirname, "..");
const sha = (contents) => createHash("sha256").update(contents).digest("hex");
const files = {};
for (const name of ["situation", "experts", "council", "reasoning", "index"]) {
  const marker = `const LAB_${name.toUpperCase()}_MJS = \`\n`;
  const start = source.indexOf(marker);
  if (start < 0) throw Error(`Missing source ${name}`);
  const end = source.indexOf("\n`;\n", start + marker.length);
  if (end < 0) throw Error(`Missing closing delimiter ${name}`);
  let code = source.slice(start + marker.length, end) + "\n";
  code = code
    .replaceAll(
      "Math.max(100,(view.auction.amount||0)+10)",
      "auctionMinimum(view.auction)",
    )
    .replaceAll(
      "Math.max(100,(auction.amount||0)+10)",
      "auctionMinimum(auction)",
    )
    .replaceAll(
      "Math.max(100,(c.view.auction.amount||0)+10)",
      "auctionMinimum(c.view.auction)",
    )
    .replaceAll(
      "Math.max(100,(s.auction.amount||0)+10)",
      "auctionMinimum(s.auction)",
    )
    .replaceAll("Math.max(100,currentAmt+10)", "auctionMinimum(view.auction)");
  if (code.includes("auctionMinimum("))
    code = code.replace(
      "import {BOARD,GROUPS} from '../../lib/content.mjs';",
      "import {BOARD,GROUPS,auctionMinimum} from '../../lib/content.mjs';",
    );
  // Engine logs are newest first: retain the recent public events in sandboxes.
  code = code.replaceAll("s.log=s.log.slice(-80)", "s.log=s.log.slice(0,80)");
  code = code.replace(
    "const maxMs=gear===3?Math.min(4200,Math.max(1800,requestedMs)):Math.min(240,Math.max(24,requestedMs));",
    "const maxMs=Math.max(0,Math.min(gear===3?4200:240,requestedMs));",
  );
  const runtime = code
    .replaceAll("'../../lib/content.mjs'", "'../../content.mjs'")
    .replaceAll("'../../lib/game.mjs'", "'../../game.mjs'")
    .replaceAll("'../../lib/bot/", "'../");
  for (const [relative, contents] of [
    [`lab/nusa-v7/${name}.mjs`, code],
    [`lib/bot/nusa-v7/${name}.mjs`, runtime],
  ]) {
    await mkdir(dirname(resolve(root, relative)), { recursive: true });
    await writeFile(resolve(root, relative), contents);
    files[relative] = sha(contents);
  }
}
const manifest = {
  version: "18.0.0",
  sourceFile: sourcePath.split("/").at(-1),
  sourceSha256: sha(source),
  files,
  compatibilityPatches: [
    "Extract embedded sources without running malformed generator.",
    "Shared five-Nusa auction minimum.",
    "Retain newest 80 simulation log events.",
    "Honor explicit remaining search budget.",
  ],
  containsTrainedWeights: false,
};
await writeFile(
  resolve(root, "NUSA_V18_IMPORTED_HASHES.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Imported 5 NUSA V18 model modules into lab/runtime; original generator SHA recorded.",
);
