import { BOARD, redemption } from "../lib/game.mjs";
import { tradeDraftStatus } from "../lib/compact-ui.mjs";

// Display-only book-value comparison. Never used to authorize or submit a trade.
export function estimateTrade(state, trade, seat) {
  if (
    !state ||
    !trade ||
    !Number.isInteger(trade.from) ||
    !state.players[trade.from]
  )
    return null;
  const status = tradeDraftStatus(state, trade.from, trade);
  if (status.invalid || !status.hasValue) return null;
  const value = (ids, cash) =>
    ids.reduce((sum, id) => {
      const tile = BOARD[id],
        asset = state.assets[id];
      return (
        sum + Math.max(0, tile.price - (asset.mortgaged ? redemption(id) : 0))
      );
    }, cash);
  const give = value(trade.give, trade.giveCash),
    take = value(trade.take, trade.takeCash);
  const perspective = seat === trade.to ? trade.to : trade.from;
  const received = perspective === trade.to ? give : take;
  const given = perspective === trade.to ? take : give;
  return {
    perspective,
    received,
    given,
    delta: received - given,
    unpricedCards: trade.giveCards + trade.takeCards > 0,
    mortgaged: [...trade.give, ...trade.take].some(
      (id) => state.assets[id].mortgaged,
    ),
  };
}
