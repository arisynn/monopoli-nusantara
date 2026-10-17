import { bankSnapshot } from "../lib/bank-economy.mjs";
import { BOARD, money } from "../lib/content.mjs";
import { financeLabels } from "../lib/finance.mjs";
import { esc } from "./domain.mjs";
import { lucideIcon } from "./lucide-icons.mjs";
const fact = (label, value) =>
  `<div class="bank-fact"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
const detail = (key, label, meta, html) =>
  `<details class="bank-detail" data-asset-key="bank-${key}"><summary><span>${esc(label)}</span><small>${esc(meta)}</small>${lucideIcon("arrow", 14)}</summary><div class="bank-detail-body">${html}</div></details>`;
const certificate = (id, text) =>
  `<button type="button" class="bank-certificate" data-action="certificate" data-id="${id}" aria-label="Lihat sertifikat ${esc(BOARD[id].name)}"><span>${text}</span>${lucideIcon("arrow", 16)}</button>`;
export function bankContent(s) {
  const b = bankSnapshot(s),
    l = b.ledger;
  const mortgageRows = b.mortgaged
    .map((m) =>
      certificate(
        m.tile,
        `<b>${esc(BOARD[m.tile].name)}</b><small>${esc(s.players[m.owner].name)} · Pokok ${esc(money(m.principal))} · Tebus ${esc(money(m.redemption))}</small>`,
      ),
    )
    .join("");
  const categories = Object.entries(l.byKind)
    .map(([kind, row]) => fact(financeLabels[kind], money(row.total)))
    .join("");
  const participant = (id) =>
    id === null ? "Bank" : s.players[id]?.name || "Pemain";
  const recent = l.recent
    .map(
      (t) =>
        `<li><div><b>${esc(financeLabels[t.kind])}${t.tile !== undefined ? " · " + esc(BOARD[t.tile].name) : ""}</b><small>${esc(participant(t.from))} → ${esc(participant(t.to))} · Ronde ${t.round}</small></div><strong>${esc(money(t.amount))}</strong></li>`,
    )
    .join("");
  return {
    title: "Bank Nusantara",
    html: `<div class="popup-title"><span class="title-icon">${lucideIcon("bank", 28)}</span><div><h2 id="popup-title">Bank Nusantara</h2><p>Catatan ekonomi pertandingan.</p></div></div>
 <section class="bank-circulation" aria-label="Nusa beredar"><span>Nusa beredar</span><strong>${esc(money(b.circulation))}</strong><small>Uang tunai seluruh pemain</small></section>
 <div class="bank-metrics"><div><span>Perputaran tercatat</span><b>${esc(money(l.turnover))}</b></div><div><span>Pokok gadai aktif</span><b>${esc(money(b.mortgagePrincipal))}</b></div></div>
 ${!l.complete ? `<p class="bank-scope" role="note">${s.schemaVersion === 1 ? "Simpanan klasik lama: riwayat transaksi bank tersedia pada pertandingan baru." : s.bankEconomy ? `Riwayat tersedia sejak ronde ${l.fromRound} saat simpanan ini diperbarui.` : "Simpanan lama: pencatatan dimulai pada aksi berikutnya."} Saldo dan gadai menampilkan kondisi saat ini.</p>` : ""}
 ${detail("flows", "Arus Nusa", `${l.count} transaksi`, fact("Uang pada awal pencatatan", money(l.openingCirculation)) + fact("Keluar dari bank", money(l.issued)) + fact("Masuk ke bank", money(l.absorbed)) + fact("Transfer antarpemain", money(l.transferred)) + `<p class="bank-explanation">Perputaran adalah jumlah nominal transaksi uang yang tercatat, dihitung sekali per transfer. Modal awal tidak dihitung sebagai perputaran. Sewa dan barter uang tidak menambah Nusa beredar. Bank menyediakan dana sesuai aturan permainan.</p>` + (categories ? `<h3>Menurut jenis transaksi</h3>${categories}` : ""))}
 ${detail("mortgages", "Aset tergadai", `${b.mortgaged.length} aset`, mortgageRows || '<p class="empty">Belum ada aset tergadai.</p>')}
 ${detail("inventory", "Persediaan bank", `${b.houses} rumah · ${b.hotels} hotel`, fact("Rumah tersedia", String(b.houses)) + fact("Hotel tersedia", String(b.hotels)) + fact("Properti belum dimiliki", String(b.unowned.length)) + b.unowned.map((id) => certificate(id, `<b>${esc(BOARD[id].name)}</b><small>Harga ${esc(money(BOARD[id].price))}</small>`)).join(""))}
 ${detail("recent", "Transaksi terakhir", `${l.recent.length} ditampilkan`, recent ? `<ol class="bank-transactions">${recent}</ol><p class="bank-explanation">Maksimal 40 transaksi terakhir. Total tetap mencakup seluruh masa pencatatan.</p>` : '<p class="empty">Belum ada transaksi tercatat.</p>')}`,
    footer:
      '<button type="button" class="primary" data-action="close">Selesai</button>',
  };
}
