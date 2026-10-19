import { rentLabel } from "./property-display.mjs";
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
import { playerAvatar, icon, buildingArt } from "./art.mjs";
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
    tab = ["all", "build", "mortgage"].includes(c.ui.assetTab)
      ? c.ui.assetTab
      : "all",
    bank = stock(c.s),
    busy = !!c.session.busy;
  const groups =
      tab === "build" && own
        ? developmentGroups(c.s, c.seat, busy).filter((g) => g.owned > 0)
        : [],
    plan = c.session.assetPlan;
  const management = (tile) => {
    const t = BOARD[tile],
      a = c.s.assets[tile],
      types =
        tab === "mortgage"
          ? a.mortgaged
            ? ["REDEEM"]
            : ["MORTGAGE"]
          : tab === "build"
            ? ["SELL"]
            : [];
    return `<div class="asset-tools">${tab === "build" ? "" : btn("Sertifikat", "certificate", { extra: `data-id="${tile}"` })}${
      own
        ? types
            .filter(
              (type) => !["SELL", "SELL_SET"].includes(type) || a.level > 0,
            )
            .map((type) => {
              const reason = assetPermission(c.s, c.seat, tile, type, busy),
                label = {
                  SELL: "Jual 1",
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
  const mortgageFilter = own ? c.ui.mortgageFilter || "available" : "held";
  const query = (c.ui.assetQuery || "").toLocaleLowerCase("id"),
    rows = assets(c.s, owner).filter(
      (t) =>
        t.name.toLocaleLowerCase("id").includes(query) &&
        (tab !== "mortgage" ||
          !!c.s.assets[t.id].mortgaged === (mortgageFilter === "held")),
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
        return `<details class="asset-item" data-asset-key="tile-${t.id}" ${c.ui.assetFocus === t.id ? "open" : ""}><summary><i style="background:${t.color}"></i><span><b>${esc(t.name)}</b><small>${esc(GROUPS[t.group]?.name || (t.type === "station" ? "Stasiun" : "Utilitas"))} · ${levelLabel(a)}</small></span><b class="asset-rent">${esc(rentLabel(c.s, t.id))}</b>${icon("arrow", 16)}</summary>${tab === "mortgage" ? `<div class="mortgage-values"><span>${a.mortgaged ? "Biaya tebus" : "Dana diterima"}<b>${esc(money(a.mortgaged ? redemption(t.id) : t.mortgage))}</b></span>${a.mortgaged ? `<small>Pokok ${esc(money(t.mortgage))} + bunga ${esc(money(redemption(t.id) - t.mortgage))}</small>` : ""}</div>` : ""}${management(t.id)}${confirmation(t.id)}${own && tab === "mortgage" && assetPermission(c.s, c.seat, t.id, a.mortgaged ? "REDEEM" : "MORTGAGE", busy) ? `<p class="asset-reason">${esc(assetPermission(c.s, c.seat, t.id, a.mortgaged ? "REDEEM" : "MORTGAGE", busy))}</p>` : ""}</details>`;
      })
      .join("") || '<p class="empty">Belum ada properti pada pilihan ini.</p>';
  const build =
    groups
      .map((g) => {
        const preview = buildPreview(c.s, c.seat, g.id),
          max = preview.tiles.length,
          saleTile = g.rows.find((row) => row.own && row.level > 0)?.tile,
          saleReason =
            saleTile === undefined
              ? ""
              : assetPermission(c.s, c.seat, saleTile, "SELL_SET", busy);
        return `<details class="development-group asset-item" data-group="${g.id}" data-asset-key="group-${g.id}" ${c.ui.assetGroup === g.id || (c.ui.assetGroup === undefined && g.id === groups.find((x) => x.ready || x.owned)?.id) ? "open" : ""}><summary><i style="background:${g.color}"></i><span><b>${esc(g.name)} · ${g.owned}/${g.ids.length}</b><small>${esc(g.status)}</small></span>${icon("arrow", 16)}</summary>${g.rows
          .filter((row) => row.own)
          .map((row) => {
            const t = BOARD[row.tile];
            return `<article class="development-row" data-development-tile="${row.tile}"><div><button type="button" class="asset-name" data-action="certificate" data-id="${row.tile}"><b>${esc(t.name)}</b><small>${levelLabel(row)} · Sewa ${esc(money(row.rent))}${row.nextRent !== null ? " → " + esc(money(row.nextRent)) : ""}</small></button></div>${row.level > 0 ? `<div class="development-actions">${management(row.tile)}</div>` : ""}</article>`;
          })
          .join(
            "",
          )}${saleTile !== undefined ? `<div class="group-sale">${btn("Jual seluruh bangunan kelompok", "confirmAsset", { disabled: !!saleReason, extra: `data-type="SELL_SET" data-tile="${saleTile}" title="${esc(saleReason || "Jual sesuai setengah harga")}"` })}${confirmation(saleTile)}</div>` : ""}${btn("Bangun", "buildOrder", { primary: true, disabled: busy || !max, extra: `data-group="${g.id}" title="${esc(max ? "Pilih jumlah dan lokasi bangunan" : g.status)}"` })}</details>`;
      })
      .join("") ||
    '<p class="empty">Belum ada tanah milik Anda untuk dibangun.</p>';
  const planStatus =
    c.session.batchResult?.match === c.s.matchId &&
    c.session.batchResult?.version === c.session.state?.version
      ? `<p class="build-progress" role="status">${c.session.batchResult.count} bangunan selesai · ${esc(money(c.session.batchResult.cost))}</p>`
      : plan?.kind === "build"
        ? `<div class="build-progress" role="status"><span>${plan.completed}/${plan.requested} bangunan · ${esc(plan.status === "running" ? "Sedang membangun…" : plan.reason)}</span>${plan.status === "running" ? btn("Hentikan", "stopBuilds") : ""}</div>`
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
      `<div class="portfolio-total">${playerAvatar(player, c.s.players)}<div><b>${esc(player.name)}</b><small>${assets(c.s, owner).length} properti</small></div>${amount(player.cash)}</div><div class="chips asset-tabs">${[
        ["all", "Properti"],
        ...(own ? [["build", "Bangun"]] : []),
        ["mortgage", "Pegadaian"],
      ]
        .map(
          ([value, label]) =>
            `<button data-action="assetTab" data-value="${value}" aria-pressed="${tab === value}">${label}</button>`,
        )
        .join("")}</div>${planStatus}${
        tab === "mortgage" && own
          ? `<div class="mortgage-filters" role="group" aria-label="Pilihan Pegadaian">${[
              ["available", "Bisa digadai"],
              ["held", "Sedang digadai"],
            ]
              .map(
                ([value, label]) =>
                  `<button type="button" data-action="mortgageFilter" data-value="${value}" aria-pressed="${mortgageFilter === value}">${label} <small>${assets(c.s, owner).filter((t) => !!c.s.assets[t.id].mortgaged === (value === "held")).length}</small></button>`,
              )
              .join(
                "",
              )}</div><p class="inline-note">${mortgageFilter === "held" ? "Tebus beserta bunga untuk mengaktifkan sewa kembali." : "Bangunan dalam kelompok harus dijual sebelum properti dapat digadai."}</p>`
          : ""
      }${tab === "build" && own ? `<div class="development-bank"><span>${buildingArt()} ${bank.houses} rumah</span><span>${buildingArt("hotel")} ${bank.hotels} hotel</span></div><div class="development-groups">${build}</div>` : `${assets(c.s, owner).length > 5 || c.ui.assetQuery ? `<label class="field asset-search">Cari properti<input name="assetSearch" type="search" value="${esc(c.ui.assetQuery || "")}" placeholder="Nama properti"></label>` : ""}<div class="asset-list">${portfolio}</div>`}`,
    footer: btn("Selesai", "close", { primary: true }),
  };
}

export function buildOrderSelection(state, seat, group, count, selectedTile) {
  const preview = buildPreview(state, seat, group);
  const eligible = (GROUPS[group]?.ids || []).filter(
    (tile) => !assetPermission(state, seat, tile, "BUILD"),
  );
  const tile = selectedTile ?? preview.tiles[0];
  const estimate = buildPreview(state, seat, group, count);
  const valid =
    Number.isInteger(count) &&
    count >= 1 &&
    count <= preview.tiles.length &&
    (count !== 1 || eligible.includes(tile));
  return {
    count,
    tile,
    eligible,
    max: preview.tiles.length,
    valid,
    cost: count === 1 && valid ? BOARD[tile].build : estimate.cost,
    tiles: count === 1 && valid ? [tile] : estimate.tiles,
  };
}

export function renderBuildOrder(session, ui, popup, { btn, lead }) {
  const s = session.interactionState || session.view,
    group = GROUPS[popup.group];
  if (!group) return null;
  const selection = buildOrderSelection(
    s,
    session.seat,
    popup.group,
    ui.buildCounts?.[popup.group] || 1,
    ui.buildTargets?.[popup.group],
  );
  const { count, tile, eligible, max, valid, cost, tiles } = selection,
    bank = stock(s);
  const options = Array.from({ length: max }, (_, n) => n + 1);
  if (!options.includes(count)) options.push(count);
  return {
    title: `Bangun · ${group.name}`,
    html:
      lead("home", `Bangun · ${group.name}`) +
      `<div class="build-dialog-facts"><span>${bank.houses} rumah · ${bank.hotels} hotel tersedia</span><b>Saldo ${esc(money(s.players[session.seat].cash))}</b></div><div class="build-dialog-fields"><label class="field">Jumlah bangunan<select name="buildCount-${popup.group}" ${session.busy ? "disabled" : ""}>${options.map((n) => `<option value="${n}" ${n === count ? "selected" : ""} ${n > max ? "disabled" : ""}>${n}${n > max ? " · tidak tersedia" : ""}</option>`).join("")}</select></label>${count === 1 ? `<label class="field">Properti tujuan<select name="buildTarget-${popup.group}" ${session.busy ? "disabled" : ""}>${[...new Set([...eligible, ...(tile === undefined ? [] : [tile])])].map((id) => `<option value="${id}" ${id === tile ? "selected" : ""} ${!eligible.includes(id) ? "disabled" : ""}>${esc(BOARD[id]?.name)}${!eligible.includes(id) ? " · tidak tersedia" : ""}</option>`).join("")}</select></label>` : ""}</div><div class="fact-row"><span>Total biaya</span><b>${valid ? esc(money(cost)) : "—"}</b></div>${count > 1 && valid ? `<details class="build-dialog-preview"><summary>Rincian ${count} bangunan</summary><ol>${tiles.map((id) => `<li>${esc(BOARD[id].name)} · ${esc(money(BOARD[id].build))}</li>`).join("")}</ol></details>` : ""}<p class="inline-note">${!valid ? "Pilihan tidak lagi tersedia. Periksa jumlah, lokasi, saldo, atau stok terbaru." : "Pesanan dibangun sekaligus sesuai aturan merata. Saldo dan stok diperiksa saat konfirmasi."}</p>`,
    footer:
      (session.errorCode === "build_batch_stock"
        ? btn("Pemesanan stok · jumlah 1", "buildStockSingle")
        : "") +
      btn(
        "Bangun " + count + (valid ? " · " + money(cost) : ""),
        "submitBuildOrder",
        { primary: true, disabled: session.busy || !valid },
      ),
  };
}
