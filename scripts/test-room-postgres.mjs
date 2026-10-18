// Isolated PostgreSQL verification; never connects to the deployed Supabase project.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createOnlineService } from "../lib/server/online-service.mjs";
const container = `nusa-room-qa-${process.pid}`,
  env = { ...process.env };
for (const k of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[k];
const docker = (...args) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const sql = (q) =>
  execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { env, input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const value = (q) => {
  const s = sql(q);
  return s ? JSON.parse(s.split("\n").at(-1)) : null;
};
const users = [0, 1, 2].map(
    (i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ),
  checks = [];
let started = false;
try {
  docker(
    "run",
    "-d",
    "--rm",
    "--name",
    container,
    "--label",
    "mn.qa=room-management",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine",
  );
  started = true;
  for (let i = 0; ; i++) {
    try {
      docker(
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      );
      break;
    } catch {
      if (i >= 100) throw Error("Isolated PostgreSQL did not start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  sql(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';create schema extensions;create extension pgcrypto with schema extensions;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create publication supabase_realtime;insert into auth.users values ${users.map((id) => `(${quote(id)})`).join(",")};`,
  );
  for (const name of [
    "202610160001_persistent_online.sql",
    "202610160002_hybrid_bot_jobs.sql",
    "202610160003_nusa_mind_settings.sql",
    "202610170004_bot_worker_vault_auth.sql",
    "202610180006_online_room_management.sql",
  ])
    sql(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const store = {
    async get(code) {
      return value(
        `select coalesce((select row_to_json(r) from (select code,data,revision from mn_rooms where code=${quote(code)}) r),'null'::json);`,
      );
    },
    async receipt(user, id) {
      return value(
        `select coalesce((select row_to_json(r) from (select code,request_hash from mn_commands where user_id=${quote(user)} and request_id=${quote(id)}) r),'null'::json);`,
      );
    },
    async quota(key, seconds) {
      return value(`select mn_take_quota(${quote(key)},${seconds});`);
    },
    async list(user) {
      return value(
        `select coalesce(json_agg(code),'[]'::json) from mn_members where user_id=${quote(user)};`,
      );
    },
    async commit(row, room, meta = {}) {
      return value(
        `select mn_commit_room(${quote(room.code)},${row.revision},${quote(JSON.stringify(room))}::jsonb,${meta.userId ? quote(meta.userId) + "::uuid" : "null"},${meta.requestId ? quote(meta.requestId) : "null"},${meta.hash ? quote(meta.hash) : "null"},${meta.type ? quote(meta.type) : "null"},${meta.notify !== false});`,
      );
    },
  };
  let seq = 0;
  const service = createOnlineService({
    store,
    botsEnabled: true,
    generateCode: () => `ABCDEF${"GHJKLMNPQR"[seq++] + "H"}`,
  });
  const call = (i, type, data = {}) =>
    service.execute(
      {
        type,
        clientId: `qa-client-${i}`,
        requestId: crypto.randomUUID(),
        ...data,
      },
      users[i],
    );
  for (const persona of ["raka", "bima", "sari", "nusa", "apex", "kresna"]) {
    const r = await call(0, "CREATE", { name: "QA Host", capacity: 6 });
    const added = await call(0, "ADD_BOT", {
      code: r.code,
      persona,
      difficulty: "hardcore",
    });
    assert.equal(added.seats[1].botPersona, persona);
    await call(0, "KICK", { code: r.code, memberId: added.seats[1].memberId });
    await call(0, "LEAVE", { code: r.code });
    assert.deepEqual(await store.list(users[0]), []);
  }
  checks.push({
    name: "All six bot personas pass actual SQL validation; remove bots and close last-human room",
    passed: true,
  });
  const r = await call(0, "CREATE", { name: "QA Host", capacity: 6 }),
    code = r.code;
  await call(1, "JOIN", { code, name: "QA Guest" });
  await call(2, "JOIN", { code, name: "QA Third" });
  const before = await service.read(code, users[0]);
  await call(0, "KICK", { code, memberId: before.seats[1].memberId });
  assert.equal((await service.read(code, users[2])).seat, 1);
  assert.deepEqual(await store.list(users[1]), []);
  assert.equal(
    value(`select count(*) from mn_members where code=${quote(code)};`),
    2,
  );
  checks.push({
    name: "Kick atomically removes membership and compacts remaining seats",
    passed: true,
  });
  const retry = {
    type: "LEAVE",
    code,
    clientId: "qa-client-0",
    requestId: crypto.randomUUID(),
  };
  await service.execute(retry, users[0]);
  assert.equal((await service.execute(retry, users[0])).left, true);
  assert.equal((await service.read(code, users[2])).host, 0);
  await call(2, "LEAVE", { code });
  checks.push({
    name: "Host leave, receipt retry, ownership transfer and room closure",
    passed: true,
  });
  const active = await call(0, "CREATE", { name: "QA Host" });
  await call(1, "JOIN", { code: active.code, name: "QA Guest" });
  for (let i = 0; i < 2; i++)
    await call(i, "READY", { code: active.code, ready: true });
  await call(0, "START", { code: active.code });
  const row = await store.get(active.code),
    snapshot = JSON.stringify(row.data.state);
  await assert.rejects(
    call(0, "KICK", {
      code: active.code,
      memberId: row.data.seats[1].memberId,
    }),
  );
  await call(0, "DISCONNECT", { code: active.code });
  const paused = await store.get(active.code);
  assert.equal(paused.data.status, "paused");
  assert.equal(JSON.stringify(paused.data.state), snapshot);
  checks.push({
    name: "Active game seats stay immutable; explicit disconnect preserves full game and pauses",
    passed: true,
  });
  assert.throws(() =>
    sql("set role authenticated;select public.mn_online_capabilities();"),
  );
  assert.throws(() =>
    sql("set role authenticated;select * from public.mn_rooms;"),
  );
  const capabilities = value(
    "set role service_role;select public.mn_online_capabilities();",
  );
  assert.equal(capabilities.schemaVersion, 6);
  assert.equal(capabilities.workerConfigured, false);
  checks.push({
    name: "Authenticated clients cannot call service RPCs or read private rooms; diagnostics return booleans",
    passed: true,
  });
  console.log(`${checks.length} isolated PostgreSQL scenarios passed.`);
} catch (error) {
  checks.push({ passed: false, error: String(error.stderr || error.message) });
  console.error(String(error.stderr || error.message));
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL("../docs/ONLINE_POSTGRES_RESULTS.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        postgres: "17, isolated Docker container",
        checks,
        limits: [
          "Does not connect to production Supabase. pg_net/cron and the deployed Edge worker are not exercised.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  try {
    if (started) docker("rm", "-f", container);
  } catch {}
}
