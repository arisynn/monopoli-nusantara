import test from "node:test";
import assert from "node:assert/strict";
import { command, GROUPS, buildTargets, BOARD } from "../lib/game.mjs";
import { renderPopup } from "../frontend/popups.mjs";
import { stockFixture } from "./helpers/gameplay-update-fixtures.mjs";
const popup = (s, seat = 0) =>
  renderPopup(
    { state: s, view: s, seat, pending: false, paused: false },
    {},
    { kind: "buildOffer" },
  );
for (const kind of ["house", "hotel"])
  test(`${kind} shortage popup shows real tile names, numeric IDs and legal choices`, () => {
    const s = stockFixture(kind);
    assert.equal(s.phase, "buildOffer");
    assert.equal(s.buildOffer.kind, kind);
    const p = popup(s);
    assert(p.html.includes("building-stock-notice"));
    assert(p.html.includes("building-icons.png"));
    assert(!p.html.includes("undefined"));
    assert(!p.html.includes('data-tile=""'));
    for (const id of buildTargets(s, 0, kind)) {
      assert(p.html.includes(BOARD[id].name));
      assert(p.html.includes(`data-tile="${id}"`));
      assert.doesNotThrow(() =>
        command(s, 0, { type: "BUILD_JOIN", tile: id }),
      );
    }
    assert(p.footer.includes("BUILD_DECLINE"));
  });
test("stock popup keeps useful content for waiting, stale and no-longer-eligible states", () => {
  const s = stockFixture();
  const waiting = popup(s, 1);
  assert(waiting.html.includes("Menunggu"));
  assert(!waiting.footer.includes("BUILD_DECLINE"));
  for (const id of GROUPS[0].ids) s.assets[id].mortgaged = true;
  assert(popup(s).html.includes("Tidak ada tanah"));
  s.buildOffer = null;
  assert(popup(s).html.includes("sudah selesai"));
});
