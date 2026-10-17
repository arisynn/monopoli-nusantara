import { bankContent } from "./bank-view.mjs";
import { estimateTrade } from "./trade-value.mjs";
import { renderAssetPanel } from "./asset-panel.mjs";
import { specialTileInfo } from "./tile-info.mjs";
import { playerLedger, publicEvents } from "./economy-view.mjs";
import { cardIcon } from "./card-icons.mjs";
import {
  BOARD,
  GROUPS,
  money,
  assets,
  canTrade,
  redemption,
  worth,
  stock,
  buildTargets,
} from "../lib/game.mjs";
import { TOKENS, pawnFor } from "../lib/pawns.mjs";
import { MODELS } from "../lib/bot/mind-config.mjs";
import { financeRows, financeLabels } from "../lib/finance.mjs";
import { bankruptcyShortfall } from "../lib/gameplay-presentation.mjs";
import { tradeChoices, tradeDraftStatus } from "../lib/compact-ui.mjs";
import { AUCTION_RULES } from "../lib/content.mjs";
import {
  esc,
  claimableRent,
  assetPermission,
  bidMinimum,
  roomEligibility,
} from "./domain.mjs";
import { icon, avatar, pawnArt, buildingArt, eventArt } from "./art.mjs";
const btn = (
  label,
  action,
  { primary = false, disabled = false, extra = "", sym } = {},
) =>
  `<button type="button" class="${primary ? "primary" : "secondary"}" data-action="${action}" ${disabled ? "disabled" : ""} ${extra}>${sym ? icon(sym) : ""}${label}</button>`;
const commandButton = (
  label,
  type,
  c,
  data = {},
  primary = false,
  disabled = false,
) =>
  btn(esc(label), "command", {
    primary,
    disabled: c.session.pending || c.session.paused || disabled,
    extra: `data-type="${type}" ${Object.entries(data)
      .map(([k, v]) => `data-${k}="${esc(v)}"`)
      .join(" ")}`,
  });
const amount = (n) => `<span class="amount">${esc(money(n))}</span>`;
const lead = (iconName, title, desc = "") =>
  `<div class="popup-title"><span class="title-icon">${icon(iconName, 30)}</span><div><h2 id="popup-title">${esc(title)}</h2>${desc ? `<p>${esc(desc)}</p>` : ""}</div></div>`;
function propertyHero(t, s) {
  const a = s.assets[t.id];
  const city = t.type === "city",
    graphic = city
      ? ""
      : t.type === "station"
        ? eventArt(3, "mini-deed-logo")
        : t.id === 12
          ? eventArt(7, "mini-deed-logo")
          : '<img class="mini-deed-logo" src="/assets/classic/water.png" alt="">',
    rows = city
      ? [
          ["Sewa", money(t.rents[0])],
          ["1 rumah", money(t.rents[1])],
          ["Gadai", money(t.mortgage)],
        ]
      : t.type === "station"
        ? [
            ["1 stasiun", money(250)],
            ["2 stasiun", money(500)],
            ["Gadai", money(t.mortgage)],
          ]
        : [
            ["1 utilitas", "4 × dadu"],
            ["2 utilitas", "10 × dadu"],
            ["Gadai", money(t.mortgage)],
          ];
  const miniature = `<button type="button" class="mini-deed" data-action="certificate" data-id="${t.id}" aria-label="Lihat sertifikat ${esc(t.name)}"><span class="mini-deed-paper" aria-hidden="true"><span class="mini-deed-heading ${city ? "" : "mini-deed-special"}" style="--deed-color:${city ? t.color : "#fffcf5"}"><small>SERTIFIKAT</small>${graphic}<b>${esc(t.name)}</b></span><span class="mini-deed-rows">${rows.map(([label, value]) => `<span><span>${label}</span><b>${esc(value)}</b></span>`).join("")}</span></span><span class="mini-deed-caption">Lihat detail</span></button>`;
  return `<div class="property-hero">${miniature}<div><span class="group-label" style="--group:${t.color}">${esc(t.group >= 0 ? GROUPS[t.group].name : t.type === "station" ? "Transportasi" : "Utilitas")}</span><h3>${esc(t.name)}</h3><p>${a?.owner != null ? "Milik " + esc(s.players[a.owner].name) : "Tersedia di bank"}${a?.mortgaged ? " · Digadai" : ""}</p><span class="property-price-label">${city ? "Harga tanah" : t.type === "station" ? "Harga stasiun" : "Harga utilitas"}</span><strong>${esc(money(t.price))}</strong></div></div>`;
}

function certificate(t, s) {
  const a = s.assets[t.id],
    city = t.type === "city",
    row = (label, value) =>
      `<div class="deed-row"><span>${label}</span><b>${esc(value)}</b></div>`;
  const header = city
    ? `<header style="background:${t.color}"><small>SERTIFIKAT KEPEMILIKAN</small><h2 id="popup-title">${esc(t.name.toUpperCase())}</h2></header>`
    : `<header class="deed-special">${t.type === "station" ? eventArt(3, "deed-logo") : t.id === 12 ? eventArt(7, "deed-logo") : '<img class="deed-logo" src="/assets/classic/water.png" alt="">'}<h2 id="popup-title">${esc(t.name.toUpperCase())}</h2></header>`;
  const rent = city
    ? row("Sewa tanah", money(t.rents[0])) +
      row("Set warna lengkap", money(t.rents[0] * 2)) +
      [1, 2, 3, 4, 5]
        .map((i) =>
          row(
            `${buildingArt(i === 5 ? "hotel" : "house")} ${i === 5 ? "1 hotel" : i + " rumah"}`,
            money(t.rents[i]),
          ),
        )
        .join("")
    : t.type === "station"
      ? [1, 2, 3, 4]
          .map((n) => row(n + " stasiun", money(250 * 2 ** (n - 1))))
          .join("")
      : '<p class="deed-rule">Satu utilitas: sewa <b>4 × jumlah dadu × N 1</b>.</p><p class="deed-rule">Dua utilitas: sewa <b>10 × jumlah dadu × N 1</b>.</p>';
  return `<article class="deed">${header}<section class="deed-rents">${rent}</section><section class="deed-costs">${row("Harga tanah", money(t.price))}${city ? row(buildingArt("house") + " Biaya 1 rumah", money(t.build)) + row(buildingArt("hotel") + " Biaya 1 hotel", money(t.build)) + "<small>Hotel menggantikan 4 rumah.</small>" : ""}${row("Nilai gadai", money(t.mortgage))}${a?.mortgaged ? row("Biaya tebus", money(redemption(t.id))) : ""}</section><footer>${a?.owner != null ? "Milik " + esc(s.players[a.owner].name) : "Tersedia di bank"}${a?.mortgaged ? " · Digadai" : ""}</footer></article>`;
}
function buy(c) {
  const t = BOARD[c.s.buy];
  return {
    title: "Beli " + t.name,
    html:
      certificate(t, c.s) +
      `<div class="fact-row"><span>Saldo Anda</span>${amount(c.s.players[c.seat].cash)}</div>`,
    footer:
      commandButton(
        `Beli ${money(t.price)}`,
        "BUY",
        c,
        {},
        true,
        c.s.players[c.seat].cash < t.price,
      ) + commandButton("Mulai lelang", "AUCTION", c, {}, false),
  };
}
function property(c, p) {
  const t = BOARD[p.id],
    a = c.s.assets[p.id];
  if (!t?.price) return specialTileInfo(p.id, { lead, btn, amount });
  return {
    title: t.name,
    html: certificate(t, c.s),
    footer: p.preview
      ? btn("Kembali", "close", { sym: "back" })
      : a?.owner === c.seat
        ? btn("Kelola di Aset Saya", "manage", {
            primary: true,
            extra: `data-id="${t.id}"`,
            sym: "home",
          })
        : btn("Tutup", "close"),
  };
}
function assetList(c, p) {
  return renderAssetPanel({ ...c, popup: p }, { btn, lead, amount });
}

function tradePropertyDetail(s, id) {
  const t = BOARD[id],
    a = s.assets[id];
  const status = a?.mortgaged
    ? `Digadai · jika diterima: bunga ${money(Math.ceil(t.mortgage / 10))} atau tebus ${money(redemption(id))}`
    : a?.level > 0
      ? a.level === 5
        ? "1 hotel"
        : `${a.level} rumah`
      : "Tidak digadai";
  return `<button type="button" class="trade-property-detail" data-action="certificate" data-id="${id}" aria-label="Lihat sertifikat ${esc(t.name)}"><b>${esc(t.name)}</b><small>Harga beli ${esc(money(t.price || 0))}</small><small>Nilai gadai ${esc(money(t.mortgage || 0))}</small><small class="trade-property-status ${a?.mortgaged ? "is-mortgaged" : ""}">${esc(status)}</small></button>`;
}
function tradeProperty(s, id, side = null) {
  return `<div class="trade-asset trade-property"><i style="background:${BOARD[id].color}"></i>${tradePropertyDetail(s, id)}${side ? `<button type="button" class="trade-property-remove" data-action="tradeRemove" data-side="${side}" data-id="${id}" aria-label="Hapus ${esc(BOARD[id].name)}">${icon("close", 16)}</button>` : ""}</div>`;
}
function tradeValue(s, ids) {
  return ids.length
    ? `<p class="trade-value-summary">Nilai beli aset <b>${esc(money(ids.reduce((sum, id) => sum + (BOARD[id]?.price || 0), 0)))}</b></p>`
    : "";
}

export function tradeEstimateMarkup(s, trade, seat) {
  const estimate = estimateTrade(s, trade, seat);
  if (!estimate)
    return '<p class="trade-estimate-empty">Tambahkan aset atau uang yang valid untuk melihat estimasi.</p>';
  const direction =
      estimate.delta > 0 ? "gain" : estimate.delta < 0 ? "loss" : "even",
    label =
      estimate.delta > 0
        ? "Estimasi laba"
        : estimate.delta < 0
          ? "Estimasi rugi"
          : "Selisih acuan",
    sign = estimate.delta > 0 ? "+ " : estimate.delta < 0 ? "− " : "",
    who =
      estimate.perspective === seat
        ? "Anda"
        : s.players[estimate.perspective].name;
  return `<div class="trade-estimate-heading ${direction}"><b>${label}</b><strong>${sign}${esc(money(Math.abs(estimate.delta)))}</strong></div><small>Nilai acuan untuk ${esc(who)}</small><div class="trade-estimate-values"><div><span>Nilai diterima</span>${amount(estimate.received)}</div><div><span>Nilai diberikan</span>${amount(estimate.given)}</div></div>${estimate.unpricedCards ? "<small>Kartu bebas penjara belum diberi nilai.</small>" : ""}<details><summary>Dasar perhitungan</summary><p>Harga beli properti + uang. Properti tergadai dikurangi biaya tebus saat diterima. Potensi sewa, monopoli dan kartu bebas penjara belum dinilai. Ini acuan barter, bukan laba pasti.</p></details>`;
}

function trade(c, p) {
  if (!c.ui.trade)
    c.ui.trade = {
      to: c.s.players.find((x) => x.id !== c.seat && !x.out)?.id,
      give: [],
      take: [],
      giveCash: 0,
      takeCash: 0,
      giveCards: 0,
      takeCards: 0,
    };
  const draft = c.ui.trade,
    from = p.counter ? c.s.trade.to : c.seat,
    other = c.s.players[draft.to],
    status = tradeDraftStatus(c.s, from, draft);
  return {
    title: p.counter ? "Tawaran Balik" : "Perdagangan",
    html:
      lead(
        "trade",
        p.counter ? "Tawaran Balik" : "Perdagangan",
        "Ketuk properti untuk melihat sertifikat. Harga beli menjadi acuan barter.",
      ) +
      `<label class="field">Pemain tujuan<select name="tradeOpponent" ${p.counter ? "disabled" : ""}>${c.s.players
        .filter((x) => x.id !== from && !x.out)
        .map(
          (x) =>
            `<option value="${x.id}" ${x.id === draft.to ? "selected" : ""}>${esc(x.name)}</option>`,
        )
        .join("")}</select></label><div class="trade-columns">${[
        ["give", from, "Anda memberi"],
        ["take", draft.to, "Anda menerima"],
      ]
        .map(
          ([side, owner, label]) =>
            `<section class="trade-side"><div class="trade-person">${avatar(owner)}<b>${esc(label)}</b></div>${draft[side].map((id) => tradeProperty(c.s, id, side)).join("")}${tradeValue(c.s, draft[side])}<button class="add-asset" data-action="tradePicker" data-side="${side}" data-owner="${owner}">${icon("plus", 16)}Tambah properti</button><label class="field">Nusa<input name="${side}Cash" inputmode="decimal" value="${esc(c.ui.tradeInputs?.[side + "Cash"] ?? (Number.isFinite(draft[side + "Cash"]) ? draft[side + "Cash"] / 10 : ""))}" aria-label="${label} Nusa"></label><label class="field">Kartu bebas penjara<select name="${side}Cards">${Array.from({ length: c.s.players[owner]?.cards.length + 1 || 1 }, (_, n) => `<option value="${n}" ${n === draft[side + "Cards"] ? "selected" : ""}>${n} kartu</option>`).join("")}</select></label></section>`,
        )
        .join(
          "",
        )}</div><section class="trade-estimate" data-trade-estimate>${tradeEstimateMarkup(c.s, { ...draft, from }, c.seat)}</section><button class="link-button" data-action="discardTradeDraft">Kosongkan draft</button><p class="draft-status" data-draft-status>${c.ui.draftPersistent ? "Draft tersimpan di perangkat · belum dikirim" : "Draft sesi · belum dikirim"}</p><p class="inline-note" data-trade-status>${esc(status.reason || "Kepemilikan dan saldo diperiksa kembali saat transaksi.")}</p>`,
    footer:
      btn(p.counter ? "Kirim balasan" : "Ajukan tawaran", "submitTrade", {
        primary: true,
        disabled:
          c.session.busy ||
          !status.hasValue ||
          status.invalid ||
          !other ||
          (!canTrade(c.s, from) && !p.counter),
        extra: `data-counter="${p.counter ? "true" : "false"}"`,
        sym: "trade",
      }) + btn("Simpan & tutup", "saveTradeDraft"),
  };
}
function incoming(c) {
  const t = c.s.trade,
    own = t.to === c.seat,
    side = (ids, cash, cards) =>
      `${ids.map((id) => tradeProperty(c.s, id)).join("")}${tradeValue(c.s, ids)}${cash ? `<div class="trade-asset">${amount(cash)}</div>` : ""}${cards ? `<p>${cards} kartu bebas penjara</p>` : ""}`;
  return {
    title: "Tawaran Barter",
    html:
      lead(
        "trade",
        "Tawaran Barter",
        `${c.s.players[t.from].name} → ${c.s.players[t.to].name}`,
      ) +
      `<div class="trade-columns"><section class="trade-side"><h3>${own ? "Anda menerima" : "Pengirim memberi"}</h3>${side(t.give, t.giveCash, t.giveCards)}</section><section class="trade-side"><h3>${own ? "Anda memberi" : "Pengirim meminta"}</h3>${side(t.take, t.takeCash, t.takeCards)}</section></div><section class="trade-estimate" data-trade-estimate>${tradeEstimateMarkup(c.s, t, c.seat)}</section>`,
    footer: own
      ? commandButton("Terima", "TRADE_ACCEPT", c, {}, true) +
        btn("Tawar balik", "counter", { disabled: c.session.busy }) +
        commandButton("Tolak", "TRADE_REJECT", c)
      : `<p class="inline-note">Menunggu keputusan ${esc(c.s.players[t.to].name)}.</p>`,
  };
}
function picker(c, p) {
  const draft = c.ui.trade,
    rows = tradeChoices(c.s, p.owner, draft[p.side]);
  return {
    title: "Pilih Properti",
    html:
      lead(
        "assets",
        "Pilih Properti",
        p.side === "give"
          ? "Properti yang Anda berikan"
          : "Properti yang Anda terima",
      ) +
      (rows
        .map(
          (t) =>
            `<div class="choice-row trade-choice"><i style="background:${t.color}"></i><div class="trade-choice-info">${tradePropertyDetail(c.s, t.id)}${t.detail.startsWith("Harga") || t.detail === "Digadai" ? "" : `<small class="trade-choice-warning">${esc(t.detail)}</small>`}</div><label class="trade-choice-select"><input type="checkbox" name="tradeAsset" value="${t.id}" data-side="${p.side}" aria-label="Pilih ${esc(t.label)}" ${draft[p.side].includes(t.id) ? "checked" : ""} ${t.disabled ? "disabled" : ""}></label></div>`,
        )
        .join("") ||
        '<p class="empty">Belum ada properti yang dapat ditukar.</p>'),
    footer: btn("Selesai", "pickerDone", { primary: true }),
  };
}
function auction(c, p) {
  const a = c.s.auction,
    id =
      a.kind === "building"
        ? (a.targets[c.seat] ?? Object.values(a.targets)[0])
        : a.tile,
    t = BOARD[id],
    min = bidMinimum(c.s),
    offer = Math.max(min, c.ui.bid || 0),
    can =
      !p.settling &&
      a.participants.includes(c.seat) &&
      a.highest !== c.seat &&
      c.s.players[c.seat].controller === "human" &&
      !c.s.players[c.seat].out;
  return {
    title: "Lelang Properti",
    html:
      lead(
        "gavel",
        a.kind === "building" ? "Lelang Bangunan" : "Lelang Properti",
        p.settling
          ? "Tawaran ditutup · menampilkan hasil."
          : "Penawaran terbuka · tanpa timer paksa.",
      ) +
      propertyHero(t, c.s) +
      `<div class="auction-bid"><span>Tawaran tertinggi saat ini</span>${amount(a.amount)}<small>${a.highest === null ? "Belum ada penawaran" : "Oleh " + esc(c.s.players[a.highest].name)}</small></div><div class="auction-people" data-count="${a.participants.length}">${a.participants.map((i) => `<div data-auction-player="${i}" class="${i === a.highest ? "selected" : ""}">${avatar(i)}<b>${esc(c.s.players[i].name)}</b><small>${i === a.highest ? (p.settling ? "Menang" : "Tertinggi") : p.settling ? "Selesai" : a.passed.includes(i) ? "Lewati" : i === a.bidder ? "Berikutnya" : "Aktif"}</small></div>`).join("")}</div><label class="field"><span>Tawaran Nusa (minimal ${esc(money(min))})</span><input name="bid" type="number" min="${min / 10}" step="${AUCTION_RULES.increment / 10}" value="${offer / 10}" inputmode="decimal" ${p.settling ? "disabled" : ""}></label><div class="chips">${[10, 20, 50, 100].map((n) => `<button data-action="bidStep" data-amount="${n * 10}" ${p.settling ? "disabled" : ""}>+ N ${n}</button>`).join("")}</div><p class="inline-note">Kas Anda ${esc(money(c.s.players[c.seat].cash))}. ${p.settling ? "Pembayaran pemenang sedang ditampilkan." : a.highest === c.seat ? "Tawaran Anda sedang tertinggi." : a.passed.includes(c.seat) ? "Anda masih boleh menawar lagi selama lelang terbuka." : ""}</p>`,
    footer:
      btn("Tawar", "bid", {
        primary: true,
        disabled: c.session.busy || !can || offer > c.s.players[c.seat].cash,
        sym: "gavel",
      }) +
      commandButton(
        "Lewati",
        "PASS",
        c,
        {},
        false,
        !can || a.passed.includes(c.seat),
      ),
  };
}
function jail(c) {
  const p = c.s.players[c.seat];
  return {
    title: "Giliran di Penjara",
    html:
      lead(
        "bank",
        "Giliran di Penjara",
        `Percobaan ${p.jail + 1} dari 3 · ${p.name}`,
      ) +
      `<div class="jail-art"><img src="/assets/classic/jail.png" alt="Penjara"></div><div class="fact-row"><span>Saldo Anda</span>${amount(p.cash)}</div><p class="body-copy">Pilih cara keluar yang sah. Menutup popup tidak mengulang kejadian masuk penjara.</p>`,
    footer:
      commandButton("Bayar N 50", "JAIL_PAY", c, {}, true, p.cash < 500) +
      commandButton(
        "Gunakan kartu",
        "JAIL_CARD",
        c,
        {},
        false,
        !p.cards.length,
      ) +
      commandButton("Coba dadu kembar", "ROLL", c),
  };
}
function debt(c) {
  const d = c.s.debt,
    p = c.s.players[d.from];
  return {
    title: "Selesaikan Tagihan",
    html:
      lead(
        "bank",
        d.label || "Tagihan Belum Lunas",
        "Kewajiban tetap tersimpan sampai diselesaikan.",
      ) +
      `<div class="big-amount">${amount(d.amount)}</div><div class="fact-row"><span>Saldo Anda</span>${amount(p.cash)}</div><div class="fact-row"><span>Kekurangan</span>${amount(Math.max(0, d.amount - p.cash))}</div><p class="body-copy">Jual bangunan, gadai aset atau susun barter untuk memenuhi tagihan.</p>`,
    footer:
      commandButton("Bayar tagihan", "PAY", c, {}, true, p.cash < d.amount) +
      btn("Kelola aset", "assets", {
        extra: `data-id="${d.from}"`,
        sym: "assets",
      }) +
      btn("Barter", "trade", { sym: "trade" }) +
      btn("Nyatakan bangkrut", "bankrupt", {
        disabled: bankruptcyShortfall(c.s, d.from) <= 0,
      }),
  };
}
function event(c, p) {
  const e = p.event;
  if (e.card) {
    const card = e.card,
      type = card.deck === "chance" ? "Kesempatan" : "Dana Umum";
    return {
      title: type,
      html: `<article class="event-card retro-card ${card.deck === "chance" ? "chance" : "community"}"><header><h2 id="popup-title">${type.toUpperCase()}</h2>${card.deck === "chance" ? eventArt(5, "header-icon") : '<img src="/assets/cards/chest.png" alt="">'}</header><section class="retro-content"><span class="card-illustration" data-card-icon="${cardIcon(card)}" style="--card-x:${((cardIcon(card) % 4) * 100) / 3}%;--card-y:${(Math.floor(cardIcon(card) / 4) * 100) / 3}%" aria-hidden="true"></span><div><h3>${esc(card.title)}</h3><p>${esc(card.text)}</p></div></section><small>Untuk ${esc(c.s.players[card.player]?.name || "pemain")}</small></article>`,
      footer: p.interactive
        ? commandButton("Jalankan kartu", "ACK", c, {}, true)
        : btn("Lanjut", "dismissEvent", { primary: true }),
    };
  }
  if (e.auctionResult) {
    const r = e.auctionResult;
    return {
      title: "Hasil Lelang",
      html:
        lead("gavel", "Lelang Selesai") +
        `<div class="result-hero">${icon("trophy", 55)}<h3>${r.winner === null ? "Belum ada pemenang" : esc(c.s.players[r.winner]?.name)}</h3>${amount(r.amount)}<p>${esc(r.tile !== null ? BOARD[r.tile]?.name : "Lelang selesai")}</p></div>`,
      footer: btn("Lanjut", "dismissEvent", { primary: true }),
    };
  }
  return {
    title: e.title,
    html:
      lead(e.type === "jail" ? "bank" : "info", e.title) +
      `<p class="body-copy event-copy">${esc(e.text)}</p>`,
    footer: btn("Lanjut", "dismissEvent", { primary: true }),
  };
}
function settlement(c, p) {
  const t = p.transaction,
    after = c.s.players[t.from].cash;
  return {
    title: t.kind === "tax" ? "Pajak Tercatat" : "Sewa Tercatat",
    html:
      lead(
        t.kind === "tax" ? "bank" : "home",
        t.kind === "tax" ? "Pembayaran Pajak" : "Pembayaran Sewa",
        t.kind === "tax"
          ? "Pajak tetap ke Bank, bukan Parkir Bebas. Tidak dihitung dari kekayaan."
          : "Pembayaran sudah tercatat.",
      ) +
      (t.tile !== undefined && BOARD[t.tile].price
        ? propertyHero(BOARD[t.tile], c.s)
        : "") +
      `<div class="big-amount settlement-amount"><span class="settlement-label">${t.kind === "tax" ? "Pajak dibayar" : "Sewa dibayar"}</span>${amount(t.amount)}</div><div class="fact-row"><span>Saldo sebelum</span>${amount(after + t.amount)}</div><div class="fact-row"><span>Saldo setelah</span>${amount(after)}</div>${t.to !== null ? `<div class="fact-row"><span>Diterima ${esc(c.s.players[t.to].name)}</span><b class="positive">+ ${esc(money(t.amount))}</b></div>` : ""}`,
    footer: btn("Selesai", "dismissEvent", { primary: true }),
  };
}
function history(c) {
  const filter = c.ui.historyFilter || "all";
  const events = publicEvents(c.s).filter(
    (e) =>
      filter === "all" ||
      (filter === "money" && e.finance?.length) ||
      (filter === "property" && e.assetChanges?.length),
  );
  return {
    title: "Riwayat Aktivitas",
    html:
      lead(
        "history",
        "Riwayat Aktivitas",
        "Langkah, properti, dan aliran Nusa yang sah.",
      ) +
      `<div class="chips">${[
        ["all", "Semua"],
        ["money", "Nusa"],
        ["property", "Properti"],
      ]
        .map(
          ([v, l]) =>
            `<button data-action="historyFilter" data-value="${v}" aria-pressed="${v === filter}">${l}</button>`,
        )
        .join("")}</div><div class="history-list">${
        events
          .map(
            (e) =>
              `<article class="history-row"><span class="history-symbol">${icon(e.finance ? "bank" : e.type === "dice" ? "dice" : "map", 18)}</span><div><small>RONDE ${e.turn}</small><p>${esc(e.text)}</p>${
                e.finance
                  ? `<details><summary>Detail transaksi</summary>${financeRows(
                      e,
                      c.s.players,
                    )
                      .map(
                        (row) =>
                          `<p class="${row.amount > 0 ? "positive" : "negative"}">${esc(row.text)}</p>`,
                      )
                      .join("")}</details>`
                  : ""
              }</div></article>`,
          )
          .join("") || '<p class="empty">Belum ada aktivitas.</p>'
      }</div>`,
  };
}
function profile(c, p) {
  const player = c.s.players[p.id],
    connection = c.session.online?.seats[p.id],
    ledger = playerLedger(c.s, p.id);
  return {
    title: "Profil Pemain",
    html:
      lead("people", "Profil Pemain") +
      `<div class="profile-hero">${avatar(player.id)}<h3>${esc(player.name)}</h3><span>${player.controller === "bot" ? "Bot · " + esc(player.botPersona || player.name) : "Pemain manusia"}${connection ? " · " + (connection.connected ? "Terhubung" : "Terputus") : ""}</span>${pawnArt(pawnFor(player), "Pion " + TOKENS[pawnFor(player)].name)}</div><div class="detail-grid"><div><span>Saldo</span>${amount(player.cash)}</div><div><span>Total aset</span>${amount(worth(c.s, player.id))}</div><div><span>Properti</span><b>${assets(c.s, player.id).length}</b></div><div><span>Status</span><b>${player.out ? "Bangkrut" : player.inJail ? "Penjara" : "Aktif"}</b></div></div><section class="profile-ledger"><h3>Riwayat Nusa</h3><small>Transaksi publik dalam riwayat tersimpan · maksimal 300 kejadian.</small>${ledger.map((row) => `<article data-ledger-row="${esc(row.id)}"><span><small>RONDE ${row.turn} · ${esc(financeLabels[row.kind] || "Transaksi")}</small><p>${esc(row.description)}</p></span><b class="${row.amount > 0 ? "positive" : "negative"}">${row.amount > 0 ? "+" : "−"} ${esc(money(Math.abs(row.amount)))}</b></article>`).join("") || '<p class="empty">Belum ada transaksi Nusa tercatat.</p>'}</section>`,
    footer: (player.id === c.seat && player.controller === "human"
      ? btn("Ubah nama", "myProfile", {sym: "people"}) : "") +
      btn("Lihat properti", "assets", {
        primary: true,
        extra: `data-id="${player.id}"`,
        sym: "assets",
      }),
  };
}

function room(c) {
  const r = c.session.online;
  if (!r)
    return {
      title: "Room",
      html: lead(
        "people",
        "Pertandingan Lokal",
        "Mode VS Bot berjalan mandiri tanpa server.",
      ),
    };
  const info = roomEligibility(r),
    own = r.seats[r.seat],
    v = r.vote;
  return {
    title: "Room & Koneksi",
    html:
      lead(
        "people",
        r.status === "paused" ? "Permainan Dijeda" : "Room " + r.code,
        "Progres tersimpan di backend.",
      ) +
      `<button class="room-code" data-action="copyRoom">${esc(r.code)}${icon("copy", 18)}</button><div class="room-members">${r.seats.map((p) => `<div class="room-member">${avatar(p.id)}<span class="room-member-identity"><b><em>P${p.id + 1}</em> ${esc(p.name)}${p.id === r.host ? " · Host" : ""}</b><small>${p.controller === "bot" ? "Bot · mengikuti room" : !p.connected ? "Terputus" : r.pause?.ready.includes(p.id) ? "Siap lanjut" : "Terhubung"}${p.out ? " · penonton" : ""}</small></span><i class="connection ${p.connected ? "on" : ""}"></i></div>`).join("")}</div>${r.held ? '<p class="inline-note">Hak keputusan ditahan. Auto-pause 90 detik sejak heartbeat terakhir.</p>' : ""}${r.status === "paused" ? `<div class="ready-summary">${info.ready}/${info.humans.length} manusia siap lanjut</div><p class="body-copy">Semua pemain manusia aktif harus siap. Bot tidak ikut voting.</p>` : v?.status === "open" ? `<div class="ready-summary">${Object.values(v.votes).filter(Boolean).length}/${info.needed} persetujuan jeda</div><p class="body-copy">Satu suara per manusia aktif. Pemain offline tetap dihitung.</p>` : ""}`,
    footer:
      r.status === "paused" && !own.out && own.controller === "human"
        ? btn(
            r.pause.ready.includes(r.seat) ? "Batalkan siap" : "Siap lanjut",
            "resumeReady",
            { primary: true, disabled: c.session.pending || !own.connected },
          )
        : v?.status === "open" &&
            v.eligible.includes(r.seat) &&
            !Object.hasOwn(v.votes, r.seat)
          ? btn("Setuju", "voteYes", { primary: true }) + btn("Tolak", "voteNo")
          : r.status === "playing" && !own.out
            ? btn("Ajukan jeda", "pauseRequest")
            : "",
  };
}
function results(c) {
  const winner = c.s.players[c.s.winner],
    sorted = [
      winner,
      ...c.s.players
        .filter((p) => p.id !== winner.id)
        .sort((a, b) => worth(c.s, b.id) - worth(c.s, a.id)),
    ];
  return {
    title: "Hasil Akhir",
    html:
      lead("trophy", "Hasil Akhir", "Petualangan Nusantara telah selesai.") +
      `<div class="winner">${icon("trophy", 45)}<h3>${esc(winner.name)} menang!</h3></div><div class="result-list" aria-label="Peringkat akhir pemain">${sorted.map((p) => `<div class="result-row ${p.id === winner.id ? "champion" : ""}">${avatar(p.id)}<span class="result-identity"><b>${esc(p.name)}</b><small>${p.id === winner.id ? "Pemenang" : p.out ? "Bangkrut" : "Total kekayaan akhir"}</small></span><span class="result-worth">${amount(worth(c.s, p.id))}</span></div>`).join("")}</div>`,
    footer: btn("Kembali ke lobby", "lobby", { primary: true, sym: "home" }),
  };
}
export function renderPopup(session, ui, p) {
  const c = { session, ui, s: session.view, seat: session.seat };
  let content;
  switch (p.kind) {
    case "rentClaims":
      content = {
        title: "Tagih Sewa",
        html:
          lead(
            "bank",
            "Tagih Sewa",
            "Sewa Meja Klasik harus ditagih sebelum hak kedaluwarsa.",
          ) +
          (claimableRent(c.s, c.seat)
            .map(
              (claim) =>
                `<div class="fact-row"><span>${esc(BOARD[claim.tile].name)} · ${esc(c.s.players[claim.from].name)}</span>${commandButton(money(claim.amount), "CLAIM_RENT", c, { "claim-id": claim.id }, true)}</div>`,
            )
            .join("") || '<p class="empty">Tidak ada klaim aktif.</p>'),
      };
      break;
    case "buy":
      content = buy(c);
      break;
    case "assets":
      content = assetList(c, p);
      break;
    case "property":
      content = property(p.bankContext ? { ...c, s: session.state } : c, p);
      break;
    case "manage":
      content = assetList(c, { id: c.s.assets[p.id]?.owner ?? c.seat });
      break;
    case "development":
      content = assetList(
        { ...c, ui: { ...c.ui, assetTab: "build" } },
        { id: c.seat },
      );
      break;
    case "trade":
      content = p.incoming ? incoming(c) : trade(c, p);
      break;
    case "tradeIncoming":
      content = incoming(c);
      break;
    case "picker":
      content = picker(c, p);
      break;
    case "auction":
      content = auction(c, p);
      break;
    case "jail":
      content = jail(c);
      break;
    case "debt":
      content = debt(c);
      break;
    case "card":
      content = event(c, {
        event: { card: c.s.card },
        interactive:
          c.s.card.player === c.seat &&
          c.s.players[c.seat].controller === "human",
      });
      break;
    case "event":
      content = event(c, p);
      break;
    case "settlement":
      content = settlement(c, p);
      break;
    case "bank":
      content = bankContent(session.state);
      break;
    case "history":
      content = history(c);
      break;
    case "profile":
      content = profile(c, p);
      break;
    case "room":
      content = room(c);
      break;
    case "won":
      content = results(c);
      break;
    case "mortgage": {
      const t = BOARD[c.s.mortgageDecision.tile];
      content = {
        title: "Aset Tergadai",
        html:
          lead("bank", "Menerima Aset Tergadai") +
          propertyHero(t, c.s) +
          `<p class="body-copy">Tebus sekarang atau pertahankan gadai dengan membayar bunga ${esc(money(Math.ceil(t.mortgage / 10)))}. Keputusan tetap tersimpan saat jeda.</p>`,
        footer:
          commandButton(
            "Tebus " + money(redemption(t.id)),
            "MORTGAGE_REDEEM",
            c,
            {},
            true,
          ) + commandButton("Pertahankan gadai", "MORTGAGE_KEEP", c),
      };
      break;
    }
    case "buildOffer": {
      const offer = c.s.buildOffer,
        targets = buildTargets(c.s, c.seat, offer.kind);
      content = {
        title: "Stok Bangunan",
        html:
          lead(
            "home",
            "Stok Bangunan Terbatas",
            `${offer.remaining} ${offer.kind === "house" ? "rumah" : "hotel"} tersisa.`,
          ) +
          targets
            .map((t) =>
              commandButton(t.name, "BUILD_JOIN", c, { tile: t.id }, true),
            )
            .join(""),
        footer: commandButton("Tidak ikut", "BUILD_DECLINE", c),
      };
      break;
    }
    case "confirmAsset": {
      const t = BOARD[p.id],
        a = c.s.assets[t.id],
        value =
          p.type === "MORTGAGE"
            ? t.mortgage
            : GROUPS[t.group].ids.reduce(
                (n, id) => n + (BOARD[id].build * c.s.assets[id].level) / 2,
                0,
              );
      content = {
        title: "Konfirmasi Aset",
        html:
          lead(
            "bank",
            p.type === "MORTGAGE" ? "Gadai properti?" : "Jual bangunan set?",
          ) +
          propertyHero(t, c.s) +
          `<p class="body-copy">Terima ${esc(money(value))}. ${p.type === "MORTGAGE" ? "Properti tidak menghasilkan sewa sampai ditebus." : "Bangunan dijual sesuai aturan dengan setengah harga."}</p>`,
        footer: commandButton(
          "Konfirmasi",
          p.type,
          c,
          { tile: p.id },
          true,
          !!assetPermission(c.s, c.seat, p.id, p.type, c.session.busy),
        ),
      };
      break;
    }
    case "bankrupt":
      content = {
        title: "Nyatakan Bangkrut?",
        html:
          lead(
            "bank",
            "Nyatakan Bangkrut?",
            "Aset dan saldo diselesaikan kepada kreditur sesuai engine.",
          ) +
          `<p class="body-copy">Tindakan ini mengakhiri partisipasi Anda. Utamakan penjualan bangunan, gadai atau barter jika masih dapat memenuhi tagihan.</p>`,
        footer: commandButton(
          "Nyatakan bangkrut",
          "BANKRUPT",
          c,
          {},
          true,
          bankruptcyShortfall(c.s, c.seat) <= 0,
        ),
      };
      break;
    case "allTiles":
      content = {
        title: "Seluruh Petak",
        html:
          lead("map", "Peta Nusantara") +
          `<div class="all-tiles">${BOARD.map((t) => `<button data-action="property" data-id="${t.id}"><i style="background:${t.color}"></i><span>${t.id + 1}. ${esc(t.name)}</span>${icon("arrow", 15)}</button>`).join("")}</div>`,
      };
      break;
    default:
      return null;
  }
  return { ...content, footer: content.footer || btn("Tutup", "close") };
}
export { btn, lead };
