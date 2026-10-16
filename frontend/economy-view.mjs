import { money } from "../lib/content.mjs";
import {
  financeRows,
  financeLabels,
  transactionDeltas,
} from "../lib/finance.mjs";

// Derived solely from committed public logs. No balance differencing or money mutation.
export function publicEvents(state) {
  const seen = new Set();
  return (state?.log || []).filter((e) => {
    if (e.audience === "private") return false;
    const key = e.id === undefined ? e : `${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function playerLedger(state, player) {
  return publicEvents(state).flatMap((e) =>
    financeRows(e, state.players)
      .filter((row) => row.player === player)
      .map((row) => ({
        ...row,
        turn: e.turn,
        description: row.text.slice(0, row.text.lastIndexOf(": ")),
      })),
  );
}
export function activitySummary(state, head = null) {
  const source =
    head?.kind !== "diceRolling" && head?.source?.audience !== "private"
      ? head?.source
      : null;
  const events = publicEvents(state),
    event = head?.finance
      ? { ...source, finance: [head.finance] }
      : events.find((e) => e.finance?.length),
    rows = event ? financeRows(event, state.players) : [];
  return {
    action: source?.text || events[0]?.text || "Petualangan dimulai.",
    money: rows.length
      ? rows
          .map(
            (r) =>
              `${state.players[r.player]?.name || "Pemain"} ${r.amount > 0 ? "+" : "−"} ${money(Math.abs(r.amount))}`,
          )
          .join(" · ") +
        " · " +
        (financeLabels[rows[0].kind] || "Transaksi")
      : "Belum ada transaksi Nusa.",
    id: event?.id ?? null,
  };
}
export function capsuleFeedback(head, player) {
  const t = head?.finance;
  if (!t) return null;
  const amount = transactionDeltas(t).find(
    (row) => row.player === player,
  )?.amount;
  return amount === undefined
    ? null
    : {
        id: head.id,
        amount,
        label: `${amount > 0 ? "+" : "−"} ${money(Math.abs(amount))} · ${financeLabels[t.kind] || "Transaksi"}`,
      };
}
