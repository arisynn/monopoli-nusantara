import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { createGame, command } from "../lib/game.mjs";
import { PERSONAS } from "../lib/bot/personas.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.MN_BROWSER_MODULE || "playwright",
);
const browser = await chromium.launch({
  executablePath: process.env.MN_CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const origin = process.env.MN_TEST_ORIGIN || "http://127.0.0.1:8787",
  checks = [],
  errors = [];
const fixture = (persona) => {
  const s = createGame(
    {
      players: [
        {
          name: persona.name,
          controller: "bot",
          botPersona: persona.id,
          botDifficulty: "hardcore",
        },
        { name: "Human", controller: "human" },
      ],
      startingRoll: false,
      matchId: "browser-" + persona.id,
    },
    () => 0.2,
  );
  s.phase = "buy";
  s.buy = 13;
  return command(s, 0, { type: "AUCTION" });
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  for (const persona of PERSONAS) {
    const s = fixture(persona),
      before = JSON.stringify(s);
    const plan = await page.evaluate(
      (state) =>
        new Promise((resolve, reject) => {
          const worker = new Worker("/lib/bot/mind.worker.mjs", {
            type: "module",
          });
          const timer = setTimeout(() => {
            worker.terminate();
            reject(Error("Worker did not reply"));
          }, 8000);
          worker.onmessage = (e) => {
            clearTimeout(timer);
            worker.terminate();
            e.data.error ? reject(Error(e.data.error)) : resolve(e.data.plan);
          };
          worker.onerror = (e) => {
            clearTimeout(timer);
            worker.terminate();
            reject(Error(e.message));
          };
          worker.postMessage({
            id: 1,
            state,
            actor: 0,
            options: { timeBudgetMs: 100 },
          });
        }),
      s,
    );
    assert(plan.action);
    command(s, 0, plan.action);
    assert.equal(JSON.stringify(s), before);
    assert(plan.foundation);
    if (persona.id === "nusa") assert.equal(plan.diagnostics.version, "18.0.0");
    checks.push({
      name: `Real browser worker ${persona.id}`,
      passed: true,
      model: plan.diagnostics.model,
      action: plan.action.type,
    });
  }
  const cancellation = await page.evaluate(async (state) => {
    const { createMindClient } = await import("/lib/bot/mind-client.mjs");
    const client = createMindClient(),
      abort = new AbortController();
    const cancelled = client.decide(state, 0, { signal: abort.signal });
    abort.abort();
    const first = await cancelled;
    const second = await client.decide(state, 0);
    client.dispose();
    return { first, model: second?.diagnostics.model, action: second?.action };
  }, fixture(PERSONAS[3]));
  assert.equal(cancellation.first, null);
  assert.equal(cancellation.model, "NUSA-V18.0-SINGULARITY");
  assert(cancellation.action);
  checks.push({
    name: "Cancelled browser worker restarts and returns a fresh V18 decision",
    passed: true,
  });
  await context.close();
  const app = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await app.addInitScript(() => {
    window.botModels = [];
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (e) => {
          if (e.data.plan?.diagnostics)
            window.botModels.push(e.data.plan.diagnostics.model);
        });
      }
    };
  });
  const appPage = await app.newPage();
  appPage.on("pageerror", (e) => errors.push(e.message));
  await appPage.goto(origin);
  const state = createGame(
    {
      players: [
        { name: "Human", controller: "human" },
        {
          name: "NUSA",
          controller: "bot",
          botPersona: "nusa",
          botDifficulty: "hardcore",
        },
      ],
      startingRoll: false,
      matchId: "app-v18",
    },
    () => 0.2,
  );
  state.turn = 1;
  state.phase = "buy";
  state.buy = 13;
  await appPage.evaluate(
    (s) =>
      localStorage.setItem(
        "nusantara-save-v1",
        JSON.stringify({ state: s, room: null, persistedAt: Date.now() }),
      ),
    state,
  );
  await appPage.reload();
  await appPage.locator("[data-action=resume]").click();
  await appPage.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("nusantara-save-v1")).state.assets[13]
        .owner === 1,
    {},
    { timeout: 15000 },
  );
  const saved = await appPage.evaluate(
    () => JSON.parse(localStorage.getItem("nusantara-save-v1")).state,
  );
  assert.equal(saved.players[1].cash, 13600);
  assert(
    await appPage.evaluate(() =>
      window.botModels.includes("NUSA-V18.0-SINGULARITY"),
    ),
  );
  checks.push({
    name: "App resumes a NUSA turn, runs V18 in worker and commits its purchase once",
    passed: true,
  });
  await app.close();
  assert.deepEqual(errors, []);
  console.log(`${checks.length} browser foundation/V18 scenarios passed.`);
} catch (e) {
  checks.push({ passed: false, error: e.stack });
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    "docs/BOT_FOUNDATION_BROWSER_RESULTS.json",
    JSON.stringify(
      {
        checks,
        errors,
        limits: [
          "Chromium browser, real local worker and saved-game UI; no live Supabase room.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
