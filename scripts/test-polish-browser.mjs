import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createGame, stock } from "../lib/game.mjs";
import { validateLocalState } from "../lib/save-format.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const origin = process.env.MN_TEST_ORIGIN || "http://127.0.0.1:8787";
const folder = process.env.MN_BROWSER_OUTPUT || "/tmp/nusa-polish-qa";
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [];
await mkdir(folder, { recursive: true });
function fixture(n = 6, owned = true) {
  const s = createGame(
    {
      players: Array.from({ length: n }, (_, id) => ({
        name: id === 0 ? "Ayu" : "Pemain " + (id + 1),
        controller: "human",
      })),
      startingRoll: false,
      matchId: "polish-" + n,
    },
    () => 0.2,
  );
  if (owned) {
    for (const id of [1, 3])
      s.assets[id] = { owner: 0, level: 2, mortgaged: false };
    for (const id of [6, 8, 9])
      s.assets[id] = { owner: 1, level: 0, mortgaged: false };
    for (const id of [31, 32, 34])
      s.assets[id] = { owner: 1, level: 5, mortgaged: false };
    s.assets[5].owner = 1;
    s.assets[12].owner = 1;
    s.assets[11] = { owner: 0, level: 0, mortgaged: true };
  }
  s.bank = stock(s);
  assert(validateLocalState(s));
  return s;
}
async function pageFor(viewport, state) {
  const context = await browser.newContext({
      viewport,
      serviceWorkers: "block",
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() === 404) errors.push("404 " + r.url());
  });
  await page.goto(origin);
  await page.evaluate(
    (s) =>
      localStorage.setItem(
        "nusantara-save-v1",
        JSON.stringify({ state: s, room: null, persistedAt: Date.now() }),
      ),
    state,
  );
  await page.reload();
  await page.locator("[data-action=resume]").click();
  await page.locator(".board-stage").waitFor();
  return { context, page };
}
const settle = (page) =>
  page
    .locator("dialog[open]")
    .evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .map((a) => a.finished.catch(() => {})),
      ),
    );
async function popupBounds(page, viewport) {
  await settle(page);
  const b = await page.locator("dialog").boundingBox();
  assert(
    b.x >= 0 &&
      b.x + b.width <= viewport.width + 1 &&
      b.y >= 0 &&
      b.y + b.height <= viewport.height,
    JSON.stringify(b),
  );
  assert(b.height <= viewport.height * 0.8 + 2);
  assert(await page.locator(".popup-footer button").last().isVisible());
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const overflow = await page
    .locator(".popup-body")
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  assert(!overflow, "Popup horizontal overflow");
  return b;
}
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    for (const n of [2, 4, 6]) {
      const { context, page } = await pageFor(viewport, fixture(n));
      assert.equal(
        new Set(
          await page
            .locator(".players .avatar")
            .evaluateAll((ns) => ns.map((n) => n.style.backgroundImage)),
        ).size,
        n,
      );
      assert.equal(
        await page.locator('[data-tile="13"] .tile-rent').count(),
        0,
      );
      assert.equal(
        await page.locator('[data-tile="1"] .tile-rent').textContent(),
        "₦ 30",
      );
      assert.equal(
        await page.locator('[data-tile="11"] .tile-rent').textContent(),
        "₦ 0",
      );
      assert.equal(
        await page.locator('[data-tile="12"] .tile-rent').textContent(),
        "4× dadu",
      );
      assert.equal(
        await page
          .locator('[data-tile="1"] .property-buildings')
          .getAttribute("aria-label"),
        "2 rumah",
      );
      assert.equal(
        await page
          .locator('[data-tile="31"] .property-buildings')
          .getAttribute("aria-label"),
        "Hotel",
      );
      assert.equal(await page.locator(".tile-owner-badge").count(), 0);
      assert.equal(await page.locator(".property-buildings text").count(), 0);
      assert.equal(
        await page.locator('[data-tile="1"] .tile-face rect').count(),
        0,
      );
      assert(
        (
          await page.locator('[data-tile="1"] .tile-rent').textContent()
        ).includes("₦"),
      );
      assert.equal(
        await page.locator('[data-tile="31"] .tile-rent').textContent(),
        "₦ 1,2k",
      );
      assert.equal(
        await page.locator('[data-tile="1"] .building-image').count(),
        2,
      );
      assert(
        (
          await page.locator(".players strong").first().textContent()
        ).startsWith("₦"),
      );
      if (viewport.width === 390 && n === 6)
        await page.screenshot({
          path: folder + "/board-390.png",
          animations: "disabled",
        });
      await page.locator("[data-action=ownAssets]").click();
      const bounds = await popupBounds(page, viewport);
      assert.equal(
        await page.locator('.asset-item[data-asset-key^="tile-"]').count(),
        3,
      );
      assert.equal(await page.locator('[data-asset-key="tile-6"]').count(), 0);
      if (viewport.width === 390 && n === 6)
        await page.screenshot({
          path: folder + "/assets-390.png",
          animations: "disabled",
        });
      await page.locator(".asset-tabs [data-value=build]").click();
      assert.equal(await page.locator(".development-group").count(), 2);
      assert.equal(await page.locator(".development-row").count(), 3);
      assert.equal(
        await page.locator('[data-development-tile="3"]').count(),
        1,
      );
      assert.equal(
        await page.locator('[data-development-tile="6"]').count(),
        0,
      );
      await popupBounds(page, viewport);
      if (viewport.width === 390 && n === 6)
        await page.screenshot({
          path: folder + "/build-390.png",
          animations: "disabled",
        });
      await page.locator(".popup-dismiss").click();
      await page.locator(".quick-actions [data-action=trade]").click();
      await popupBounds(page, viewport);
      assert.equal(await page.locator(".trade-cards").count(), 0);
      await page.locator("[name=giveCash]").fill("12.3");
      await page.locator("[data-action=tradePicker][data-side=take]").click();
      assert.equal(
        await page.locator('[name=tradeAsset][value="31"]').count(),
        0,
      );
      await page.locator('[name=tradeAsset][value="6"]').check();
      await page.locator("[data-action=pickerDone]").click();
      assert.equal(await page.locator("[name=giveCash]").inputValue(), "12.3");
      await page.locator('[data-action=certificate][data-id="6"]').click();
      await popupBounds(page, viewport);
      await page.locator(".popup-dismiss").click();
      assert.equal(await page.locator("[name=giveCash]").inputValue(), "12.3");
      assert.equal(
        await page.locator('[data-action=tradeRemove][data-id="6"]').count(),
        1,
      );
      await settle(page);
      if (viewport.width === 390 && n === 6)
        await page.screenshot({
          path: folder + "/trade-390.png",
          animations: "disabled",
        });
      checks.push({
        name: "Responsive board, owned assets, compact trade and preserved draft",
        viewport,
        n,
        bounds,
        passed: true,
      });
      await context.close();
    }
  }
  {
    const { context, page } = await pageFor(
      { width: 390, height: 844 },
      fixture(),
    );
    await page.locator(".quick-actions [data-action=trade]").click();
    const cash = page.locator("[name=giveCash]");
    assert.equal(await cash.getAttribute("type"), "text");
    assert.equal(await cash.getAttribute("inputmode"), "decimal");
    assert.equal(await cash.getAttribute("enterkeyhint"), "done");
    await cash.focus();
    await page.keyboard.type("12");
    assert.equal(await cash.inputValue(), "12");
    await cash.fill("0012");
    assert.equal(await cash.inputValue(), "12");
    await cash.fill("000");
    assert.equal(await cash.inputValue(), "0");
    await cash.fill("00,5");
    assert.equal(await cash.inputValue(), "0,5");
    await cash.fill("0.");
    await page.keyboard.type("5");
    assert.equal(await cash.inputValue(), "0.5");
    await cash.fill("");
    assert.equal(await cash.inputValue(), "");
    await cash.fill("012.3");
    assert.equal(await cash.inputValue(), "12.3");
    await page.locator("[data-action=saveTradeDraft]").click();
    await page.locator("[data-action=ownAssets]").click();
    assert.equal(
      await page.locator(".asset-tabs [data-value=auto]").count(),
      0,
    );
    assert.equal(await page.locator(".asset-tabs button").count(), 3);
    await page.locator(".popup-dismiss").click();
    const numeric = await page.evaluate(async () => {
      const { createGame, command } = await import("/lib/game.mjs");
      const { renderPopup } = await import("/frontend/popups.mjs");
      let s = createGame(
        { players: [{ name: "Ayu" }, { name: "Raka" }], startingRoll: false },
        () => 0.2,
      );
      s.phase = "buy";
      s.buy = 1;
      s = command(s, 0, { type: "AUCTION" });
      const template = document.createElement("template");
      template.innerHTML = renderPopup(
        {
          state: s,
          view: s,
          seat: 0,
          pending: false,
          paused: false,
          busy: false,
        },
        {},
        { kind: "auction" },
      ).html;
      const input = template.content.querySelector("[name=bid]");
      return {
        mode: input.inputMode,
        type: input.type,
        hint: input.enterKeyHint,
        pattern: input.pattern,
      };
    });
    assert.deepEqual(numeric, {
      mode: "numeric",
      type: "text",
      hint: "done",
      pattern: "[0-9]*",
    });
    checks.push({
      name: "Native number keyboard hints, zero replacement, pasted amounts and stable mortgage input",
      passed: true,
    });
    await context.close();
  }
  // A real DOM update must retain the focused cash node and its caret, even if card controls appear.
  {
    const { context, page } = await pageFor(
      { width: 390, height: 844 },
      fixture(),
    );
    const result = await page.evaluate(async (state) => {
      const { renderPopup } = await import("/frontend/popups.mjs");
      const { updateTradeBody } = await import("/frontend/trade-view.mjs");
      const { enhanceSelections } = await import("/frontend/selections.mjs");
      const ui = {
        trade: {
          to: 1,
          give: [],
          take: [],
          giveCash: 123,
          takeCash: 0,
          giveCards: 0,
          takeCards: 0,
        },
        tradeInputs: { giveCash: "12.3" },
      };
      const session = {
        view: state,
        state,
        seat: 0,
        busy: false,
        pending: false,
        paused: false,
      };
      const root = document.createElement("div");
      root.style =
        "position:fixed;top:0;left:0;width:360px;height:260px;overflow:auto;background:white;z-index:100";
      document.body.append(root);
      root.innerHTML = renderPopup(session, ui, { kind: "trade" }).html;
      enhanceSelections(root);
      const input = root.querySelector("[name=giveCash]");
      input.focus();
      input.setSelectionRange(2, 3);
      root.scrollTop = 30;
      const scroll = root.scrollTop;
      state.players[1].cards = [{ deck: "chance", idx: 0 }];
      const patched = updateTradeBody(
        root,
        renderPopup(session, ui, { kind: "trade" }).html,
      );
      const result = {
        patched,
        same: input === root.querySelector("[name=giveCash]"),
        focused: document.activeElement === input,
        value: input.value,
        start: input.selectionStart,
        end: input.selectionEnd,
        scroll: root.scrollTop === scroll,
        cards: !!root.querySelector("[name=takeCards]"),
      };
      root.remove();
      return result;
    }, fixture());
    assert.deepEqual(result, {
      patched: true,
      same: true,
      focused: true,
      value: "12.3",
      start: 2,
      end: 3,
      scroll: true,
      cards: true,
    });
    checks.push({
      name: "Trade revision preserves input node, focus, caret, raw value and scroll",
      passed: true,
    });
    const motion = await page.evaluate(async (state) => {
      const { BoardView } = await import("/frontend/board.mjs");
      const root = document.createElement("div");
      root.style = "position:fixed;left:-2000px;width:400px;height:400px";
      root.innerHTML = "<svg><g></g></svg>";
      document.body.append(root);
      const board = new BoardView(
        root,
        () => {},
        () => {},
      );
      board.update(state, null, {});
      const initial = root.getAnimations({ subtree: true }).length;
      const next = structuredClone(state);
      next.version++;
      next.assets[13].owner = 0;
      board.update(next, null, {});
      const acquired = root.getAnimations({ subtree: true }).length;
      board.update(next, null, {});
      const repeated = root.getAnimations({ subtree: true }).length;
      const last = structuredClone(next);
      last.version++;
      last.assets[13].owner = 1;
      board.update(last, null, { reduced: true });
      const reduced = root.getAnimations({ subtree: true }).length;
      board.dispose();
      root.remove();
      return { initial, acquired, repeated, reduced };
    }, fixture());
    assert.deepEqual(motion, {
      initial: 0,
      acquired: 1,
      repeated: 1,
      reduced: 0,
    });
    checks.push({
      name: "Ownership animation runs on transfer, never on initial load or reduced motion",
      passed: true,
    });
    await context.close();
  }
  {
    const { context, page } = await pageFor(
      { width: 320, height: 568 },
      fixture(2, false),
    );
    assert.equal(await page.locator(".tile-rent").count(), 0);
    assert(
      (
        await page.locator('[data-tile="4"] .tile-price').textContent()
      ).includes("₦ 200"),
    );
    await page.locator("[data-action=ownAssets]").click();
    assert.equal(await page.locator(".asset-item").count(), 0);
    await page.locator(".asset-tabs [data-value=build]").click();
    assert(
      (await page.locator(".popup-body").textContent()).includes(
        "Belum ada tanah milik Anda",
      ),
    );
    checks.push({
      name: "New game hides property amounts and handles empty portfolio",
      passed: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`${checks.length} polish browser scenarios passed.`);
} catch (error) {
  checks.push({ name: "Browser failure", passed: false, error: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    "docs/FRONTEND_POLISH_BROWSER.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        screenshots: folder,
        limits: [
          "Chromium viewport emulation; not physical Android/iOS.",
          "Trade revisions are exercised in the real DOM; no live Supabase service contacted.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
