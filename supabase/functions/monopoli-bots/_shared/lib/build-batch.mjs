import { BOARD, GROUPS, command, managementError } from "./game.mjs";

export class BuildBatchError extends Error {
  constructor(message, code = "build_batch_unavailable") {
    super(message);
    this.code = code;
  }
}

// Human transport operation only. Every step uses the unchanged official BUILD
// command on private snapshots. The caller publishes the completed snapshot once.
export function commandBuildBatch(input, actor, action, rng) {
  const fail = (message, code) => {
    throw new BuildBatchError(message, code);
  };
  if (!input || input.players[actor]?.controller !== "human")
    fail("Pesanan batch hanya untuk pemain manusia.");
  if (
    action.type !== "BUILD_BATCH" ||
    typeof action.id !== "string" ||
    !action.id
  )
    fail("Pesanan bangunan tidak valid.");
  if (input.seen?.includes(action.id)) return input;
  if (action.expectedVersion !== input.version)
    fail("State berubah. Periksa ulang pesanan.", "state_changed");
  const { group, count } = action;
  if (
    !Number.isInteger(group) ||
    !GROUPS[group] ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 15
  )
    fail("Pilih kelompok dan 2–15 bangunan.");
  let next = input;
  const tiles = [];
  for (let index = 0; index < count; index++) {
    const tile = GROUPS[group].ids
      .filter((id) => !managementError(next, actor, id, "BUILD"))
      .sort((a, b) => next.assets[a].level - next.assets[b].level || a - b)[0];
    if (tile === undefined)
      fail(
        "Pesanan dibatalkan seluruhnya. Saldo, stok, atau syarat pembangunan tidak mencukupi.",
      );
    try {
      next = command(
        next,
        actor,
        {
          type: "BUILD",
          tile,
          id: `${action.id}#${index}`,
          expectedVersion: next.version,
        },
        rng,
      );
    } catch (error) {
      fail(error.message);
    }
    if (next.phase !== input.phase)
      fail(
        "Pesanan belum dibeli: pembangunan ini memerlukan keputusan stok. Pilih jumlah 1 untuk pemesanan atau lelang resmi.",
        "build_batch_stock",
      );
    tiles.push(tile);
  }
  const batch = {
    id: `${input.matchId}:${input.eventId + 1}:${action.id.slice(action.id.lastIndexOf(":") + 1)}`,
    player: actor,
    count,
    group,
    cost: tiles.reduce((n, id) => n + BOARD[id].build, 0),
  };
  // Preserve all original economic entries; metadata only groups their presentation.
  next.log = next.log.map((e) =>
    e.id > input.eventId && e.type === "build"
      ? { ...e, buildBatch: batch }
      : e,
  );
  next.seen = [...(next.seen || []).slice(-199), action.id];
  return next;
}
