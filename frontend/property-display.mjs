import { assets, rent } from "../lib/game.mjs";
import { BOARD, money } from "../lib/content.mjs";

function compactMoney(units) {
  // Values use ten engine units per Nusa. Keep exact amounts below 1,000 Nusa.
  if (!Number.isSafeInteger(units) || Math.abs(units) < 10000)
    return money(units);
  const divisor = Math.abs(units) >= 10000000 ? 10000000 : 10000,
    suffix = divisor === 10000000 ? "m" : "k",
    amount = Math.trunc((units / divisor) * 10) / 10;
  return `₦ ${amount.toLocaleString("id-ID", { maximumFractionDigits: 1 })}${suffix}`;
}

// Display the ordinary rent. Card-specific surcharges belong to their payment event.
export function rentLabel(state, tile, { compact = false } = {}) {
  const format = compact ? compactMoney : money;
  const asset = state.assets[tile];
  if (asset?.owner == null) return "";
  if (asset.mortgaged) return format(0);
  if (BOARD[tile].type === "utility") {
    const count = assets(state, asset.owner).filter(
      (t) => t.type === "utility",
    ).length;
    return `${count === 2 ? 10 : 4}× dadu`;
  }
  return format(rent(state, tile));
}
