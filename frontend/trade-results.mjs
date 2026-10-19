import { tradeResults } from "../lib/trade-result.mjs";

export class TradeResults {
  constructor({ changed = () => {}, clock = Date.now } = {}) {
    Object.assign(this, { changed, clock });
    this.queue = [];
    this.cursor = null;
  }
  get current() {
    return this.queue[0] || null;
  }
  ingest(state, seat, baseline = false) {
    const next = state && {
      match: state.matchId,
      seat,
      event: state.eventId,
      version: state.version,
    };
    const previous = this.cursor;
    if (!next || baseline || !previous || previous.match !== next.match) {
      this.dispose();
      this.queue = [];
      this.cursor = next;
      return;
    }
    if (next.event < previous.event || next.version < previous.version) return;
    // Local hot-seat can return from the recipient to the sender in this same
    // command. Keep the event watermark, but not the previous seat's queue.
    if (previous.seat !== seat) {
      this.pause();
      this.queue = [];
    }
    this.cursor = next;
    if (state.players[seat]?.controller !== "human") return;
    const results = tradeResults(state);
    for (const result of results
      .filter(
        (r) => r.eventId > previous.event && [r.from, r.to].includes(seat),
      )
      .sort((a, b) => a.eventId - b.eventId)) {
      if (!this.queue.some((r) => r.id === result.id))
        this.queue.push({ ...result, seat, remaining: 3600 });
    }
    // The authoritative bounded public log is also the recovery/review source.
    const available = new Set(results.map((r) => r.id));
    this.queue = this.queue.filter((r) => available.has(r.id));
  }
  dismiss(id = this.current?.id) {
    if (!id) return;
    this.pause();
    this.queue = this.queue.filter((r) => r.id !== id);
    this.changed();
  }
  pause() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.timed)
      this.timed.remaining = Math.max(
        0,
        this.timed.remaining - (this.clock() - this.started),
      );
    this.timed = null;
  }
  sync(visible) {
    const r = this.current;
    if (
      !visible ||
      !r ||
      r.outcome === "accepted" ||
      (this.timed && this.timed !== r)
    )
      this.pause();
    if (!visible || !r || r.outcome === "accepted" || this.timer) return;
    this.timed = r;
    this.started = this.clock();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timed = null;
      if (this.current === r) this.queue.shift();
      this.changed();
    }, r.remaining);
  }
  dispose() {
    this.pause();
  }
}
