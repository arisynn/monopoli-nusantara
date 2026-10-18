export type BotReason =
  | "not_configured"
  | "simple"
  | "budget"
  | "circuit_open"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "provider_error"
  | "invalid_response"
  | "illegal_action"
  | "economic_guard"
  | "network_error";
export type BotStatus =
  | "local"
  | "configured"
  | "consulting"
  | "hybrid"
  | "fallback";
export type BotDifficulty = "easy" | "medium" | "hard" | "hardcore";
export interface TinyValueNetwork {
  hidden: number;
  input: number;
  weights: number[];
  bias: number[];
  output: number[];
  offset: number;
}
export interface LearningModel {
  schema: number;
  rulepack: string;
  status: "candidate" | "promoted";
  valueFeatures: string[];
  policyFeatures: string[];
  value: number[];
  policy: number[];
  valueNetwork?: TinyValueNetwork | null;
  training?: { games: number; seedRanges: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
}
export interface BotTrade {
  to: number;
  give: number[];
  take: number[];
  giveCash: number;
  takeCash: number;
  giveCards: number;
  takeCards: number;
}
export interface BotAction {
  type: string;
  tile?: number;
  amount?: number;
  cardIndex?: number;
  claimId?: string;
  trade?: BotTrade;
  actionId?: string;
}
export interface BotDecisionResult {
  action: BotAction;
  diagnostics?: {
    model?: string;
    elapsedMs?: number;
    nodes?: number;
    budgetExhausted?: boolean;
    reason?: string;
  };
  status: BotStatus;
  comment: string | null;
  /** Safe diagnostic enum only. Never contains provider body, headers or a stack. */
  reason?: BotReason;
  stateVersion: number;
  matchId: string;
  actor: number;
  advisorUsed: boolean;
  usage?: { totalTokens: number; latencyMs: number };
}
export interface BotEnvironment {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_TIMEOUT_MS?: string;
  GROQ_DAILY_BUDGET?: string;
  [key: string]: unknown;
}
export interface BotGameState {
  schemaVersion: number;
  matchId: string;
  version: number;
  phase: string;
  players: Array<{
    id: number;
    name: string;
    controller: string;
    cash: number;
    pos: number;
    inJail: boolean;
    out: boolean;
    botPersona?: string;
    botDifficulty?: BotDifficulty;
    [key: string]: unknown;
  }>;
  assets: Record<string, unknown>;
  aiStatus?: string;
  aiComment?: string | null;
  advisorEnabled?: boolean;
  [key: string]: unknown;
}
export interface FoundationDiagnostics {
  version: string;
  elapsedMs: number;
  budgetMs: number | null;
  stopReason: string | null;
  cacheEntries: number;
  counters: Record<string, number>;
  stages: Record<string, number>;
}
export interface EconomicPlan {
  action: BotAction | null;
  candidates: Array<{
    id: string;
    action: BotAction;
    score: number;
    macro?: BotAction[];
  }>;
  shouldConsult: boolean;
  summary: Record<string, unknown>;
  reason?: string;
  foundation?: FoundationDiagnostics;
}
export interface MindPlan extends EconomicPlan {
  diagnostics: {
    version: string;
    model: string;
    algorithm: string;
    selectedBy: string;
    actor: number;
    persona: string;
    elapsedMs: number;
    nodes: number;
    samples: number;
    interrupted: boolean;
    budgetExhausted: boolean;
    selected?: string;
    workerFallback?: boolean;
    learning?: {
      enabled: boolean;
      status: string;
      policyUsed: boolean;
      valueUsed: boolean;
    };
    search: Array<{
      id: string;
      mean: number | null;
      tail: number | null;
      samples: number;
    }>;
  };
}
export interface MindClient {
  decide(
    state: BotGameState,
    actor: number,
    options?: { signal?: AbortSignal },
  ): Promise<MindPlan | null>;
  dispose(): void;
}
