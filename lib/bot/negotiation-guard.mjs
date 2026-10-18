import { prepareTradeCandidate } from './negotiation.mjs';
import { legalCandidate } from './candidates.mjs';

// Runs after persona experts as well as the shared planner. A specialist cannot
// reintroduce an identical refused offer after the candidate generator filtered it.
export function guardNegotiation(s, actor, plan, decisionContext) {
  if (!plan.action || !['OFFER','COUNTER'].includes(plan.action.type)) return plan;
  const prepared = prepareTradeCandidate(s, actor, plan.action, { decisionContext });
  if (prepared === plan.action) return plan;
  const legal = prepared && legalCandidate(s, actor, prepared, decisionContext);
  const alternative = legal ? prepared : plan.candidates?.find(c =>
    !['OFFER','COUNTER'].includes(c.action.type) && legalCandidate(s, actor, c.action, decisionContext))?.action;
  if (!alternative) return { ...plan, action: null, shouldConsult: false };
  const action = legal ? { ...alternative, actionId: `${alternative.actionId || 'trade'}:revision` } : alternative;
  const candidates = legal ? [{ id: action.actionId, action, score: 0 }, ...(plan.candidates || [])] : plan.candidates;
  return { ...plan, action, candidates, shouldConsult: false,
    diagnostics: { ...plan.diagnostics, negotiation: legal ? 'revised_after_refusal' : 'refused_offer_blocked', selected: action.actionId }
  };
}
