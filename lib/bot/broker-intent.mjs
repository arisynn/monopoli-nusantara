// Candidate identifiers are normally transient. The trusted NUSA broker marker
// is the one exception: confirmed engine commands use it to persist same-turn
// intent. It never replaces the command UUID, expected version, or rule guards.
export function brokerIntentMetadata(state, actor, action) {
  const player = Number.isInteger(actor) ? state?.players?.[actor] : null;
  if (player?.controller !== 'bot' || player.botPersona !== 'nusa' ||
      action?.type !== 'OFFER' || typeof action.actionId !== 'string') return {};
  const marker = /^nusa-(?:2hop-broker-step1|broker-step2)-\d+-for-\d+/.exec(action.actionId);
  return marker ? { actionId: marker[0] } : {};
}
