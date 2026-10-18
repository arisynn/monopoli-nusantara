import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { createGame } from "../lib/game.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const origin = process.env.MN_TEST_ORIGIN || "http://127.0.0.1:8787";
const browser = await chromium.launch({
    executablePath: process.env.MN_CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  }),
  checks = [],
  errors = [];
const transform = (p) =>
  p.locator(".board-view>svg>g").getAttribute("transform");
async function pageFor(reduced) {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      reducedMotion: reduced ? "reduce" : "no-preference",
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const s = createGame(
    {
      players: [
        { name: "Ayu", controller: "human" },
        { name: "Budi", controller: "human" },
      ],
      startingRoll: false,
    },
    () => 0.2,
  );
  s.players[0].pos = 9;
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(
    (s) =>
      localStorage.setItem(
        "nusantara-save-v1",
        JSON.stringify({ state: s, room: null }),
      ),
    s,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-action=resume]").click();
  await page.locator(".board-stage").waitFor();
  return { context, page };
}
try {
  const { context, page } = await pageFor(false);
  await page.evaluate(() => {
    document.querySelector("[data-action=camera]").click();
    document.querySelector("[data-action=menu]").click();
  });
  await page.locator("dialog[open]").waitFor();
  const paused = await transform(page);
  await page.waitForTimeout(350);
  assert.equal(await transform(page), paused);
  await page.locator(".popup-footer [data-action=close]").click();
  await page.waitForTimeout(350);
  assert.notEqual(await transform(page), paused);
  checks.push({
    name: "Popup freezes an in-progress camera transition; closing resumes to the correct target",
    passed: true,
  });
  const b = await page.locator(".board-stage").boundingBox();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6 - 60, b.y + b.height * 0.5 - 40, {
    steps: 5,
  });
  await page.mouse.up();
  assert.equal(
    await page.locator("[data-action=camera]").getAttribute("aria-pressed"),
    "false",
  );
  assert(
    (
      await page.locator("[data-action=camera]").getAttribute("aria-label")
    ).includes("manual"),
  );
  const manual = await transform(page);
  await page.waitForTimeout(350);
  assert.equal(await transform(page), manual);
  await page.locator("[data-action=camera]").click();
  await page.waitForTimeout(320);
  assert.equal(await transform(page), "translate(0 0) scale(0.39)");
  checks.push({
    name: "Drag cancels following, label reflects manual mode, and overview resumes only on explicit request",
    passed: true,
  });
  await context.close();
  const reduced = await pageFor(true);
  await reduced.page.locator("[data-action=camera]").click();
  const immediate = await transform(reduced.page);
  await reduced.page.waitForTimeout(350);
  assert.equal(await transform(reduced.page), immediate);
  await reduced.page.setViewportSize({ width: 430, height: 932 });
  await reduced.page.waitForTimeout(150);
  assert(!(await transform(reduced.page)).includes("NaN"));
  const inside = await reduced.page.locator('[data-pawn="0"]').evaluate((n) => {
    const r = n.getBoundingClientRect(),
      b = document.querySelector(".board-stage").getBoundingClientRect();
    return (
      r.x + r.width / 2 >= b.x &&
      r.x + r.width / 2 <= b.right &&
      r.y + r.height / 2 >= b.y &&
      r.y + r.height / 2 <= b.bottom
    );
  });
  assert(inside);
  checks.push({
    name: "Reduced motion applies camera changes immediately; resizing keeps the pawn visible",
    passed: true,
  });
  await reduced.context.close();
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  checks.push({ passed: false, error: error.stack });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL("../docs/CAMERA_BROWSER_RESULTS.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        limits: [
          "Local Chromium viewport emulation; not a physical-phone performance measurement.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.passed).length} camera browser scenarios passed.`,
);
