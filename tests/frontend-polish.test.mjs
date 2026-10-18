import test from "node:test";
import assert from "node:assert/strict";
import { createGame, command, BOARD, money } from "../lib/game.mjs";
import { localPlayers } from "../lib/bot/personas.mjs";
import { rentLabel } from "../frontend/property-display.mjs";
import { playerAvatar } from "../frontend/art.mjs";
import { renderPopup } from "../frontend/popups.mjs";
import { moduleGraph, projectRoot } from "../scripts/module-graph.mjs";
import { resolve } from "node:path";
import { normalizeAmountInput } from "../frontend/number-input.mjs";

const setup = () =>
  createGame(
    { players: localPlayers("Ayu", 6), startingRoll: false },
    () => 0.2,
  );
const popup = (s, kind, ui = {}) =>
  renderPopup(
    { state: s, view: s, seat: 0, busy: false, pending: false, paused: false },
    ui,
    { kind },
  );

test("displayed rent follows purchases, full sets, construction and mortgage commands", () => {
  let s = setup();
  assert.equal(rentLabel(s, 1), "");
  for (const tile of [1, 3]) {
    s.phase = "buy";
    s.buy = tile;
    s = command(s, 0, { type: "BUY" });
    if (tile === 1) assert.equal(rentLabel(s, 1), money(BOARD[1].rents[0]));
  }
  assert.equal(rentLabel(s, 1), money(BOARD[1].rents[0] * 2));
  s = command(s, 0, { type: "BUILD", tile: 1 });
  assert.equal(rentLabel(s, 1), money(BOARD[1].rents[1]));
  s = command(s, 0, { type: "SELL_SET", tile: 1 });
  s = command(s, 0, { type: "MORTGAGE", tile: 1 });
  assert.equal(rentLabel(s, 1), money(0));
});

test("stations and utilities update their labels when another deed changes hands", () => {
  const s = setup();
  s.assets[5].owner = 0;
  s.assets[12].owner = 0;
  assert.equal(rentLabel(s, 5), money(250));
  assert.equal(rentLabel(s, 12), "4× dadu");
  s.assets[15].owner = 0;
  s.assets[28].owner = 0;
  assert.equal(rentLabel(s, 5), money(500));
  assert.equal(rentLabel(s, 12), "10× dadu");
  s.assets[12].mortgaged = true;
  assert.equal(rentLabel(s, 12), money(0));
  assert.equal(rentLabel(s, 12, { compact: true }), "₦ 0");
  assert.equal(rentLabel(s, 5, { compact: true }), "₦ 50");
  s.assets[39] = { owner: 0, level: 5, mortgaged: false };
  assert.equal(rentLabel(s, 39, { compact: true }), "₦ 2k");
  assert.equal(rentLabel(s, 39), "₦ 2.000");
  s.assets[31] = { owner: 0, level: 5, mortgaged: false };
  assert.equal(rentLabel(s, 31, { compact: true }), "₦ 1,2k");
});

test("amount editing removes leading zeros without rounding or losing partial decimals", () => {
  for (const [before, after] of [
    ["012", "12"],
    ["0012", "12"],
    ["000", "0"],
    ["000.5", "0.5"],
    ["00,5", "0,5"],
    ["0,", "0,"],
    ["0.", "0."],
    ["", ""],
    ["120", "120"],
    ["9007199254740993123", "9007199254740993123"],
  ]) {
    const input = {
      value: before,
      selectionStart: before.length,
      selectionEnd: before.length,
      setSelectionRange(start, end) {
        this.selectionStart = start;
        this.selectionEnd = end;
      },
    };
    normalizeAmountInput(input);
    assert.equal(input.value, after);
    assert.equal(input.selectionStart, after.length);
    assert.equal(input.selectionEnd, after.length);
  }
});

test("six players keep unique portraits across views and roster order", () => {
  const s = setup();
  for (const players of [s.players, [...s.players].reverse()]) {
    // Seat order is canonical, but persona identity never follows its array index.
    for (const p of s.players.filter((p) => p.controller === "bot"))
      assert(playerAvatar(p, players).includes(`${p.botPersona}.webp`));
  }
  assert.equal(
    new Set(s.players.map((p) => playerAvatar(p, s.players))).size,
    6,
  );
  assert(playerAvatar(s.players[0], s.players).includes("human.webp"));
  for (const p of s.players) delete p.botPersona;
  assert.equal(
    new Set(s.players.map((p) => playerAvatar(p, s.players))).size,
    6,
  );
});

test("assets and building panels contain only the viewed player's deeds", () => {
  const s = setup();
  s.assets[1].owner = 0;
  s.assets[3].owner = 1;
  s.assets[11].owner = 1;
  const before = JSON.stringify(s);
  const panel = popup(s, "assets"),
    build = popup(s, "assets", { assetTab: "build" });
  assert(panel.html.includes('data-asset-key="tile-1"'));
  assert(!panel.html.includes('data-asset-key="tile-3"'));
  assert(build.html.includes('data-group="0"'));
  assert(build.html.includes('data-development-tile="1"'));
  assert(!build.html.includes('data-development-tile="3"'));
  assert(!build.html.includes('data-group="2"'));
  assert.equal(JSON.stringify(s), before);
  s.assets[1].owner = 1;
  assert(
    popup(s, "assets", { assetTab: "build" }).html.includes(
      "Belum ada tanah milik Anda",
    ),
  );
});

test("trade card controls follow each side's inventory and stale selections remain removable", () => {
  const s = setup(),
    ui = {
      trade: {
        to: 1,
        give: [],
        take: [],
        giveCash: 0,
        takeCash: 0,
        giveCards: 0,
        takeCards: 0,
      },
    };
  let html = popup(s, "trade", ui).html;
  assert(!html.includes('name="giveCards"'));
  assert(!html.includes('name="takeCards"'));
  s.players[1].cards = [{ deck: "chance", idx: 0 }];
  html = popup(s, "trade", ui).html;
  assert(!html.includes('name="giveCards"'));
  assert(html.includes('name="takeCards"'));
  s.players[1].cards = [];
  ui.trade.takeCards = 1;
  assert(popup(s, "trade", ui).html.includes('name="takeCards"'));
});

test("build graphs include browser workers, omit unused helpers and preserve Edge types", async () => {
  const browser = await moduleGraph(["frontend/app.mjs"]);
  assert(browser.has(resolve(projectRoot, "lib/bot/mind.worker.mjs")));
  assert(![...browser.keys()].some((p) => p.includes("/lib/server/")));
  const edge = await moduleGraph(["lib/groq.ts"], { preserveTypes: true });
  assert(edge.has(resolve(projectRoot, "lib/bot/contracts.ts")));
  assert(
    edge
      .get(resolve(projectRoot, "lib/groq.ts"))
      .source.includes("import type"),
  );
});
