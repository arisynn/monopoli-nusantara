/** Bot integration guard. Rules and strategic scoring stay in native modules.
 * Planning is read-only; the host records history after a successful command.
 */
import { BOARD, GROUPS, DECKS, RULEPACK, AUCTION_RULES } from '../content.mjs';
import { CURRENCY } from '../currency.mjs';
import { blockedFinance } from './finance-history.mjs';
import { command, decisionActor, redemption, worth, botCandidates } from '../game.mjs';

export const STABILITY_GUARD_VERSION = '2.0.0';
const FLIP_WINDOW = 3;
const decisionExports = new Set(['decideMind', 'decideNusa', 'nusaV7Decision', 'nusaV71Decision']);
const actionOf = item => item?.action || (typeof item?.type === 'string' ? item : null);
const intent = action => {
  const { actionId, id, expectedVersion, ...rest } = action || {};
  return JSON.stringify(rest);
};
const sameIntent = (a, b) => intent(a) === intent(b);

export function detectMoneyScale(state) {
  if (state?.schemaVersion === 2) return RULEPACK.scale;
  return state?.moneyScale ?? state?.config?.moneyScale ?? CURRENCY.unitsPerNusa;
}
export function getAuctionMinStep() { return AUCTION_RULES.increment; }

/** Compatibility utility: require a full increment, even from a nonmultiple. */
export function snapBidToFiveMultiple(rawBid, currentBid, step = AUCTION_RULES.increment) {
  const increment = Number.isFinite(step) && step > 0 ? step : AUCTION_RULES.increment;
  const current = Number.isFinite(currentBid) ? Math.max(0, currentBid) : 0;
  return Math.ceil(Math.max(Number.isFinite(rawBid) ? rawBid : 0, current + increment) / increment) * increment;
}

function actorOf(state, context = {}) {
  if (Number.isInteger(context.actor)) return context.actor;
  if (Number.isInteger(context.playerIndex)) return context.playerIndex;
  return decisionActor(state);
}
function isNusa(state, actor) {
  const player = state.players[actor];
  if (!player) return false;
  // Numeric seats and display names must not override an explicit persona.
  const tag = String(player.botPersona ?? player.persona ?? player.profile ?? player.key ??
    (typeof player.id === 'string' ? player.id : player.name) ?? '').toLowerCase();
  return tag === 'nusa' || tag === 'nusa-v7' || tag.startsWith('nusa_main');
}

/** Join immutable definitions with authoritative mutable ownership. */
export function analyzeGuardState(state, context = {}) {
  const actor = actorOf(state, context);
  const tiles = BOARD.map(tile => ({ ...tile, ...(state.assets[tile.id] || {}),
    houseCost: tile.build || 0, mortgageValue: tile.mortgage || 0,
    redeemCost: tile.price ? redemption(tile.id) : 0 }));
  const groups = GROUPS.map((group, id) => ({ ...group, id,
    complete: group.ids.every(tile => state.assets[tile]?.owner === actor),
    buildable: group.ids.every(tile => state.assets[tile]?.owner === actor && !state.assets[tile].mortgaged) &&
      group.ids.some(tile => state.assets[tile].level < 5) }));
  return { actor, isNusa: isNusa(state, actor), scale: detectMoneyScale(state), tiles, groups,
    activePlayers: state.players.filter(player => !player.out),
    rankings: state.players.filter(player => !player.out)
      .map(player => ({ actor: player.id, worth: worth(state, player.id) }))
      .sort((a, b) => b.worth - a.worth || a.actor - b.actor) };
}

function historyOf(state, actor) {
  const saved = state.botMemory?.players?.[actor]?.stabilityGuard;
  return saved?.matchId === state.matchId ? saved : null;
}
function recentFlip(history, tile, serial) {
  const flip = history?.flips?.[tile];
  return flip?.count >= 2 && serial >= flip.turnSerial && serial - flip.turnSerial <= FLIP_WINDOW;
}
export function reversesCommittedAction(state, actor, action) {
  const history = historyOf(state, actor);
  if (!history) return false;
  const current = history.turnSerial === state.turnSerial;
  const tile = action.tile ?? (action.type === 'MORTGAGE_REDEEM' ? state.mortgageDecision?.tile : undefined);
  if (action.type === 'REDEEM' || action.type === 'MORTGAGE_REDEEM') {
    return current && history.mortgaged.includes(tile) || recentFlip(history, tile, state.turnSerial);
  }
  // Emergency liquidation remains available after a previous redemption/build.
  if (state.phase === 'debt' && state.debt?.from === actor) return false;
  if (action.type === 'MORTGAGE') {
    return current && history.redeemed.includes(tile) || recentFlip(history, tile, state.turnSerial);
  }
  if (!current) return false;
  if (['BUILD', 'BUILD_JOIN'].includes(action.type)) return history.sold.includes(tile);
  if (action.type === 'SELL') return history.built.includes(tile);
  if (action.type === 'SELL_SET') {
    return (GROUPS[BOARD[tile]?.group]?.ids || []).some(id => history.built.includes(id));
  }
  return false;
}

export function unsafeNusaTrade(state, actor, action) {
  if (!isNusa(state, actor) || !['OFFER', 'COUNTER', 'TRADE_ACCEPT'].includes(action.type)) return false;
  const trade = action.type === 'TRADE_ACCEPT' ? state.trade : action.trade;
  if (!trade) return false;
  const from = trade.from ?? actor, incoming = from !== actor;
  const partner = incoming ? from : trade.to;
  if (!state.players[partner]) return false;
  const give = (incoming ? trade.take : trade.give) || [];
  const take = (incoming ? trade.give : trade.take) || [];
  // Malformed proposals are rejected by isolated engine validation below.
  if (!Array.isArray(give) || !Array.isArray(take)) return false;
  const giveCash = (incoming ? trade.takeCash : trade.giveCash) || 0;
  const takeCash = (incoming ? trade.giveCash : trade.takeCash) || 0;
  const fees = ids => ids.reduce((n, id) => n + (state.assets[id]?.mortgaged ? Math.ceil(BOARD[id].mortgage / 10) : 0), 0);
  const mineCash = state.players[actor].cash - giveCash + takeCash - fees(take);
  const theirCash = state.players[partner].cash + giveCash - takeCash - fees(give);
  const newGroups = (who, acquired, surrendered) => GROUPS.filter(group =>
    !group.ids.every(id => state.assets[id]?.owner === who) && group.ids.every(id =>
      acquired.includes(id) || !surrendered.includes(id) && state.assets[id]?.owner === who));
  const mine = newGroups(actor, take, give), theirs = newGroups(partner, give, take);
  if (!theirs.length) return false;
  // Preserve the existing mutual-monopoly / cash-drain exceptions. Ranking,
  // broker offers, position forecasts and ROI remain in the native strategy.
  const tiers = [1.04, 1.14, 1.12, 1.38, 1.32, 1.20, 1.14, 1.18];
  const quality = groups => Math.max(1, ...groups.map(group => tiers[BOARD[group.ids[0]].group]));
  const mineCost = mine.length ? Math.min(...mine.map(group => BOARD[group.ids[0]].build)) : Infinity;
  const theirCost = Math.min(...theirs.map(group => BOARD[group.ids[0]].build));
  const mutual = mine.length >= theirs.length && mineCash >= mineCost * 2 &&
    (quality(mine) >= quality(theirs) || theirCash < theirCost * 1.5);
  const ready = GROUPS.filter(group => group.ids.every(id => state.assets[id]?.owner === actor &&
    !give.includes(id) && !state.assets[id].mortgaged) && group.ids.some(id => state.assets[id].level < 5));
  const drain = theirCash < theirCost * 1.2 && ready.length > 0 &&
    mineCash >= Math.min(...ready.map(group => BOARD[group.ids[0]].build)) * 3;
  return !mutual && !drain;
}

function publicRules(state) {
  if (state.decks) return state;
  const held = new Set(state.players.flatMap(player => player.cards || []).map(card => `${card.deck}:${card.idx}`));
  if (state.card?.jailCard) held.add(`${state.card.deck}:${state.card.idx}`);
  return { ...state, seen: [], decks: Object.fromEntries(Object.entries(DECKS).map(([name, cards]) =>
    [name, cards.map((_, id) => id).filter(id => !held.has(`${name}:${id}`))])) };
}
function legal(state, actor, action) {
  if (!action || state.players[actor]?.out) return false;
  try {
    // An isolated transition; never consume the live RNG or call a host hook.
    const { id, ...candidate } = action;
    command(publicRules(state), actor, candidate, () => 0.413);
    return true;
  } catch { return false; }
}
export function blockedStabilityAction(state, actor, action) {
  return blockedFinance(state, actor, action) || reversesCommittedAction(state, actor, action) || unsafeNusaTrade(state, actor, action);
}
function normalizeAction(state, actor, original) {
  if (!original) return null;
  const action = { ...original };
  if (action.type === 'BID') {
    const auction = state.auction;
    if (state.phase !== 'auction' || !auction?.participants.includes(actor) || auction.highest === actor) return null;
    const minimum = Math.max(AUCTION_RULES.minimum, auction.amount + AUCTION_RULES.increment);
    // Official host requires N5 multiples, including when recovering old N1 bids.
    const amount = Math.ceil(Math.max(Number.isFinite(action.amount) ? action.amount : minimum, minimum) /
      AUCTION_RULES.increment) * AUCTION_RULES.increment;
    if (!Number.isSafeInteger(amount) || amount > state.players[actor].cash) return null;
    action.amount = amount;
  }
  if (blockedStabilityAction(state, actor, action)) return null;
  return action;
}

export function stabilizeCandidates(state, candidates, context = {}) {
  if (!Array.isArray(candidates) || state?.schemaVersion !== 2) return candidates;
  const actor = actorOf(state, context), result = [], seen = new Set();
  for (const item of candidates) {
    const original = actionOf(item);
    if (!original) continue;
    const action = normalizeAction(state, actor, original);
    if (!action) continue;
    // The core generator validated unchanged actions. Recheck modified bids.
    if ((!context.validated || !sameIntent(action, original)) && !legal(state, actor, action)) continue;
    const key = intent(action);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item.action ? { ...item, action } : action);
    }
  }
  return result;
}

export function stabilizeDecision(state, decisionOrAction, context = {}) {
  if (!decisionOrAction || state?.schemaVersion !== 2) return decisionOrAction;
  const actor = actorOf(state, context), wrapped = 'action' in decisionOrAction;
  const original = wrapped ? decisionOrAction.action : decisionOrAction;
  const candidates = stabilizeCandidates(state, decisionOrAction.candidates || context.candidates || [],
    { actor, validated: true });
  const proposed = normalizeAction(state, actor, original);
  let action = proposed && legal(state, actor, proposed) ? proposed : null;
  if (!action) {
    action = candidates.map(actionOf).find(candidate => legal(state, actor, candidate)) ||
      stabilizeCandidates(state, botCandidates(publicRules(state), actor), { actor })[0] || null;
  }
  if (!wrapped) return action;
  const changed = !sameIntent(original, action);
  return { ...decisionOrAction, action,
    ...('candidates' in decisionOrAction ? { candidates } : {}),
    ...(decisionOrAction.diagnostics ? { diagnostics: { ...decisionOrAction.diagnostics,
      selected: action?.actionId, stabilityGuard: { version: STABILITY_GUARD_VERSION, changed,
        ...(changed ? { reason: proposed ? 'illegal_action_fallback' : 'unsafe_action_fallback' } : {}) } } } : {}) };
}

/** Host lifecycle: call only after command() succeeds. Diff actual changes,
 * including build-offer resolution for another owner. State-backed history
 * survives workers and replay without leaking between matches or simulations.
 */
export function recordStabilityAction(state, previous, actor, action, committedVersion = state?.version) {
  // Official command() invokes its existing memory hook just before version++.
  // The hook passes the reserved successful transition version, without changing rules.
  if (state?.schemaVersion !== 2 || state.matchId !== previous?.matchId || committedVersion !== previous.version + 1) return;
  const changes = new Map();
  for (const tile of BOARD) {
    const before = previous.assets[tile.id], after = state.assets[tile.id];
    if (!before || !after || before.owner === null || before.owner !== after.owner) continue;
    const owner = before.owner;
    const change = changes.get(owner) || { mortgaged: [], redeemed: [], built: [], sold: [] };
    if (!before.mortgaged && after.mortgaged) change.mortgaged.push(tile.id);
    if (before.mortgaged && !after.mortgaged) change.redeemed.push(tile.id);
    if (after.level > before.level) change.built.push(tile.id);
    if (after.level < before.level) change.sold.push(tile.id);
    if (Object.values(change).some(ids => ids.length)) changes.set(owner, change);
  }
  if (!changes.size) return;
  state.botMemory ||= { version: 1, players: {}, opponents: {}, negotiation: null };
  state.botMemory.players ||= {};
  for (const [owner, change] of changes) {
    const memory = state.botMemory.players[owner] ||= { lastOfferSerial: -100, lastSignature: '', rejections: {} };
    if (memory.stabilityGuard?.matchId === state.matchId && memory.stabilityGuard.lastVersion === committedVersion) continue;
    const old = historyOf(previous, owner), serial = previous.turnSerial;
    const sameTurn = old?.turnSerial === serial;
    const saved = { matchId: state.matchId, turnSerial: serial, lastVersion: committedVersion,
      flips: Object.fromEntries(Object.entries(old?.flips || {}).filter(([, flip]) =>
        serial >= flip.turnSerial && serial - flip.turnSerial <= FLIP_WINDOW)) };
    for (const key of ['mortgaged', 'redeemed', 'built', 'sold']) {
      saved[key] = [...new Set([...(sameTurn ? old[key] : []), ...change[key]])];
    }
    for (const tile of [...change.mortgaged, ...change.redeemed]) {
      saved.flips[tile] = { count: (saved.flips[tile]?.count || 0) + 1, turnSerial: serial };
    }
    memory.stabilityGuard = saved;
  }
}

// Compatibility export: the caller's timeBudgetMs/maxMs and context own the deadline.
export function optimizeSearchContext(state, optionsOrContext) { return optionsOrContext; }

/** Only known action-producing boundaries are wrapped. Helpers, afterstates,
 * forecasts, telemetry and rollout policies retain their original meaning.
 */
export function wrapModuleExport(moduleTag, exportName, exportedValue) {
  if (typeof exportedValue !== 'function' || exportedValue.__nusaWrapped) return exportedValue;
  const generates = moduleTag === 'candidates' && exportName === 'generateCandidates';
  if (!generates && !decisionExports.has(exportName)) return exportedValue;
  const wrapped = function (state, actor, ...args) {
    const result = exportedValue.call(this, state, actor, ...args);
    const guard = output => generates
      ? stabilizeCandidates(state, output, { actor, validated: true })
      : stabilizeDecision(state, output, { actor, candidates: args[0]?.candidates });
    return result?.then ? result.then(guard) : guard(result);
  };
  wrapped.__nusaWrapped = true;
  Object.defineProperty(wrapped, 'name', { value: exportedValue.name || exportName, configurable: true });
  return wrapped;
}
