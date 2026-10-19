import { BOARD, money } from "../lib/content.mjs";
import { esc } from "./domain.mjs";

const validSide = (side) =>
  Array.isArray(side) &&
  side.length <= 28 &&
  side.every(
    (a) =>
      Number.isInteger(a?.tile) &&
      !!BOARD[a.tile]?.price &&
      typeof a.mortgaged === "boolean",
  );
const validResult = (r) =>
  r &&
  ["accepted", "rejected", "cancelled"].includes(r.status) &&
  Number.isInteger(r.from) &&
  Number.isInteger(r.to) &&
  r.from !== r.to &&
  Number.isInteger(r.actor) &&
  [r.from, r.to].includes(r.actor) &&
  validSide(r.give) &&
  validSide(r.take) &&
  [r.giveCash, r.takeCash, r.giveCards, r.takeCards].every(
    (n) => Number.isSafeInteger(n) && n >= 0,
  );
const defaultStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

// Independent of the animation queue and short-lived notices. Never issue a
// game command when reading/dismissing a receipt, including after reconnect.
export class TradeResults {
  constructor({ storage = defaultStorage() } = {}) {
    this.storage = storage;
    this.key = null;
    this.queue = [];
    this.cursor = null;
  }
  get current() {
    return this.queue[0] || null;
  }
  save() {
    try {
      this.storage?.setItem(
        this.key,
        JSON.stringify({ cursor: this.cursor, queue: this.queue }),
      );
    } catch {}
  }
  ingest(state, seat, { reset = false } = {}) {
    if (!state || state.players[seat]?.controller !== "human") {
      this.key = null;
      this.cursor = null;
      this.queue = [];
      return;
    }
    const key = `nusantara-trade-results-v1:${state.matchId}:${seat}`;
    const latest = { version: state.version, event: state.eventId };
    if (key !== this.key) {
      this.key = key;
      this.cursor = null;
      this.queue = [];
      try {
        const saved = JSON.parse(this.storage?.getItem(key) || "null");
        if (
          Number.isSafeInteger(saved?.cursor?.version) &&
          Number.isSafeInteger(saved?.cursor?.event) &&
          saved.cursor.version <= latest.version &&
          saved.cursor.event <= latest.event &&
          Array.isArray(saved.queue)
        ) {
          this.cursor = saved.cursor;
          this.queue = saved.queue.filter(
            (r) =>
              typeof r.id === "string" &&
              validResult(r) &&
              [r.from, r.to].includes(seat) &&
              state.players[r.from] &&
              state.players[r.to],
          );
        }
      } catch {}
    }
    if (
      !this.cursor ||
      (reset &&
        (latest.version < this.cursor.version ||
          latest.event < this.cursor.event))
    ) {
      // A first join is a baseline; an explicit save rewind must not show future receipts.
      this.cursor = latest;
      this.queue = [];
      this.save();
      return;
    }
    if (
      latest.version < this.cursor.version ||
      latest.event < this.cursor.event
    )
      return;
    for (const event of [...state.log]
      .filter((e) => e.id > this.cursor.event && e.audience !== "private")
      .sort((a, b) => a.id - b.id)) {
      const result = event.tradeResult;
      if (
        !validResult(result) ||
        ![result.from, result.to].includes(seat) ||
        !state.players[result.from] ||
        !state.players[result.to]
      )
        continue;
      const id = `${state.matchId}:${seat}:${event.id}`;
      if (!this.queue.some((r) => r.id === id))
        this.queue.push({
          ...structuredClone(result),
          id,
          text: event.text,
          fromName: state.players[result.from].name,
          toName: state.players[result.to].name,
        });
    }
    this.cursor = latest;
    this.save();
  }
  dismiss(id) {
    if (!id || this.current?.id !== id) return false;
    this.queue.shift();
    this.save();
    return true;
  }
}

export function renderTradeResult(result, seat, { lead }) {
  const sender = seat === result.from;
  const other = sender ? result.toName : result.fromName;
  const title =
    result.status === "accepted"
      ? "Barter berhasil"
      : result.status === "cancelled"
        ? "Tawaran barter dibatalkan"
        : "Tawaran barter ditolak";
  const description =
    result.status === "accepted"
      ? `Transaksi dengan ${other} sudah tercatat.`
      : result.status === "cancelled"
        ? `${sender ? "Anda" : result.fromName} membatalkan tawaran.`
        : `${sender ? result.toName : "Anda"} menolak tawaran barter.`;
  const side = (label, list, cash, cards) =>
    `<section class="trade-side trade-result-side"><h3>${label}</h3>${list
      .map(
        (a) =>
          `<div class="trade-asset"><i style="background:${BOARD[a.tile].color}"></i><div><b>${esc(BOARD[a.tile].name)}</b>${a.mortgaged ? '<small class="trade-property-status is-mortgaged">Digadai saat transaksi</small>' : ""}</div></div>`,
      )
      .join(
        "",
      )}${cash ? `<div class="trade-asset"><b>${esc(money(cash))}</b></div>` : ""}${cards ? `<div class="trade-asset"><b>${cards} kartu bebas penjara</b></div>` : ""}${!list.length && !cash && !cards ? '<p class="trade-empty">Tidak ada.</p>' : ""}</section>`;
  const received = sender ? "take" : "give",
    given = sender ? "give" : "take";
  const html =
    lead("trade", title, description) +
    (result.status === "accepted"
      ? `<div class="trade-columns">${side("Anda menerima", result[received], result[received + "Cash"], result[received + "Cards"])}${side("Anda memberi", result[given], result[given + "Cash"], result[given + "Cards"])}</div>${[...result.give, ...result.take].some((a) => a.mortgaged) ? '<p class="inline-note">Ada properti tergadai dalam transaksi. Keputusan bunga atau penebusan mengikuti aturan permainan dan ditampilkan terpisah bila diperlukan.</p>' : ""}`
      : '<p class="inline-note">Tidak ada uang, properti, atau kartu yang berpindah dari tawaran ini.</p>');
  // Reuse the shared persistent Tutup control; no second popup or duplicate close button.
  return { title, html, footer: "" };
}
