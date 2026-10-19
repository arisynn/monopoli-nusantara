import { command } from "./game.mjs";

// Transport/presentation metadata only. The protected engine still owns every
// validation, transfer, memory update and version increment.
export function commandWithTradeResult(input, actor, action, rng) {
  const next = command(input, actor, action, rng);
  if (next === input || next.version === input.version) return next;
  const resolved = ["TRADE_ACCEPT", "TRADE_REJECT"].includes(action.type);
  const offered = ["OFFER", "COUNTER"].includes(action.type);
  const trade = resolved ? input.trade : offered ? next.trade : null;
  if (!trade) return next;
  const event = next.log.find(
    (e) => e.id > input.eventId && e.type === "trade",
  );
  if (!event) return next;
  const offer = input.log.find((e) => e.type === "trade")?.tradeOffer;
  const snapshot = {
    from: trade.from,
    to: trade.to,
    give: trade.give.map((tile) => ({
      tile,
      mortgaged: !!input.assets[tile]?.mortgaged,
    })),
    take: trade.take.map((tile) => ({
      tile,
      mortgaged: !!input.assets[tile]?.mortgaged,
    })),
    giveCash: trade.giveCash,
    takeCash: trade.takeCash,
    giveCards: trade.giveCards,
    takeCards: trade.takeCards,
  };
  const metadata = resolved
    ? {
        tradeResult: {
          ...snapshot,
          offerId:
            offer?.from === trade.from && offer?.to === trade.to
              ? offer.id
              : `${input.matchId}:offer:${input.eventId}`,
          status:
            action.type === "TRADE_ACCEPT"
              ? "accepted"
              : actor === trade.from
                ? "cancelled"
                : "rejected",
          actor,
        },
      }
    : { tradeOffer: { ...snapshot, id: `${input.matchId}:offer:${event.id}` } };
  next.log = next.log.map((e) =>
    e.id === event.id ? { ...e, ...metadata } : e,
  );
  return next;
}
