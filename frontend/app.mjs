import { bankSnapshot } from "../lib/bank-economy.mjs";
import { lucideIcon } from "./lucide-icons.mjs";
import { updateAuctionBody } from "./auction-view.mjs";
import { updateTradeBody, updateAssetBody } from "./trade-view.mjs";
import { normalizeAmountInput } from "./number-input.mjs";
import { auctionIdentity } from "../lib/auction-presentation.mjs";
import { APP_VERSION } from "../lib/version.mjs";
import { activitySummary, capsuleFeedback } from "./economy-view.mjs";
import { onlineStatus } from "./online-status.mjs";
import { decorateCurrency } from "./currency-view.mjs";
import { enhanceSelections } from "./selections.mjs";
import { TradeDrafts, draftScope, emptyTrade } from "./trade-drafts.mjs";
import { retireLegacyUI } from "./cache-migration.mjs";
import { createPwa } from "./pwa.mjs";
import { createLayerNavigation } from "../lib/layer-navigation.mjs";
import { DiceView } from "./dice-view.mjs";
import { GameSession } from "./session.mjs";
import { RollInput } from "./roll-input.mjs";
import { diceLogExport } from "./dice-log.mjs";
import { renderBuildOrder, buildOrderSelection } from "./asset-panel.mjs";
import { copyRoomCode, installSelectionGuard } from "./clipboard.mjs";
import {
  decisionFooter,
  passivePopup,
  readingCard,
  dismissalAction,
  dismissalLabel,
} from "./popup-controls.mjs";
import { BoardView } from "./board.mjs";
import {
  esc,
  requestedPopup,
  claimableRent,
  dismissalKey,
  primaryAction,
  dicePresentation,
  autoPopup,
  bidMinimum,
} from "./domain.mjs";
import { icon, avatar, playerAvatar, colors, pawnArt } from "./art.mjs";
import { renderPopup, btn, lead, tradeEstimateMarkup } from "./popups.mjs";
import { localPlayers, PERSONAS } from "../lib/bot/personas.mjs";
import { TOKENS, pawnFor } from "../lib/pawns.mjs";
import { BOARD, money } from "../lib/content.mjs";
import { decisionActor } from "../lib/game.mjs";
import { parseNusa, nusaInput } from "../lib/currency.mjs";
import { serializeSave, parseSave } from "../lib/save-format.mjs";
import { saveSlot, listSaves } from "../lib/storage.ts";
import { loadPreferences, savePreferences } from "../lib/preferences.mjs";
import {
  loadPlayerName,
  savePlayerName,
  requirePlayerName,
} from "../lib/player-name.mjs";
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
  name: loadPlayerName(),
  profileDraft: "",
  count: 4,
  pawn: 0,
  rules: "digital",
  levels: Object.fromEntries(PERSONAS.map((p) => [p.id, "hardcore"])),
  botIds: ["raka", "bima", "sari", "nusa", "apex"],
  nextBotPersona: null,
  advisor: false,
  popup: null,
  dismissed: "",
  selected: 0,
  historyFilter: "all",
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
  dialogHeader = dialog.querySelector(".popup-header"),
  dialogBody = dialog.querySelector(".popup-body"),
  dialogFooter = dialog.querySelector(".popup-footer"),
  dialogClose = dialog.querySelector(".popup-dismiss");
installSelectionGuard();
function rollIntent(button) {
  if (
    !button ||
    button.disabled ||
    session.screen !== "gameplay" ||
    session.busy ||
    session.hidden
  )
    return null;
  const s = session.interactionState,
    seat = session.seat;
  if (!s || s.players[seat]?.controller !== "human" || s.players[seat].out)
    return null;
  const type =
    button.dataset.action === "primary"
      ? primaryAction(s, seat, session.interactionHead, session.paused).type
      : button.dataset.action === "command"
        ? button.dataset.type
        : null;
  if (!["ROLL", "START_ROLL"].includes(type) || decisionActor(s) !== seat)
    return null;
  if (
    (type === "ROLL" && !["roll", "jail"].includes(s.phase)) ||
    (type === "START_ROLL" && s.phase !== "starting")
  )
    return null;
  return {
    type,
    token: JSON.stringify([
      s.matchId,
      s.version,
      seat,
      type,
      session.connectionEpoch,
    ]),
  };
}
const rollInput = new RollInput({
  document,
  resolve: rollIntent,
  commit: (intent) => {
    chirp();
    return session.act(intent.type);
  },
  changed: queueRender,
});
const assetViews = new Map(),
  assetTabs = new Map();
let renderedAssetKey = "",
  assetRestore = null;
const assetOwnerKey = (owner = ui.popup?.id ?? session.seat) =>
  `${session.state?.matchId}:${session.seat}:${owner}`;
const assetViewKey = () => `${assetOwnerKey()}:${ui.assetTab}`;
function rememberAssetView() {
  if (!renderedAssetKey || dialog.dataset.kind !== "assets") return;
  assetViews.set(renderedAssetKey, {
    query: dialogBody.querySelector('[name="assetSearch"]')?.value || "",
    filter:
      dialogBody.querySelector(
        '[data-action="mortgageFilter"][aria-pressed="true"]',
      )?.dataset.value || "available",
    scroll: dialogBody.scrollTop,
    details: [...dialogBody.querySelectorAll("[data-asset-key]")].map((n) => [
      n.dataset.assetKey,
      n.open,
    ]),
  });
  while (assetViews.size > 48)
    assetViews.delete(assetViews.keys().next().value);
}
function restoreAssetView() {
  const saved = assetViews.get(assetViewKey());
  ui.assetQuery = saved?.query || "";
  ui.mortgageFilter = saved?.filter || "available";
  assetRestore = saved || { scroll: 0, details: [] };
}
function returnFromBuild() {
  const origin = ui.buildReturn;
  const group = ui.popup?.group;
  ui.buildReturn = null;
  ui.popup =
    origin?.match === session.state?.matchId
      ? origin.popup
      : { kind: "assets", id: session.seat };
  ui.assetTab = "build";
  assetRestore = origin?.view || { scroll: 0, details: [] };
  session.setCovered(true, { assets: true });
  queueRender();
  requestAnimationFrame(() =>
    dialogBody
      .querySelector(`[data-action="buildOrder"][data-group="${group}"]`)
      ?.focus({ preventScroll: true }),
  );
}
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
const pwa = createPwa({
  window,
  navigator,
  canUpdate: () =>
    session.screen !== "gameplay" && !session.pending && !session.botThinking,
  onChange: queueRender,
});
const botFor = (id) => PERSONAS.find((p) => p.id === id);
const selectedBots = () => ui.botIds.slice(0, ui.count - 1);
const availableRoomPersona = () => {
  const occupied = new Set(
    (session.online?.seats || [])
      .filter((p) => p.controller === "bot")
      .map((p) => p.botPersona),
  );
  return (
    PERSONAS.find((p) => p.id === ui.nextBotPersona && !occupied.has(p.id)) ||
    PERSONAS.find((p) => !occupied.has(p.id))
  );
};
const botCard = (p, selected, disabled) =>
  `<button type="button" class="bot-choice-card ${selected ? "selected" : ""}" data-action="chooseBotPersona" data-value="${p.id}" aria-pressed="${selected}" ${disabled ? "disabled" : ""}>${avatar(PERSONAS.indexOf(p))}<span class="bot-choice-details"><b>${esc(p.id === "apex" ? "ARKA / APEX" : p.name)}</b><small>${esc(p.role)}</small></span><span class="bot-choice-indicator">${selected ? icon("check", 16) : disabled ? "Dipakai" : icon("arrow", 16)}</span></button>`;
const brand = () =>
  `<div class="brand"><img src="/assets/brand/logo.png" alt="" width="38" height="38"><span>Nusantara</span></div>`;
const topbar = () =>
  `<header class="topbar"><button class="icon-button" data-action="menu" aria-label="Menu permainan">${icon("menu", 22)}</button>${brand()}${session.screen === "gameplay" ? `<button class="icon-button" data-action="camera" aria-label="Kamera: ${ui.camera === "overview" ? "lihat dekat" : "seluruh papan"}" aria-pressed="${ui.camera === "follow"}">${icon("map", 22)}</button>` : '<span class="header-spacer" aria-hidden="true"></span>'}</header>`;
function lobbyHTML() {
  return `${topbar()}<main class="lobby"><section class="lobby-panel" aria-label="Lobby permainan"><div id="lobby-content"></div></section><p class="version-line">Monopoli Nusantara · Klasik ${APP_VERSION}</p></main><div id="page-status" class="page-status" role="status"></div>`;
}
function gameplayHTML() {
  return `${topbar()}<main class="gameplay"><section class="players" aria-label="Pemain"></section><div class="connection-note" hidden></div><section class="board-stage" aria-label="Papan 40 petak"><div class="board-view" tabindex="0" aria-label="Papan Nusantara, ketuk petak, geser atau cubit untuk menjelajah"><svg role="group" aria-label="Papan permainan"><g></g></svg></div><button type="button" class="bank-indicator" data-action="bank" aria-label="Bank Nusantara, lihat rincian ekonomi">${lucideIcon("bank", 18)}<span><small>Nusa beredar</small><b id="bank-circulation"></b></span>${lucideIcon("arrow", 12)}</button></section><section class="gameplay-info" aria-label="Aktivitas, petak dan dadu"><button class="activity" data-action="history" aria-label="Riwayat aktivitas dan transaksi"><span id="activity-text"></span><span id="activity-money"></span></button><button class="tile-caption" data-action="selectedProperty"></button><div class="dice-tray" aria-live="polite"></div></section><section class="action-console" aria-label="Aksi permainan"><div class="turn-heading"></div><div class="console-row"><div class="quick-actions"><button class="property-button" data-action="ownAssets" aria-label="Properti Saya" title="Properti Saya">${icon("assets", 22)}<span>Aset</span></button><button class="property-button" data-action="trade" aria-label="Perdagangan dan barter" title="Barter">${icon("trade", 22)}<span>Barter</span></button></div><button class="roll-button primary" data-action="primary"></button></div><div id="page-status" class="page-status" role="status"></div></section></main>`;
}
function lobbyContent() {
  const r = session.online,
    isRoom = !!session.room,
    players = isRoom
      ? r.seats
      : localPlayers(
          ui.name || "Pemain",
          ui.count,
          ui.pawn,
          ui.levels,
          selectedBots(),
        ).map((p, id) => ({
          ...p,
          name: !ui.name && id === 0 ? "Isi nama di Profil Saya" : p.name,
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
  return `<div class="lobby-heading"><h1>Ruang Bermain</h1><span class="lobby-mode">${isRoom ? "ONLINE" : "VS BOT"}</span></div><div class="lobby-facts"><span>${icon("map", 19)}40 petak</span><span>${icon("people", 19)}${isRoom ? players.length + "/" + r.capacity : ui.count} peserta</span><span class="coin-label"><span class="nusa-token">₦</span> = Nusa</span></div>${isRoom ? `<div class="online-room-heading"><button class="room-code" data-action="copyRoom" aria-label="Salin kode room ${esc(r.code)}"><small>KODE ROOM</small><b>${esc(r.code)}</b><span>${icon("copy", 18)} Salin</span></button><div class="lobby-connection" data-connected="${session.connected}"><span>${session.connected ? "Terhubung" : "Menghubungkan kembali…"}</span><small>${players.filter((p) => p.controller === "human" && p.ready && p.connected).length}/${humanCount} manusia siap${r.worker?.status === "offline" ? " · Bot menunggu worker" : ""}</small></div></div>` : `<button class="setup-summary" data-action="setup"><span>${esc(ui.name || "Atur nama di Profil")} · ${ui.count} peserta</span><b>Atur permainan ${icon("gear", 15)}</b></button>`}<div class="lobby-roster" style="--columns:${slots === 2 || slots === 4 ? 2 : 3}">${Array.from(
    { length: slots },
    (_, i) => {
      const p = players[i];
      return p
        ? `<button class="lobby-player ${i === (isRoom ? session.room.seat : 0) ? "own" : ""}" data-action="${isRoom ? "room" : "setup"}" style="--player:${colors[pawnFor(p)]}"><span class="player-number">P${i + 1}${isRoom && i === r.host ? " · HOST" : ""}</span><div class="roster-art">${playerAvatar(p, players)}${pawnArt(pawnFor(p), TOKENS[pawnFor(p)].name)}</div><b>${esc(p.name)}</b><small class="ready-pill ${p.ready || p.controller === "bot" ? "ready" : ""}">${p.controller === "bot" ? "Bot" : !p.connected ? "Terputus" : p.ready ? "Siap" : "Belum siap"}</small></button>`
        : `<div class="lobby-player empty-seat"><span>P${i + 1}</span>${icon("plus", 25)}<small>Kursi kosong</small></div>`;
    },
  ).join(
    "",
  )}</div>${isRoom ? `<div class="lobby-tools">${btn(r.seats[r.seat]?.ready ? "Batal siap" : "Saya siap", "ready", { primary: true, disabled: session.pending || !session.connected })}${btn("Pilih pion", "pawn", { disabled: session.pending })}${host ? btn(session.config?.onlineBots ? "Tambah bot" : "Status bot", "addBotPopup", { disabled: session.pending || (session.config?.onlineBots && (players.filter((p) => p.controller === "bot").length >= 3 || players.length + 1 + Math.max(0, 2 - humanCount) > r.capacity)) }) : ""}</div>${host ? btn("Mulai permainan", "startRoom", { primary: true, disabled: session.pending || !canStart, sym: "play" }) : '<p class="inline-note">Menunggu host memulai pertandingan.</p>'}<div class="room-lobby-actions">${btn("Kelola room", "room", { sym: "people" })}${btn("Keluar room", "leaveRoomConfirm", { disabled: session.pending, sym: "home" })}</div><p class="lobby-hint">Minimal dua manusia. Semua manusia harus siap dan terhubung.</p>` : `${btn("Mulai VS Bot", "startLocal", { primary: true, disabled: session.pending, sym: "play" })}<div class="lobby-secondary">${btn("Main Online", "onlineEntry", { sym: "people" })}${btn("Lanjutkan", "resume", { sym: "save", disabled: (!session.saved?.room && !session.saved?.state) || session.pending })}</div>`}`;
}
function playerCards() {
  const s = session.view,
    actor = decisionActor(s);
  return s.players
    .map((p) => {
      const conn = session.online?.seats[p.id],
        flow = capsuleFeedback(session.head, p.id);
      return `<button class="player-capsule ${p.id === actor ? "active" : ""} ${p.out ? "out" : ""}" data-action="profile" data-id="${p.id}" style="--player:${colors[pawnFor(p)]}" aria-label="${esc(p.name)}, ${esc(money(p.cash))}${p.id === actor ? ", giliran aktif" : ""}${p.inJail ? ", penjara" : ""}"><div class="capsule-avatar">${playerAvatar(p, s.players)}${pawnArt(pawnFor(p))}</div><div><span class="capsule-name">${esc(p.name)}${conn ? `<i class="connection ${conn.connected ? "on" : ""}"></i>` : ""}</span><strong>${esc(money(p.cash))}</strong><small class="capsule-flow ${flow ? (flow.amount > 0 ? "positive" : "negative") : ""}" ${flow ? `data-ledger="${esc(flow.id)}"` : ""}>${flow ? esc(flow.label) : p.out ? "Bangkrut" : p.inJail ? "Di penjara" : p.id === actor ? (session.botThinking ? "Bot berpikir…" : "Giliran aktif") : p.controller === "bot" ? "Bot" : "P" + (p.id + 1)}</small></div></button>`;
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
  diceView.update(
    rollInput.holding || session.pendingRoll
      ? {
          stage: "rolling",
          values: null,
          label: rollInput.holding
            ? "Lepas untuk melempar"
            : "Menunggu konfirmasi server",
        }
      : dicePresentation(session.view, session.head),
    {
      id:
        rollInput.current?.id || session.pendingRoll || session.head?.id || "",
      paused: session.covered || session.paused || session.hidden,
      reduced: session.reduced,
    },
  );
}
function syncCameraButton() {
  const mode = board?.mode || ui.camera,
    button = page.querySelector("[data-action=camera]");
  button?.setAttribute("aria-pressed", String(mode === "follow"));
  button?.setAttribute(
    "aria-label",
    mode === "manual"
      ? "Kamera manual: tampilkan seluruh papan"
      : mode === "follow"
        ? "Kamera mengikuti pion: tampilkan seluruh papan"
        : "Kamera: ikuti pion",
  );
}
function render() {
  const renderStarted = performance.now();
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
          syncCameraButton,
        );
        board.setMode(ui.camera);
      } else {
        board = null;
        diceView = null;
      }
    }
    if (screen === "lobby") {
      page
        .querySelector(".lobby-panel")
        .classList.toggle("online-lobby", !!session.room);
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
        paused: session.covered || session.paused || session.hidden,
        fast: session.fast,
        reduced: session.reduced,
        selected: ui.selected,
      });
      page.querySelector("#bank-circulation").textContent = money(
        bankSnapshot(session.state).circulation,
      );
      drawDice();
      const primary = primaryAction(
          session.interactionState,
          session.seat,
          session.interactionHead,
          session.paused,
        ),
        button = page.querySelector("[data-action=primary]");
      button.innerHTML = `${icon(primary.type === "ROLL" || primary.type === "START_ROLL" ? "dice" : primary.type === "END" ? "arrow" : "info", 22)}<span>${esc(primary.label)}${["ROLL", "START_ROLL"].includes(primary.type) ? '<small class="roll-gesture-hint">Tahan lalu lepas · ketuk juga bisa</small>' : ""}</span>`;
      button.disabled = !!primary.disabled || session.pending;
      page.querySelector(".turn-heading").innerHTML =
        `<b>${session.room ? "ONLINE" : "VS BOT"} · RONDE ${s.round}</b><span>${session.botThinking ? "Bot sedang berpikir…" : esc(s.players[decisionActor(s)]?.name || "")} ${session.botStatus === "hybrid" ? "· Groq berhasil" : session.botStatus === "fallback" ? "· Lokal cadangan" : ""}</span>`;
      const t = BOARD[ui.selected],
        a = s.assets[t.id];
      page.querySelector(".tile-caption").innerHTML =
        `<i style="background:${t.color}"></i><b>${esc(t.name)}</b><span>${a?.owner != null ? "Milik " + esc(s.players[a.owner].name) : t.price ? esc(money(t.price)) : "Petak perjalanan"}</span>${icon("arrow", 14)}`;
      const activity = activitySummary(s, session.head);
      page.querySelector("#activity-text").textContent =
        session.room &&
        session.model?.catchup?.economicCount &&
        performance.now() - session.model.catchup.at < 2500
          ? `${session.model.catchup.economicCount} transaksi terkonfirmasi · lihat Riwayat`
          : activity.action;
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
      if (!note.hidden) {
        const humans =
          session.online?.seats?.filter(
            (p) => p.controller === "human" && !p.out,
          ).length || 0;
        const ready = session.online?.pause?.ready?.length || 0;
        const message =
          session.online?.status === "paused"
            ? `Dijeda · ${ready}/${humans} siap lanjut`
            : !session.connected
              ? "Menghubungkan kembali…"
              : session.online?.held
                ? "Menunggu koneksi pemain"
                : "Permintaan jeda · tanggapi";
        note.innerHTML = `<button data-action="room" aria-label="${esc(message)}. Lihat detail room">${icon("pause", 16)}<span class="connection-note-label">${esc(message)}</span>${icon("arrow", 15)}</button>`;
      }
    }
    page.querySelector("#page-status").textContent = session.error || "";
    decorateCurrency(page);
    renderDialog();
    rollInput.sync();
    renderNotice();
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
  } finally {
    if (session.room) {
      session.performance.record(
        "render.dom",
        performance.now() - renderStarted,
        { version: session.state?.version },
      );
      if (!session.performanceFramePending && !session.hidden) {
        session.performanceFramePending = true;
        requestAnimationFrame(() => {
          session.performanceFramePending = false;
          session.performance.record(
            "render.frame-opportunity",
            performance.now() - renderStarted,
            { version: session.state?.version },
          );
        });
      }
    }
  }
}
function queueRender() {
  if (!renderQueued) {
    renderQueued = true;
    queueMicrotask(render);
  }
}
session.addEventListener("roomexit", () => {
  ui.popup = null;
  ui.dismissed = "";
  queueRender();
});
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
  rollInput.cancel();
  rememberAssetView();
  const explicitTab = ["development", "manage"].includes(p.kind);
  if (p.kind === "development") {
    ui.assetTab = "build";
    p = { kind: "assets", id: session.seat };
  } else if (p.kind === "manage") {
    const t = BOARD[p.id],
      owner = session.state.assets[p.id]?.owner ?? session.seat;
    ui.assetFocus = p.id;
    ui.assetTab = "all";
    ui.assetGroup = t.group;
    p = { kind: "assets", id: owner };
  }
  if (p.kind === "assets" && p.id !== undefined && p.id !== session.seat)
    ui.assetTab = "all";
  ui.popup = requestedPopup(p, session.state);
  if (p.kind === "assets") {
    if (!explicitTab) ui.assetTab = assetTabs.get(assetOwnerKey()) || "all";
    if ((p.id ?? session.seat) !== session.seat && ui.assetTab === "build")
      ui.assetTab = "all";
    restoreAssetView();
  }
  session.setCovered(ui.popup.kind !== "tradeIncoming", {
    assets:
      ["assets", "debt", "buildOrder"].includes(ui.popup.kind) &&
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
  if (readingCard(currentPopup())) return;
  rememberAssetView();
  persistTradeDraft();
  if (ui.popup?.kind === "buildOrder") {
    if (!session.pending) returnFromBuild();
    return;
  }
  if (ui.popup?.kind === "property" && ui.popup.preview) {
    const origin = ui.certificateReturn,
      tile = ui.popup.id,
      sameMatch = origin?.matchId === session.state?.matchId;
    ui.certificateReturn = null;
    ui.popup = sameMatch ? origin.popup : null;
    session.setCovered(!!ui.popup, {
      assets:
        ["assets", "debt"].includes(ui.popup?.kind) &&
        (ui.popup.id ?? session.seat) === session.seat,
    });
    queueRender();
    if (sameMatch)
      requestAnimationFrame(() => {
        for (const [key, expanded] of origin.details || []) {
          const node = dialogBody.querySelector(
            `[data-asset-key="${CSS.escape(key)}"]`,
          );
          if (node) node.open = expanded;
        }
        dialogBody.scrollTop = origin.scroll;
        dialogBody
          .querySelector(`[data-action="certificate"][data-id="${tile}"]`)
          ?.focus({ preventScroll: true });
      });
    return;
  }
  if (ui.popup?.kind === "botChoice") {
    ui.popup = { kind: ui.popup.slot === "online" ? "addBotPopup" : "setup" };
    queueRender();
    return;
  }
  if (ui.popup?.kind === "picker") {
    ui.popup = ui.pickerReturn || { kind: "trade", counter: !!ui.tradeCounter };
    queueRender();
    return;
  }
  if (ui.popup) {
    if (
      [
        "buy",
        "debt",
        "auction",
        "jail",
        "mortgage",
        "tradeIncoming",
        "buildOffer",
        "won",
      ].includes(ui.popup.kind)
    )
      ui.dismissed = dismissalKey(ui.popup, session.interactionState);
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
  if (
    ui.popup?.kind === "buildOrder" &&
    (ui.popup.matchId !== session.state?.matchId ||
      ui.popup.owner !== session.seat)
  ) {
    ui.popup = null;
    ui.buildReturn = null;
    session.setCovered(false);
  }
  if (
    ui.popup?.preview &&
    ui.certificateReturn?.matchId !== session.state?.matchId
  ) {
    ui.certificateReturn = null;
    ui.popup = null;
    session.setCovered(false);
  }
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
  if (ui.popup?.kind === "debt" && session.state?.phase !== "debt") {
    ui.popup = null;
    session.setCovered(false);
  }
  if (ui.popup) return ui.popup;
  if (session.screen !== "gameplay" || session.paused) return null;
  const p = autoPopup(
    session.interactionState,
    session.state,
    session.interactionHead,
    session.seat,
    ui.dismissed,
  );
  if (p?.kind === "trade") p.kind = "tradeIncoming";
  return p;
}
function auxiliary(p) {
  const s = session.interactionState,
    r = session.online,
    own = session.seat;
  switch (p.kind) {
    case "buildOrder":
      return renderBuildOrder(session, ui, p, { btn, lead });
    case "profile":
      if (!s)
        return {
          title: "Profil Pemain",
          html:
            lead(
              "people",
              ui.name || "Profil Saya",
              "Nama pemain harus diisi sebelum memulai pertandingan.",
            ) +
            `<div class="profile-hero">${avatar("human")}<h3>${esc(ui.name || "Belum diberi nama")}</h3>${pawnArt(ui.pawn, "Pion pilihan")}</div>`,
          footer: btn("Pilih pion", "pawn", { primary: true }),
        };
      return null;
    case "myProfile":
      return {
        title: "Profil Saya",
        html:
          lead(
            "people",
            "Profil Saya",
            "Pilih nama pemainmu sendiri. Tidak ada nama bawaan.",
          ) +
          `<label class="field">Nama pemain<input name="playerName" autocomplete="nickname" placeholder="Isi nama pemain (2–24 karakter)" maxlength="24" value="${esc(ui.profileDraft)}" required></label>` +
          `<p class="inline-note">${session.room ? "Nama akan disinkronkan ke semua pemain di room, termasuk saat dijeda." : "Nama disimpan di perangkat ini dan digunakan untuk VS Bot maupun room baru."}</p>`,
        footer:
          btn("Simpan nama", "savePlayerName", {
            primary: true,
            disabled: session.pending,
          }) + btn("Batal", "close"),
      };
    case "menu":
      return {
        title: "Menu Permainan",
        html:
          lead("menu", "Meja Nusantara", "") +
          `${session.botBlocked ? btn("Coba ulang bot", "retryBot", { primary: true }) : ""}${s && claimableRent(s, own).length ? btn("Tagih sewa (" + claimableRent(s, own).length + ")", "rentClaims", { primary: true }) : ""}<div class="menu-grid">${(s ||
          session.room
            ? [
                ["myProfile", "Profil saya", "people"],
                ["room", "Room & koneksi", "people"],
                ["saves", "Simpanan", "save"],
                ["settings", "Pengaturan", "gear"],
                ["rules", "Aturan", "info"],
              ]
            : [
                ["saves", "Simpanan", "save"],
                ["settings", "Pengaturan", "gear"],
                ["rules", "Aturan", "info"],
                ["myProfile", "Profil saya", "people"],
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
              btn(
                session.room ? "Kembali ke lobi" : "Simpan & ke lobi",
                "lobby",
                { primary: true, sym: "home" },
              )
            : session.room
              ? btn("Kembali ke lobi", "lobby", {
                  primary: true,
                  sym: "home",
                }) + btn("Keluar room", "leaveRoomConfirm", { sym: "home" })
              : btn("Tutup", "close"),
      };
    case "setup":
      return {
        title: "Atur VS Bot",
        html:
          lead("gear", "Teman Berpetualang", "") +
          `<div class="profile-name-row"><span>Nama kamu: <b>${esc(ui.name || "Belum diisi")}</b></span>${btn("Atur nama", "myProfile")}</div><div class="setup-controls"><span>Jumlah peserta</span>${btn("Pilih pion", "pawn")}<div class="segments">${[2, 3, 4, 5, 6].map((n) => `<button data-action="count" data-value="${n}" aria-pressed="${n === ui.count}">${n}</button>`).join("")}</div></div><p class="bot-section-caption">Pilih karakter AI untuk setiap kursi. Tiap karakter sudah membawa model dan strategi sendiri.</p>` +
          selectedBots()
            .map((botId, i) => {
              const p = botFor(botId);
              return `<button type="button" class="bot-setting bot-seat-select" data-action="pickBot" data-slot="${i}" aria-label="Ganti karakter bot di kursi ${i + 2}">${avatar(PERSONAS.indexOf(p))}<span class="bot-seat-desc"><small>KURSI ${i + 2}</small><b>${esc(p.name)}</b><small>${esc(p.role)}</small></span><span class="bot-seat-arrow">${icon("chevron-right", 18)}</span></button>`;
            })
            .join("") +
          `<label class="field">Aturan sewa<select name="rules"><option value="digital" ${ui.rules === "digital" ? "selected" : ""}>Digital · otomatis</option><option value="classic" ${ui.rules === "classic" ? "selected" : ""}>Meja Klasik · tagih manual</option></select></label><label class="toggle">Advisor Groq<input type="checkbox" name="advisor" ${ui.advisor ? "checked" : ""} ${!session.configured ? "disabled" : ""}></label><p class="inline-note">${session.configured ? "Opsional; koneksi advisor diperiksa saat dipakai." : "Advisor belum dikonfigurasi."} Bot lokal tetap mandiri.</p>`,
        footer: btn("Selesai", "close", { primary: true }),
      };
    case "botChoice": {
      const room = p.slot === "online";
      const current = room ? availableRoomPersona()?.id : ui.botIds[p.slot];
      const taken = new Set(
        room
          ? (session.online?.seats || [])
              .filter((seat) => seat.controller === "bot")
              .map((seat) => seat.botPersona)
          : selectedBots().filter((_, i) => i !== p.slot),
      );
      return {
        title: "Pilih Karakter",
        html:
          lead(
            "people",
            "Pilih Karakter",
            "Ketuk satu karakter. Strateginya sudah melekat pada pilihan.",
          ) +
          `<div class="bot-choice-grid">${PERSONAS.map((persona) => botCard(persona, current === persona.id, taken.has(persona.id))).join("")}</div>`,
        footer: btn("Kembali", "close", { primary: true }),
      };
    }
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
          lead("people", "Pilih Pion") +
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
            )}</div>${ui.roomMode === "create" ? `<label class="field">Kapasitas room<select name="capacity">${[2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === (ui.capacity || 6) ? "selected" : ""}>${n} peserta</option>`).join("")}</select></label><p class="inline-note">Bagikan kode setelah room dibuat. Tiap pemain memakai identitas sendiri.</p>` : ui.roomMode === "join" ? `<label class="field">Kode room<input name="joinCode" value="${esc(ui.joinCode)}" maxlength="8" placeholder="ABCDEFGH" autocomplete="off" autocapitalize="characters"></label><p class="inline-note">8 karakter. Kode room bukan bukti kepemilikan kursi.</p>` : '<p class="body-copy">Masuk dengan identitas pemilik pertandingan untuk melanjutkan.</p>'}<div class="identity-chip">${icon("people", 19)}<span>${session.auth?.session() ? "Identitas tersedia" : "Belum masuk"}</span><button data-action="auth">${session.auth?.session() ? "Akun" : "Masuk / Tamu"}</button></div><div class="online-status" data-online-status="${status.code}" role="status"><b>${esc(status.label)}</b><p>${esc(status.detail)}</p></div>${btn("Periksa ulang", "retryOnline", { disabled: session.configStatus === "loading" })}`,
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
          lead("gear", "Pengaturan") +
          `${btn("Profil Saya · Atur nama", "myProfile", { sym: "people" })}<label class="toggle">Efek suara<input type="checkbox" name="sound" ${ui.sound ? "checked" : ""}></label><label class="toggle">Animasi cepat<input type="checkbox" name="fast" ${session.fast ? "checked" : ""}></label><label class="toggle">Kurangi gerakan<input type="checkbox" name="reduced" ${session.reduced ? "checked" : ""}></label>${session.room ? btn("Unduh diagnostik online", "onlinePerformance") : ""}${session.state ? btn("Unduh log dadu", "diceLog") : ""}<p class="inline-note">Pengaturan disimpan pada perangkat ini. Preferensi reduced motion sistem tetap dihormati.</p><div class="fact-row"><span>Versi</span><b>${APP_VERSION} · Papan Klasik</b></div><div class="pwa-tools">${!pwa.state.installed ? btn(pwa.state.installable ? "Pasang Nusantara" : "Cara memasang aplikasi", "installApp", { sym: "home" }) : "<span>Aplikasi terpasang</span>"}${pwa.state.updateAvailable ? btn("Perbarui aplikasi", "updateApp", { disabled: session.screen === "gameplay" || session.pending }) : ""}</div><p class="inline-note">${esc(pwa.state.message || (pwa.state.offline ? "Sedang offline. VS Bot dan simpanan lokal tetap tersedia setelah aplikasi tersimpan di perangkat." : pwa.state.updateAvailable ? "Versi baru tersedia. Kembali ke lobby untuk memperbarui. Permainan online membutuhkan koneksi." : "VS Bot tersedia offline setelah aplikasi tersimpan di perangkat. Permainan online membutuhkan koneksi."))}</p>`,
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
              "Pajak Penghasilan tetap ₦ 200 dan Pajak Kemewahan tetap ₦ 100 ke Bank. Tidak menghitung kekayaan, rumah, atau hotel dan tidak memakai opsi 10%. Parkir Bebas tidak menerima uang pajak atau memberikan jackpot.",
            ],
            [
              "Barter",
              "Uang, properti dan kartu dapat ditawarkan. Kedua pihak harus menyetujui; aset dengan bangunan memiliki batasan.",
            ],
            [
              "Penjara & utang",
              "Bayar ₦ 50, pakai kartu, atau coba kembar. Saat utang, jual bangunan, gadai atau barter sebelum menyatakan bangkrut.",
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
      if (!session.config?.onlineBots)
        return {
          title: "Bot Online",
          html:
            lead(
              "people",
              "Bot online belum aktif",
              "Room ini tetap dapat dimainkan bersama pemain manusia.",
            ) +
            `<p class="body-copy">${ui.botHealth?.capabilities ? (!ui.botHealth.capabilities.workerConfigured || !ui.botHealth.capabilities.schedulerConfigured ? "Layanan bot belum selesai disiapkan di server." : "Layanan sudah terpasang; bot online belum diaktifkan oleh server.") : ui.botHealth?.code === "online_migration_required" ? "Server room perlu diperbarui agar bot dan pengelolaan room tersedia." : ui.botHealth?.unavailable ? "Status layanan belum dapat diperiksa. Coba lagi." : "Layanan bot online belum tersedia di server. Periksa lagi setelah layanan diaktifkan."}</p>`,
          footer:
            btn(
              ui.botChecking ? "Memeriksa…" : "Periksa ulang",
              "retryOnline",
              { disabled: ui.botChecking },
            ) + btn("Selesai", "close"),
        };
      return {
        title: "Tambah Bot",
        html:
          lead(
            "people",
            "Bot di Room",
            "Pilih karakter untuk kursi kosong, tanpa duplikasi.",
          ) +
          `<div class="bot-room-settings"><div><small>KARAKTER BOT</small><button type="button" class="bot-config-row" data-action="pickBotOnline">${esc(availableRoomPersona()?.name || "Tidak tersedia")}${icon("arrow", 16)}</button></div></div><p class="inline-note">Pilih salah satu dari enam model unik. Maksimal tiga bot per room, dan minimal dua pemain manusia.</p>`,
        footer: btn("Tambahkan bot", "addBot", {
          primary: true,
          disabled: session.pending,
        }),
      };
    case "leaveRoomConfirm":
      return {
        title: "Keluar Room",
        html: lead(
          "people",
          "Keluar dari room?",
          "Kursi Anda akan dikosongkan. Pemain yang tersisa memilih siap kembali; jika Anda host, host berpindah ke pemain manusia berikutnya.",
        ),
        footer:
          btn("Batal", "close") +
          btn("Keluar room", "leaveRoom", {
            primary: true,
            disabled: session.pending,
          }),
      };
    case "kickConfirm": {
      const member = session.online?.seats.find(
        (s) => s.memberId === p.memberId,
      );
      return {
        title: "Keluarkan Peserta",
        html: lead(
          "people",
          member ? `Keluarkan ${member.name}?` : "Peserta sudah keluar",
          member
            ? "Kursinya dikosongkan dan status siap room diatur ulang."
            : "Daftar peserta sudah berubah.",
        ),
        footer:
          btn("Batal", "close") +
          (member
            ? btn("Keluarkan", "kickMember", {
                primary: true,
                disabled: session.pending,
              })
            : ""),
      };
    }
  }
  return null;
}
function renderNotice() {
  const el = document.querySelector("#game-notice"),
    n = session.notices.current;
  el.hidden =
    !n ||
    dialog.open ||
    session.paused ||
    session.hidden ||
    session.screen !== "gameplay";
  if (el.hidden) return;
  const html = `<span class="notice-symbol">${icon(n.kind === "rent" ? "home" : "info", 24)}</span><div><b>${esc(n.title)}${n.amount ? ` <strong>+ ${esc(money(n.amount))}</strong>` : ""}</b><p>${esc(n.text)}</p></div>`;
  if (el.innerHTML !== html) {
    el.innerHTML = html;
    decorateCurrency(el);
  }
  el.dataset.kind = n.kind;
}
function renderDialog() {
  const candidate = currentPopup(),
    p = passivePopup(candidate) ? null : candidate;
  layers.sync(!!p);
  if (!p) {
    if (dialog.open) {
      dialog.close();
      previousFocus?.focus?.({ preventScroll: true });
    }
    popupKey = "";
    popupHTML = "";
    footerHTML = "";
    renderedAssetKey = "";
    return;
  }
  if (p.kind === "auction") {
    const identity = auctionIdentity(session.interactionState);
    if (ui.auctionId !== identity) {
      ui.auctionId = identity;
      ui.bid = 0;
      ui.bidRaw = undefined;
    }
  }
  let content = auxiliary(p);
  if (!content && (session.view || p.kind === "room"))
    content = renderPopup(session, ui, p);
  if (!content) {
    close();
    return;
  }
  // Cards, certificates and deck catalogs keep their existing visual contract.
  const compact =
    !/class="(?:[^"]*\s)?(?:deed|retro-card|deck-catalog)(?:\s|")/.test(
      content.html,
    );
  const density = compact ? "compact" : "preserved";
  const densityChanged = dialog.dataset.density !== density;
  dialog.dataset.density = density;
  const template = document.createElement("template");
  template.innerHTML = content.html;
  const heading = template.content.firstElementChild;
  const headingHTML = heading?.classList.contains("popup-title")
    ? heading.outerHTML
    : "";
  if (headingHTML) heading.remove();
  if (dialogHeader.innerHTML !== headingHTML)
    dialogHeader.innerHTML = headingHTML;
  dialogHeader.hidden = !headingHTML;
  content.html = template.innerHTML;
  const key = p.key || p.kind + ":" + (p.id ?? ""),
    markup = `${content.html}${session.error && p.kind !== "auction" ? `<p class="dialog-status" role="status">${esc(session.error)}</p>` : ""}`;
  if (popupKey !== key) {
    if (!dialog.open) previousFocus = document.activeElement;
    dialogBody.scrollTop = 0;
    popupKey = key;
  }
  const assetStates =
    assetRestore?.details ||
    (popupKey === key && ["assets", "bank"].includes(dialog.dataset.kind)
      ? [...dialogBody.querySelectorAll("[data-asset-key]")].map((n) => [
          n.dataset.assetKey,
          n.open,
        ])
      : []);
  const focused = dialog.contains(document.activeElement)
      ? document.activeElement
      : null,
    name = focused?.dataset.selectionName || focused?.name,
    start = focused?.selectionStart,
    end = focused?.selectionEnd,
    scroll = assetRestore?.scroll ?? dialogBody.scrollTop;
  if (popupHTML !== markup || densityChanged) {
    const patched =
      p.kind === "auction"
        ? updateAuctionBody(dialogBody, markup)
        : p.kind === "trade"
          ? updateTradeBody(dialogBody, markup)
          : p.kind === "assets" && updateAssetBody(dialogBody, markup);
    if (!patched) dialogBody.innerHTML = markup;
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
  assetRestore = null;
  renderedAssetKey = p.kind === "assets" ? assetViewKey() : "";
  let footer = decisionFooter(content.footer || "");
  if (footerHTML !== footer || densityChanged) {
    dialogFooter.innerHTML = footer;
    decorateCurrency(dialogFooter);
    footerHTML = footer;
  }
  dialog.setAttribute("aria-label", content.title);
  dialog.dataset.kind = p.kind;
  dialog.classList.toggle(
    "auction-static",
    p.kind === "auction" || !!p.event?.auctionResult,
  );
  dialogClose.disabled = p.kind === "buildOrder" && session.pending;
  dialogClose.hidden = readingCard(p);
  dialogClose.textContent = dismissalLabel(p);
  dialogClose.dataset.action = dismissalAction(p);
  dialogFooter.hidden = !dialogFooter.querySelector("button");
  dialog.classList.remove("has-close");
  dialogFooter.dataset.actions = String(
    dialogFooter.querySelectorAll(":scope > button").length,
  );
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
    session.errorCode = "";
    chirp();
    const id = Number(el?.dataset.id);
    switch (action) {
      case "autoPayDebt":
        open({ kind: "debt" });
        session.startDebtPayment();
        return;
      case "installApp":
        await pwa.install();
        return;
      case "updateApp":
        pwa.update();
        return;
      case "close":
        close();
        return;
      case "menu":
        open({ kind: "menu" });
        return;
      case "onlinePerformance": {
        const blob = new Blob(
            [JSON.stringify(session.performance.export(), null, 2)],
            { type: "application/json" },
          ),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "NUSA-online-performance.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case "diceLog": {
        if (!session.state) return;
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(diceLogExport(session.state), null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "NUSA-dice-log.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
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
      case "myProfile":
        ui.profileDraft = session.room
          ? session.online?.seats?.[session.room.seat]?.name || ui.name
          : ui.name;
        open({ kind: "myProfile" });
        return;
      case "savePlayerName": {
        const name = requirePlayerName(ui.profileDraft);
        if (session.room) {
          if (!(await session.roomOp("RENAME", { name })))
            throw Error(session.error || "Nama belum tersimpan di room.");
        } else if (session.screen === "gameplay") {
          await session.renameLocalPlayer(name);
        }
        ui.name = savePlayerName(name);
        close();
        break;
      }
      case "pickBot":
        open({ kind: "botChoice", slot: Number(el.dataset.slot) });
        return;
      case "pickBotOnline":
        open({ kind: "botChoice", slot: "online" });
        return;
      case "chooseBotPersona": {
        const chosen = el.dataset.value;
        if (!botFor(chosen) || ui.popup?.kind !== "botChoice") return;
        if (ui.popup.slot === "online") {
          const taken = (session.online?.seats || []).some(
            (seat) => seat.controller === "bot" && seat.botPersona === chosen,
          );
          if (taken) return;
          ui.nextBotPersona = chosen;
        } else {
          const slot = ui.popup.slot;
          if (
            !Number.isInteger(slot) ||
            slot < 0 ||
            slot >= ui.count - 1 ||
            selectedBots().some((x, i) => i !== slot && x === chosen)
          )
            return;
          const old = ui.botIds[slot];
          const elsewhere = ui.botIds.indexOf(chosen);
          if (elsewhere >= 0 && elsewhere !== slot) ui.botIds[elsewhere] = old;
          ui.botIds[slot] = chosen;
        }
        close();
        return;
      }
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
        if (!ui.name) {
          ui.profileDraft = "";
          open({ kind: "myProfile" });
          break;
        }
        requirePlayerName(ui.name);
        close();
        ui.dismissed = "";
        ui.trade = null;
        await session.startLocal({
          name: ui.name,
          count: ui.count,
          pawn: ui.pawn,
          rules: ui.rules,
          levels: Object.fromEntries(PERSONAS.map((p) => [p.id, "hardcore"])),
          botIds: selectedBots(),
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
        if (!ui.name) {
          ui.profileDraft = "";
          open({ kind: "myProfile" });
          break;
        }
        requirePlayerName(ui.name);
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
      case "leaveRoomConfirm":
        open({ kind: "leaveRoomConfirm" });
        return;
      case "kickPlayer":
        open({ kind: "kickConfirm", memberId: el.dataset.member });
        return;
      case "kickMember":
        if (await session.roomOp("KICK", { memberId: ui.popup?.memberId }))
          open({ kind: "room" });
        break;
      case "leaveRoom":
        if (await session.roomOp("LEAVE")) close();
        break;
      case "startRoom":
        if (await session.roomOp("START")) close();
        break;
      case "addBot":
        if (
          await session.roomOp("ADD_BOT", {
            difficulty: "hardcore",
            persona: availableRoomPersona()?.id,
          })
        ) {
          ui.nextBotPersona = null;
          close();
        }
        break;
      case "copyRoom":
        if (ui.copyingRoom) return;
        ui.copyingRoom = true;
        try {
          const ok = await copyRoomCode(session.room?.code);
          session.error = ok
            ? "Kode room disalin."
            : "Clipboard belum tersedia. Izinkan akses clipboard di browser, lalu coba lagi.";
        } finally {
          ui.copyingRoom = false;
        }
        break;
      case "camera":
        ui.camera =
          board?.mode === "manual"
            ? "overview"
            : ui.camera === "overview"
              ? "follow"
              : "overview";
        board?.setMode(ui.camera);
        syncCameraButton();
        break;
      case "primary": {
        if (session.pending) break;
        if (session.paused) {
          if (session.room) open({ kind: "room" });
          else session.setPaused(false);
          break;
        }
        const a = primaryAction(
          session.interactionState,
          session.seat,
          session.interactionHead,
        );
        if (a.disabled) break;
        if (a.type) await session.act(a.type, a.data || {});
        else {
          ui.dismissed = "";
          if (!currentPopup()) {
            const actor = decisionActor(session.interactionState);
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
      case "bank":
      case "room":
      case "rentClaims":
      case "development":
        open({ kind: action });
        return;
      case "selectedProperty":
        open({ kind: "property", id: ui.selected });
        return;
      case "certificate":
        if (!BOARD[id]?.price || !session.state || ui.popup?.preview) return;
        persistTradeDraft();
        ui.certificateReturn = {
          popup: ui.popup,
          matchId: session.state.matchId,
          scroll: dialogBody.scrollTop,
          details: [...dialogBody.querySelectorAll("[data-asset-key]")].map(
            (n) => [n.dataset.assetKey, n.open],
          ),
        };
        open({
          kind: "property",
          id,
          preview: true,
          bankContext: ui.popup?.kind === "bank",
        });
        return;
      case "property":
      case "manage":
        open({ kind: action, id });
        return;
      case "retryOnline": {
        const checkBots =
          ui.popup?.kind === "addBotPopup" && session.auth?.session();
        if (checkBots) ui.botChecking = true;
        await session.refreshConfig();
        if (checkBots) {
          try {
            ui.botHealth = await session.auth.request("?diagnostics=1");
          } catch {
            ui.botHealth = { unavailable: true };
          } finally {
            ui.botChecking = false;
            queueRender();
          }
        }
        return;
      }
      case "assetTab":
        rememberAssetView();
        ui.assetTab = el.dataset.value;
        ui.assetConfirm = null;
        assetTabs.set(assetOwnerKey(), ui.assetTab);
        restoreAssetView();
        if (el.dataset.group !== undefined)
          ui.assetGroup = Number(el.dataset.group);
        queueRender();
        return;
      case "mortgageFilter":
        rememberAssetView();
        ui.mortgageFilter = el.dataset.value;
        ui.assetConfirm = null;
        assetRestore = { scroll: 0, details: [] };
        queueRender();
        return;
      case "buildOrder": {
        if (
          session.busy ||
          ui.popup?.kind !== "assets" ||
          (ui.popup.id ?? session.seat) !== session.seat
        )
          return;
        rememberAssetView();
        const group = Number(el.dataset.group);
        ui.buildReturn = {
          popup: { ...ui.popup },
          match: session.state.matchId,
          view: assetViews.get(renderedAssetKey),
        };
        ui.buildCounts[group] = 1;
        ui.buildTargets ||= {};
        delete ui.buildTargets[group];
        open({
          kind: "buildOrder",
          group,
          owner: session.seat,
          matchId: session.state.matchId,
        });
        return;
      }
      case "submitBuildOrder": {
        if (ui.popup?.kind !== "buildOrder" || session.busy) return;
        const group = ui.popup.group,
          order = buildOrderSelection(
            session.interactionState,
            session.seat,
            group,
            ui.buildCounts[group] || 1,
            ui.buildTargets?.[group],
          );
        if (!order.valid) {
          session.error = "Pilihan berubah. Periksa jumlah dan lokasi terbaru.";
          queueRender();
          return;
        }
        if (order.count === 1) {
          if (await session.act("BUILD", { tile: order.tile }))
            returnFromBuild();
        } else {
          if (await session.act("BUILD_BATCH", { group, count: order.count }))
            returnFromBuild();
        }
        queueRender();
        return;
      }
      case "buildStockSingle":
        if (ui.popup?.kind === "buildOrder") {
          ui.buildCounts[ui.popup.group] = 1;
          delete ui.buildTargets?.[ui.popup.group];
          session.error = "";
          session.errorCode = "";
          queueRender();
        }
        return;
      case "stopBuilds":
        session.stopAssetPlan();
        session.notify();
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
          const status = tradeDraftStatus(
            session.interactionState,
            session.seat,
            ui.trade,
          );
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
          bidMinimum(session.interactionState),
          Math.ceil(
            ((session.interactionState.auction?.amount || 0) +
              Number(el.dataset.amount)) /
              50,
          ) * 50,
        );
        ui.bidRaw = nusaInput(ui.bid);
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
dialogBody.addEventListener(
  "toggle",
  (e) => {
    const item = e.target;
    if (
      dialog.dataset.kind !== "assets" ||
      !item.matches?.("details[data-asset-key]")
    )
      return;
    if (item.open) {
      const scroll = dialogBody.scrollTop;
      for (const other of dialogBody.querySelectorAll(
        "details[data-asset-key][open]",
      ))
        if (other !== item) other.open = false;
      // Leave the newly selected heading visible after a large preceding item collapses.
      dialogBody.scrollTop = Math.min(
        scroll,
        dialogBody.scrollHeight - dialogBody.clientHeight,
      );
    }
    rememberAssetView();
  },
  true,
);
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
document.addEventListener("focusin", (e) => {
  const input = e.target;
  if (input.matches?.("input[data-amount]") && input.value === "0")
    input.select();
});
document.addEventListener("input", (e) => {
  const el = e.target,
    name = el.name;
  if (e.isComposing) return;
  if (el.matches?.("input[data-amount]")) normalizeAmountInput(el);
  if (name === "playerName") ui.profileDraft = el.value;
  else if (name === "assetSearch") {
    ui.assetQuery = el.value;
    queueRender();
  } else if (name === "bid") {
    const n = parseNusa(el.value);
    ui.bidRaw = el.value;
    if (n !== null) ui.bid = n;
    queueRender();
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
      const status = tradeDraftStatus(
          session.interactionState,
          session.seat,
          ui.trade,
        ),
        b = dialog.querySelector("[data-action=submitTrade]");
      if (b) b.disabled = status.invalid || !status.hasValue;
      const estimate = dialog.querySelector("[data-trade-estimate]");
      if (estimate) {
        const expanded = estimate.querySelector("details")?.open;
        estimate.innerHTML = tradeEstimateMarkup(
          session.interactionState,
          {
            ...ui.trade,
            from: ui.tradeCounter
              ? session.interactionState.trade?.to
              : session.seat,
          },
          session.seat,
        );
        if (expanded && estimate.querySelector("details"))
          estimate.querySelector("details").open = true;
        decorateCurrency(estimate);
      }
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
    } else if (name?.startsWith("buildTarget-")) {
      ui.buildTargets ||= {};
      ui.buildTargets[Number(name.slice(12))] = Number(el.value);
      queueRender();
    } else if (name?.startsWith("level-"))
      ui.levels[name.slice(6)] = "hardcore";
    else if (name === "rules") ui.rules = el.value;
    else if (name === "advisor") ui.advisor = el.checked;
    else if (name === "capacity") ui.capacity = Number(el.value);
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
session.addEventListener("change", () => {
  rollInput.sync();
  queueRender();
});
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
    !e.defaultPrevented &&
    !e.repeat &&
    e.code === "Space" &&
    !dialog.open &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
      document.activeElement.tagName,
    )
  ) {
    const action = primaryAction(
      session.interactionState,
      session.seat,
      session.interactionHead,
      session.paused,
    );
    if (action.type && !["ROLL", "START_ROLL"].includes(action.type)) {
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
    .then(() => pwa.start())
    .catch(() => {});
