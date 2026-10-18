import { createGame, command, GROUPS, stock } from "../../lib/game.mjs";
export const debtFixture = () => {
  const s = createGame(
    {
      players: [
        { name: "Joy", controller: "human" },
        { name: "NUSA", controller: "bot", botPersona: "nusa" },
      ],
      startingRoll: false,
    },
    () => 0.2,
  );
  for (const id of [1, 3, 6, 8]) s.assets[id].owner = 0;
  s.players[0].cash = 0;
  s.phase = "debt";
  s.debt = { from: 0, to: 1, amount: 800, label: "Sewa" };
  return s;
};

export function stockFixture(kind = "house") {
  let s = createGame(
    {
      players: [0, 1, 2].map((id) => ({
        name: "Pemain " + id,
        controller: "human",
      })),
      startingRoll: false,
    },
    () => 0.2,
  );
  for (const group of GROUPS)
    for (const id of group.ids)
      s.assets[id].owner =
        group === GROUPS[0] ? 0 : group === GROUPS[1] ? 1 : 2;
  if (kind === "house") {
    for (const group of [GROUPS[2], GROUPS[3]])
      for (const id of group.ids) s.assets[id].level = 4;
    for (const id of GROUPS[4].ids) s.assets[id].level = 2;
    s.assets[26].level = 1;
  } else {
    for (const id of [...GROUPS[0].ids, ...GROUPS[1].ids])
      s.assets[id].level = 4;
    for (const group of [GROUPS[2], GROUPS[3], GROUPS[4], GROUPS[7]])
      for (const id of group.ids) s.assets[id].level = 5;
  }
  s.turn = 1;
  s.bank = stock(s);
  s = command(s, 1, { type: "BUILD", tile: 6 });
  return s;
}
