import { BOARD, money } from "../lib/content.mjs";
import { gameplayDecision } from "../lib/gameplay-presentation.mjs";
import { nusaText } from "../lib/currency.mjs";

// Presentation only: no transfers, claims or game decisions happen here.
export const readingTime = (text = "") =>
  Math.min(
    6500,
    Math.max(2300, 1200 + String(text).trim().split(/\s+/).length * 180),
  );

export class GameNotices {
  constructor({ changed = () => {}, clock = Date.now } = {}) {
    this.changed = changed;
    this.clock = clock;
    this.cursor = null;
    this.queue = [];
  }
  get current() {
    return this.queue[0] || null;
  }
  ingest(state, seat, baseline = false) {
    const next = state && {
      match: state.matchId,
      version: state.version,
      event:
        state.eventId ?? Math.max(0, ...(state.log || []).map((e) => e.id)),
    };
    const previous = this.cursor;
    if (!next || baseline || !previous || previous.match !== next.match) {
      this.dispose();
      this.queue = [];
      this.cursor = next;
      return;
    }
    if (next.version < previous.version || next.event < previous.event) return;
    this.cursor = next;
    if (state.players[seat]?.controller !== "human") return;
    for (const e of [...(state.log || [])]
      .filter((e) => e.id > previous.event && e.audience !== "private")
      .sort((a, b) => a.id - b.id)) {
      for (const [index, t] of (e.finance || []).entries()) {
        if (!(t.amount > 0)) continue;
        const id = `${next.match}:${e.id}:${index}`;
        if (t.kind === "rent" && t.to === seat) {
          this.push({
            id,
            kind: "rent",
            title: "Terima sewa",
            amount: t.amount,
            count: 1,
            text: `${state.players[t.from]?.name || "Pemain"} · ${BOARD[t.tile]?.name || "Properti"}`,
            duration: 2800,
          });
        } else if (["rent", "tax"].includes(t.kind) && t.from === seat) {
          this.push({
            id,
            kind: "payment",
            title: t.kind === "rent" ? "Sewa dibayar" : "Pajak dibayar",
            text: `${money(t.amount)} · ${BOARD[t.tile]?.name || "Pembayaran tercatat"}`,
            duration: 2600,
          });
        } else if (["salary", "card"].includes(t.kind) && t.to === seat) {
          this.push({
            id,
            kind: "bonus",
            title: t.kind === "salary" ? "Melewati Mulai" : "Nusa diterima",
            text: `+ ${money(t.amount)}${t.card?.title ? " · " + t.card.title : ""}`,
            duration: 2800,
          });
        }
      }
      if (
        ["jail", "release", "auctionResult"].includes(e.type) ||
        /menyimpan kartu bebas penjara/.test(e.text || "")
      ) {
        const title =
          {
            jail: "Masuk penjara",
            release: "Bebas dari penjara",
            auctionResult: "Lelang selesai",
          }[e.type] || "Kartu bebas penjara";
        this.push({
          id: `${next.match}:${e.id}`,
          kind: "event",
          title,
          text: nusaText(e.text),
          duration: readingTime(e.text),
        });
      } else if (e.card && e.card.player !== seat) {
        const card = e.card;
        const text = `${state.players[card.player]?.name || "Pemain"} · ${card.title}. ${card.text}`;
        this.push({
          id: `${next.match}:${e.id}`,
          kind: "card",
          title: card.deck === "chance" ? "Kesempatan" : "Dana Umum",
          text,
          duration: readingTime(text),
        });
      }
    }
  }
  push(notice) {
    const rent =
      notice.kind === "rent" && this.queue.find((n) => n.kind === "rent");
    if (rent) {
      rent.count++;
      rent.amount += notice.amount;
      rent.text = `${rent.count} pembayaran sewa · detail di Riwayat`;
      return;
    }
    // A burst must never leave the player reading a long backlog of old alerts.
    if (this.queue.length >= 4) this.queue.splice(1, 1);
    this.queue.push({ ...notice, remaining: notice.duration });
  }
  sync(active) {
    if (this.timer && !active) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.current)
        this.current.remaining = Math.max(
          0,
          this.current.remaining - (this.clock() - this.started),
        );
    }
    if (!active || this.timer || !this.current) return;
    const notice = this.current;
    this.started = this.clock();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.current === notice) this.queue.shift();
      this.changed();
    }, notice.remaining);
  }
  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}

// Exactly one automatic attempt per revealed card, through GameSession.act().
// Uncertain network outcomes require a deliberate retry after state recovery.
export class CardReader {
  constructor({ clock = Date.now, changed = () => {} } = {}) {
    this.clock = clock;
    this.changed = changed;
  }
  sync(state, seat, active, acknowledge) {
    const card =
      state?.phase === "card" &&
      state.card?.player === seat &&
      state.players[seat]?.controller === "human"
        ? state.card
        : null;
    const key = card
      ? JSON.stringify([
          state.matchId,
          seat,
          card.deck,
          card.idx,
          card.revealId ?? gameplayDecision(state).key,
        ])
      : null;
    if (key !== this.key) {
      this.dispose();
      this.key = key;
      this.attempted = false;
      this.failed = false;
      this.remaining = card ? readingTime(`${card.title} ${card.text}`) : 0;
    }
    if (this.timer && !active) {
      clearTimeout(this.timer);
      this.timer = null;
      this.remaining = Math.max(
        0,
        this.remaining - (this.clock() - this.started),
      );
    }
    if (!key || !active || this.attempted || this.timer) return;
    this.started = this.clock();
    this.timer = setTimeout(async () => {
      this.timer = null;
      this.attempted = true;
      const ok = await acknowledge();
      if (this.key === key) {
        this.failed = !ok;
        this.changed();
      }
    }, this.remaining);
  }
  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
