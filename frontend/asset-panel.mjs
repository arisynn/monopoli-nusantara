import { mortgageAdvice } from "./mortgage-advisor.mjs";
import { parseNusa } from "../lib/currency.mjs";
import {
  BOARD,
  GROUPS,
  assets,
  money,
  stock,
  redemption,
} from "../lib/game.mjs";
import { developmentGroups, buildPreview } from "./development.mjs";
import { assetPermission, esc } from "./domain.mjs";
import { avatar, icon, buildingArt } from "./art.mjs";
const levelLabel = (a) =>
  a.mortgaged
    ? "Digadai"
    : a.level === 5
      ? "Hotel"
      : a.level
        ? `${a.level} rumah`
        : "Tanah";
export function renderAssetPanel(c, { btn, lead, amount }) {
  const owner = c.popup.id ?? c.seat,
    player = c.s.players[owner],
    own = owner === c.seat,
    tab = c.ui.assetTab || "all",
    bank = stock(c.s),
    busy = !!c.session.busy;
  const target =
    c.ui.mortgageTarget ??
    String(
      c.s.debt?.from === c.seat && c.s.debt.amount > c.s.players[c.seat].cash
        ? (c.s.debt.amount - c.s.players[c.seat].cash) / 10
        : 100,
    );
  let advice =
    tab === "auto" && own
      ? mortgageAdvice(c.s, c.seat, parseNusa(target))
      : { tiles: [], amount: 0, reason: "" };
  const groups =
      tab === "build" && own ? developmentGroups(c.s, c.seat, busy) : [],
    plan = c.session.assetPlan;
  const reviewed =
    plan?.kind === "mortgage" &&
    plan.match === c.s.matchId &&
    plan.target === parseNusa(target);
  if (reviewed)
    advice = {
      tiles: plan.tiles,
      amount: plan.tiles.reduce((n, id) => n + BOARD[id].mortgage, 0),
      reason:
        "Pilihan yang telah disetujui. Rekomendasi baru memerlukan perhitungan ulang.",
    };
  const management = (tile) => {
    const t = BOARD[tile],
      a = c.s.assets[tile],
      types = a.mortgaged ? ["REDEEM"] : ["SELL", "SELL_SET", "MORTGAGE"];
    return `<div class="asset-tools">${btn("Sertifikat", "property", { extra: `data-id="${tile}"` })}${
      own
        ? types
            .map((type) => {
              const reason = assetPermission(c.s, c.seat, tile, type, busy),
                label = {
                  SELL: "Jual bangunan",
                  MORTGAGE: "Gadai " + money(t.mortgage),
                  REDEEM: "Tebus " + money(redemption(tile)),
                  SELL_SET: "Jual bangunan set",
                }[type];
              return btn(
                label,
                ["MORTGAGE", "SELL_SET"].includes(type)
                  ? "confirmAsset"
                  : "command",
                {
                  disabled: !!reason,
                  extra: `data-type="${type}" data-tile="${tile}" title="${esc(reason || label)}"`,
                },
              );
            })
            .join("")
        : ""
    }</div>`;
  };
  const query = (c.ui.assetQuery || "").toLocaleLowerCase("id"),
    rows = assets(c.s, owner).filter(
      (t) =>
        t.name.toLocaleLowerCase("id").includes(query) &&
        (tab !== "mortgage" || c.s.assets[t.id].mortgaged),
    );
  const confirmation = (tile) => {
    const pending = c.ui.assetConfirm;
    if (!own || pending?.tile !== tile) return "";
    const type = pending.type;
    if (!["MORTGAGE", "SELL_SET"].includes(type)) return "";
    const t = BOARD[tile],
      value =
        type === "MORTGAGE"
          ? t.mortgage
          : (GROUPS[t.group]?.ids || []).reduce(
              (n, id) => n + (BOARD[id].build * c.s.assets[id].level) / 2,
              0,
            ),
      reason = assetPermission(c.s, c.seat, tile, type, busy);
    return `<section class="asset-confirm"><p>${type === "MORTGAGE" ? "Gadai menghentikan sewa properti ini sampai ditebus." : "Semua bangunan kelompok dijual sesuai aturan."} Terima ${esc(money(value))}.</p>${reason ? `<small>${esc(reason)}</small>` : ""}<div>${btn("Konfirmasi", "command", { primary: true, disabled: !!reason, extra: `data-type="${type}" data-tile="${tile}"` })}${btn("Batal", "cancelAssetConfirm")}</div></section>`;
  };
  const portfolio =
    rows
      .map((t) => {
        const a = c.s.assets[t.id];
        return `<details class="asset-item" data-asset-key="tile-${t.id}" ${c.ui.assetFocus === t.id ? "open" : ""}><summary><i style="background:${t.color}"></i><span><b>${esc(t.name)}</b><small>${esc(GROUPS[t.group]?.name || (t.type === "station" ? "Stasiun" : "Utilitas"))} · ${levelLabel(a)}</small></span>${icon("arrow", 16)}</summary>${management(t.id)}${confirmation(t.id)}${own && t.group >= 0 ? btn("Bangun di kelompok " + esc(GROUPS[t.group].name), "assetTab", { extra: `data-value="build" data-group="${t.group}"` }) : ""}</details>`;
      })
      .join("") || '<p class="empty">Belum ada properti pada pilihan ini.</p>';
  const build = groups
    .map((g) => {
      const preview = buildPreview(c.s, c.seat, g.id),
        max = preview.tiles.length,
        selected = Math.min(max || 1, c.ui.buildCounts?.[g.id] || 1),
        estimate = buildPreview(c.s, c.seat, g.id, selected);
      return `<details class="development-group asset-item" data-group="${g.id}" data-asset-key="group-${g.id}" ${c.ui.assetGroup === g.id || (c.ui.assetGroup === undefined && g.id === groups.find((x) => x.ready || x.owned)?.id) ? "open" : ""}><summary><i style="background:${g.color}"></i><span><b>${esc(g.name)} · ${g.owned}/${g.ids.length}</b><small>${esc(g.status)}</small></span>${icon("arrow", 16)}</summary>${g.rows
        .map((row) => {
          const t = BOARD[row.tile];
          return `<article class="development-row" data-development-tile="${row.tile}"><div><b>${esc(t.name)}</b><small>${row.owner === null ? "Bank" : row.own ? "Milik Anda" : "Milik " + esc(c.s.players[row.owner].name)} · ${levelLabel(row)}</small><small>Sewa ${esc(money(row.rent))}${row.nextRent !== null ? " → " + esc(money(row.nextRent)) : ""}</small></div>${row.own ? `<div class="development-actions">${btn(row.level === 4 ? "Hotel " + money(row.cost) : "Bangun " + money(row.cost), "command", { primary: true, disabled: !!row.reason, extra: `data-type="BUILD" data-tile="${row.tile}"` })}${row.reason ? `<small>${esc(row.reason)}</small>` : ""}</div>` : row.barter ? btn("Barter", "developmentTrade", { extra: `data-owner="${row.owner}" data-tile="${row.tile}"`, sym: "trade" }) : ""}</article>`;
        })
        .join(
          "",
        )}${max ? `<div class="build-order"><label>Tambah pada kelompok<select name="buildCount-${g.id}" ${busy ? "disabled" : ""}>${Array.from({ length: max }, (_, n) => `<option value="${n + 1}" ${n + 1 === selected ? "selected" : ""}>${n + 1} bangunan</option>`).join("")}</select></label>${btn("Bangun " + selected + " · " + money(estimate.cost), "buildMany", { primary: true, disabled: busy, extra: `data-group="${g.id}" data-count="${selected}"` })}<small>Dibangun merata, diperiksa satu per satu.</small></div>` : ""}</details>`;
    })
    .join("");
  const planStatus = plan
    ? `<div class="build-progress" role="status"><span>${plan.completed}/${plan.requested} ${plan.kind === "mortgage" ? "properti" : "bangunan"} · ${esc(plan.status === "running" ? (plan.kind === "mortgage" ? "Sedang menggadai…" : "Sedang membangun…") : plan.reason)}</span>${plan.status === "running" ? btn("Hentikan", "stopBuilds") : ""}</div>`
    : c.session.assetFeedback
      ? '<p class="build-progress" role="status">Transaksi tersimpan · memperbarui aset…</p>'
      : "";
  return {
    title: own ? "Aset Saya" : `Aset ${player.name}`,
    html:
      lead(
        "assets",
        own ? "Aset Saya" : `Aset ${player.name}`,
        own ? "" : "Aset pemain lain hanya dapat dilihat.",
      ) +
      `<div class="portfolio-total">${avatar(owner)}<div><b>${esc(player.name)}</b><small>${assets(c.s, owner).length} properti</small></div>${amount(player.cash)}</div><div class="chips asset-tabs">${[
        ["all", "Properti"],
        ...(own
          ? [
              ["build", "Bangun"],
              ["auto", "Gadai otomatis"],
            ]
          : []),
        ["mortgage", "Digadai"],
      ]
        .map(
          ([value, label]) =>
            `<button data-action="assetTab" data-value="${value}" aria-pressed="${tab === value}">${label}</button>`,
        )
        .join(
          "",
        )}</div>${planStatus}${tab === "auto" && own ? `<section class="auto-mortgage"><p class="tile-explanation">Tentukan dana tambahan, lalu periksa daftar gadai.</p><label class="field">Kebutuhan tambahan Nusa<input name="mortgageTarget" inputmode="decimal" value="${esc(target)}"></label><p class="inline-note">${esc(advice.reason)}</p><ul class="mortgage-preview">${advice.tiles.map((id) => `<li><span>${esc(BOARD[id].name)}</span><b>+ ${esc(money(BOARD[id].mortgage))}</b></li>`).join("")}</ul>${advice.tiles.length ? btn("Gadai " + advice.tiles.length + " properti · + " + money(advice.amount), "autoMortgage", { primary: true, disabled: busy || reviewed, extra: `data-target="${parseNusa(target)}" data-version="${c.s.version}" data-tiles="${advice.tiles.join(",")}"` }) : ""}${reviewed ? btn("Hitung rekomendasi baru", "refreshMortgageAdvice", { disabled: busy }) : ""}<details class="compact-help"><summary>Info gadai otomatis</summary><p>Set lengkap dijaga bila aset lain cukup. Properti tetap milik Anda, tetapi sewanya berhenti sampai ditebus. Setiap transaksi diperiksa ulang.</p></details></section>` : ""}${tab === "auto" ? "" : tab === "build" && own ? `<div class="development-bank"><span>${buildingArt()} ${bank.houses} rumah</span><span>${buildingArt("hotel")} ${bank.hotels} hotel</span></div><div class="development-groups">${build}</div>` : `<label class="field">Cari properti<input name="assetSearch" type="search" value="${esc(c.ui.assetQuery || "")}" placeholder="Nama properti"></label><div class="asset-list">${portfolio}</div>`}`,
    footer:
      btn("Seluruh petak", "allTiles", { sym: "map" }) +
      btn("Selesai", "close", { primary: true }),
  };
}
