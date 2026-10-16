// Device-local intentions only. Never included in snapshots, events or room broadcasts.
const STORAGE_KEY = "nusantara-trade-drafts-v1",
  LIMIT = 24;
const clone = (value) => structuredClone(value);
export function draftScope(state, room, seat, counter = false) {
  const identity = room?.userId || `local-${seat}`,
    trade = state.trade;
  const mode = counter
    ? JSON.stringify([
        trade?.from,
        trade?.to,
        trade?.give,
        trade?.take,
        trade?.giveCash,
        trade?.takeCash,
        trade?.giveCards,
        trade?.takeCards,
        state.log.find((e) => e.type === "trade")?.id,
      ])
    : "offer";
  return JSON.stringify([state.matchId, identity, seat, mode]) + ":";
}
export function emptyTrade(
  state,
  seat,
  to = state.players.find((p) => p.id !== seat && !p.out)?.id,
) {
  return {
    to,
    give: [],
    take: [],
    giveCash: 0,
    takeCash: 0,
    giveCards: 0,
    takeCards: 0,
  };
}
function normalize(record) {
  if (
    !record ||
    typeof record !== "object" ||
    !record.trade ||
    !Number.isInteger(record.trade.to) ||
    record.trade.to < 0 ||
    record.trade.to > 5
  )
    return null;
  const trade = { to: record.trade.to };
  for (const side of ["give", "take"]) {
    const ids = record.trade[side];
    if (
      !Array.isArray(ids) ||
      ids.length > 40 ||
      ids.some((n) => !Number.isInteger(n) || n < 0 || n > 39)
    )
      return null;
    trade[side] = [...new Set(ids)];
  }
  for (const field of ["giveCash", "takeCash", "giveCards", "takeCards"]) {
    const value = record.trade[field];
    if ((value === null || Number.isNaN(value)) && field.endsWith("Cash"))
      trade[field] = NaN;
    else if (Number.isSafeInteger(value) && value >= 0) trade[field] = value;
    else return null;
  }
  const inputs = {};
  for (const field of ["giveCash", "takeCash"])
    if (typeof record.inputs?.[field] === "string")
      inputs[field] = record.inputs[field].slice(0, 32);
  return { trade, inputs };
}
export class TradeDrafts {
  constructor(storage) {
    this.storage = storage;
    this.records = new Map();
    this.clock = 0;
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw?.length < 100000) {
        const data = JSON.parse(raw);
        if (data.version === 1 && Array.isArray(data.records))
          for (const item of data.records.slice(-LIMIT)) {
            const value = normalize(item);
            if (typeof item.key === "string" && item.key.length < 2000 && value)
              this.records.set(item.key, {
                ...value,
                updatedAt:
                  Number.isSafeInteger(item.updatedAt) && item.updatedAt >= 0
                    ? item.updatedAt
                    : 0,
              });
          }
      }
    } catch {}
  }
  read(key) {
    const value = this.records.get(key);
    return value ? clone(value) : null;
  }
  latest(scope) {
    return (
      [...this.records]
        .filter(([key]) => key.startsWith(scope))
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0]?.[0] || null
    );
  }
  write(key, record) {
    const value = normalize(record);
    if (!value) return false;
    this.records.delete(key);
    this.records.set(key, {
      ...value,
      updatedAt: (this.clock = Math.max(
        Date.now(),
        this.clock + 1,
        ...[...this.records.values()].map((r) => r.updatedAt + 1),
      )),
    });
    while (this.records.size > LIMIT)
      this.records.delete(this.records.keys().next().value);
    return this.flush();
  }
  remove(key) {
    this.records.delete(key);
    return this.flush();
  }
  flush() {
    try {
      this.storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          records: [...this.records].map(([key, value]) => ({ key, ...value })),
        }),
      );
      return !!this.storage;
    } catch {
      return false;
    }
  }
}
