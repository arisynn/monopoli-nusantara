import { APP_VERSION } from "../lib/version.mjs";
import { activitySummary, capsuleFeedback } from "./economy-view.mjs";
import { onlineStatus } from "./online-status.mjs";
import { decorateCurrency } from "./currency-view.mjs";
import { enhanceSelections } from "./selections.mjs";
import { TradeDrafts, draftScope, emptyTrade } from "./trade-drafts.mjs";
import { retireLegacyUI } from "./cache-migration.mjs";
import { createLayerNavigation } from "../lib/layer-navigation.mjs";
import { DiceView } from "./dice-view.mjs";
import { GameSession } from "./session.mjs";
import { BoardView } from "./board.mjs";
import {
  esc,
  requestedPopup,
  claimableRent,
  dismissalKey,
  primaryAction,
  dicePresentation,
  autoPopup,
  gameplayDecision,
  bidMinimum,
  roomEligibility,
} from "./domain.mjs";
import { icon, avatar, colors, pawnArt } from "./art.mjs";
import { renderPopup, btn, lead } from "./popups.mjs";
import { localPlayers, PERSONAS } from "../lib/bot/personas.mjs";
import { MODELS } from "../lib/bot/mind-config.mjs";
import { TOKENS, pawnFor, availablePawn } from "../lib/pawns.mjs";
import { BOARD, money } from "../lib/content.mjs";
import { decisionActor } from "../lib/game.mjs";
import { parseNusa } from "../lib/currency.mjs";
import { serializeSave, parseSave } from "../lib/save-format.mjs";
import { saveSlot, listSaves } from "../lib/storage.ts";
import { loadPreferences, savePreferences } from "../lib/preferences.mjs";
import { changeTradeOpponent, tradeDraftStatus } from "../lib/compact-ui.mjs";
const session = new GameSession(),
  prefs = loadPreferences(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
Object.assign(session, {
  fast: prefs.fast,
  reduced:
    prefs.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches,
});
const ui = {
  mode: "bot",
  name: "Jovan",
  count: 4,
  pawn: 0,
  rules: "digital",
  levels: { raka: "medium", bima: "medium", sari: "medium" },
  advisor: false,
  popup: null,
  dismissed: "",
  selected: 0,
  historyFilter: "all",
  assetFilter: "all",
  assetTab: "all",
  assetQuery: "",
  buildCounts: {},
  bid: 0,
  roomMode: "create",
  joinCode: "",
  email: "",
  password: "",
  saveLabel: "Perjalanan Nusantara",
  camera: "overview",
  sound: prefs.sound,
};
let draftStorage;
try {
  draftStorage = localStorage;
} catch {}
const drafts = new TradeDrafts(draftStorage);
const page = document.querySelector("#page"),
  dialog = document.querySelector("#popup"),
  dialogBody = dialog.querySelector(".popup-body"),
  dialogFooter = dialog.querySelector(".popup-footer"),
  dialogClose = dialog.querySelector("[data-action=close]");
const layers = createLayerNavigation(history, () => close());
window.addEventListener("popstate", () => layers.pop());
let board,
  diceView,
  screen = "",
  popupKey = "",
  popupHTML = "",
  footerHTML = "",
  previousFocus,
  renderQueued = false;
const brand = () => `<div class="brand">Nusantara</div>`;
const topbar = () =>
  `<header class="topbar"><button class="icon-button" data-action="menu" aria-label="Menu permainan">${icon("menu", 22)}</button>${brand()}${session.screen === "gameplay" ? `<button class="icon-button" data-action="camera" aria-label="Kamera: ${ui.camera === "overview" ? "lihat dekat" : "seluruh papan"}" aria-pressed="${ui.camera === "follow"}">${icon("map", 22)}</button>` : '<span class="header-spacer" aria-hidden="true"></span>'}</header>`;
function lobbyHTML() {
  return `${topbar()}<main class="lobby"><section class="lobby-panel" aria-label="Lobby permainan"><div id="lobby-content"></div></section><p class="version-line">Monopoli Nusantara · Klasik ${APP_VERSION}</p></main><div id="page-status" class="page-status" role="status"></div>`;
}
function gameplayHTML() {
  return `${topbar()}<main class="gameplay"><section class="players" aria-label="Pemain"></section><div class="connection-note" hidden></div><section class="board-stage" aria-label="Papan 40 petak"><div class="board-view" tabindex="0" aria-label="Papan Nusantara, ketuk petak, geser atau cubit untuk menjelajah"><svg role="group" aria-label="Papan permainan"><g></g></svg></div></section><button class="activity" data-action="history" aria-label="Riwayat aktivitas dan transaksi"><span id="activity-text"></span><span id="activity-money"></span></button><button class="tile-caption" data-action="selectedProperty"></button><section class="action-console" aria-label="Aksi permainan"><div class="turn-heading"></div><div class="console-row"><div class="quick-actions"><button class="property-button" data-action="ownAssets" aria-label="Properti Saya" title="Properti Saya">${icon("assets", 22)}<span>Aset</span></button><button class="property-button" data-action="trade" aria-label="Perdagangan dan barter" title="Barter">${icon("trade", 22)}<span>Barter</span></button></div><div class="dice-tray" aria-live="polite"></div><button class="roll-button primary" data-action="primary"></button></div><div id="page-status" class="page-status" role="status"></div></section></main>`;
}
function lobbyContent() {
  const r = session.online,
    isRoom = !!session.room,
    players = isRoom
      ? r.seats
      : localPlayers(ui.name, ui.count, ui.pawn, ui.levels).map((p, id) => ({
          ...p,
          id,
          ready: true,
          connected: true,
        }));
  const humanCount = players.filter((p) => p.controller === "human").length,
    host = isRoom && r.host === session.room.seat,
    canStart = isRoom
      ? host &&
        humanCount >= 2 &&
        players.every((p) => p.controller === "bot" || (p.ready && p.connected))
      : true;
  const slots = isRoom ? r.capacity : ui.count;
  return `<div class="lobby-heading"><span class="eyebrow">RUANG BERMAIN <b>${isRoom ? "ONLINE" : "VS BOT"}</b></span><h1>Ruang Bermain</h1></div><div class="lobby-facts"><span>${icon("map", 19)}40 petak</span><span>${icon("people", 19)}${isRoom ? "2–6" : ui.count} peserta</span><span class="coin-label"><span class="nusa-token">N</span> = Nusa</span></div>${isRoom ? `<button class="room-code" data-action="copyRoom"><small>KODE ROOM</small><b>${esc(r.code)}</b>${icon("copy", 18)}</button>` : `<button class="setup-summary" data-action="setup"><span>${esc(ui.name)} · ${ui.count} peserta</span><b>Atur permainan ${icon("gear", 15)}</b></button>`}<div class="lobby-roster" style="--columns:${slots === 2 || slots === 4 ? 2 : 3}">${Array.from(
    { length: slots },
    (_, i) => {
      const p = players[i];
      return p
        ? `<button class="lobby-player ${i === (isRoom ? session.room.seat : 0) ? "own" : ""}" data-action="${isRoom ? "room" : "setup"}" style="--player:${colors[pawnFor(p)]}"><span class="player-number">P${i + 1}${isRoom && i === r.host ? " · HOST" : ""}</span><div class="roster-art">${avatar(i)}${pawnArt(pawnFor(p), TOKENS[pawnFor(p)].name)}</div><b>${esc(p.name)}</b><small class="ready-pill ${p.ready || p.controller === "bot" ? "ready" : ""}">${p.controller === "bot" ? "Bot · " + esc(MODELS.find((m) => m.id === p.botDifficulty)?.label || "Medium") : p.ready ? "Siap" : "Belum siap"}</small></button>`
        : `<div class="lobby-player empty-seat"><span>P${i + 1}</span>${icon("plus", 25)}<small>Kursi kosong</small></div>`;
    },
  ).join(
    "",
  )}</div>${isRoom ? `<div class="lobby-tools">${btn(r.seats[r.seat]?.ready ? "Batalkan siap" : "Saya siap", "ready", { primary: true, disabled: session.pending || !session.connected })}${btn("Pilih pion", "pawn", { disabled: session.pending })}${host ? btn("Tambah bot", "addBotPopup", { disabled: session.pending || !session.config?.onlineBots || players.filter((p) => p.controller === "bot").length >= 3 || players.length + 1 + Math.max(0, 2 - humanCount) > r.capacity }) : ""}</div>${host ? btn("Mulai permainan", "startRoom", { primary: true, disabled: session.pending || !canStart, sym: "play" }) : '<p class="inline-note">Menunggu host memulai pertandingan.</p>'}<p class="lobby-hint">Minimal dua manusia. Semua manusia harus siap dan terhubung.</p>` : `${btn("Mulai VS Bot", "startLocal", { primary: true, disabled: session.pending, sym: "play" })}<div class="lobby-secondary">${btn("Main Online", "onlineEntry", { sym: "people" })}${btn("Lanjutkan", "resume", { sym: "save", disabled: !session.saved || session.pending })}</div>`}`;
}
function playerCards() {
  const s = session.view,
    actor = decisionActor(s);
  return s.players
    .map((p) => {
      const conn = session.online?.seats[p.id],
        flow = capsuleFeedback(session.head, p.id);
      return `<button class="player-capsule ${p.id === actor ? "active" : ""} ${p.out ? "out" : ""}" data-action="profile" data-id="${p.id}" style="--player:${colors[pawnFor(p)]}" aria-label="${esc(p.name)}, ${esc(money(p.cash))}${p.id === actor ? ", giliran aktif" : ""}${p.inJail ? ", penjara" : ""}"><div class="capsule-avatar">${avatar(p.id)}${pawnArt(pawnFor(p))}</div><div><span class="capsule-name">${esc(p.name)}${conn ? `<i class="connection ${conn.connected ? "on" : ""}"></i>` : ""}</span><strong>${esc(money(p.cash))}</strong><small class="capsule-flow ${flow ? (flow.amount > 0 ? "positive" : "negative") : ""}" ${flow ? `data-ledger="${esc(flow.id)}"` : ""}>${flow ? esc(flow.label) : p.out ? "Bangkrut" : p.inJail ? "Di penjara" : p.id === actor ? "Giliran aktif" : p.controller === "bot" ? "Bot" : "P" + (p.id + 1)}</small></div></button>`;
    })
    .join("");
}
// Preserve the feedback node on heartbeats and repeated renders of the same event.
function renderPlayers(roster) {
  const template = document.createElement("template");
  template.innerHTML = playerCards();
  decorateCurrency(template.content);
  const ids = new Set([...template.content.children].map((n) => n.dataset.id));
  for (const old of [...roster.children])
    if (!ids.has(old.dataset.id)) old.remove();
  for (const incoming of template.content.children) {
    const old = roster.querySelector(`[data-id="${incoming.dataset.id}"]`);
    if (!old) {
      roster.append(incoming.cloneNode(true));
      continue;
    }
    for (const name of ["class", "style", "aria-label"])
      if (old.getAttribute(name) !== incoming.getAttribute(name))
        old.setAttribute(name, incoming.getAttribute(name));
    for (let i = 0; i < 2; i++)
      if (old.children[i].outerHTML !== incoming.children[i].outerHTML)
        old.children[i].replaceWith(incoming.children[i].cloneNode(true));
  }
}
function drawDice() {
  diceView.update(dicePresentation(session.view, session.head), {
    id: session.head?.id || "",
    paused: session.covered || session.paused,
    reduced: session.reduced,
  });
}
function render() {
  renderQueued = false;
  try {
    const current = session.screen;
    if (current !== screen) {
      board?.dispose();
      diceView?.dispose();
      screen = current;
      page.innerHTML = current === "gameplay" ? gameplayHTML() : lobbyHTML();
      if (current === "gameplay") {
        diceView = new DiceView(page.querySelector(".dice-tray"));
        board = new BoardView(
          page.querySelector(".board-stage"),
          (id) => {
            ui.selected = id;
            open({ kind: "property", id });
          },
          (id) => session.complete(id),
        );
      } else {
        board = null;
        diceView = null;
      }
    }
    if (screen === "lobby") {
      page.querySelector("#lobby-content").innerHTML = lobbyContent();
    } else if (session.view) {
      const s = session.view,
        roster = page.querySelector(".players");
      roster.style.setProperty(
        "--columns",
        s.players.length === 2 || s.players.length === 4 ? 2 : 3,
      );
      renderPlayers(roster);
      board.update(s, session.head, {
        paused: session.covered || session.paused,
        fast: session.fast,
        reduced: session.reduced,
        selected: ui.selected,
      });
      drawDice();
      const primary = primaryAction(
          s,
          session.seat,
          session.head,
          session.paused,
        ),
        button = page.querySelector("[data-action=primary]");
      button.innerHTML = `${icon(primary.type === "ROLL" || primary.type === "START_ROLL" ? "dice" : primary.type === "END" ? "arrow" : "info", 22)}<span>${esc(primary.label)}</span>`;
      button.disabled = !!primary.disabled || session.pending;
      page.querySelector(".turn-heading").innerHTML =
        `<b>${session.room ? "ONLINE" : "VS BOT"} · RONDE ${s.round}</b><span>${session.botThinking ? "Bot sedang berpikir…" : esc(s.players[decisionActor(s)]?.name || "")} ${session.botStatus === "hybrid" ? "· Groq berhasil" : session.botStatus === "fallback" ? "· Lokal cadangan" : ""}</span>`;
      const t = BOARD[ui.selected],
        a = s.assets[t.id];
      page.querySelector(".tile-caption").innerHTML =
        `<i style="background:${t.color}"></i><b>${esc(t.name)}</b><span>${a?.owner != null ? "Milik " + esc(s.players[a.owner].name) : t.price ? esc(money(t.price)) : "Petak perjalanan"}</span>${icon("arrow", 14)}`;
      const activity = activitySummary(s, session.head);
      page.querySelector("#activity-text").textContent = activity.action;
      page.querySelector("#activity-money").textContent = activity.money;
      page.querySelector(".activity").title =
        activity.action + "\n" + activity.money;
      const note = page.querySelector(".connection-note");
      note.hidden =
        !session.room ||
        (session.connected &&
          !session.online?.held &&
          session.online?.status !== "paused" &&
          session.online?.vote?.status !== "open");
      if (!note.hidden)
        note.innerHTML = `<button data-action="room">${icon("people", 17)}<span>${session.online?.status === "paused" ? "Permainan dijeda · Siap lanjut" : !session.connected ? "Menghubungkan kembali…" : session.online?.held ? "Menunggu koneksi pemain" : "Permintaan jeda · tanggapi"}</span>${icon("arrow", 15)}</button>`;
    }
    page.querySelector("#page-status").textContent = session.error || "";
    decorateCurrency(page);
    renderDialog();
    document.documentElement.classList.toggle("reduced", session.reduced);
    document.documentElement.classList.toggle("playing", screen === "gameplay");
  } catch (e) {
    console.error("Render gagal", e);
    page
      .querySelector("#page-status")
      ?.replaceChildren(
        document.createTextNode(
          "Tampilan belum dapat diperbarui. Buka ulang dari Simpanan.",
        ),
      );
  }
}
function queueRender() {
  if (!renderQueued) {
    renderQueued = true;
    queueMicrotask(render);
  }
}
function persistTradeDraft() {
  if (
    !session.state ||
    !ui.tradeKey ||
    !ui.trade ||
    !ui.tradeKey.startsWith(
      draftScope(session.state, session.room, session.seat, !!ui.tradeCounter),
    )
  )
    return;
  ui.draftPersistent = drafts.write(ui.tradeKey, {
    trade: ui.trade,
    inputs: ui.tradeInputs || {},
  });
  const status = dialog.querySelector("[data-draft-status]");
  if (status)
    status.textContent = ui.draftPersistent
      ? "Draft tersimpan di perangkat · belum dikirim"
      : "Draft sesi · penyimpanan perangkat tidak tersedia";
}
function openTrade(counter = false, target = null) {
  const state = session.state,
    scope = draftScope(state, session.room, session.seat, counter),
    incoming = state.trade;
  const initial = counter
    ? {
        to: incoming.from,
        give: [...incoming.take],
        take: [...incoming.give],
        giveCash: incoming.takeCash,
        takeCash: incoming.giveCash,
        giveCards: incoming.takeCards,
        takeCards: incoming.giveCards,
      }
    : emptyTrade(state, session.seat);
  if (target) {
    initial.to = target.to;
    initial.take = [target.tile];
  }
  const key = target
      ? scope + target.to
      : drafts.latest(scope) || scope + initial.to,
    record = drafts.read(key);
  ui.trade = record?.trade || initial;
  if (target && !ui.trade.take.includes(target.tile))
    ui.trade.take.push(target.tile);
  ui.tradeInputs = record?.inputs || {};
  ui.tradeCounter = counter;
  ui.tradeKey = key;
  persistTradeDraft();
  open({ kind: "trade", counter });
}
function selectTradeOpponent(to) {
  persistTradeDraft();
  const scope = draftScope(session.state, session.room, session.seat, false),
    key = scope + to,
    record = drafts.read(key);
  ui.trade = record?.trade || changeTradeOpponent(ui.trade, to);
  ui.tradeInputs = record?.inputs || {
    ...(ui.tradeInputs?.giveCash !== undefined
      ? { giveCash: ui.tradeInputs.giveCash }
      : {}),
  };
  ui.tradeKey = key;
  persistTradeDraft();
  queueRender();
}
function open(p) {
  if (p.kind === "development") {
    ui.assetTab = "build";
    p = { kind: "assets", id: session.seat };
  } else if (p.kind === "manage") {
    const t = BOARD[p.id],
      owner = session.state.assets[p.id]?.owner ?? session.seat;
    ui.assetFocus = p.id;
    ui.assetTab = t.group >= 0 && owner === session.seat ? "build" : "all";
    ui.assetGroup = t.group;
    p = { kind: "assets", id: owner };
  }
  if (p.kind === "assets" && p.id !== undefined && p.id !== session.seat)
    ui.assetTab = "all";
  ui.popup = requestedPopup(p, session.state);
  if (p.kind === "assets") ui.assetQuery = "";
  session.setCovered(ui.popup.kind !== "tradeIncoming", {
    assets:
      ui.popup.kind === "assets" &&
      (ui.popup.id ?? session.seat) === session.seat,
  });
  if (p.kind === "saves")
    void listSaves().then((rows) => {
      ui.saves = rows;
      queueRender();
    });
  if (p.kind === "savedRooms" && session.auth)
    void session.auth
      .request("?rooms=1")
      .then((r) => {
        ui.savedRooms = r.rooms;
        queueRender();
      })
      .catch((e) => {
        session.error = e.message;
        queueRender();
      });
  queueRender();
}
function close() {
  persistTradeDraft();
  if (ui.popup?.kind === "picker") {
    ui.popup = ui.pickerReturn || { kind: "trade", counter: !!ui.tradeCounter };
    queueRender();
    return;
  }
  if (ui.popup) {
    ui.popup = null;
    session.setCovered(false);
  } else {
    const p = currentPopup();
    if (p?.key) ui.dismissed = dismissalKey(p, session.state);
    session.complete(session.head?.id);
  }
  queueRender();
}
function currentPopup() {
  if (ui.popup?.kind === "assets" && session.assetInterruption) {
    session.assetInterruption = false;
    ui.popup = null;
    session.setCovered(false);
  }
  if (
    ui.tradeCounter &&
    ["trade", "picker", "discardDraft"].includes(ui.popup?.kind) &&
    ui.tradeKey &&
    !ui.tradeKey.startsWith(
      draftScope(session.state, session.room, session.seat, true),
    )
  ) {
    ui.popup = null;
    ui.trade = null;
    ui.tradeKey = null;
    ui.tradeInputs = {};
    session.setCovered(false);
  }
  if (ui.popup?.kind === "tradeIncoming" && session.state?.phase !== "trade") {
    ui.popup = null;
    session.setCovered(false);
  }
  if (ui.popup) return ui.popup;
  if (session.screen !== "gameplay" || session.paused) return null;
  const p = autoPopup(
    session.view,
    session.state,
    session.head,
    session.seat,
    ui.dismissed,
  );
  if (p?.kind === "trade") p.kind = "tradeIncoming";
  return p;
}
function auxiliary(p) {
  const s = session.view,
    r = session.online,
    own = session.seat;
  switch (p.kind) {
    case "profile":
      if (!s)
        return {
          title: "Profil Pemain",
          html:
            lead(
              "people",
              ui.name,
              "Nama dan pion untuk pertandingan lokal berikutnya.",
            ) +
            `<div class="profile-hero">${avatar(0)}<h3>${esc(ui.name)}</h3>${pawnArt(ui.pawn, "Pion pilihan")}</div>`,
          footer: btn("Pilih pion", "pawn", { primary: true }),
        };
      return null;
    case "menu":
      return {
        title: "Menu Permainan",
        html:
          lead(
            "menu",
            "Meja Nusantara",
            "Semua fitur, tanpa meninggalkan papan.",
          ) +
          `${session.botBlocked ? btn("Coba ulang bot", "retryBot", { primary: true }) : ""}${claimableRent(s, own).length ? btn("Tagih sewa (" + claimableRent(s, own).length + ")", "rentClaims", { primary: true }) : ""}<div class="menu-grid">${(s
            ? [
                ["room", "Room & koneksi", "people"],
                ["saves", "Simpanan", "save"],
                ["settings", "Pengaturan", "gear"],
                ["rules", "Aturan", "info"],
              ]
            : [
                ["saves", "Simpanan", "save"],
                ["settings", "Pengaturan", "gear"],
                ["rules", "Aturan", "info"],
                ["profile", "Profil saya", "people"],
              ]
          )
            .map(([a, l, i]) => btn(l, a, { sym: i }))
            .join("")}</div>`,
        footer:
          session.screen === "gameplay"
            ? (!session.room
                ? btn(
                    session.localPaused
                      ? "Lanjutkan permainan"
                      : "Jeda permainan",
                    "localPause",
                    { sym: session.localPaused ? "play" : "pause" },
                  )
                : "") +
              btn("Simpan & ke lobby", "lobby", { primary: true, sym: "home" })
            : btn("Tutup", "close"),
      };
    case "setup":
      return {
        title: "Atur VS Bot",
        html:
          lead(
            "gear",
            "Teman Berpetualang",
            "Persona tetap, model kecerdasan bisa dipilih.",
          ) +
          `<label class="field">Nama pemain<input name="playerName" value="${esc(ui.name)}" maxlength="24"></label><div class="setup-row"><span>Total peserta</span><div class="segments">${[2, 3, 4].map((n) => `<button data-action="count" data-value="${n}" aria-pressed="${n === ui.count}">${n}</button>`).join("")}</div></div>${btn("Pilih pion", "pawn")}` +
          PERSONAS.slice(0, ui.count - 1)
            .map(
              (p, i) =>
                `<label class="bot-setting">${avatar(i + 1)}<span><b>${esc(p.name)}</b><small>${p.role}</small></span><select name="level-${p.id}">${MODELS.map((m) => `<option value="${m.id}" ${ui.levels[p.id] === m.id ? "selected" : ""}>${m.label}</option>`).join("")}</select></label>`,
            )
            .join("") +
          `<label class="field">Aturan sewa<select name="rules"><option value="digital" ${ui.rules === "digital" ? "selected" : ""}>Digital · otomatis</option><option value="classic" ${ui.rules === "classic" ? "selected" : ""}>Meja Klasik · tagih manual</option></select></label><label class="toggle">Groq opsional<input type="checkbox" name="advisor" ${ui.advisor ? "checked" : ""} ${!session.configured ? "disabled" : ""}></label><p class="inline-note">${session.configured ? "Terkonfigurasi; belum berarti request berhasil." : "Groq belum tersedia."} Bot lokal tetap mandiri.</p>`,
        footer: btn("Selesai", "close", { primary: true }),
      };
    case "pawn": {
      const selected = session.room ? session.online.seats[own]?.pawn : ui.pawn,
        used = new Map(
          (session.online?.seats || [])
            .filter((x) => x.id !== own)
            .map((x) => [x.pawn, x.name]),
        );
      return {
        title: "Pilih Pion",
        html:
          lead("people", "Pilih Pion", "Identitas perjalananmu di Nusantara.") +
          `<div class="pawn-grid">${TOKENS.map((t) => `<button data-action="choosePawn" data-id="${t.id}" ${used.has(t.id) ? "disabled" : ""} class="${t.id === selected ? "selected" : ""}">${pawnArt(t.id, t.name)}<b>${t.name}</b><small>${esc(used.get(t.id) || "Tersedia")}</small></button>`).join("")}</div>`,
        footer: btn("Selesai", "close", { primary: true }),
      };
    }
    case "onlineEntry": {
      const status = onlineStatus(session);
      return {
        title: "Main Online",
        html:
          lead(
            "people",
            "Bermain Bersama",
            "2–6 peserta · minimal dua manusia.",
          ) +
          `<div class="chips">${[
            ["create", "Buat Room"],
            ["join", "Gabung"],
            ["saved", "Lanjutkan"],
          ]
            .map(
              ([v, l]) =>
                `<button data-action="onlineTab" data-value="${v}" aria-pressed="${ui.roomMode === v}">${l}</button>`,
            )
            .join(
              "",
            )}</div>${ui.roomMode === "create" ? `<label class="field">Kapasitas room<select name="capacity">${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === (ui.capacity || 6) ? "selected" : ""}>${n} peserta</option>`).join("")}</select></label><p class="body-copy">Undang teman dengan kode room setelah dibuat. Identitas pemain memakai akun masing-masing.</p>` : ui.roomMode === "join" ? `<label class="field">Kode room<input name="joinCode" value="${esc(ui.joinCode)}" maxlength="8" placeholder="ABCDEFGH" autocomplete="off" autocapitalize="characters"></label><p class="inline-note">8 karakter. Kode room bukan bukti kepemilikan kursi.</p>` : '<p class="body-copy">Masuk dengan identitas pemilik pertandingan untuk melanjutkan.</p>'}<div class="identity-chip">${icon("people", 19)}<span>${session.auth?.session() ? "Identitas tersedia" : "Belum masuk"}</span><button data-action="auth">${session.auth?.session() ? "Akun" : "Masuk / Tamu"}</button></div><div class="online-status" data-online-status="${status.code}" role="status"><b>${esc(status.label)}</b><p>${esc(status.detail)}</p></div>${btn("Periksa ulang", "retryOnline", { disabled: session.configStatus === "loading" })}`,
        footer: btn(
          ui.roomMode === "create"
            ? "Buat Room"
            : ui.roomMode === "join"
              ? "Gabung Room"
              : "Lihat Room Tersimpan",
          ui.roomMode === "saved" ? "savedRooms" : "enterRoom",
          {
            primary: true,
            disabled:
              session.pending ||
              !session.config?.online ||
              session.configStatus !== "ready",
            sym: "people",
          },
        ),
      };
    }
    case "auth":
      return {
        title: "Identitas Online",
        html:
          lead(
            "people",
            "Identitas Online",
            "Gunakan akun untuk pemulihan lintas perangkat.",
          ) +
          `<label class="field">Email<input name="email" type="email" autocomplete="email" value="${esc(ui.email)}"></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" value="${esc(ui.password)}"></label><p class="inline-note">Tamu dipulihkan di browser yang sama. Jangan berbagi token atau kode akun.</p>${session.auth?.session() ? '<p class="inline-note">Anda sudah memiliki sesi tersimpan pada perangkat ini.</p>' : ""}`,
        footer:
          btn("Masuk", "login", { primary: true, disabled: !session.auth }) +
          btn("Daftar / tautkan akun", "signup", { disabled: !session.auth }) +
          btn("Main sebagai tamu", "guest", { disabled: !session.auth }),
      };
    case "savedRooms":
      return {
        title: "Lanjutkan Room",
        html:
          lead("save", "Pertandingan Tersimpan") +
          (ui.savedRooms
            ? ui.savedRooms
                .map((x) =>
                  btn(
                    `${esc(x.code)} · ${esc(x.status)} · ${x.players}/${x.capacity}`,
                    "joinSaved",
                    { extra: `data-code="${esc(x.code)}"` },
                  ),
                )
                .join("") ||
              '<p class="empty">Belum ada room pada identitas ini.</p>'
            : '<p class="empty">Memuat room…</p>'),
        footer: btn("Tutup", "close"),
      };
    case "discardDraft":
      return {
        title: "Hapus Draft Barter",
        html: lead(
          "trade",
          "Kosongkan draft?",
          "Pilihan properti, uang dan kartu pada draft ini akan dihapus. Tawaran yang sudah dikirim tidak berubah.",
        ),
        footer:
          btn("Tetap simpan", "close") +
          btn("Kosongkan", "clearTradeDraft", { primary: true }),
      };
    case "settings":
      return {
        title: "Pengaturan",
        html:
          lead("gear", "Pengaturan", "Sesuaikan kenyamanan bermain.") +
          `<label class="toggle">Efek suara<input type="checkbox" name="sound" ${ui.sound ? "checked" : ""}></label><label class="toggle">Animasi cepat<input type="checkbox" name="fast" ${session.fast ? "checked" : ""}></label><label class="toggle">Kurangi gerakan<input type="checkbox" name="reduced" ${session.reduced ? "checked" : ""}></label><p class="inline-note">Pengaturan disimpan pada perangkat ini. Preferensi reduced motion sistem tetap dihormati.</p><div class="fact-row"><span>Versi</span><b>${APP_VERSION} · Papan Klasik</b></div>`,
        footer: btn("Selesai", "close", { primary: true }),
      };
    case "rules":
      return {
        title: "Cara Bermain",
        html:
          lead("info", "Cara Bermain", "Aturan C1009 · Mata uang Nusa.") +
          [
            [
              "Giliran & dadu",
              "Lempar awal menentukan pemain pertama. Dadu kembar dapat memberi lemparan tambahan; tiga kali kembar mengirim ke penjara.",
            ],
            [
              "Beli, sewa & bangunan",
              "Properti yang dilewatkan ditawarkan dalam lelang. Lengkapi kelompok dan bangun merata; stok rumah/hotel terbatas.",
            ],
            [
              "Pajak & Parkir Bebas",
              "Pajak Penghasilan tetap N 200 dan Pajak Kemewahan tetap N 100 ke Bank. Tidak menghitung kekayaan, rumah, atau hotel dan tidak memakai opsi 10%. Parkir Bebas tidak menerima uang pajak atau memberikan jackpot.",
            ],
            [
              "Barter",
              "Uang, properti dan kartu dapat ditawarkan. Kedua pihak harus menyetujui; aset dengan bangunan memiliki batasan.",
            ],
            [
              "Penjara & utang",
              "Bayar N 50, pakai kartu, atau coba kembar. Saat utang, jual bangunan, gadai atau barter sebelum menyatakan bangkrut.",
            ],
            [
              "Room, jeda & reconnect",
              "Jeda manual memerlukan mayoritas manusia aktif. Auto-pause setelah 90 detik tanpa heartbeat. Resume memerlukan semua manusia aktif terhubung dan siap.",
            ],
            [
              "Kontrol papan",
              "Ketuk petak untuk detail. Geser atau cubit untuk menjelajah. Ikon peta mengembalikan seluruh papan atau mengikuti pion.",
            ],
          ]
            .map(
              ([h, t]) =>
                `<details class="rule-item"><summary>${h}</summary><p>${t}</p></details>`,
            )
            .join(""),
        footer: btn("Mengerti", "close", { primary: true }),
      };
    case "saves":
      return {
        title: "Simpanan",
        html:
          lead(
            "save",
            "Simpanan",
            session.room
              ? "Room tersimpan permanen di backend."
              : "Autosave lokal dan lima slot cadangan.",
          ) +
          (session.room
            ? '<p class="body-copy">Lanjutkan room dengan identitas pemilik kursi. Impor JSON tidak boleh mengganti pertandingan online.</p>'
            : `<label class="field">Nama cadangan<input name="saveLabel" maxlength="48" value="${esc(ui.saveLabel)}"></label>${(ui.saves || []).map((x) => `<div class="save-slot"><div><b>${esc(x.label || x.id)}</b><small>${x.state ? "Ronde " + x.state.round + " · " + x.state.players.length + " peserta" : "Kosong"}</small></div>${x.id !== "previous" ? btn("Simpan", "saveSlot", { extra: `data-id="${x.id}"`, disabled: !session.state }) : ""}${btn("Muat", "loadSlot", { extra: `data-id="${x.id}"`, disabled: !x.state })}</div>`).join("")}<div class="lobby-tools">${btn("Ekspor JSON", "export", { disabled: !session.state })}${btn("Impor JSON", "import")}</div><input type="file" id="save-file" accept="application/json,.json" hidden>`),
        footer: btn("Tutup", "close"),
      };
    case "addBotPopup":
      return {
        title: "Tambah Bot",
        html:
          lead(
            "people",
            "Bot di Room",
            "Persona berikutnya dipilih backend, tanpa duplikasi.",
          ) +
          `<label class="field">Model bot<select name="nextBotLevel">${MODELS.map((x) => `<option value="${x.id}" ${x.id === (ui.nextBotLevel || "medium") ? "selected" : ""}>${x.label}</option>`).join("")}</select></label><p class="inline-note">Bot hanya ditambahkan sebelum mulai. Tidak menggantikan manusia yang terputus.</p>`,
        footer: btn("Tambahkan bot", "addBot", {
          primary: true,
          disabled: session.pending,
        }),
      };
  }
  return null;
}
function renderDialog() {
  const p = currentPopup();
  layers.sync(!!p);
  if (!p) {
    if (dialog.open) {
      dialog.close();
      previousFocus?.focus?.({ preventScroll: true });
    }
    popupKey = "";
    popupHTML = "";
    footerHTML = "";
    return;
  }
  let content = auxiliary(p);
  if (!content && (session.view || p.kind === "room"))
    content = renderPopup(session, ui, p);
  if (!content) {
    close();
    return;
  }
  const key = p.key || p.kind + ":" + (p.id ?? ""),
    markup = `${content.html}${session.error ? `<p class="dialog-status" role="status">${esc(session.error)}</p>` : ""}`;
  if (popupKey !== key) {
    previousFocus = document.activeElement;
    dialogBody.scrollTop = 0;
    popupKey = key;
  }
  const assetStates =
    popupKey === key && dialog.dataset.kind === "assets"
      ? [...dialogBody.querySelectorAll("[data-asset-key]")].map((n) => [
          n.dataset.assetKey,
          n.open,
        ])
      : [];
  const focused = dialog.contains(document.activeElement)
      ? document.activeElement
      : null,
    name = focused?.dataset.selectionName || focused?.name,
    start = focused?.selectionStart,
    end = focused?.selectionEnd,
    scroll = dialogBody.scrollTop;
  if (popupHTML !== markup) {
    dialogBody.innerHTML = markup;
    enhanceSelections(dialogBody);
    decorateCurrency(dialogBody);
    popupHTML = markup;
    for (const [id, expanded] of assetStates) {
      const el = dialogBody.querySelector(
        `[data-asset-key="${CSS.escape(id)}"]`,
      );
      if (el) el.open = expanded;
    }
    dialogBody.scrollTop = scroll;
  }
  let footer = content.footer || "";
  if (
    ui.popup &&
    !/data-action="(?:close|saveTradeDraft|pickerDone)"/.test(footer)
  )
    footer += btn("Selesai", "close");
  if (footerHTML !== footer) {
    dialogFooter.innerHTML = footer;
    decorateCurrency(dialogFooter);
    footerHTML = footer;
  }
  dialog.setAttribute("aria-label", content.title);
  dialog.dataset.kind = p.kind;
  dialogClose.disabled = false;
  dialogClose.hidden = !!dialogFooter.querySelector("button");
  dialog.classList.toggle("has-close", !dialogClose.hidden);
  if (!dialog.open) dialog.showModal();
  if (name) {
    const replacement =
      dialog.querySelector(`[data-selection-name="${CSS.escape(name)}"]`) ||
      dialog.querySelector(`[name="${CSS.escape(name)}"]`);
    replacement?.focus({ preventScroll: true });
    try {
      replacement?.setSelectionRange(start, end);
    } catch {}
  }
}
function chirp() {
  if (!ui.sound) return;
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    ui.audio ||= new C();
    const osc = ui.audio.createOscillator(),
      gain = ui.audio.createGain();
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.025, ui.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ui.audio.currentTime + 0.1);
    osc.connect(gain).connect(ui.audio.destination);
    osc.start();
    osc.stop(ui.audio.currentTime + 0.11);
  } catch {}
}
async function perform(action, el) {
  try {
    session.error = "";
    chirp();
    const id = Number(el?.dataset.id);
    switch (action) {
      case "close":
        close();
        return;
      case "menu":
      case "settings":
      case "setup":
      case "onlineEntry":
      case "auth":
      case "saves":
      case "savedRooms":
      case "rules":
      case "addBotPopup":
        open({ kind: action });
        return;
      case "count":
        ui.count = Number(el.dataset.value);
        ui.trade = null;
        queueRender();
        return;
      case "pawn":
        if (session.screen === "gameplay") {
          session.error = "Pion dipilih sebelum pertandingan dimulai.";
          break;
        }
        open({ kind: "pawn" });
        return;
      case "choosePawn":
        if (session.room) {
          if (
            await session.roomOp("READY", {
              ready: !!session.online.seats[session.seat].ready,
              pawn: id,
            })
          )
            close();
        } else {
          ui.pawn = id;
          close();
        }
        break;
      case "startLocal":
        close();
        ui.dismissed = "";
        ui.trade = null;
        await session.startLocal({
          name: ui.name,
          count: ui.count,
          pawn: ui.pawn,
          rules: ui.rules,
          levels: ui.levels,
          advisorEnabled: ui.advisor,
        });
        break;
      case "resume":
        close();
        await session.resume();
        break;
      case "onlineTab":
        ui.roomMode = el.dataset.value;
        queueRender();
        return;
      case "enterRoom": {
        if (!session.auth?.session()) {
          open({ kind: "auth" });
          break;
        }
        const ok = await session.roomOp(
          ui.roomMode === "join" ? "JOIN" : "CREATE",
          ui.roomMode === "join"
            ? {
                code: ui.joinCode.trim().toUpperCase(),
                name: ui.name,
                pawn: ui.pawn,
              }
            : {
                name: ui.name,
                pawn: ui.pawn,
                capacity: ui.capacity || 6,
                rules: ui.rules,
                advisorEnabled: ui.advisor && session.configured,
              },
        );
        if (ok) close();
        break;
      }
      case "guest":
      case "login":
      case "signup":
        if (!session.auth) throw Error("Supabase belum tersedia.");
        if (action === "guest") await session.auth.guest();
        else {
          if (!ui.email.includes("@") || ui.password.length < 6)
            throw Error("Masukkan email dan password minimal 6 karakter.");
          if (action === "login")
            await session.auth.login(ui.email, ui.password);
          else if (session.auth.session()?.user?.is_anonymous)
            await session.auth.link(ui.email, ui.password);
          else await session.auth.signup(ui.email, ui.password);
        }
        ui.password = "";
        if (
          session.room &&
          session.room.userId !== session.auth.session()?.user.id
        ) {
          session.disconnect();
          session.room = null;
          session.online = null;
          session.state = null;
          session.model = null;
          session.screen = "lobby";
        }
        open({ kind: "onlineEntry" });
        break;
      case "joinSaved":
        if (await session.roomOp("JOIN", { code: el.dataset.code })) close();
        break;
      case "ready":
        await session.roomOp("READY", {
          ready: !session.online.seats[session.seat].ready,
        });
        break;
      case "startRoom":
        if (await session.roomOp("START")) close();
        break;
      case "addBot":
        if (
          await session.roomOp("ADD_BOT", {
            difficulty: ui.nextBotLevel || "medium",
          })
        )
          close();
        break;
      case "copyRoom":
        await navigator.clipboard.writeText(
          `${location.origin}/?room=${session.room.code}`,
        );
        session.error = "Tautan room disalin.";
        break;
      case "camera":
        ui.camera =
          board?.mode === "manual"
            ? "overview"
            : ui.camera === "overview"
              ? "follow"
              : "overview";
        board?.setMode(ui.camera);
        page
          .querySelector("[data-action=camera]")
          .setAttribute("aria-pressed", String(ui.camera === "follow"));
        page
          .querySelector("[data-action=camera]")
          .setAttribute(
            "aria-label",
            "Kamera: " +
              (ui.camera === "overview" ? "lihat dekat" : "seluruh papan"),
          );
        break;
      case "primary": {
        if (session.pending) break;
        if (session.paused) {
          if (session.room) open({ kind: "room" });
          else session.setPaused(false);
          break;
        }
        const a = primaryAction(session.view, session.seat, session.head);
        if (a.disabled) break;
        if (a.type) await session.act(a.type, a.data || {});
        else {
          ui.dismissed = "";
          if (!currentPopup()) {
            const actor = decisionActor(session.view);
            open({ kind: "profile", id: actor });
          }
        }
        break;
      }
      case "retryBot":
        close();
        session.retryBot();
        break;
      case "skip":
        session.resetPresentation();
        session.notify();
        break;
      case "assets":
      case "ownAssets":
        open({
          kind: "assets",
          id:
            action === "assets" && el.dataset.id !== undefined
              ? id
              : session.seat,
        });
        return;
      case "profile":
        open({
          kind: "profile",
          id: el?.dataset.id === undefined ? session.seat : id,
        });
        return;
      case "history":
      case "room":
      case "allTiles":
      case "rentClaims":
      case "development":
        open({ kind: action });
        return;
      case "selectedProperty":
        open({ kind: "property", id: ui.selected });
        return;
      case "property":
      case "manage":
        open({ kind: action, id });
        return;
      case "developmentTrade":
        openTrade(false, {
          to: Number(el.dataset.owner),
          tile: Number(el.dataset.tile),
        });
        return;
      case "retryOnline":
        await session.refreshConfig();
        return;
      case "assetTab":
        ui.assetTab = el.dataset.value;
        if (el.dataset.group !== undefined)
          ui.assetGroup = Number(el.dataset.group);
        queueRender();
        return;
      case "refreshMortgageAdvice":
        if (!session.busy) {
          session.assetPlan = null;
          queueRender();
        }
        return;
      case "autoMortgage":
        session.startMortgages(Number(el.dataset.target), {
          version: Number(el.dataset.version),
          tiles: (el.dataset.tiles || "").split(",").map(Number),
        });
        return;
      case "buildMany":
        session.startBuilds(Number(el.dataset.group), Number(el.dataset.count));
        return;
      case "stopBuilds":
        session.stopAssetPlan();
        session.notify();
        return;
      case "assetFilter":
        ui.assetFilter = el.dataset.value;
        queueRender();
        return;
      case "historyFilter":
        ui.historyFilter = el.dataset.value;
        queueRender();
        return;
      case "cancelAssetConfirm":
        ui.assetConfirm = null;
        queueRender();
        return;
      case "confirmAsset":
        if (ui.popup?.kind === "assets") {
          ui.assetConfirm = {
            tile: Number(el.dataset.tile),
            type: el.dataset.type,
          };
          queueRender();
          return;
        }
        ui.assetReturn = ui.popup?.kind === "assets" ? { ...ui.popup } : null;
        open({
          kind: "confirmAsset",
          id: Number(el.dataset.tile),
          type: el.dataset.type,
        });
        return;
      case "command": {
        const data = {};
        if (el.dataset.tile !== undefined) data.tile = Number(el.dataset.tile);
        if (el.dataset.claimId) data.claimId = el.dataset.claimId;
        const type = el.dataset.type,
          manual = !!ui.popup,
          assetPanel = ui.popup?.kind === "assets";
        if (await session.act(type, data)) {
          ui.assetConfirm = null;
          if (
            manual &&
            !assetPanel &&
            ["MORTGAGE", "SELL_SET"].includes(type)
          ) {
            const back = ui.assetReturn;
            ui.assetReturn = null;
            open(back || { kind: "manage", id: data.tile });
            session.markAssetPresentation(session.state, type);
            session.notify();
          } else if (
            manual &&
            ["TRADE_ACCEPT", "TRADE_REJECT", "BANKRUPT"].includes(type)
          )
            close();
        }
        break;
      }
      case "trade":
        if (session.state.phase === "trade") open({ kind: "tradeIncoming" });
        else openTrade();
        return;
      case "saveTradeDraft":
        persistTradeDraft();
        close();
        return;
      case "discardTradeDraft":
        open({ kind: "discardDraft" });
        return;
      case "clearTradeDraft": {
        const counter = !!ui.tradeCounter;
        drafts.remove(ui.tradeKey);
        ui.trade = emptyTrade(session.state, session.seat, ui.trade.to);
        ui.tradeInputs = {};
        persistTradeDraft();
        open({ kind: "trade", counter });
        return;
      }
      case "counter":
        openTrade(true);
        return;
      case "tradePicker":
        ui.pickerReturn = ui.popup;
        open({
          kind: "picker",
          side: el.dataset.side,
          owner: Number(el.dataset.owner),
        });
        return;
      case "pickerDone":
        ui.popup = ui.pickerReturn || { kind: "trade", manual: true };
        queueRender();
        return;
      case "tradeRemove":
        ui.trade[el.dataset.side] = ui.trade[el.dataset.side].filter(
          (x) => x !== id,
        );
        persistTradeDraft();
        queueRender();
        return;
      case "submitTrade":
        {
          const status = tradeDraftStatus(session.view, session.seat, ui.trade);
          if (status.invalid || !status.hasValue)
            throw Error(status.reason || "Tawaran masih kosong.");
        }
        if (
          await session.act(
            el.dataset.counter === "true" ? "COUNTER" : "OFFER",
            { trade: ui.trade },
          )
        ) {
          drafts.remove(ui.tradeKey);
          ui.trade = null;
          ui.tradeKey = null;
          ui.tradeInputs = {};
          close();
        }
        break;
      case "bidStep":
        ui.bid = Math.max(
          bidMinimum(session.view),
          (session.view.auction?.amount || 0) + Number(el.dataset.amount),
        );
        queueRender();
        return;
      case "bid": {
        const raw = dialog.querySelector("[name=bid]")?.value,
          amount = parseNusa(raw);
        if (amount === null) throw Error("Nominal tawaran tidak valid.");
        await session.act("BID", { amount });
        break;
      }
      case "dismissEvent":
        ui.dismissed = dismissalKey(currentPopup(), session.state);
        session.complete(session.head?.id);
        break;
      case "bankrupt":
        open({ kind: "bankrupt" });
        return;
      case "pauseRequest":
        await session.roomOp("PAUSE_REQUEST");
        break;
      case "voteYes":
      case "voteNo":
        await session.roomOp("VOTE", {
          voteId: session.online.vote.id,
          agree: action === "voteYes",
        });
        break;
      case "resumeReady":
        await session.roomOp("RESUME_READY", {
          cycle: session.online.pause.cycle,
          ready: !session.online.pause.ready.includes(session.seat),
        });
        break;
      case "localPause":
        close();
        session.setPaused(!session.localPaused);
        break;
      case "lobby":
        ui.popup = null;
        session.setCovered(false);
        await session.lobby();
        ui.dismissed = "";
        break;
      case "saveSlot":
        await saveSlot(
          el.dataset.id,
          { state: session.state, room: null },
          ui.saveLabel,
        );
        ui.saves = await listSaves();
        session.error = "Cadangan tersimpan.";
        break;
      case "loadSlot": {
        const slot = ui.saves.find((x) => x.id === el.dataset.id);
        if (slot?.state) {
          await session.restore(slot.state);
          close();
        }
        break;
      }
      case "export": {
        if (session.room)
          throw Error("Room online tidak dapat diekspor sebagai save lokal.");
        const blob = new Blob(
            [serializeSave({ state: session.state, room: null })],
            { type: "application/json" },
          ),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "Nusantara-save.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case "import":
        dialog.querySelector("#save-file").click();
        return;
    }
  } catch (e) {
    console.error("Tindakan gagal", e);
    session.error =
      e instanceof TypeError
        ? "Tampilan belum dapat diperbarui. Coba kembali ke lobby."
        : e.message || "Tindakan belum berhasil.";
  }
  queueRender();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && !el.disabled) void perform(el.dataset.action, el);
});
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  close();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      close();
  }
});
document.addEventListener("input", (e) => {
  const el = e.target,
    name = el.name;
  if (name === "playerName") ui.name = el.value;
  else if (name === "mortgageTarget") {
    ui.mortgageTarget = el.value;
    queueRender();
  } else if (name === "assetSearch") {
    ui.assetQuery = el.value;
    queueRender();
  } else if (name === "bid") {
    const n = parseNusa(el.value);
    if (n !== null) ui.bid = n;
  } else if (name === "joinCode") ui.joinCode = el.value.toUpperCase();
  else if (name === "email" || name === "password" || name === "saveLabel")
    ui[name] = el.value;
  else if (["giveCash", "takeCash"].includes(name)) {
    const n = parseNusa(el.value);
    {
      ui.trade[name] = n === null ? NaN : n;
      ui.tradeInputs ||= {};
      ui.tradeInputs[name] = el.value;
      persistTradeDraft();
      const status = tradeDraftStatus(session.view, session.seat, ui.trade),
        b = dialog.querySelector("[data-action=submitTrade]");
      if (b) b.disabled = status.invalid || !status.hasValue;
      dialog.querySelector("[data-trade-status]").textContent =
        status.reason ||
        "Kepemilikan dan saldo diperiksa kembali saat transaksi.";
    }
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target,
    name = el.name;
  try {
    if (name?.startsWith("buildCount-")) {
      ui.buildCounts[Number(name.slice(11))] = Number(el.value);
      queueRender();
    } else if (name?.startsWith("level-")) ui.levels[name.slice(6)] = el.value;
    else if (name === "rules") ui.rules = el.value;
    else if (name === "advisor") ui.advisor = el.checked;
    else if (name === "capacity") ui.capacity = Number(el.value);
    else if (name === "nextBotLevel") ui.nextBotLevel = el.value;
    else if (name === "assetOwner")
      open({ kind: "assets", id: Number(el.value) });
    else if (name === "tradeOpponent") {
      selectTradeOpponent(Number(el.value));
    } else if (name === "tradeAsset") {
      const side = el.dataset.side,
        id = Number(el.value);
      ui.trade[side] = el.checked
        ? [...ui.trade[side], id]
        : ui.trade[side].filter((x) => x !== id);
      persistTradeDraft();
    } else if (name === "giveCards" || name === "takeCards") {
      ui.trade[name] = Number(el.value);
      persistTradeDraft();
      queueRender();
    } else if (["fast", "reduced", "sound"].includes(name)) {
      if (name === "sound") ui.sound = el.checked;
      else
        session[name] =
          el.checked ||
          (name === "reduced" &&
            matchMedia("(prefers-reduced-motion: reduce)").matches);
      savePreferences({
        sound: ui.sound,
        fast: session.fast,
        reduced: session.reduced,
        view: ui.camera,
      });
      queueRender();
    } else if (el.id === "save-file") {
      const file = el.files?.[0];
      if (file) {
        if (file.size > 1000000) throw Error("Ukuran cadangan maksimal 1 MB.");
        const value = parseSave(await file.text());
        await session.restore(value.state);
        close();
      }
    }
  } catch (error) {
    session.error = error.message;
    queueRender();
  }
});
session.addEventListener("change", queueRender);
document.addEventListener("visibilitychange", () =>
  session.setVisible(!document.hidden),
);
window.addEventListener("online", () => void session.readRoom(true));
window.addEventListener("pagehide", (e) => {
  session.stopBot();
  session.disconnect();
  session.localLease.release();
  if (e.persisted && !session.room) session.localPaused = true;
  if (!e.persisted) session.dispose();
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    if (session.room) {
      session.setVisible(!document.hidden);
      session.connectRoom();
    } else if (session.state && session.screen === "gameplay")
      void session.resume().then(() => session.setVisible(!document.hidden));
    else session.setVisible(!document.hidden);
  }
});
window.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !dialog.open &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
      document.activeElement.tagName,
    )
  ) {
    const action = primaryAction(
      session.view,
      session.seat,
      session.head,
      session.paused,
    );
    if (action.type) {
      e.preventDefault();
      void session.act(action.type, action.data || {});
    }
  }
});
render();
void session.initialize().then(() => {
  const code = new URLSearchParams(location.search).get("room");
  if (code) {
    ui.roomMode = "join";
    ui.joinCode = code;
    open({ kind: "onlineEntry" });
  }
});

let viewportFrame;
const resizeViewport = () => {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(() =>
    document.documentElement.style.setProperty(
      "--vh",
      `${window.visualViewport?.height || window.innerHeight}px`,
    ),
  );
};
window.visualViewport?.addEventListener("resize", resizeViewport);
window.addEventListener("resize", resizeViewport);
resizeViewport();
if ("serviceWorker" in navigator && window.isSecureContext)
  void retireLegacyUI({
    serviceWorker: navigator.serviceWorker,
    caches: window.caches,
    origin: location.origin,
  })
    .then(() => navigator.serviceWorker.register("/nusantara-sw.js"))
    .catch(() => {});
