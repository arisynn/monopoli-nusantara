// Read-only diagnostics; never imported by the game/worker RNG or bot model.
function logGamma(z) {
  const p = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5)
    return (
      Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
    );
  z--;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
}
export function chiSquareP(statistic, df) {
  if (!(statistic >= 0) || !(df > 0)) return null;
  if (statistic === 0) return 1;
  const a = df / 2,
    x = statistic / 2,
    scale = Math.exp(a * Math.log(x) - x - logGamma(a));
  if (x < a + 1) {
    let sum = 1 / a,
      term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return Math.max(0, Math.min(1, 1 - sum * scale));
  }
  let b = x + 1 - a,
    c = 1e30,
    d = 1 / b,
    h = d;
  for (let n = 1; n < 1000; n++) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.max(0, Math.min(1, scale * h));
}
export function wilson(success, total) {
  if (!total) return null;
  const z = 1.959963984540054,
    p = success / total,
    d = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / d,
    half =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
const chi = (observed, expected, df) => {
  const statistic = observed.reduce(
      (n, v, i) => n + (expected[i] ? (v - expected[i]) ** 2 / expected[i] : 0),
      0,
    ),
    enough = expected.every((n) => n >= 5);
  return {
    statistic,
    df,
    p: enough ? chiSquareP(statistic, df) : null,
    minimumExpected: Math.min(...expected),
    note: enough
      ? "Exploratory; multiple comparisons are not independent proof of bias."
      : "Too few expected samples for asymptotic p-value.",
  };
};
function correlation(rows, lag = false) {
  let n = 0,
    x = 0,
    y = 0,
    xx = 0,
    yy = 0,
    xy = 0;
  for (const [a, b] of rows) {
    n++;
    x += a;
    y += b;
    xx += a * a;
    yy += b * b;
    xy += a * b;
  }
  const denominator = Math.sqrt((n * xx - x * x) * (n * yy - y * y));
  return {
    samples: n,
    value: denominator ? (n * xy - x * y) / denominator : null,
  };
}
export function diceStatistics(rows) {
  const n = rows.length,
    faces = [Array(6).fill(0), Array(6).fill(0)],
    pairs = Array(36).fill(0),
    sums = Array(11).fill(0);
  let doubles = 0,
    middle = 0;
  for (const {
    dice: [a, b],
  } of rows) {
    faces[0][a - 1]++;
    faces[1][b - 1]++;
    pairs[(a - 1) * 6 + b - 1]++;
    sums[a + b - 2]++;
    if (a === b) doubles++;
    if (a + b >= 6 && a + b <= 8) middle++;
  }
  const expectedSums = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map(
    (k) => (n * k) / 36,
  );
  const byMatch = new Map();
  for (const row of rows) {
    if (!byMatch.has(row.match)) byMatch.set(row.match, []);
    byMatch.get(row.match).push(row);
  }
  const lag = [[], []];
  for (const match of byMatch.values())
    for (let i = 1; i < match.length; i++)
      for (let d = 0; d < 2; d++)
        lag[d].push([match[i - 1].dice[d], match[i].dice[d]]);
  return {
    rolls: n,
    faces,
    pairs,
    sums,
    doubles: {
      count: doubles,
      rate: n ? doubles / n : 0,
      expected: 1 / 6,
      ci95: wilson(doubles, n),
    },
    sum6to8: {
      count: middle,
      rate: n ? middle / n : 0,
      expected: 16 / 36,
      ci95: wilson(middle, n),
    },
    tests: {
      faces: faces.map((f) => chi(f, Array(6).fill(n / 6), 5)),
      pairsUniform: chi(pairs, Array(36).fill(n / 36), 35),
      sums: chi(sums, expectedSums, 10),
      pairIndependence: chi(
        pairs,
        pairs.map((_, i) =>
          n ? (faces[0][Math.floor(i / 6)] * faces[1][i % 6]) / n : 0,
        ),
        25,
      ),
    },
    correlation: correlation(rows.map((r) => r.dice)),
    lagOne: lag.map((r) => correlation(r)),
  };
}
export class DiceAudit {
  constructor() {
    this.matches = new Map();
    this.duplicates = 0;
    this.conflicts = 0;
  }
  ingest(value, source = "input") {
    if (Array.isArray(value)) {
      for (const item of value) this.ingest(item, source);
      return;
    }
    if (!value || typeof value !== "object") return;
    const state = value.state?.log ? value.state : value;
    if (Array.isArray(state.log)) {
      const match = state.matchId || value.matchId || source;
      this.match(match).players = state.players || this.match(match).players;
      for (const e of state.log) this.event(e, match);
      return;
    }
    if (Array.isArray(value.events)) {
      for (const e of value.events) this.event(e, value.matchId || source);
      return;
    }
    if (value.type && value.id !== undefined)
      this.event(value, value.matchId || source);
  }
  match(id) {
    if (!this.matches.has(id))
      this.matches.set(id, { players: [], events: new Map() });
    return this.matches.get(id);
  }
  event(event, match) {
    const events = this.match(match).events,
      key = event.id,
      old = events.get(key);
    if (old) {
      this.duplicates++;
      if (
        JSON.stringify([old.dice, old.diceKind, old.actor]) !==
        JSON.stringify([event.dice, event.diceKind, event.actor])
      )
        this.conflicts++;
      return;
    }
    events.set(key, event);
  }
  result() {
    const rows = [];
    let invalid = 0,
      reconstructed = 0,
      tieMessages = 0,
      unknownJailContext = 0;
    for (const [match, { events, players }] of this.matches) {
      const sorted = [...events.values()].sort((a, b) => a.id - b.id),
        jail = new Map(
          players.map((p) => [
            p.id,
            sorted.some((e) => e.type === "start") ? false : null,
          ]),
        );
      for (const e of sorted) {
        const actor = Number.isInteger(e.actor)
          ? e.actor
          : players.find((p) => e.text?.startsWith(p.name + " "))?.id;
        if (e.type === "jail" && actor !== undefined) jail.set(actor, true);
        if (e.type === "release" && actor !== undefined) jail.set(actor, false);
        if (e.type !== "dice") continue;
        let dice = e.dice;
        if (!dice) {
          const pair = String(e.text || "").match(/([1-6])\s*\+\s*([1-6])/);
          if (!pair) {
            tieMessages++;
            continue;
          }
          dice = [+pair[1], +pair[2]];
          reconstructed++;
        }
        if (
          !Array.isArray(dice) ||
          dice.length !== 2 ||
          dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6)
        ) {
          invalid++;
          continue;
        }
        let kind =
          e.diceKind ||
          (/lempar awal/i.test(e.text)
            ? "opening"
            : /utilitas|Dadu baru/i.test(e.text)
              ? "utility"
              : "movement");
        if (kind === "movement") {
          if (jail.get(actor) === true) kind = "jail";
          else if (jail.get(actor) !== false) {
            kind = "movement-unknown-jail";
            unknownJailContext++;
          }
        }
        rows.push({
          match,
          id: e.id,
          dice,
          kind,
          role: players[actor]?.controller || "unknown",
        });
      }
    }
    const groups = (field) =>
      Object.fromEntries(
        [...new Set(rows.map((r) => r[field]))].map((value) => [
          value,
          diceStatistics(rows.filter((r) => r[field] === value)),
        ]),
      );
    return {
      matches: this.matches.size,
      duplicates: this.duplicates,
      conflicts: this.conflicts,
      invalid,
      reconstructed,
      tieMessages,
      unknownJailContext,
      overall: diceStatistics(rows),
      byRole: groups("role"),
      byKind: groups("kind"),
      limits: [
        "Counts use one pair per match/event ID, never snapshots or animation frames.",
        "Truncated logs are not a complete-match sample. Jail context is unknown unless supported by start/jail/release events.",
        "Exploratory statistics; short matches, stopping rules and multiple comparisons limit conclusions.",
      ],
    };
  }
}
