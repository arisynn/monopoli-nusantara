import { BOARD, GROUPS } from '../content.mjs';

export const TRADE_HISTORY_LIMIT = 12;
export const TRADE_REVISION_LIMIT = 2;
const sorted = ids => [...(ids || [])].sort((a, b) => a - b);
export const tradeBundleKey = t => JSON.stringify([t.to, sorted(t.give), sorted(t.take), t.giveCards || 0, t.takeCards || 0]);
export const tradeSignature = t => JSON.stringify([tradeBundleKey(t), (t.giveCash || 0) - (t.takeCash || 0)]);
const face = ids => (ids || []).reduce((sum, id) => sum + (BOARD[id]?.price || 0), 0);
const compensation = t => (t.giveCash || 0) - (t.takeCash || 0);
const reverseCounter = record => record?.counter ? {
  to: record.partner, give: sorted(record.counter.take), take: sorted(record.counter.give),
  giveCash: record.counter.takeCash, takeCash: record.counter.giveCash,
  giveCards: record.counter.takeCards, takeCards: record.counter.giveCards
} : null;
const hash = value => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); };

// Public economic changes matter; heartbeat, round numbers and array order do not.
export function tradeContextKey(s) {
  return hash(JSON.stringify([
    s.players.map(p => [Math.floor(p.cash / 1000), !!p.out, p.cards?.length || 0]),
    BOARD.filter(t => t.price).map(t => { const a = s.assets[t.id]; return [a.owner, a.level, a.mortgaged]; })
  ]));
}
export function rejectionHypothesis(s, from, t) {
  const recipient = s.players[t.to];
  if ((t.takeCash || 0) > Math.max(0, recipient.cash - 500)) return 'cash_pressure';
  const completes = GROUPS.some(g => !g.ids.every(i => s.assets[i].owner === from) &&
    g.ids.every(i => t.take.includes(i) || (s.assets[i].owner === from && !t.give.includes(i))));
  const receiverCompletes = GROUPS.some(g => !g.ids.every(i => s.assets[i].owner === t.to) &&
    g.ids.every(i => t.give.includes(i) || (s.assets[i].owner === t.to && !t.take.includes(i))));
  if (completes && !receiverCompletes) return 'monopoly_threat';
  if (face(t.give) + compensation(t) < face(t.take)) return 'insufficient_value';
  return 'strategic_preference';
}
export function rememberTradeResponse(state, previous, actor, action, memory) {
  const t = previous.trade;
  if (!t || !['COUNTER', 'TRADE_REJECT', 'TRADE_ACCEPT'].includes(action.type)) return;
  const cancelled = action.type === 'TRADE_REJECT' && actor === t.from;
  const outcome = cancelled ? 'withdrawn' : action.type === 'COUNTER' ? 'countered' : action.type === 'TRADE_ACCEPT' ? 'accepted' : 'rejected';
  const owner = memory.players[t.from] ||= { lastOfferSerial: -100, lastSignature: '', rejections: {} };
  const trade = { to: t.to, give: sorted(t.give), take: sorted(t.take), giveCash: t.giveCash, takeCash: t.takeCash, giveCards: t.giveCards, takeCards: t.takeCards };
  const record = {
    version: previous.version + 1, serial: previous.turnSerial, partner: t.to,
    signature: tradeSignature(trade), bundle: tradeBundleKey(trade),
    context: tradeContextKey(previous), trade, outcome,
    reason: outcome === 'rejected' ? rejectionHypothesis(previous, t.from, trade) : null,
    // These are hypotheses from public information, never the recipient's thoughts.
    confidence: outcome === 'rejected' ? 'estimated' : 'observed',
    ...(outcome === 'countered' ? { counter: structuredClone(action.trade) } : {})
  };
  owner.tradeHistory = [...(owner.tradeHistory || []).filter(r => r.version !== record.version), record].slice(-TRADE_HISTORY_LIMIT);
}
export function relatedRefusals(s, id, trade) {
  const bundle = tradeBundleKey(trade), context = tradeContextKey(s);
  return (s.botMemory?.players?.[id]?.tradeHistory || []).filter(r =>
    ['rejected', 'countered'].includes(r.outcome) && r.bundle === bundle && r.context === context &&
    s.turnSerial - r.serial < s.players.length * 4);
}
export function tradeRetryVerdict(s, id, trade) {
  const refusals = relatedRefusals(s, id, trade), last = refusals.at(-1);
  if (!last) return { allowed: true, reason: 'new_context' };
  if (refusals.length > TRADE_REVISION_LIMIT) return { allowed: false, reason: 'revision_limit' };
  if (refusals.some(r => r.signature === tradeSignature(trade))) return { allowed: false, reason: 'repeated_offer' };
  const requested = reverseCounter(last);
  if (requested && tradeSignature(requested) === tradeSignature(trade)) return { allowed: true, reason: 'observed_counteroffer' };
  const minimum = Math.max(100, Math.ceil((face(trade.give) + face(trade.take)) * .04 / 10) * 10);
  return compensation(trade) - compensation(last.trade) >= minimum
    ? { allowed: true, reason: 'meaningful_concession' }
    : { allowed: false, reason: 'insufficient_revision' };
}
export function revisedTrade(s, id, trade) {
  if (tradeRetryVerdict(s, id, trade).allowed) return trade;
  const refusals = relatedRefusals(s, id, trade), last = refusals.at(-1);
  if (!last || refusals.length > TRADE_REVISION_LIMIT || last.reason === 'monopoly_threat') return null;
  const step = Math.max(100, Math.ceil((face(trade.give) + face(trade.take)) * .06 / 10) * 10);
  const requested = reverseCounter(last);
  const requestedPayment = requested && tradeBundleKey(requested) === tradeBundleKey(trade) ? compensation(requested) : -Infinity;
  const payment = Math.max(compensation(trade), compensation(last.trade) + step, requestedPayment);
  const result = { ...trade, giveCash: Math.max(0, payment), takeCash: Math.max(0, -payment) };
  if (s.players[id].cash - result.giveCash < Math.min(s.players[id].cash, 500) || result.takeCash > s.players[trade.to].cash) return null;
  return tradeRetryVerdict(s, id, result).allowed ? result : null;
}
