import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { staticResponse } from "../adapters/node/static.mjs";
import { createOnlineService } from "../lib/server/online-service.mjs";
import { MemoryOnlineStore } from "../tests/helpers/online-store.mjs";
import { stockFixture } from "../tests/helpers/gameplay-update-fixtures.mjs";
import { createGame } from "../lib/game.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const folder = process.env.MN_BROWSER_OUTPUT || "/tmp/nusa-online-room";
await mkdir(folder, { recursive: true });
const store = new MemoryOnlineStore(),
  service = createOnlineService({ store, botsEnabled: true, rng: () => 0.2 }),
  tokens = new Map(),
  sockets = new Set();
let onlineBots = false,
  origin;
function notify() {
  for (const s of sockets) {
    const row = store.rooms.get(s.code);
    if (row?.data.seats.some((m) => m.userId === s.user))
      s.socket.send(
        JSON.stringify({
          topic: "realtime:mn-room:" + s.code,
          event: "postgres_changes",
          payload: { data: { revision: row.revision } },
        }),
      );
  }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    let response;
    if (url.pathname === "/api/bot")
      response = Response.json({ configured: false });
    else if (url.pathname === "/api/auth") {
      const id = crypto.randomUUID(),
        access_token = "qa-session-" + crypto.randomUUID();
      tokens.set(access_token, id);
      response = Response.json({
        access_token,
        refresh_token: "qa-refresh",
        expires_in: 3600,
        user: { id, is_anonymous: true },
      });
    } else if (url.pathname === "/api/online") {
      if (url.searchParams.has("config"))
        response = Response.json({
          online: true,
          onlineBots,
          url: origin,
          key: "public-qa-key",
        });
      else {
        const user = tokens.get(req.headers.authorization?.slice(7));
        assert(user, "Issued test identity required");
        if (url.searchParams.has("diagnostics"))
          response = Response.json({
            onlineBots,
            capabilities: {
              schemaVersion: 6,
              lobbyManagement: true,
              workerConfigured: true,
              schedulerConfigured: true,
            },
          });
        else if (req.method === "POST") {
          let b = "";
          for await (const part of req) b += part;
          response = Response.json(await service.execute(JSON.parse(b), user));
          notify();
        } else
          response = Response.json(
            await service.read(url.searchParams.get("code"), user),
          );
      }
    } else response = await staticResponse(new Request(url));
    response ||= new Response("Not found", { status: 404 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(error.status || 400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message, code: error.code }));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [],
  contexts = [];
async function client(name, width) {
  const context = await browser.newContext({
    viewport: { width, height: width === 320 ? 568 : 844 },
    serviceWorkers: "block",
  });
  contexts.push(context);
  await context.addInitScript(
    (name) => localStorage.setItem("nusantara-player-name", name),
    name,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.routeWebSocket("**/realtime/v1/websocket*", (socket) => {
    let entry;
    socket.onMessage((message) => {
      const m = JSON.parse(message);
      if (m.event === "phx_join") {
        entry = {
          socket,
          code: m.topic.split(":").at(-1),
          user: tokens.get(m.payload.access_token),
        };
        sockets.add(entry);
        socket.send(
          JSON.stringify({
            topic: m.topic,
            event: "phx_reply",
            ref: m.ref,
            payload: { status: "ok" },
          }),
        );
      }
    });
    socket.onClose(() => sockets.delete(entry));
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[data-action=onlineEntry]").click();
  await page.locator("[data-action=auth]").click();
  await page.locator("[data-action=guest]").click();
  await page.locator("dialog[data-kind=onlineEntry]").waitFor();
  return page;
}
async function close(page) {
  await page
    .locator("dialog[open] [data-action=close]:visible")
    .first()
    .click();
}
async function join(page, code) {
  await page.locator("[data-action=onlineTab][data-value=join]").click();
  await page.locator("[name=joinCode]").fill(code);
  await page.locator("[data-action=enterRoom]").click();
  await page.locator(".room-code").waitFor();
}
async function account(page) {
  return page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("nusantara-save-v1"));
    return (
      c?.room?.userId ||
      JSON.parse(localStorage.getItem("nusantara-auth:" + location.origin)).user
        .id
    );
  });
}
async function fits(page, width) {
  await page
    .locator("dialog[open]")
    .evaluate((n) =>
      Promise.all(
        n
          .getAnimations({ subtree: true })
          .map((a) => a.finished.catch(() => {})),
      ),
    );
  const bounds = await page.locator("dialog").evaluate((n) => {
    const r = n.getBoundingClientRect(),
      body = n.querySelector(".popup-body");
    return {
      x: r.x,
      right: r.right,
      y: r.y,
      bottom: r.bottom,
      overflow: body.scrollWidth > body.clientWidth + 1,
      height: innerHeight,
    };
  });
  assert(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.right <= width + 1 &&
      bounds.bottom <= bounds.height &&
      !bounds.overflow,
    JSON.stringify(bounds),
  );
}
async function fixture(pages, kind) {
  const users = await Promise.all(pages.map(account));
  const call = (i, type, data = {}) =>
    service.execute(
      {
        type,
        clientId: "fixture-client-" + i,
        requestId: crypto.randomUUID(),
        ...data,
      },
      users[i],
    );
  const r = await call(0, "CREATE", { name: "Host", capacity: 6 });
  for (let i = 1; i < 3; i++)
    await call(i, "JOIN", { code: r.code, name: "Guest " + i });
  const row = await store.get(r.code);
  row.data.status = "playing";
  row.data.state = stockFixture(kind);
  await store.commit(row, row.data);
  for (let i = 0; i < 3; i++) {
    await pages[i].evaluate(
      ({ code, userId, seat }) =>
        localStorage.setItem(
          "nusantara-save-v1",
          JSON.stringify({
            state: null,
            room: { code, userId, seat, provider: "supabase" },
            persistedAt: Date.now() + 1000,
          }),
        ),
      { code: r.code, userId: users[i], seat: i },
    );
    await pages[i].reload({ waitUntil: "networkidle" });
    await pages[i].locator("[data-action=resume]").click();
    await pages[i].locator(".board-stage").waitFor();
  }
  return r.code;
}
try {
  for (const width of [320, 390]) {
    onlineBots = false;
    const host = await client("QA Host", width);
    await host.locator("[data-action=enterRoom]").click();
    await host.locator(".room-code").waitFor();
    const code = await host.locator(".room-code b").textContent();
    const guest = await client("QA Guest", width),
      third = await client("QA Third", width);
    await join(guest, code);
    await join(third, code);
    await host
      .locator(".lobby-player")
      .filter({ hasText: "QA Third" })
      .waitFor();
    await host.locator("[data-action=addBotPopup]").click();
    assert(
      (await host.locator("dialog").textContent()).includes("belum aktif"),
    );
    await fits(host, width);
    onlineBots = true;
    await host.locator("[data-action=retryOnline]").click();
    await host.locator("[data-action=pickBotOnline]").click();
    await host
      .locator("[data-action=chooseBotPersona][data-value=nusa]")
      .click();
    await host.locator("[data-action=addBot]").click();
    await guest.locator(".lobby-player").filter({ hasText: "NUSA" }).waitFor();
    checks.push({
      name: `${width}: bot disabled has clear status; refresh enables NUSA selection and synchronizes roster`,
      passed: true,
    });
    await guest.locator("[data-action=room]").first().click();
    assert.equal(await guest.locator("[data-action=kickPlayer]").count(), 0);
    await close(guest);
    await host.locator("[data-action=room]").first().click();
    await fits(host, width);
    await host.screenshot({
      path: `${folder}/room-host-${width}.png`,
      animations: "disabled",
    });
    await host
      .locator(".room-member")
      .filter({ hasText: "QA Third" })
      .locator("[data-action=kickPlayer]")
      .click();
    await host.locator("[data-action=kickMember]").click();
    await third
      .locator("[data-action=onlineEntry]")
      .waitFor({ timeout: 15000 });
    assert.equal(await third.locator(".room-code").count(), 0);
    checks.push({
      name: `${width}: host-only kick, confirmation and kicked-client recovery to main lobby`,
      passed: true,
    });
    await close(host);
    await host
      .locator(".room-lobby-actions [data-action=leaveRoomConfirm]")
      .click();
    await host.locator("[data-action=leaveRoom]").click();
    await host.locator("[data-action=onlineEntry]").waitFor();
    await guest.locator(".lobby-player").filter({ hasText: "HOST" }).waitFor();
    await guest.locator("[data-action=room]").first().click();
    await guest
      .locator(".room-member")
      .filter({ hasText: "NUSA" })
      .locator("[data-action=kickPlayer]")
      .click();
    await guest.locator("[data-action=kickMember]").click();
    await close(guest);
    await guest
      .locator(".room-lobby-actions [data-action=leaveRoomConfirm]")
      .click();
    await guest.locator("[data-action=leaveRoom]").click();
    await guest.locator("[data-action=onlineEntry]").waitFor();
    assert((await store.get(code)).data.closed);
    checks.push({
      name: `${width}: leave frees seat, transfers host, removes bot and closes last-human lobby`,
      passed: true,
    });
    await host.locator("[data-action=onlineEntry]").click();
    await host.locator("[data-action=enterRoom]").click();
    const activeCode = await host.locator(".room-code b").textContent();
    await guest.locator("[data-action=onlineEntry]").click();
    await join(guest, activeCode);
    await host.locator("[data-action=ready]").click();
    await guest.locator("[data-action=ready]").click();
    await host.locator("[data-action=startRoom]:enabled").click();
    await guest.locator(".board-stage").waitFor();
    const row = await store.get(activeCode);
    row.data.state = createGame(
      { players: row.data.seats, startingRoll: false },
      () => 0.2,
    );
    row.data.state.players[0].pos = 9;
    await store.commit(row, row.data);
    notify();
    await host.waitForFunction(() =>
      document
        .querySelector("[data-action=primary]")
        ?.textContent.includes("Lempar dadu"),
    );
    await host.locator("[data-action=camera]").click();
    await host.waitForTimeout(320);
    const pawnBefore = await host
      .locator('[data-pawn="0"]')
      .getAttribute("transform");
    await host.locator("[data-action=primary]:enabled").click();
    await host.waitForFunction(
      (before) =>
        document.querySelector('[data-pawn="0"]')?.getAttribute("transform") !==
        before,
      pawnBefore,
    );
    const samples = await host.evaluate(
      () =>
        new Promise((resolve) => {
          const out = [],
            start = performance.now();
          const frame = () => {
            const world = document.querySelector(".board-view>svg>g"),
              pawn = document.querySelector('[data-pawn="0"]'),
              r = pawn.getBoundingClientRect(),
              b = document
                .querySelector(".board-stage")
                .getBoundingClientRect();
            out.push({
              camera: world.getAttribute("transform"),
              inside:
                r.x + r.width / 2 >= b.x - 2 &&
                r.x + r.width / 2 <= b.right + 2 &&
                r.y + r.height / 2 >= b.y - 2 &&
                r.y + r.height / 2 <= b.bottom + 2,
            });
            if (performance.now() - start > 500) resolve(out);
            else requestAnimationFrame(frame);
          };
          frame();
        }),
    );
    assert(new Set(samples.map((s) => s.camera)).size > 3);
    assert(samples.every((s) => s.inside));
    checks.push({
      name: `${width}: camera zoom transitions and follows pawn continuously across a corner`,
      passed: true,
      distinctCameraFrames: new Set(samples.map((s) => s.camera)).size,
    });
    await host.waitForTimeout(1000);
    if (await host.locator("dialog[open]").count()) await close(host);
    await host.locator("[data-action=menu]").click();
    await host.locator(".popup-footer [data-action=lobby]").click();
    await host.locator(".lobby").waitFor();
    assert.equal((await store.get(activeCode)).data.status, "paused");
    const version = (await store.get(activeCode)).data.state.version;
    await host.locator("[data-action=resume]").click();
    await host.locator(".board-stage").waitFor();
    assert.equal((await store.get(activeCode)).data.state.version, version);
    checks.push({
      name: `${width}: gameplay return releases lease, pauses room and resumes without replay`,
      passed: true,
    });
    for (const kind of ["house", "hotel"]) {
      await fixture([host, guest, third], kind);
      await host.locator("dialog[data-kind=buildOffer]").waitFor();
      await fits(host, width);
      assert.equal(
        await host
          .locator(".building-stock-targets [data-type=BUILD_JOIN]")
          .count(),
        2,
      );
      assert(
        (await host.locator(".popup-body").textContent()).includes("Bogor"),
      );
      assert(
        (await guest.locator(".popup-body").textContent()).includes("Menunggu"),
      );
      await host.screenshot({
        path: `${folder}/online-stock-${kind}-${width}.png`,
        animations: "disabled",
      });
      await host
        .locator(".building-stock-targets [data-type=BUILD_JOIN]")
        .first()
        .click();
      if (await third.locator("[data-type=BUILD_DECLINE]").count())
        await third.locator("[data-type=BUILD_DECLINE]").click();
      checks.push({
        name: `${width}: online ${kind} stock popup has names, PNG art, waiting text and legal choice`,
        passed: true,
      });
    }
    for (const c of contexts.splice(0)) await c.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ passed: false, error: error.stack });
  console.error(error);
  process.exitCode = 1;
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({
        path: `${folder}/failure-${i}.png`,
        animations: "disabled",
      })
      .catch(() => {});
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    new URL("../docs/ONLINE_ROOM_BROWSER_RESULTS.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        limits: [
          "Local HTTP and real application/service; Auth and Realtime revision hints use isolated contract doubles. Actual live human-room results are recorded separately. Stock states are isolated fixtures; production data is not modified.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.passed).length} online room browser scenarios passed.`,
);
