import { analyzeState } from "../lib/bot/analysis.mjs";
import { rescuePlan, mortgageSubset } from "../lib/bot/liquidation.mjs";
import { GROUPS } from "../lib/content.mjs";
import { strategyView } from "../lib/bot/memory.mjs";
const cache = new WeakMap();
export function debtAdvice(state, seat) {
  if (state?.phase !== "debt" || state.debt?.from !== seat) return null;
  const key = JSON.stringify([
    state.version,
    state.debt,
    state.players.map((p) => [p.cash, p.out]),
    state.assets,
  ]);
  const previous = cache.get(state);
  if (previous?.key === key) return previous.value;
  const view = strategyView(state, seat),
    amount = state.debt.amount;
  const analysis = analyzeState(view, seat, {
    fast: true,
    publicOpponent: true,
  });
  const protectedSet = new Set(
    GROUPS.filter((g) =>
      g.ids.every((id) => view.assets[id].owner === seat),
    ).flatMap((g) => g.ids),
  );
  const outside = mortgageSubset(view, seat, amount, analysis, {
    maxStates: 4096,
    allowTile: (id) => !protectedSet.has(id),
  });
  const result =
    state.players[seat].cash >= amount
      ? { path: [], raised: 0, complete: true }
      : outside ||
        rescuePlan(view, seat, analysis, { maxNodes: 80, timeBudgetMs: 40 });
  const value = result
    ? {
        available: true,
        actions: result.path,
        raised: result.raised || 0,
        loss: result.loss || 0,
        remaining: state.players[seat].cash + (result.raised || 0) - amount,
        version: state.version,
        match: state.matchId,
      }
    : {
        available: false,
        actions: [],
        version: state.version,
        match: state.matchId,
      };
  cache.set(state, { key, value });
  return value;
}
