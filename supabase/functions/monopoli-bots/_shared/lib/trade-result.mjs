import { command } from "./game.mjs";

// Presentation adapter only: the official engine decides and transfers everything.
// Attach the final proposal to its confirmed public event before the existing commit.
export function commandWithTradeResult(before, actor, action, rng) {
  const next = command(before, actor, action, rng);
  if (
    next === before ||
    before.phase !== "trade" ||
    !before.trade ||
    !["TRADE_ACCEPT", "TRADE_REJECT"].includes(action.type)
  )
    return next;
  const event = next.log.find(
    (e) => e.type === "trade" && e.id > before.eventId,
  );
  if (!event) return next;
  const t = before.trade;
  const side = (ids, cash, cards) => ({
    properties: ids.map((tile) => ({
      tile,
      mortgaged: !!before.assets[tile].mortgaged,
    })),
    cash,
    cards,
  });
  const result = {
    schema: 1,
    id: `${next.matchId}:${event.id}`,
    eventId: event.id,
    version: next.version,
    round: event.turn,
    outcome:
      action.type === "TRADE_ACCEPT"
        ? "accepted"
        : actor === t.from
          ? "cancelled"
          : "rejected",
    actor,
    from: t.from,
    to: t.to,
    give: side(t.give, t.giveCash, t.giveCards),
    take: side(t.take, t.takeCash, t.takeCards),
  };
  next.log = next.log.map((e) =>
    e.id === event.id ? { ...e, tradeResult: result } : e,
  );
  return next;
}

// Imported local saves are untrusted. Never render arbitrary nested metadata.
export function eventTradeResult(state, event) {
  const r = event?.tradeResult;
  if (!r) return null;
  const player = (id) => Number.isInteger(id) && !!state.players[id];
  const amount = (n) => Number.isSafeInteger(n) && n >= 0;
  const side = (s) =>
    s &&
    amount(s.cash) &&
    amount(s.cards) &&
    s.cards <= 2 &&
    Array.isArray(s.properties) &&
    s.properties.length <= 28 &&
    s.properties.every(
      (p) =>
        Number.isInteger(p.tile) &&
        !!state.assets[p.tile] &&
        typeof p.mortgaged === "boolean",
    );
  if (
    !r ||
    event.type !== "trade" ||
    event.audience === "private" ||
    r.schema !== 1 ||
    r.id !== `${state.matchId}:${event.id}` ||
    r.eventId !== event.id ||
    !Number.isSafeInteger(r.version) ||
    r.version > state.version ||
    r.version < 0 ||
    !Number.isInteger(r.round) ||
    r.round < 1 ||
    !["accepted", "rejected", "cancelled"].includes(r.outcome) ||
    !player(r.from) ||
    !player(r.to) ||
    r.from === r.to ||
    ![r.from, r.to].includes(r.actor) ||
    (r.outcome === "accepted" && r.actor !== r.to) ||
    (r.outcome === "rejected" && r.actor !== r.to) ||
    (r.outcome === "cancelled" && r.actor !== r.from) ||
    !side(r.give) ||
    !side(r.take)
  )
    return null;
  const ids = [...r.give.properties, ...r.take.properties].map((p) => p.tile);
  if (new Set(ids).size !== ids.length) return null;
  // Return a whitelist, never an account ID, hidden card identity or raw proposal.
  const clean = (s) => ({
    cash: s.cash,
    cards: s.cards,
    properties: s.properties.map(({ tile, mortgaged }) => ({
      tile,
      mortgaged,
    })),
  });
  return {
    schema: 1,
    id: r.id,
    eventId: r.eventId,
    version: r.version,
    round: r.round,
    outcome: r.outcome,
    actor: r.actor,
    from: r.from,
    to: r.to,
    give: clean(r.give),
    take: clean(r.take),
  };
}

export const tradeResults = (state) =>
  (state?.log || []).map((e) => eventTradeResult(state, e)).filter(Boolean);
export const tradeResultTitle = (result) =>
  ({
    accepted: "Barter diterima",
    rejected: "Barter ditolak",
    cancelled: "Tawaran dibatalkan",
  })[result?.outcome] || "Hasil barter";
