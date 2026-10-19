// Read-only deployed-renderer check. Fixtures exist only in this browser DOM.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { stockFixture } from "../tests/helpers/gameplay-update-fixtures.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const origin =
    process.env.MN_TEST_ORIGIN || "https://monopoli-nusantara-eight.vercel.app",
  folder = process.env.MN_BROWSER_OUTPUT || "/tmp/nusa-live-stock";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH,
  headless: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const checks = [],
  errors = [];
try {
  for (const width of [320, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: width === 320 ? 568 : 844 },
        serviceWorkers: "block",
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    for (const kind of ["house", "hotel"])
      for (const seat of [0, 1, 2]) {
        const result = await page.evaluate(
          async ({ state, seat }) => {
            const { renderPopup } = await import("/frontend/popups.mjs");
            const content = renderPopup(
              {
                view: state,
                state,
                seat,
                pending: false,
                paused: false,
                room: { seat },
              },
              {},
              { kind: "buildOffer" },
            );
            const dialog = document.querySelector("dialog"),
              template = document.createElement("template");
            template.innerHTML = content.html;
            const title = template.content.querySelector(".popup-title"),
              header = dialog.querySelector(".popup-header");
            header.replaceChildren(title);
            header.hidden = false;
            dialog.querySelector(".popup-body").innerHTML = template.innerHTML;
            dialog.querySelector(".popup-footer").innerHTML = content.footer;
            dialog.dataset.kind = "buildOffer";
            dialog.dataset.density = "compact";
            dialog.querySelector(".popup-dismiss").hidden = true;
            if (!dialog.open) dialog.showModal();
            return {
              text: dialog.textContent.trim(),
              buttons: [
                ...dialog.querySelectorAll("[data-type=BUILD_JOIN]"),
              ].map((n) => ({ tile: n.dataset.tile, label: n.textContent })),
              png: !!dialog.querySelector(
                'image[href="/assets/buildings/building-icons.png"]',
              ),
            };
          },
          { state: stockFixture(kind), seat },
        );
        assert(result.text.length > 60);
        assert(!result.text.includes("undefined"));
        assert(result.png);
        if (seat === 0) {
          assert.equal(result.buttons.length, 2);
          assert(
            result.buttons.some(
              (b) => b.tile === "1" && b.label.includes("Bogor"),
            ),
          );
        }
        if (seat === 1) {
          assert.equal(result.buttons.length, 0);
          assert(result.text.includes("Menunggu"));
        }
        checks.push({
          name: `Live ${kind} renderer ${width}px seat ${seat}: populated content and valid choices/waiting message`,
          passed: true,
          choices: result.buttons.length,
        });
        if (seat === 0)
          await page.screenshot({
            path: `${folder}/${kind}-${width}.png`,
            animations: "disabled",
          });
      }
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  checks.push({ passed: false, error: error.stack });
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL("../docs/LIVE_STOCK_RENDERER_RESULTS.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        origin,
        checks,
        errors,
        limits: [
          "Uses deployed JavaScript and CSS with deterministic DOM-only fixtures. Does not alter any live room or simulate a naturally depleted live game.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${checks.filter((c) => c.passed).length} deployed stock renderer scenarios passed.`,
);
