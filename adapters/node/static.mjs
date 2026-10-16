import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("../../dist/", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
/** Serve only an explicit generated static directory; never source/.env/server modules. */
export async function staticResponse(request) {
  const url = new URL(request.url);
  if (
    !["GET", "HEAD"].includes(request.method) ||
    url.pathname.startsWith("/api/")
  )
    return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  const path = resolve(
    root,
    "." + (pathname === "/" ? "/index.html" : pathname),
  );
  if (path !== root && !path.startsWith(root + sep))
    return new Response("Not found", { status: 404 });
  if (pathname.split("/").some((p) => p.startsWith(".")))
    return new Response("Not found", { status: 404 });
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    const ext = extname(path),
      body = request.method === "HEAD" ? null : await readFile(path);
    return new Response(body, {
      headers: {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control":
          ext === ".html" || ext === ".mjs" || ext === ".css"
            ? "no-cache"
            : "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
      },
    });
  } catch {
    return null;
  }
}
