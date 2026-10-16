import { BOARD, GROUPS, assets, rent } from "../lib/game.mjs";
import { assetPermission } from "./domain.mjs";
const diceWays = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
export function mortgageAdvice(state, seat, target) {
  if (!Number.isSafeInteger(target) || target <= 0)
    return {
      tiles: [],
      amount: 0,
      reason: "Masukkan kebutuhan dana yang valid.",
    };
  const eligible = assets(state, seat).filter(
    (t) => !assetPermission(state, seat, t.id, "MORTGAGE"),
  );
  const complete = (t) =>
    t.group >= 0 &&
    GROUPS[t.group].ids.every((id) => state.assets[id].owner === seat);
  const outside = eligible.filter((t) => !complete(t)),
    outsideFunds = outside.reduce((n, t) => n + t.mortgage, 0);
  // Keep complete sets entirely out of consideration when outside assets can cover the target.
  const choices = outsideFunds >= target ? outside : eligible;
  const loss = (t) => {
    const own =
        t.group >= 0
          ? GROUPS[t.group].ids.filter((id) => state.assets[id].owner === seat)
              .length
          : 0,
      near = t.group >= 0 && own === GROUPS[t.group].ids.length - 1;
    const landing = state.players
      .filter((p) => p.id !== seat && !p.out && !p.inJail)
      .reduce((n, p) => n + (diceWays[(t.id - p.pos + 40) % 40] || 0) / 36, 0);
    return Math.ceil(
      t.mortgage * 0.1 +
        rent(state, t.id) * (4 + landing * 6) +
        (complete(t)
          ? t.price * 0.65 + (t.build || 0) * 2
          : near
            ? t.price * 0.18
            : 0),
    );
  };
  const dp = new Map([[0, { cost: 0, tiles: [], amount: 0 }]]);
  for (const t of choices)
    for (const entry of [...dp.values()]) {
      const amount = entry.amount + t.mortgage,
        cost = entry.cost + loss(t),
        key = Math.min(amount, target),
        old = dp.get(key);
      if (!old || cost < old.cost || (cost === old.cost && amount < old.amount))
        dp.set(key, { cost, amount, tiles: [...entry.tiles, t.id] });
    }
  const best = dp.get(target);
  if (!best) {
    const amount = eligible.reduce((n, t) => n + t.mortgage, 0);
    return {
      tiles: [],
      amount,
      reason:
        "Aset legal yang bisa digadai belum mencukupi. Jual bangunan atau kurangi target dana.",
    };
  }
  return {
    ...best,
    protectedComplete: outsideFunds >= target,
    reason:
      outsideFunds >= target
        ? "Set lengkap dipertahankan; pilih aset dengan perkiraan kehilangan sewa terendah."
        : "Dana di luar set lengkap belum cukup; sebagian set lengkap diperlukan.",
  };
}
