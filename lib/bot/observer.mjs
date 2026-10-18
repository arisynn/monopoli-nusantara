import { BOARD, GROUPS } from '../content.mjs';

export const OBSERVATION_QUEUE_LIMIT = 32;
const BATCH_SIZE = 4;
const watched = new Set(['ROLL','BUY','BID','PASS','BUILD','BUILD_JOIN','SELL','SELL_SET','MORTGAGE','REDEEM','OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT','BANKRUPT','PAY','ACK','JAIL_PAY','CLAIM_RENT','MORTGAGE_REDEEM']);
const fresh = () => ({ version: 1, throughVersion: -1, queuedThroughVersion: -1, batches: 0, profiles: {}, pending: [] });

export function flushObservations(input, limit = OBSERVATION_QUEUE_LIMIT) {
  const result = structuredClone(input || fresh());
  const batch = result.pending.splice(0, Math.max(0, Math.min(OBSERVATION_QUEUE_LIMIT, limit)));
  for (const event of batch) {
    if (event.version <= result.throughVersion) continue;
    const p = result.profiles[event.actor] ||= { observations: 0, groups: {}, aggression: 1, cashPressure: 0, trades: { offered: 0, accepted: 0, rejected: 0 } };
    p.observations = Math.min(1000, p.observations + 1);
    for (const group of event.groups) p.groups[group] = Math.min(100, (p.groups[group] || 0) + 1);
    if (event.bidRatio) p.aggression = Math.max(.2, Math.min(4, p.aggression * .75 + event.bidRatio * .25));
    p.cashPressure = p.cashPressure * .7 + event.cashPressure * .3;
    if (['OFFER','COUNTER'].includes(event.type)) p.trades.offered++;
    if (event.type === 'TRADE_ACCEPT') p.trades.accepted++;
    if (event.type === 'TRADE_REJECT') p.trades.rejected++;
    for (const key of ['offered','accepted','rejected']) p.trades[key] = Math.min(1000, p.trades[key]);
    p.monopolyGroups = event.monopolyGroups;
    p.lastVersion = event.version;
    p.confidence = p.observations / (p.observations + 8);
    result.throughVersion = event.version;
  }
  if (batch.length) result.batches++;
  return result;
}

// Called only by successful engine transitions. No timers, searches, private logs,
// card order or additional database transactions are involved.
export function recordNusaObservation(state, previous, actor, action, memory) {
  if (!watched.has(action.type)) return;
  for (const nusa of state.players.filter(p => p.controller === 'bot' && p.botPersona === 'nusa' && !p.out && p.id !== actor)) {
    const own = memory.players[nusa.id] ||= { lastOfferSerial: -100, lastSignature: '', rejections: {} };
    let observation = own.observation || fresh();
    const version = previous.version + 1;
    if (version <= observation.queuedThroughVersion) continue;
    if (observation.pending.length >= OBSERVATION_QUEUE_LIMIT) observation = flushObservations(observation);
    const tiles = [...(action.trade?.take || []), ...(action.type === 'BUY' ? [previous.buy] : []),
      ...(['BUILD','BUILD_JOIN','REDEEM'].includes(action.type) && Number.isInteger(action.tile) ? [action.tile] : []),
      ...(action.type === 'TRADE_ACCEPT' ? previous.trade?.give || [] : [])];
    const auctionTile = previous.auction?.kind === 'building' ? previous.auction.targets?.[actor] : previous.auction?.tile;
    if (action.type === 'BID' && Number.isInteger(auctionTile)) tiles.push(auctionTile);
    const price = previous.auction?.kind === 'building' ? BOARD[auctionTile]?.build : BOARD[auctionTile]?.price;
    const type = action.type === 'TRADE_REJECT' && previous.trade?.from === actor ? 'TRADE_WITHDRAWN' : action.type;
    observation.pending.push({ version, actor, type,
      groups: [...new Set(tiles.map(id => BOARD[id]?.group).filter(g => g >= 0))],
      bidRatio: action.type === 'BID' && price ? action.amount / price : 0,
      cashPressure: Math.max(0, Math.min(1, 1 - state.players[actor].cash / 2000)),
      monopolyGroups: GROUPS.flatMap((g,index) => g.ids.every(id => state.assets[id].owner === actor) ? [index] : [])
    });
    observation.queuedThroughVersion = version;
    // Coalesce up to four actions; critical responses and turn boundaries flush
    // immediately. Work is bounded by event count rather than a persistent loop.
    if (observation.pending.length >= BATCH_SIZE || previous.turn !== state.turn || ['TRADE_ACCEPT','TRADE_REJECT'].includes(action.type))
      observation = flushObservations(observation, BATCH_SIZE);
    own.observation = observation;
  }
}

export function observedOpponents(memory, actor) {
  const observation = memory?.players?.[actor]?.observation;
  if (!observation) return memory?.opponents || {};
  const profiles = flushObservations(observation).profiles;
  const result = { ...(memory.opponents || {}) };
  for (const [id, profile] of Object.entries(profiles)) {
    const existing = result[id] || {};
    const groups = { ...existing.groups };
    for (const [group,count] of Object.entries(profile.groups)) groups[group] = Math.max(groups[group] || 0,count);
    result[id] = { ...existing, groups,
      observations: Math.max(existing.observations || 0, profile.observations),
      aggression: existing.observations ? existing.aggression : profile.aggression,
      cashPressure: profile.cashPressure, confidence: profile.confidence,
      monopolyGroups: profile.monopolyGroups, observedThroughVersion: profile.lastVersion
    };
  }
  return result;
}
