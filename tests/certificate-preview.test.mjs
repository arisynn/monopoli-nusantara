import test from "node:test";
import assert from "node:assert/strict";
import { createGame, command, BOARD, stock } from "../lib/game.mjs";
import { renderPopup } from "../frontend/popups.mjs";
const state = () =>
  createGame(
    {
      players: ["Jovan", "Sari"].map((name) => ({ name, controller: "human" })),
      startingRoll: false,
    },
    () => 0.2,
  );
const session = (s) => ({
  view: s,
  state: s,
  seat: 0,
  pending: false,
  paused: false,
  busy: false,
});
for (const tile of [11, 5, 12, 28])
  test(`certificate summary ${tile} uses rulepack values, labeled price and a read-only detail control`, () => {
    const s = state();
    s.assets[tile] = { owner: 1, level: 0, mortgaged: false };
    const snapshot = JSON.stringify(s);
    const result = renderPopup(
      session(s),
      {},
      {
        kind: "settlement",
        transaction: { kind: "rent", from: 0, to: 1, tile, amount: 100 },
      },
    );
    assert(result.html.includes(`data-action="certificate" data-id="${tile}"`));
    assert(result.html.includes("mini-deed-paper"));
    assert(!result.html.includes("region-art"));
    assert(result.html.includes("Sewa dibayar"));
    assert(result.html.includes("Pembayaran sudah tercatat."));
    assert(!result.html.includes("disahkan engine"));
    const label =
      BOARD[tile].type === "city"
        ? "Harga tanah"
        : BOARD[tile].type === "station"
          ? "Harga stasiun"
          : "Harga utilitas";
    assert(result.html.includes(label));
    assert.equal(JSON.stringify(s), snapshot);
    assert(!result.footer.includes("data-type="));
    assert(result.footer.includes("dismissEvent"));
    const detail = renderPopup(
      session(s),
      {},
      { kind: "property", id: tile, preview: true },
    );
    assert(detail.html.includes('class="deed"'));
    assert(detail.footer.includes("Kembali"));
    assert(!detail.footer.includes("manage"));
    assert(!detail.footer.includes("data-type="));
  });
test("the mini deed displays actual city rents, mortgage state and escaped ownership", () => {
  const s = state();
  s.players[1].name = "<Sari>";
  s.assets[11] = { owner: 1, level: 0, mortgaged: true };
  const r = renderPopup(
    session(s),
    {},
    {
      kind: "settlement",
      transaction: { kind: "rent", tile: 11, from: 0, to: 1, amount: 100 },
    },
  );
  assert(r.html.includes("Milik &lt;Sari&gt; · Digadai"));
  assert(r.html.includes("₦ 10"));
  assert(r.html.includes("₦ 50"));
  assert(r.html.includes("Gadai"));
  assert(r.html.includes("₦ 70"));
});
test("all shared property summary consumers render the same certificate control", () => {
  let s = state();
  s.phase = "buy";
  s.buy = 11;
  s = command(s, 0, { type: "AUCTION" });
  assert(
    renderPopup(session(s), {}, { kind: "auction" }).html.includes(
      'data-action="certificate"',
    ),
  );
  s = state();
  s.assets[11] = { owner: 0, level: 0, mortgaged: true };
  s.phase = "mortgage";
  s.mortgageDecision = { tile: 11, player: 0 };
  assert(
    renderPopup(session(s), {}, { kind: "mortgage" }).html.includes(
      'data-action="certificate"',
    ),
  );
  for (const type of ["MORTGAGE", "SELL_SET"]) {
    s.assets[11].mortgaged = false;
    s.bank = stock(s);
    const r = renderPopup(
      session(s),
      {},
      { kind: "confirmAsset", id: 11, type },
    );
    assert(r.html.includes('data-action="certificate"'));
    assert(r.footer.includes(`data-type="${type}"`));
  }
});
test("trade draft and incoming offer show property values, mortgage costs and read-only certificate links", () => {
  let s = state();
  s.assets[11] = { owner: 0, level: 0, mortgaged: false };
  s.assets[5] = { owner: 1, level: 0, mortgaged: true };
  const ui = {
    trade: {
      to: 1,
      give: [11],
      take: [5],
      giveCash: 123,
      takeCash: 0,
      giveCards: 0,
      takeCards: 0,
    },
    tradeInputs: { giveCash: "12.3" },
  };
  const before = JSON.stringify(ui);
  const draft = renderPopup(session(s), ui, { kind: "trade" });
  for (const text of [
    "Harga beli",
    "Nilai gadai",
    "Nilai beli aset",
    "Jika diterima".toLowerCase(),
    "bunga ₦ 10 atau tebus ₦ 110",
  ])
    assert(draft.html.includes(text), text);
  assert(draft.html.includes('data-action="certificate" data-id="11"'));
  assert(draft.html.includes('data-action="tradeRemove"'));
  assert.equal(JSON.stringify(ui), before);
  s = command(s, 0, { type: "OFFER", trade: ui.trade });
  const incoming = renderPopup(
    { ...session(s), seat: 1 },
    {},
    { kind: "tradeIncoming" },
  );
  assert(incoming.html.includes("trade-property-detail"));
  assert(incoming.html.includes("Harga beli"));
  assert(!incoming.html.includes("tradeRemove"));
  assert(incoming.footer.includes("TRADE_ACCEPT"));
});
test("picker hides developed assets but preserves stale selections for removal", () => {
  const s = state();
  s.assets[11] = { owner: 0, level: 2, mortgaged: false };
  const ui = {
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
  const hidden = renderPopup(session(s), ui, {
    kind: "picker",
    owner: 0,
    side: "give",
  });
  assert(!hidden.html.includes('data-id="11"'));
  assert(hidden.html.includes("Belum ada properti"));
  ui.trade.give = [11];
  const selected = renderPopup(session(s), ui, {
    kind: "picker",
    owner: 0,
    side: "give",
  });
  assert(selected.html.includes('data-action="certificate" data-id="11"'));
  assert(selected.html.includes("Jual bangunan kelompok dahulu"));
  assert(selected.html.includes("checked"));
  assert(!selected.html.match(/name="tradeAsset"[^>]*disabled/));
});
