import { decideMind, observation } from "./mind.mjs";
import { planDecision } from "./strategy.mjs";
import { legalCandidate } from "./candidates.mjs";
import { createDecisionContext } from "./foundation.mjs";
import { guardNegotiation } from "./negotiation-guard.mjs";
import { decideNusa, NUSA_MODEL_VERSION } from "./nusa-v7/index.mjs";
import { cleanAction } from "./nusa-v7/council.mjs";
import { apexPolicyAction, APEX_ADAPTER_VERSION } from "./apex-policy.mjs";
import { kresnaPolicyAction, KRESNA_MODEL_VERSION } from "./kresna-policy.mjs";

export const STRATEGIC_PERSONAS = Object.freeze(["nusa", "kresna", "apex"]);
export function decidePersona(state, actor, options = {}) {
  const persona = state?.players?.[actor]?.botPersona;
  if (!STRATEGIC_PERSONAS.includes(persona))
    return decideMind(state, actor, options);
  const clock = options.clock || (() => performance.now()),
    started = clock();
  const budget = Number.isFinite(options.timeBudgetMs)
    ? Math.max(0, options.timeBudgetMs)
    : options.deep
      ? 2600
      : 64;
  const planningBudget = Number.isFinite(options.planningBudgetMs) ? Math.max(budget, options.planningBudgetMs) : budget;
  const context = createDecisionContext({
    ...options,
    clock,
    timeBudgetMs: planningBudget,
  });
  const view = observation(state, actor);
  const base = planDecision(view, actor, {
    ...options,
    context,
    diagnostics: true,
    fast: false,
    noLearning: true,
  });
  const modelLabel =
    persona === "nusa"
      ? "NUSA-V23.0-CHRONOS-KAIROS"
      : persona === "kresna"
        ? "KRESNA-V2.0"
        : "APEX-JS-3.0";
  let selected = {
    action: base.action,
    changed: false,
    reason: base.action ? "economic_floor" : "no_action",
  };
  if (base.action && !options.baseOnly && !context.expired()) {
    try {
      selected = context.measure("persona", () => {
        if (persona === "nusa")
          return decideNusa(view, actor, base, {
            mode: options.nusaMode || "search",
            maxMs: context.remaining(),
            maxNodes:
              options.maxNodes ?? (options.deep || budget >= 1500 ? 5200 : 540),
            deep: !!options.deep || budget >= 1500,
            context,
          });
        if (persona === "kresna") return kresnaPolicyAction(view, actor, base);
        return apexPolicyAction(view, actor, base);
      });
    } catch {
      selected = {
        action: base.action,
        changed: false,
        reason: "model_exception",
      };
    }
  } else if (base.action)
    selected.reason = options.baseOnly
      ? "bounded_fallback"
      : "foundation_budget_exhausted";
  const proposed = selected?.action;
  const matched = base.candidates.find(
    (c) =>
      JSON.stringify(cleanAction(c.action)) ===
      JSON.stringify(cleanAction(proposed)),
  );
  const candidateAction = matched ? matched.action : proposed;
  const valid =
    !!candidateAction && legalCandidate(view, actor, candidateAction, context);
  const action = valid ? candidateAction : base.action;
  return guardNegotiation(view, actor, {
    ...base,
    action,
    shouldConsult: false,
    foundation: context.snapshot(),
    diagnostics: {
      version:
        persona === "nusa"
          ? NUSA_MODEL_VERSION
          : persona === "kresna"
            ? KRESNA_MODEL_VERSION
            : APEX_ADAPTER_VERSION,
      model: modelLabel,
      algorithm:
        persona === "nusa"
          ? "chronos-kairos-v23.0"
          : persona === "kresna"
            ? "kresna-policy-v2.0"
            : "apex-policy-v3.0",
      persona,
      selectedBy:
        valid && selected.changed ? "strategic-persona" : "economic-floor",
      reason: valid ? selected.reason : "illegal_proposal_rejected",
      actor,
      elapsedMs: Math.max(0, clock() - started),
      nodes: selected?.search?.nodes ?? 0,
      samples: selected?.search?.pairedSamples ?? 0,
      interrupted: !!options.signal?.aborted,
      budgetExhausted: context.expired(),
      ...(persona === "nusa"
        ? {
            macroPosture: selected?.temporalTelemetry?.macroPosture ?? null,
            temporalTelemetry: selected?.temporalTelemetry ?? null,
          }
        : {}),
      learning: { enabled: false },
      selected: action?.actionId,
      search: [],
    },
  }, context);
}
