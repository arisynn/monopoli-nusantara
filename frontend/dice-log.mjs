// On-demand public log export. No new polling, storage, hidden decks or account IDs.
export function diceLogExport(state) {
  return {
    format: "nusa-confirmed-dice-window-v1",
    capturedAt: new Date().toISOString(),
    source:
      "Confirmed public log window; earlier events may have been truncated. This is not a complete-match recording.",
    state: {
      schemaVersion: state.schemaVersion,
      matchId: state.matchId,
      version: state.version,
      players: state.players.map(({ id, name, controller, botPersona }) => ({
        id,
        name,
        controller,
        ...(botPersona ? { botPersona } : {}),
      })),
      log: state.log
        .filter(
          (e) =>
            e.audience !== "private" &&
            ["start", "dice", "jail", "release"].includes(e.type),
        )
        .map(({ id, type, text, actor, dice, diceKind, turn, version }) => ({
          id,
          type,
          text,
          actor,
          dice,
          diceKind,
          turn,
          version,
        })),
    },
  };
}
