import { DECKS } from "../../lib/content.mjs";
import { createGame, command } from "../../lib/game.mjs";

export function tradeFixture({
  n = 3,
  to = 1,
  bot = false,
  mortgaged = false,
  cards = true,
  trade = {},
} = {}) {
  const s = createGame(
    {
      players: Array.from({ length: n }, (_, id) => ({
        name: `P${id}`,
        controller: bot && id === to ? "bot" : "human",
        botPersona: "raka",
      })),
      startingRoll: false,
    },
    () => 0.2,
  );
  s.phase = "end";
  for (const tile of [1, 3]) s.assets[tile].owner = 0;
  for (const tile of [6, 8]) s.assets[tile].owner = to;
  if (mortgaged) s.assets[6].mortgaged = true;
  if (cards) {
    // Exactly one publicly counted card each; its hidden deck identity is never in a receipt.
    for (const [id, deck] of [
      [0, "chance"],
      [to, "community"],
    ]) {
      const idx = DECKS[deck].findIndex((card) => card.jailCard);
      s.decks[deck] = s.decks[deck].filter((i) => i !== idx);
      s.players[id].cards.push({ deck, idx });
    }
  }
  return command(
    s,
    0,
    {
      type: "OFFER",
      trade: {
        to,
        give: [1],
        take: [6],
        giveCash: 300,
        takeCash: 150,
        giveCards: cards ? 1 : 0,
        takeCards: cards ? 1 : 0,
        ...trade,
      },
    },
    () => 0.2,
  );
}
