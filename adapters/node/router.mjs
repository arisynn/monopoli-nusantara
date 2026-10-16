import {
  APP_VERSION,
  APP_RELEASE,
  ENGINE_SCHEMA_VERSION,
  RULEPACK_VERSION,
} from "../../lib/version.mjs";
import * as online from "../../app/api/online/route.ts";
import * as advisor from "../../app/api/bot/route.ts";
import * as legacy from "../../app/api/game/route.ts";
const routes = new Map([
  ["/api/online", online],
  ["/api/bot", advisor],
  ["/api/game", legacy],
]);
/** Transport only. Existing handlers own Auth, quotas, authority and state mutation. */
export async function handleRequest(request) {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET")
    return Response.json(
      {
        ok: true,
        package: "monopoli-nusantara-logic",
        version: APP_VERSION,
        release: APP_RELEASE,
        engineSchemaVersion: ENGINE_SCHEMA_VERSION,
        rulepackVersion: RULEPACK_VERSION,
        frontend: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  const route = routes.get(path);
  if (!route)
    return Response.json({ error: "Route tidak tersedia." }, { status: 404 });
  const method = route[request.method];
  if (typeof method !== "function")
    return Response.json(
      { error: "Metode tidak tersedia." },
      { status: 405, headers: { Allow: "GET, POST" } },
    );
  return method(request);
}
