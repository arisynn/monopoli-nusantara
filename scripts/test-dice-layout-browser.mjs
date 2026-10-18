import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGame } from "../lib/game.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const origin = process.env.MN_TEST_ORIGIN || "http://127.0.0.1:8787";
const folder =
  process.env.MN_BROWSER_OUTPUT || join(tmpdir(), "nusantara-dice-layout");
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [];
const views = [
  [320, 568, 6],
  [360, 640, 4],
  [390, 844, 4],
  [430, 932, 6],
  [576, 1024, 4],
  [740, 360, 4],
  [844, 390, 6],
  [1280, 800, 6],
];
try {
  for (const [width, height, count] of views) {
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        serviceWorkers: "block",
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() === 404) errors.push(r.url());
    });
    const personas = ["nusa", "kresna", "apex", "bima", "sari"];
    const state = createGame(
      {
        players: [
          { name: "Joy", controller: "human" },
          ...personas
            .slice(0, count - 1)
            .map((id) => ({
              name: id === "apex" ? "ARKA" : id.toUpperCase(),
              controller: "bot",
              botPersona: id,
            })),
        ],
        startingRoll: false,
      },
      () => 0.2,
    );
    for (const [tile, owner] of [
      [1, 0],
      [3, 0],
      [6, 1],
      [8, 1],
      [9, 1],
    ])
      state.assets[tile].owner = owner;
    state.log.unshift({
      id: ++state.eventId,
      type: "dice",
      dice: [5, 6],
      actor: 0,
      version: 0,
      turn: 1,
      audience: "public",
      text: "Lemparan terakhir 5 + 6",
    });
    state.log.unshift({
      id: ++state.eventId,
      type: "trade",
      actor: 2,
      version: 0,
      turn: 1,
      audience: "public",
      text: "Tawaran KRESNA kepada Joy ditolak.",
    });
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
    await page.locator(".board-stage").waitFor();
    await page
      .locator(".die-face")
      .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
    const metrics = await page.evaluate(() => {
      const box = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      return {
        dice: box(".dice-tray"),
        die: box(".die"),
        info: box(".gameplay-info"),
        activity: box(".activity"),
        console: box(".action-console"),
        action: box(".roll-button"),
        quick: box(".quick-actions"),
        board: box(".board-stage"),
        columns: getComputedStyle(
          document.querySelector(".console-row"),
        ).gridTemplateColumns.split(" ").length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        parent: document.querySelector(".dice-tray").parentElement.className,
        visibleImages: [...document.querySelectorAll(".die")].map((d) =>
          [...d.querySelectorAll("img")]
            .filter((img) => getComputedStyle(img).opacity === "1")
            .map((img) => Number(img.dataset.face)),
        ),
        transparent: [
          ...document.querySelectorAll(".die:first-child img"),
        ].every((img) => {
          const canvas = document.createElement("canvas");
          canvas.width = 192;
          canvas.height = 192;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, 1, 1).data[3] === 0;
        }),
      };
    });
    assert.equal(metrics.parent, "gameplay-info");
    assert.equal(metrics.columns, 2);
    assert(!metrics.overflow);
    assert(metrics.dice.x >= metrics.activity.right - 1);
    assert(metrics.dice.bottom <= metrics.console.y + 1);
    assert(metrics.die.width >= 48);
    assert.deepEqual(metrics.visibleImages, [[5], [6]]);
    assert(
      metrics.transparent,
      "Dice PNG must preserve actual alpha transparency",
    );
    assert(metrics.action.width > metrics.quick.width + 25);
    assert(metrics.action.right <= width + 1);
    assert(Math.abs(metrics.board.width - metrics.board.height) < 1);
    if (width <= 576 && width < height) {
      assert(metrics.console.bottom <= height + 1);
      assert(metrics.board.width >= width - 2);
    }
    await page.screenshot({
      path: join(folder, `${width}x${height}-${count}.png`),
    });
    checks.push({
      name: `Dice above extended action ${width}x${height}, ${count} players`,
      passed: true,
      metrics,
    });
    await context.close();
  }
  let bytes = 0;
  for (let face = 1; face <= 6; face++) {
    const png = await readFile(
      new URL(`../public/assets/dice/die-${face}.png`, import.meta.url),
    );
    assert.equal(png.readUInt32BE(16), 192);
    assert.equal(png.readUInt32BE(20), 192);
    bytes += png.length;
  }
  assert(bytes < 80000);
  checks.push({
    name: "Six 192px PNG faces below 80 KB total",
    passed: true,
    bytes,
  });
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ passed: false, error: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL("../docs/DICE_LAYOUT_BROWSER_RESULTS.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        checks,
        errors,
        limits: [
          "Chromium mobile emulation, not physical phone performance measurements.",
          "Presentation fixtures show a previous dice roll; no game rule or RNG is changed.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.passed).length} dice layout scenarios passed.`,
);
