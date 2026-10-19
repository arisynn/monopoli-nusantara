import test from "node:test";
import assert from "node:assert/strict";
import {
  DiceAudit,
  diceStatistics,
  chiSquareP,
  wilson,
} from "../lib/dice-audit.mjs";
import { diceLogExport } from "../frontend/dice-log.mjs";
test("36 equally weighted pairs give the exact expected middle sum and double frequency", () => {
  const rows = Array.from({ length: 360 }, (_, id) => ({
    match: "test",
    id,
    dice: [1 + Math.floor((id % 36) / 6), 1 + (id % 6)],
  }));
  const s = diceStatistics(rows);
  assert.equal(s.sum6to8.rate, 16 / 36);
  assert.equal(s.doubles.rate, 1 / 6);
  assert.equal(s.tests.pairsUniform.statistic, 0);
  assert.equal(s.tests.pairsUniform.p, 1);
  assert(s.sum6to8.ci95[0] < 16 / 36 && s.sum6to8.ci95[1] > 16 / 36);
  assert.equal(chiSquareP(0, 5), 1);
  assert(Math.abs(chiSquareP(3.841458820694124, 1) - 0.05) < 1e-8);
  assert.equal(wilson(0, 0), null);
});
test("overlapping snapshots, opening ties and utility rolls do not double count a match/event", () => {
  const a = new DiceAudit(),
    s = {
      matchId: "one",
      players: [
        { id: 0, name: "Ayu", controller: "human" },
        { id: 1, name: "Bot", controller: "bot" },
      ],
      log: [
        { id: 1, type: "start" },
        { id: 2, type: "dice", actor: 0, diceKind: "opening", dice: [1, 2] },
        {
          id: 3,
          type: "dice",
          text: "Nilai tertinggi seri; peserta seri melempar ulang.",
        },
        { id: 4, type: "jail", actor: 1 },
        { id: 5, type: "dice", actor: 1, diceKind: "movement", dice: [3, 3] },
        { id: 6, type: "release", actor: 1 },
        { id: 7, type: "dice", actor: 1, diceKind: "utility", dice: [4, 5] },
      ],
    };
  a.ingest(s);
  a.ingest({ state: s });
  a.ingest(s.log.map((e) => ({ ...e, matchId: "one" })));
  const r = a.result();
  assert.equal(r.overall.rolls, 3);
  assert.equal(r.duplicates, 14);
  assert.equal(r.conflicts, 0);
  assert.equal(r.byKind.jail.rolls, 1);
  assert.equal(r.byKind.utility.rolls, 1);
  assert.equal(r.byRole.human.rolls, 1);
  assert.equal(r.byRole.bot.rolls, 2);
  assert.equal(r.tieMessages, 1);
});
test("same IDs in different matches remain independent; bad pairs and conflicting records are reported", () => {
  const a = new DiceAudit();
  a.ingest([
    { matchId: "a", id: 1, type: "dice", dice: [2, 5] },
    { matchId: "b", id: 1, type: "dice", dice: [1, 6] },
    { matchId: "a", id: 2, type: "dice", dice: [0, 7] },
    { matchId: "a", id: 1, type: "dice", dice: [6, 6] },
  ]);
  const r = a.result();
  assert.equal(r.overall.rolls, 2);
  assert.equal(r.conflicts, 1);
  assert.equal(r.invalid, 1);
  assert.equal(r.unknownJailContext, 2);
  assert.equal(r.overall.tests.pairsUniform.p, null);
});
test("public dice export contains only a labeled log window, without hidden state, finance or account identity", () => {
  const source = {
    matchId: "game",
    version: 3,
    schemaVersion: 2,
    decks: { secret: [1, 2] },
    seen: ["private-command"],
    players: [
      {
        id: 0,
        name: "Ayu",
        controller: "human",
        userId: "private-user",
        cash: 999,
      },
    ],
    log: [
      {
        id: 1,
        type: "dice",
        dice: [3, 4],
        actor: 0,
        finance: [{ secret: true }],
      },
      { id: 2, type: "dice", dice: [6, 6], audience: "private" },
    ],
  };
  const exported = diceLogExport(source),
    text = JSON.stringify(exported);
  assert(!text.includes("secret"));
  assert(!text.includes("private-user"));
  assert(!text.includes("private-command"));
  assert(!text.includes("999"));
  assert.equal(exported.state.log.length, 1);
  const a = new DiceAudit();
  a.ingest(exported);
  assert.equal(a.result().overall.rolls, 1);
  assert(exported.source.includes("truncated"));
});
