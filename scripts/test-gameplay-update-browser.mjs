import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  stockFixture,
  debtFixture,
} from "../tests/helpers/gameplay-update-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const origin = process.env.MN_TEST_ORIGIN || "http://127.0.0.1:8787",
  folder =
    process.env.MN_BROWSER_OUTPUT ||
    join(tmpdir(), "nusantara-gameplay-update");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [];
const read = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("nusantara-save-v1")).state,
  );
async function pageFor(width, height, state) {
  const context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: "block",
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.evaluate(
    (s) =>
      localStorage.setItem(
        "nusantara-save-v1",
        JSON.stringify({ state: s, room: null }),
      ),
    state,
  );
  await page.reload();
  await page.locator("[data-action=resume]").click();
  return { context, page };
}
async function fits(page, width, height) {
  await page
    .locator("dialog[open]")
    .evaluate((n) =>
      Promise.all(
        n
          .getAnimations({ subtree: true })
          .map((a) => a.finished.catch(() => {})),
      ),
    );
  const m = await page.locator("dialog[open]").evaluate((n) => {
    const r = n.getBoundingClientRect(),
      b = n.querySelector(".popup-body");
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      overflow: b.scrollWidth > b.clientWidth + 1,
      footer: n.querySelector(".popup-footer").getBoundingClientRect().bottom,
    };
  });
  assert(
    m.x >= 0 &&
      m.y >= 0 &&
      m.right <= width + 1 &&
      m.bottom <= height + 1 &&
      !m.overflow &&
      m.footer <= height + 1,
    JSON.stringify(m),
  );
}
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
  ]) {
    for (const kind of ["house", "hotel"]) {
      const { context, page } = await pageFor(
        width,
        height,
        stockFixture(kind),
      );
      await page.locator("dialog[open][data-kind=buildOffer]").waitFor();
      assert(
        (await page.locator(".popup-body").textContent()).includes(
          "Pilih tanah",
        ),
      );
      const choices = page.locator(
        ".building-stock-targets [data-type=BUILD_JOIN]",
      );
      assert.equal(await choices.count(), 2);
      assert((await choices.first().textContent()).includes("Bogor"));
      assert.equal(await choices.first().getAttribute("data-tile"), "1");
      await fits(page, width, height);
      await page.screenshot({
        path: join(folder, `stock-${kind}-${width}.png`),
      });
      await choices.first().click();
      await page.waitForFunction(() => {
        const s = JSON.parse(localStorage.getItem("nusantara-save-v1")).state;
        return (s.buildOffer?.targets[0] ?? s.auction?.targets?.[0]) === 1;
      });
      assert.equal((await read(page)).players[0].cash, 15000);
      checks.push({
        name: `${kind} stock popup ${width}: visible legal choices and numeric tile submission`,
        passed: true,
      });
      await context.close();
    }
    {
      const { context, page } = await pageFor(width, height, debtFixture());
      await page.locator("dialog[open][data-kind=debt]").waitFor();
      assert.equal(await page.locator("dialog [data-type=PAY]").count(), 0);
      await fits(page, width, height);
      await page.screenshot({ path: join(folder, `debt-${width}.png`) });
      await page.locator("[data-action=autoPayDebt]").click();
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("nusantara-save-v1")).state.phase !==
          "debt",
      );
      const s = await read(page);
      assert.equal(s.version, 3);
      assert.equal(s.players[0].cash, 200);
      assert.equal(s.players[1].cash, 15800);
      assert(
        s.assets[6].mortgaged &&
          s.assets[8].mortgaged &&
          !s.assets[1].mortgaged &&
          !s.assets[3].mortgaged,
      );
      checks.push({
        name: `Automatic rent payment ${width}: two reviewed mortgages and one payment`,
        passed: true,
      });
      await context.close();
    }
    {
      const s = debtFixture();
      s.phase = "roll";
      s.debt = null;
      s.players[0].cash = 15000;
      for (const tile of [11, 13, 14, 16, 18, 19, 21, 23])
        s.assets[tile].owner = 0;
      const { context, page } = await pageFor(width, height, s);
      await page.locator("[data-action=ownAssets]").click();
      assert.equal(await page.locator(".asset-tabs button").count(), 3);
      assert.equal(
        await page
          .locator("[name=mortgageTarget],[data-action=autoMortgage]")
          .count(),
        0,
      );
      const cols = await page
        .locator(".asset-list")
        .evaluate(
          (n) => getComputedStyle(n).gridTemplateColumns.split(" ").length,
        );
      assert.equal(cols, width >= 360 ? 2 : 1);
      await fits(page, width, height);
      await page.screenshot({ path: join(folder, `assets-${width}.png`) });
      await page.locator("[data-asset-key=tile-6] summary").click();
      await page
        .locator(
          "[data-asset-key=tile-6] [data-action=confirmAsset][data-type=MORTGAGE]",
        )
        .click();
      await page.locator(".asset-confirm [data-action=command]").click();
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("nusantara-save-v1")).state.assets[6]
            .mortgaged,
      );
      assert.equal((await read(page)).version, 1);
      await fits(page, width, height);
      checks.push({
        name: `Compact Assets ${width}: owned cards, manual mortgage, no retired auto-mortgage UI`,
        passed: true,
      });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ passed: false, error: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL("../docs/GAMEPLAY_UPDATE_BROWSER_RESULTS.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        limits: [
          "Local Chromium mobile emulation; no live Supabase or physical phone.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.passed).length} gameplay update browser scenarios passed.`,
);
