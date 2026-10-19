import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  command,
  GROUPS,
  stock,
  publicState,
} from "../lib/game.mjs";
import { commandBuildBatch } from "../lib/build-batch.mjs";
import {
  ingestTimeline,
  presentedState,
  advanceTimeline,
} from "../lib/presentation-timeline.mjs";
import { createOnlineService } from "../lib/server/online-service.mjs";
import { validateOnlineAction } from "../lib/server/online-room.mjs";
import { MemoryOnlineStore } from "./helpers/online-store.mjs";
import { GameSession } from "../frontend/session.mjs";
import {createGame as createLegacyGame} from '../lib/game-v1.mjs';
const make = (n = 3) => {
  const s = createGame(
    {
      players: Array.from({ length: n }, (_, i) => ({
        name: `P${i}`,
        controller: "human",
      })),
      startingRoll: false,
    },
    () => 0.2,
  );
  for (const id of [1, 3]) s.assets[id].owner = 0;
  return s;
};
const batch = (s, data = {}) =>
  commandBuildBatch(s, 0, {
    type: "BUILD_BATCH",
    id: "batch-0001",
    expectedVersion: s.version,
    group: 0,
    count: 6,
    ...data,
  });

test("atomic six-build result matches official commands, ledger, balanced assets and has one visual settlement", () => {
  const s = make(),
    before = structuredClone(s),
    next = batch(s);
  let control = s;
  for (const [n, tile] of [1, 3, 1, 3, 1, 3].entries())
    control = command(control, 0, {
      type: "BUILD",
      tile,
      id: `control-${n}`,
      expectedVersion: control.version,
    });
  assert.deepEqual(s, before);
  assert.deepEqual(next.assets, control.assets);
  assert.deepEqual(next.players, control.players);
  assert.equal(next.version, 6);
  assert.deepEqual(next.bankEconomy, control.bankEconomy);
  assert.equal(next.log.filter((e) => e.type === "build").length, 6);
  assert.equal(
    batch(next),
    next,
    "parent action ID deduplicates even with a later state",
  );
  const model = ingestTimeline(
    ingestTimeline(null, publicState(s)),
    publicState(next),
  );
  assert.equal(model.queue.filter((h) => h.finance).length, 1);
  assert.equal(model.queue[0].finance.amount, 3000);
  assert.deepEqual(presentedState(model).assets, next.assets);
  assert.equal(presentedState(model).players[0].cash, next.players[0].cash);
  assert.deepEqual(
    advanceTimeline(model, model.queue[0].id).view,
    publicState(next),
  );
});
for (const reason of ["cash", "mortgage", "owner", "stock"])
  test(`batch ${reason} failure publishes no partial purchase or ledger entries`, () => {
    const s = make();
    if (reason === "cash") s.players[0].cash = 500;
    if (reason === "mortgage") s.assets[3].mortgaged = true;
    if (reason === "owner") s.assets[3].owner = 1;
    if (reason === "stock") {
      for (const group of [GROUPS[1], GROUPS[2]])
        for (const id of group.ids)
          s.assets[id] = { owner: 1, level: 4, mortgaged: false };
      for (const id of GROUPS[3].ids)
        s.assets[id] = { owner: 1, level: 2, mortgaged: false };
      s.bank = stock(s);
      assert.equal(s.bank.houses, 2);
    }
    const before = structuredClone(s);
    assert.throws(() => batch(s));
    assert.deepEqual(s, before);
  });
test("scarce stock is rolled back and single BUILD still opens the official multi-player offer", () => {
  const s = make();
  for (const id of [6, 8, 9]) s.assets[id].owner = 1;
  for (const group of [GROUPS[2], GROUPS[3]])
    for (const id of group.ids)
      s.assets[id] = { owner: 2, level: 4, mortgaged: false };
  for (const id of GROUPS[4].ids)
    s.assets[id] = { owner: 2, level: 2, mortgaged: false };
  s.assets[26] = { owner: 2, level: 1, mortgaged: false };
  s.bank = stock(s);
  assert.equal(s.bank.houses, 1);
  const before = structuredClone(s);
  assert.throws(
    () => batch(s, { count: 2 }),
    (e) => e.code === "build_batch_stock",
  );
  assert.deepEqual(s, before);
  const order = command(s, 0, { type: "BUILD", tile: 1 });
  assert.equal(order.phase, "buildOffer");
  assert.equal(order.players[0].cash, s.players[0].cash);
  assert(order.buildOffer.pending.includes(1));
});
test("hotel transitions return houses to the bank using the original rules", () => {
  const s = make();
  for (const id of [1, 3]) s.assets[id].level = 4;
  s.bank = stock(s);
  const next = batch(s, { count: 2 });
  assert.equal(next.assets[1].level, 5);
  assert.equal(next.assets[3].level, 5);
  assert.equal(next.bank.houses, 32);
  assert.equal(next.bank.hotels, 10);
  assert.equal(next.players[0].cash, 14000);
});
test("public batch metadata never exposes the private user prefix of a command ID", () => {
  const s = make(),
    next = batch(s, { id: "private-user-id:public-request-id" }),
    view = publicState(next);
  assert(!JSON.stringify(view).includes("private-user-id"));
  assert(
    view.log
      .find((e) => e.buildBatch)
      .buildBatch.id.includes("public-request-id"),
  );
});
test("batch input rejects invalid groups, counts, injected properties, bot actors, stale version and forbidden phase", () => {
  const s = make();
  for (const count of [0, 1, 16, 2.5, "3", null])
    assert.throws(() => batch(s, { count }));
  for (const group of [-1, 8, "0", 1.5])
    assert.throws(() => batch(s, { group }));
  assert.throws(() => batch(s, { expectedVersion: 10 }));
  s.phase = "debt";
  s.debt = { from: 0, to: 1, amount: 10 };
  assert.throws(() => batch(s));
  s.phase = "roll";
  s.players[0].controller = "bot";
  assert.throws(() => batch(s));
  assert.throws(() =>
    validateOnlineAction({
      type: "BUILD_BATCH",
      id: "valid",
      expectedVersion: 0,
      group: 0,
      count: 3,
      tile: 1,
    }),
  );
});
async function online(n = 2) {
  const store = new MemoryOnlineStore(),
    now = 1000000,
    service = createOnlineService({
      store,
      clock: () => now,
      rng: () => 0.2,
      generateCode: () => "ABCDEFGH",
    });
  const body = (type, data = {}) => ({
    type,
    clientId: "connection-000",
    requestId: crypto.randomUUID(),
    ...data,
  });
  await service.execute(body("CREATE", { name: "Ayu", capacity: n }), "user-0");
  for (let i = 1; i < n; i++)
    await service.execute(
      body("JOIN", { code: "ABCDEFGH", name: `P${i}` }),
      "user-" + i,
    );
  store.edit("ABCDEFGH", (r) => {
    r.status = "playing";
    r.state = make(n);
  });
  const id = crypto.randomUUID(),
    request = body("ACTION", {
      code: "ABCDEFGH",
      requestId: id,
      action: {
        type: "BUILD_BATCH",
        id,
        expectedVersion: 0,
        group: 0,
        count: 6,
      },
    });
  store.notifications = [];
  return { store, service, request };
}
for (const n of [2, 3, 4, 5, 6])
  test(`${n} players: one database commit/notification, receipt deduplication and concurrent double submission`, async () => {
    const { store, service, request } = await online(n),
      version = store.rooms.get("ABCDEFGH").revision;
    const [a, b] = await Promise.all([
      service.execute(request, "user-0"),
      service.execute(request, "user-0"),
    ]);
    assert.equal(a.state.version, 6);
    assert.equal(b.state.version, 6);
    assert.equal(store.rooms.get("ABCDEFGH").revision, version + 1);
    assert.equal(store.notifications.length, 1);
    assert.equal(a.performance.sourceVersion, 0);
    assert.equal(a.performance.version, 6);
    await assert.rejects(
      service.execute(
        { ...request, action: { ...request.action, count: 2 } },
        "user-0",
      ),
      /isi berbeda/,
    );
  });
test("separate racing batches with the same source version cannot overspend or partially commit", async () => {
  const { store, service, request } = await online(),
    other = structuredClone(request),
    id = crypto.randomUUID();
  other.requestId = other.action.id = id;
  const results = await Promise.allSettled([
    service.execute(request, "user-0"),
    service.execute(other, "user-0"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(store.rooms.get("ABCDEFGH").data.state.players[0].cash, 12000);
});
test("batch reuses membership, controller and lease checks", async () => {
  const { store, service, request } = await online();
  await assert.rejects(service.execute(request, "outsider"), /peserta/);
  store.edit("ABCDEFGH", (r) => (r.seats[1].connections = {}));
  await assert.rejects(service.execute(request, "user-0"), /dijeda|ditahan/);
  assert.equal(store.rooms.get("ABCDEFGH").data.state.version, 0);
});
test("offline session sends one batch, settles every asset at once and retains the ledger", async (t) => {
  const s = new GameSession({
    persist: async () => {},
    load: async () => null,
    mind: { dispose() {} },
  });
  t.after(() => s.dispose());
  s.screen = "gameplay";
  s.hidden = true;
  s.ingest(make(), { reset: true });
  s.setCovered(true, { assets: true });
  assert(await s.act("BUILD_BATCH", { group: 0, count: 6 }));
  assert.equal(s.state.version, 6);
  assert.equal(s.model.queue.filter((h) => h.finance).length, 1);
  assert.equal(s.view.players[0].cash, 12000);
  assert.equal(s.view.assets[1].level, 3);
  assert.equal(s.batchResult.count, 6);
});
test('legacy offline saves retain their own engine validation during a batch',()=>{
 const s=createLegacyGame({players:[{name:'Ayu',controller:'human'},{name:'Bima',controller:'human'}]},()=>.2);
 for(const tile of [1,3])s.assets[tile].owner=0;
 const next=commandBuildBatch(s,0,{type:'BUILD_BATCH',id:'legacy-batch',expectedVersion:s.version,group:0,count:4});
 let control=s;for(const tile of [1,3,1,3])control=command(control,0,{type:'BUILD',tile});
 assert.deepEqual(next.assets,control.assets);assert.deepEqual(next.players,control.players);assert.equal(next.schemaVersion,1);
});
