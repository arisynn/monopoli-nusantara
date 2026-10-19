import { BOARD, money } from "../lib/content.mjs";
import {
  eventTradeResult,
  tradeResults,
  tradeResultTitle,
} from "../lib/trade-result.mjs";
import { esc } from "./domain.mjs";

export function latestTradeResult(state, seat) {
  return (
    tradeResults(state)
      .filter((r) => [r.from, r.to].includes(seat))
      .sort((a, b) => b.eventId - a.eventId)[0] || null
  );
}

export function latestTradeLink(state, seat) {
  const latest = latestTradeResult(state, seat);
  return latest
    ? `<button type="button" class="link-button trade-receipt-link" data-action="tradeLatest">Hasil barter terbaru</button>`
    : "";
}

export function tradeResultContent(state, seat, eventId) {
  const event = state?.log?.find(
    (e) => e.id === eventId && e.type === "trade" && e.audience !== "private",
  );
  const r = event && eventTradeResult(state, event);
  if (!r)
    return {
      title: "Catatan barter",
      html: `<div class="popup-title"><div><h2>Catatan barter</h2></div></div><p>${esc(event?.text || "Catatan ini sudah tidak tersedia dalam jendela riwayat.")}</p><p class="inline-note">Rincian terstruktur belum tersedia untuk catatan ini.</p>`,
    };
  const player = (id) => state.players[id]?.name || "Pemain";
  const title = tradeResultTitle(r);
  const own = [r.from, r.to].includes(seat);
  const partner = player(seat === r.to ? r.from : r.to);
  const header = `<div class="popup-title"><div><h2>${title}</h2><p>${own ? `Dengan ${esc(partner)}` : `${esc(player(r.from))} ↔ ${esc(player(r.to))}`} · Ronde ${r.round}</p></div></div>`;
  if (r.outcome !== "accepted")
    return {
      title,
      html:
        header +
        `<div class="trade-result-status" role="status"><b>${esc(player(r.actor))} ${r.outcome === "cancelled" ? "membatalkan tawaran." : "menolak tawaran."}</b><p>Tawaran ini tidak memindahkan properti, uang, atau kartu.</p></div>`,
    };
  const section = (label, side, incoming) => {
    const rows = side.properties.map(({ tile, mortgaged }) => {
      const t = BOARD[tile];
      return `<li class="trade-result-property"><i style="background:${t.color || "#52745c"}"></i><span>${esc(t.name)}</span>${mortgaged ? '<small class="trade-result-mortgage">Digadai saat transaksi</small>' : ""}</li>`;
    });
    if (side.cash)
      rows.push(
        `<li class="trade-result-cash ${incoming ? "positive" : "negative"}"><span>Uang</span><strong>${incoming ? "+" : "−"} ${esc(money(side.cash))}</strong></li>`,
      );
    if (side.cards)
      rows.push(
        `<li><span>Kartu bebas penjara</span><strong>${side.cards} kartu</strong></li>`,
      );
    return `<section class="trade-result-side" data-direction="${incoming ? "in" : "out"}"><h3>${esc(label)}</h3><ul>${rows.join("") || '<li class="trade-result-empty">Tidak ada</li>'}</ul></section>`;
  };
  const received = seat === r.to ? r.give : r.take;
  const given = seat === r.to ? r.take : r.give;
  const sides = own
    ? section("Anda menerima", received, true) +
      section("Anda memberikan", given, false)
    : section(`${player(r.from)} memberikan`, r.give, false) +
      section(`${player(r.to)} memberikan`, r.take, false);
  const mortgages = [...r.give.properties, ...r.take.properties].some(
    (p) => p.mortgaged,
  );
  const pending =
    state.phase === "mortgage" &&
    [...r.give.properties, ...r.take.properties].some(
      (p) => p.tile === state.mortgageDecision?.tile,
    );
  return {
    title,
    html:
      header +
      `<div class="trade-result-sides">${sides}</div>${mortgages ? `<p class="trade-result-footnote">${pending ? "Keputusan tebus atau bayar bunga masih perlu diselesaikan." : "Label gadai menunjukkan kondisi saat barter. Biaya tebus/bunga mengikuti aturan bank dan tidak termasuk angka pertukaran di atas."}</p>` : ""}`,
  };
}
