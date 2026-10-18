import test from "node:test";
import assert from "node:assert/strict";
import { createOnlineService } from "../lib/server/online-service.mjs";
import { MemoryOnlineStore } from "./helpers/online-store.mjs";
import { GameSession } from "../frontend/session.mjs";
import { renderPopup } from "../frontend/popups.mjs";
const users = [0, 1, 2, 3].map(
  (i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
async function setup() {
  const store = new MemoryOnlineStore(),
    service = createOnlineService({
      store,
      botsEnabled: true,
      generateCode: () => "ABCDEFGH",
    });
  const call = (i, type, data = {}) =>
    service.execute(
      {
        type,
        code: "ABCDEFGH",
        clientId: `browser-${i}`,
        requestId: crypto.randomUUID(),
        ...data,
      },
      users[i],
    );
  await call(0, "CREATE", { name: "Host", capacity: 6 });
  await call(1, "JOIN", { name: "Guest" });
  return {
    store,
    service,
    call,
    read: (i) => service.read("ABCDEFGH", users[i]),
  };
}
test("host kicks a stable member identity, compacts the waiting lobby and resets ready state", async () => {
  const f = await setup();
  await f.call(2, "JOIN", { name: "Third" });
  await f.call(0, "ADD_BOT", { persona: "nusa" });
  for (let i = 0; i < 3; i++) await f.call(i, "READY", { ready: true });
  const before = await f.read(0),
    removed = before.seats[1].memberId;
  const r = await f.call(0, "KICK", { memberId: removed });
  assert.deepEqual(
    r.seats.map((s) => s.name),
    ["Host", "Third", "NUSA"],
  );
  assert(r.seats.every((s) => !s.ready));
  assert.equal((await f.read(2)).seat, 1);
  await assert.rejects(
    f.read(1),
    (e) => e.status === 403 && e.code === "room_membership_ended",
  );
  await assert.rejects(
    f.call(1, "HEARTBEAT"),
    (e) => e.code === "room_membership_ended",
  );
  await assert.rejects(
    f.call(0, "KICK", { memberId: removed }),
    /sudah keluar/,
  );
  assert.equal((await f.read(0)).seats.length, 3);
});
test("non-host and self kick are rejected; duplicate commands cannot remove a second participant", async () => {
  const f = await setup(),
    r = await f.read(0),
    memberId = r.seats[1].memberId;
  await assert.rejects(
    f.call(1, "KICK", { memberId: r.seats[0].memberId }),
    /Hanya host/,
  );
  await assert.rejects(
    f.call(0, "KICK", { memberId: r.seats[0].memberId }),
    /kursi sendiri/,
  );
  const body = {
    type: "KICK",
    code: "ABCDEFGH",
    clientId: "browser-0",
    requestId: crypto.randomUUID(),
    memberId,
  };
  const both = await Promise.all([
    f.service.execute(body, users[0]),
    f.service.execute(body, users[0]),
  ]);
  assert(both.every((r) => r.seats.length === 1));
});
test("leaving host transfers ownership; last human closes the lobby and retry stays idempotent", async () => {
  const f = await setup();
  await f.call(0, "ADD_BOT", { persona: "kresna" });
  assert.equal((await f.call(0, "LEAVE")).left, true);
  assert.equal((await f.read(1)).host, 0);
  assert.deepEqual(await f.service.list(users[0]), []);
  const body = {
    type: "LEAVE",
    code: "ABCDEFGH",
    clientId: "browser-1",
    requestId: crypto.randomUUID(),
  };
  assert.equal((await f.service.execute(body, users[1])).left, true);
  assert.equal((await f.service.execute(body, users[1])).left, true);
  const row = await f.store.get("ABCDEFGH");
  assert(row.data.closed);
  assert.equal(row.data.seats.length, 0);
  assert.deepEqual(await f.service.list(users[1]), []);
  await assert.rejects(
    f.call(2, "JOIN", { name: "Third" }),
    (e) => e.status === 410,
  );
});
test("a stale kick target never changes identity when another seat leaves concurrently", async () => {
  const f = await setup();
  await f.call(2, "JOIN", { name: "Third" });
  const r = await f.read(0),
    third = r.seats[2].memberId;
  await f.call(1, "LEAVE");
  await f.call(0, "KICK", { memberId: third });
  assert.deepEqual(
    (await f.read(0)).seats.map((s) => s.name),
    ["Host"],
  );
});
test("during gameplay kick and permanent leave are blocked; disconnect pauses without rewriting the game", async () => {
  const f = await setup();
  for (let i = 0; i < 2; i++) await f.call(i, "READY", { ready: true });
  await f.call(0, "START");
  const before = await f.store.get("ABCDEFGH");
  await assert.rejects(
    f.call(0, "KICK", { memberId: before.data.seats[1].memberId }),
    /sebelum permainan/,
  );
  await assert.rejects(f.call(1, "LEAVE"), /sebelum permainan/);
  const r = await f.call(0, "DISCONNECT");
  assert.equal(r.status, "paused");
  assert.equal(r.pause.reason, "leave");
  assert.deepEqual(
    (await f.store.get("ABCDEFGH")).data.state,
    before.data.state,
  );
  assert.equal(r.host, 1);
  assert.equal((await f.call(0, "JOIN")).seat, 0);
});
test("disconnect releases only this browser lease while another tab keeps its seat connected", async () => {
  const f = await setup();
  await f.call(0, "HEARTBEAT", { clientId: "another-tab" });
  const r = await f.call(0, "DISCONNECT");
  assert(r.seats[0].connected);
  const row = await f.store.get("ABCDEFGH");
  assert(!("browser-0" in row.data.seats[0].connections));
  assert(row.data.seats[0].connections["another-tab"]);
});
function session(t, options = {}) {
  const s = new GameSession({
    persist: async () => {},
    load: async () => null,
    archive: async () => {},
    mind: { dispose() {} },
    ...options,
  });
  s.hidden = true;
  s.connectRoom = () => {};
  t.after(() => s.dispose());
  return s;
}
test("resume waits for online configuration before reading the saved identity", async (t) => {
  const f = await setup(),
    s = session(t, {
      load: async () => ({ room: { code: "ABCDEFGH", userId: users[0] } }),
    });
  let refreshed = 0;
  s.refreshConfig = async () => {
    refreshed++;
    s.configStatus = "ready";
    s.auth = {
      token: async () => "",
      session: () => ({ user: { id: users[0] } }),
      request: async (_p, b) => f.service.execute(b, users[0]),
    };
  };
  await s.resume();
  assert.equal(refreshed, 1);
  assert.equal(s.room.code, "ABCDEFGH");
  assert.equal(s.error, "");
});
test("kicked client returns to main lobby, forgets only its old room, and does not reconnect", async (t) => {
  const f = await setup();
  let saved = { room: { code: "ABCDEFGH", userId: users[1] } };
  const s = session(t, {
    load: async () => saved,
    persist: async (value) => {
      saved = value;
    },
  });
  s.auth = {
    session: () => ({ user: { id: users[1] } }),
    request: async () => {
      const e = Error("Anda sudah tidak terdaftar di room ini.");
      e.code = "room_membership_ended";
      throw e;
    },
  };
  s.takeRoom(await f.read(1), { baseline: true });
  await s.saveQueue;
  await s.readRoom();
  assert.equal(s.room, null);
  assert.equal(s.screen, "lobby");
  assert.equal(saved.room, null);
  assert.equal(s.unsubscribe, null);
});
test("a removal notice cannot erase a newer local save written in another tab", async (t) => {
  const local = { state: { matchId: "new-local" }, room: null },
    s = session(t, {
      load: async () => local,
      persist: async () => {
        throw Error("must not overwrite");
      },
    });
  s.room = { code: "ABCDEFGH", userId: users[1] };
  await s.exitOnline("ABCDEFGH", { forget: true });
  assert.equal(s.saved, local);
});
test("online return does not trap the player when local storage is unavailable", async (t) => {
  const s = session(t, {
    persist: async () => {
      throw Error("device quota");
    },
  });
  let released = false;
  s.room = { code: "ABCDEFGH", seat: 0, userId: users[0] };
  s.online = { status: "playing" };
  s.screen = "gameplay";
  s.auth = {
    request: async (_p, b) => {
      assert.equal(b.type, "DISCONNECT");
      released = true;
    },
  };
  await s.lobby();
  assert.equal(s.screen, "lobby");
  assert.equal(s.room, null);
  assert(released);
  assert(s.error.includes("tersimpan di server"));
});
test("leaving then creating another room keeps the cleared save revision for safe persistence", async (t) => {
  let stored = {
    state: null,
    room: { code: "ABCDEFGH", userId: users[0] },
    saveRevision: "old",
  };
  const s = session(t, {
    load: async () => stored,
    persist: async (value, options) => {
      assert.equal(options.expectedRevision, stored.saveRevision);
      stored = { ...value, saveRevision: crypto.randomUUID() };
      return stored;
    },
  });
  s.room = { ...stored.room };
  await s.exitOnline("ABCDEFGH", { forget: true });
  assert.equal(s.saved.saveRevision, stored.saveRevision);
  assert.equal(s.saved.room, null);
  s.room = { code: "ABCDEFHJ", seat: 0, userId: users[0] };
  await s.saveCurrent();
  assert.equal(stored.room.code, "ABCDEFHJ");
});
test("room popup renders in waiting lobby without gameplay state and shows host-only kick controls", async () => {
  const f = await setup(),
    r = await f.read(0);
  const own = renderPopup(
    { view: null, state: null, seat: 0, online: r, pending: false },
    {},
    { kind: "room" },
  );
  assert(own.html.includes("Guest"));
  assert(own.html.includes("kickPlayer"));
  assert(own.footer.includes("leaveRoomConfirm"));
  const guest = renderPopup(
    {
      view: null,
      state: null,
      seat: 1,
      online: await f.read(1),
      pending: false,
    },
    {},
    { kind: "room" },
  );
  assert(!guest.html.includes("kickPlayer"));
});
