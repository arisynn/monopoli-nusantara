import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createGame, command, stock } from "../lib/game.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const origin = process.env.MN_TEST_ORIGIN || "http://127.0.0.1:8787";
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [];
await mkdir("docs/screenshots-ui-update", { recursive: true });
function auction(n = 4, bots = false) {
  let s = createGame(
    {
      players: Array.from({ length: n }, (_, i) => ({
        name: "P" + i,
        controller: bots && i ? "bot" : "human",
      })),
      startingRoll: false,
    },
    () => 0.2,
  );
  s.phase = "buy";
  s.buy = 13;
  return command(s, 0, { type: "AUCTION" });
}
async function pageFor(s, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    deviceScaleFactor: 1,
  });
  // Hold the idle scheduler, with explicit release for the incoming-bot test.
  await context.addInitScript(() => {
    const delay = setTimeout;
    window.auctionBotTimers = [];
    window.setTimeout = (fn, ms, ...args) => {
      if (ms !== 480) return delay(fn, ms, ...args);
      const timer = delay(fn, 60000, ...args);
      window.auctionBotTimers.push(() => {
        clearTimeout(timer);
        fn(...args);
      });
      return timer;
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(
    (state) =>
      localStorage.setItem(
        "nusantara-save-v1",
        JSON.stringify({ state, room: null, persistedAt: Date.now() }),
      ),
    s,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-action=resume]").click();
  await page.locator("dialog[data-kind=auction] .auction-leader").waitFor();
  return { context, page };
}
const read = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("nusantara-save-v1")).state,
  );
async function watch(page) {
  await page.evaluate(() => {
    window.auctionHidden = 0;
    const dialog = document.querySelector("dialog");
    new MutationObserver((records) => {
      for (const r of records)
        if (r.attributeName === "open" && !dialog.open) window.auctionHidden++;
    }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });
}
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 800 },
  ]) {
    for (const n of [2, 4, 6]) {
      const { context, page } = await pageFor(auction(n), viewport);
      assert.equal(
        await page
          .locator("dialog .animal-avatar, dialog .auction-people")
          .count(),
        0,
      );
      assert.equal(await page.locator(".auction-leader").count(), 1);
      assert.equal(
        await page
          .locator("dialog")
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      const b = await page.locator("dialog").boundingBox();
      assert(
        b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.width <= viewport.width + 1 &&
          b.y + b.height <= viewport.height + 1,
      );
      assert(
        await page
          .locator(".popup-body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      const footer = await page.locator(".popup-footer").boundingBox();
      assert(footer.y + footer.height <= viewport.height + 1);
      if (n === 4 && [320, 390].includes(viewport.width))
        await page.screenshot({
          path: `docs/screenshots-ui-update/auction-${viewport.width}.png`,
          animations: "disabled",
        });
      checks.push({
        name: `${n} participants ${viewport.width}: fixed leader panel, no portraits or motion`,
        passed: true,
      });
      await context.close();
    }
  }
  for (const mode of ["human-reentry", "bot-reentry"]) {
    let s = auction(4, true);
    if (mode === "human-reentry") s = command(s, 0, { type: "PASS" });
    else for (const id of [1, 2, 3]) s = command(s, id, { type: "PASS" });
    const { context, page } = await pageFor(s);
    assert(await page.locator("[data-action=bid]").isEnabled());
    await page.locator("[data-action=bid]").click();
    await page.waitForFunction(
      (v) =>
        JSON.parse(localStorage.getItem("nusantara-save-v1")).state.version > v,
      s.version,
    );
    const next = await read(page);
    assert.equal(next.auction.highest, 0);
    assert.equal(next.auction.amount, 50);
    assert.deepEqual(next.auction.passed, []);
    checks.push({ name: mode, passed: true });
    await context.close();
  }
  {
    const { context, page } = await pageFor(auction(4, true));
    await page.locator("[name=bid]").evaluate((el) => {
      window.originalBidInput = el;
      window.originalLeader = document.querySelector(".auction-leader");
    });
    const initial = await page.locator(".popup-footer").boundingBox();
    for (const value of ["4", "5.1", "1501", ""]) {
      await page.locator("[name=bid]").fill(value);
      await page.waitForFunction(
        () => document.querySelector("[data-action=bid]").disabled,
      );
      assert.equal(await page.locator("[name=bid]").inputValue(), value);
      assert(
        await page.evaluate(
          () =>
            window.originalBidInput === document.querySelector("[name=bid]"),
        ),
      );
      const footer = await page.locator(".popup-footer").boundingBox();
      assert(
        Math.abs(initial.y - footer.y) < 1,
        "Validation shifted the footer",
      );
    }
    await page.locator('[data-action=bidStep][data-amount="50"]').click();
    assert.equal(await page.locator("[name=bid]").inputValue(), "5");
    await page.locator("[name=bid]").fill("12");
    const before = await read(page);
    await page.waitForFunction(() => window.auctionBotTimers.length > 0);
    await page.evaluate(() => window.auctionBotTimers.shift()());
    await page.waitForFunction(
      (v) =>
        JSON.parse(localStorage.getItem("nusantara-save-v1")).state.version > v,
      before.version,
    );
    await page.waitForFunction(
      () => document.querySelector(".auction-price").textContent !== "₦ 0",
    );
    assert.equal(await page.locator("[name=bid]").inputValue(), "12");
    assert(
      await page.evaluate(
        () =>
          window.originalBidInput === document.querySelector("[name=bid]") &&
          window.originalLeader === document.querySelector(".auction-leader"),
      ),
    );
    assert(
      await page
        .locator("[name=bid]")
        .evaluate((el) => el === document.activeElement),
    );
    const after = await page.locator(".popup-footer").boundingBox();
    assert(
      Math.abs(initial.y - after.y) < 1,
      "Incoming bid shifted the footer",
    );
    checks.push({
      name: "Invalid bids blocked; real bot update preserves raw input, focus, DOM nodes and panel positions",
      passed: true,
    });
    await context.close();
  }
  {
    let s = auction(2);
    s = command(s, 1, { type: "BID", amount: 100 });
    const { context, page } = await pageFor(s);
    await watch(page);
    await page.locator("[data-type=PASS]").click();
    await page
      .locator("dialog[data-kind=auction] [name=bid]:disabled")
      .waitFor();
    await page.locator("dialog[data-kind=event] .result-hero").waitFor();
    assert.equal(await page.evaluate(() => window.auctionHidden), 0);
    const done = await read(page);
    assert.equal(done.players[1].cash, s.players[1].cash - 100);
    assert.equal(done.assets[13].owner, 1);
    assert.equal(
      await page
        .locator("dialog")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    checks.push({
      name: "Winning payment keeps dialog open, charges once, and shows a still result",
      passed: true,
    });
    await context.close();
  }
  {
    let s = createGame(
      {
        players: [0, 1, 2].map((i) => ({ name: "P" + i, controller: "human" })),
        startingRoll: false,
      },
      () => 0.2,
    );
    for (const id of [13, 15])
      s.assets[id] = { owner: 0, level: 0, mortgaged: false };
    s.players[0].cash = 0;
    s.phase = "debt";
    s.debt = { from: 0, to: null, amount: 500000, label: "Bank" };
    s.bank = stock(s);
    s = command(s, 0, { type: "BANKRUPT" });
    s = command(s, 2, { type: "BID", amount: 100 });
    const { context, page } = await pageFor(s);
    await page.locator("[name=bid]").fill("999");
    await watch(page);
    await page.locator("[data-type=PASS]").click();
    await page.locator("dialog[data-kind=event] .result-hero").waitFor();
    assert.equal(await page.evaluate(() => window.auctionHidden), 0);
    await page.locator("[data-action=dismissEvent]").click();
    await page
      .locator(
        'dialog[data-kind=auction] [data-action=certificate][data-id="15"]',
      )
      .waitFor();
    assert.equal(await page.locator("[name=bid]").inputValue(), "5");
    assert.equal(await page.evaluate(() => window.auctionHidden), 0);
    checks.push({
      name: "Bankruptcy auction chain stays open and resets input to the new opening minimum",
      passed: true,
    });
    await context.close();
  }
  {
    const { context, page } = await pageFor(auction());
    const normalized = await page.evaluate(async () => {
      const { decorateCurrency } = await import("/frontend/currency-view.mjs");
      const root = document.createElement("div");
      root.innerHTML = 'NUSA · N 15 · ₦ 20<input value="N 15">';
      decorateCurrency(root);
      return {
        text: root.textContent,
        input: root.querySelector("input").value,
      };
    });
    assert.equal(normalized.text, "NUSA · ₦ 15 · ₦ 20");
    assert.equal(normalized.input, "N 15");
    checks.push({
      name: "Naira symbol normalizes older currency text while preserving NUSA and input values",
      passed: true,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `${checks.length} auction layout/rules/input/transition scenarios passed.`,
  );
} catch (e) {
  checks.push({ passed: false, error: e.stack });
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    "docs/AUCTION_BROWSER_RESULTS.json",
    JSON.stringify(
      {
        checks,
        errors,
        limits: [
          "Local engine/save and real bot worker in Chromium; not a live online room.",
          "Bot idle scheduling is held in fixtures and explicitly released for the incoming-bid check.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
