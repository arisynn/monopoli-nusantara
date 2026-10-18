export const FOUNDATION_VERSION = "1.0.0";

// One context per decision, never a cross-match/state-version cache. Only plain
// counters leave the planner; clocks, signals and WeakMaps stay in this scope.
export function createDecisionContext({
  clock = () => performance.now(),
  timeBudgetMs = Infinity,
  signal,
  maxEntries = 2048,
} = {}) {
  const started = clock();
  const budget = Number.isFinite(timeBudgetMs)
    ? Math.max(0, timeBudgetMs)
    : Infinity;
  const cache = new WeakMap();
  let entries = 0;
  const stages = {},
    counters = { hits: 0, misses: 0, transitions: 0, rejected: 0 };
  const elapsed = () => Math.max(0, clock() - started);
  const reason = () =>
    signal?.aborted ? "cancelled" : elapsed() >= budget ? "time_budget" : null;
  return {
    expired: () => reason() !== null,
    remaining: () => Math.max(0, budget - elapsed()),
    /** @template T @param {object} state @param {string} namespace @param {string} key @param {()=>T} compute @returns {T} */
    memo(state, namespace, key, compute) {
      let rows = cache.get(state);
      const full = namespace + ":" + key;
      if (rows?.has(full)) {
        counters.hits++;
        return rows.get(full);
      }
      counters.misses++;
      const value = compute();
      if (entries < maxEntries) {
        if (!rows) {
          rows = new Map();
          cache.set(state, rows);
        }
        rows.set(full, value);
        entries++;
      }
      return value;
    },
    count(name) {
      counters[name] = (counters[name] || 0) + 1;
    },
    /** @template T @param {string} name @param {()=>T} compute @returns {T} */
    measure(name, compute) {
      const before = clock();
      try {
        return compute();
      } finally {
        stages[name] = (stages[name] || 0) + Math.max(0, clock() - before);
      }
    },
    snapshot() {
      return {
        version: FOUNDATION_VERSION,
        elapsedMs: elapsed(),
        budgetMs: Number.isFinite(budget) ? budget : null,
        stopReason: reason(),
        cacheEntries: entries,
        counters: { ...counters },
        stages: { ...stages },
      };
    },
  };
}

export function analysisKey(id, options) {
  return JSON.stringify([
    id,
    Object.entries(options)
      .filter(
        ([key, value]) =>
          key !== "context" &&
          ["boolean", "number", "string"].includes(typeof value),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
