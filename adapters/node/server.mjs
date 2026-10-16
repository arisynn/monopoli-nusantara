import { createServer } from "node:http";
import { handleRequest } from "./router.mjs";
import { staticResponse } from "./static.mjs";
const port = Number(process.env.MN_HEADLESS_PORT || 8787),
  host = process.env.MN_HEADLESS_HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("MN_HEADLESS_PORT tidak valid.");
const origin = process.env.MN_HEADLESS_ORIGIN || `http://${host}:${port}`;
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 131072) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Snapshot terlalu besar." }));
        return;
      }
      chunks.push(chunk);
    }
    const url = new URL(req.url || "/", origin);
    if (url.origin !== new URL(origin).origin) {
      res.writeHead(400);
      res.end();
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value !== undefined)
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(url, {
      method: req.method,
      headers,
      ...(!["GET", "HEAD"].includes(req.method)
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const response =
      (await staticResponse(request)) || (await handleRequest(request));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Permintaan belum dapat diproses." }));
  }
});
server.on("error", (error) => {
  console.error("Backend belum dapat dibuka:", error.code || "listen_failed");
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(
    `Monopoli logic backend aktif pada ${origin}; frontend Klasik dan API tersedia.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
