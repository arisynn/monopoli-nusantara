import { LocalSessionLease } from "./local-session-lease.mjs";
import { secureRandom } from "../lib/random.mjs";
import { debtAdvice } from "./debt-advisor.mjs";
import { assetPermission } from "./domain.mjs";
import { buildPreview } from "./development.mjs";
import { createGame, command, publicState } from "../lib/game.mjs";
import { localPlayers } from "../lib/bot/personas.mjs";
import { createMindClient } from "../lib/bot/mind-client.mjs";
import { strategyView } from "../lib/bot/memory.mjs";
import { brokerIntentMetadata } from "../lib/bot/broker-intent.mjs";
import { decisionGate, planDecision } from "../lib/bot/strategy.mjs";
import {
  ingestTimeline,
  advanceTimeline,
  presentedState,
  stepDuration,
  liveCardDecision,
} from "../lib/presentation-timeline.mjs";
import {
  saveGame,
  loadGame,
  savePrevious,
  saveRevision,
  SaveConflictError,
} from "../lib/storage.ts";
import { validateLocalState } from "../lib/save-format.mjs";
import { requirePlayerName } from "../lib/player-name.mjs";
import {
  OnlineAuth,
  subscribeRoom,
  connectionId,
} from "../lib/online-client.mjs";
import {
  acceptRevision,
  mergeState,
  requestJSON,
} from "../lib/room-client.mjs";
import { localBotActor, humanSeat } from "./domain.mjs";
export class GameSession extends EventTarget {
  constructor({
    persist = saveGame,
    load = loadGame,
    archive = savePrevious,
    random = secureRandom,
    mind = createMindClient(),
    transport = fetch,
    clock = Date.now,
  } = {}) {
    super();
    Object.assign(this, {
      persist,
      load,
      archive,
      random,
      mind,
      transport,
      clock,
    });
    this.screen = "lobby";
    this.state = null;
    this.model = null;
    this.room = null;
    this.online = null;
    this.connected = false;
    this.config = null;
    this.configStatus = "loading";
    this.configRequest = null;
    this.auth = null;
    this.epoch = 0;
    this.covered = false;
    this.assetPanel = false;
    this.assetPresentation = null;
    this.assetPlan = null;
    this.assetTimer = null;
    this.assetStepping = false;
    this.localPaused = false;
    this.pending = false;
    this.botThinking = false;
    this.botFailures = 0;
    this.botBlocked = false;
    this.botStatus = "local";
    this.configured = false;
    this.error = "";
    this.saved = null;
    this.localLease = new LocalSessionLease();
    this.saveConflict = false;
    this.fast = false;
    this.reduced = false;
    this.timer = null;
    this.timerId = "";
    this.remaining = 0;
    this.botTimer = null;
    this.generation = 0;
    this.connectionEpoch = 0;
    this.clientId =
      typeof sessionStorage === "undefined"
        ? crypto.randomUUID()
        : connectionId();
  }
  get view() {
    return presentedState(this.model) || this.state;
  }
  get head() {
    return this.model?.queue[0] || null;
  }
  get seat() {
    return humanSeat(this.state, this.room);
  }
  get paused() {
    return (
      this.localPaused ||
      !!(
        this.room &&
        (this.online?.status === "paused" ||
          this.online?.held ||
          !this.connected)
      )
    );
  }
  get busy() {
    return (
      this.pending ||
      this.botThinking ||
      !!this.head ||
      this.paused ||
      this.assetPlan?.status === "running"
    );
  }
  get assetFeedback() {
    const h = this.head,
      p = this.assetPresentation;
    return !!(
      this.covered &&
      this.assetPanel &&
      p &&
      p.match === this.state?.matchId &&
      p.version === h?.source?.version &&
      h.kind === "financialSettlement" &&
      ["build", "sell", "mortgage", "redeem"].includes(h.finance?.kind) &&
      (h.finance.from === p.seat || h.finance.to === p.seat)
    );
  }
  notify() {
    this.schedule();
    this.dispatchEvent(new Event("change"));
  }
  async initialize() {
    try {
      this.saved = await this.load();
    } catch {
      this.error = "Simpanan belum dapat dibaca.";
    }
    this.notify();
    await this.refreshConfig();
  }
  async refreshConfig() {
    if (this.configRequest) return this.configRequest;
    this.configStatus = "loading";
    this.notify();
    this.configRequest = (async () => {
      const results = await Promise.allSettled([
        requestJSON("/api/online?config=1", {}, this.transport),
        requestJSON("/api/bot", {}, this.transport),
      ]);
      const online = results[0];
      if (
        online.status === "fulfilled" &&
        typeof online.value?.online === "boolean"
      ) {
        this.config = online.value;
        this.configStatus = "ready";
        if (this.config.online) {
          if (
            !this.auth ||
            this.auth.config.url !== this.config.url ||
            this.auth.config.key !== this.config.key
          )
            this.auth = new OnlineAuth(this.config, this.transport);
          try {
            await this.auth.consumeRedirect();
          } catch {
            this.error =
              "Tautan masuk belum dapat diproses. Masuk kembali dengan email.";
          }
        }
      } else this.configStatus = "error";
      this.configured =
        results[1].status === "fulfilled" && !!results[1].value.configured;
    })().finally(() => {
      this.configRequest = null;
      this.notify();
    });
    return this.configRequest;
  }

  ingest(s, { reset = false } = {}) {
    if (s?.matchId !== this.state?.matchId) {
      this.stopAssetPlan("Pertandingan berubah.");
      this.assetPlan = null;
      this.assetPresentation = null;
    } else if (reset) {
      this.stopAssetPlan("State dipulihkan. Sisa pembangunan dibatalkan.");
      this.assetPresentation = null;
    }
    this.state = s;
    this.model = ingestTimeline(this.model, s ? publicState(s) : null, {
      epoch: this.epoch,
      enabled: this.screen === "gameplay",
      reset: reset || this.paused,
    });
  }
  async saveCurrent(options = {}) {
    const value = structuredClone({ state: this.state, room: this.room });
    const save = async () => {
      const stored = await this.persist(value, {
        expectedRevision: saveRevision(this.saved),
        ...options,
      });
      this.saved = stored && typeof stored === "object" ? stored : value;
    };
    this.saveQueue = (this.saveQueue || Promise.resolve())
      .catch(() => {})
      .then(save);
    return this.saveQueue;
  }
  async persistNow(options = {}) {
    try {
      await this.saveCurrent(options);
      return true;
    } catch (error) {
      if (error instanceof SaveConflictError && !this.room) {
        this.saveConflict = true;
        this.localPaused = true;
        this.stopBot();
        this.stopAssetPlan("Simpanan berubah di tab lain.");
        this.resetPresentation();
        this.error = error.message;
      } else
        this.error =
          "Penyimpanan perangkat belum berhasil. Buat cadangan dari Simpanan.";
      return false;
    }
  }
  stopBot() {
    this.generation++;
    clearTimeout(this.botTimer);
    this.botTimer = null;
    this.botAbort?.abort();
    this.botAbort = null;
    this.botThinking = false;
  }
  resetPresentation() {
    this.assetPresentation = null;
    this.cancelTimer();
    this.timerId = "";
    this.epoch++;
    this.model = ingestTimeline(
      this.model,
      this.state ? publicState(this.state) : null,
      { epoch: this.epoch, reset: true },
    );
  }
  async startLocal({
    name,
    count = 4,
    pawn = 0,
    rules = "digital",
    levels = {},
    botIds = null,
    advisorEnabled = false,
  } = {}) {
    if (this.pending) return;
    this.pending = true;
    this.stopBot();
    try {
      await this.localLease.acquire();
      this.saved = (await this.load()) || this.saved;
      if (this.state && !this.room) await this.archive(this.state);
      this.saveConflict = false;
      this.disconnect();
      this.room = null;
      this.online = null;
      this.screen = "gameplay";
      this.covered = false;
      this.localPaused = false;
      this.botBlocked = false;
      this.botFailures = 0;
      this.epoch++;
      this.ingest(
        createGame(
          {
            players: localPlayers(
              name,
              Number(count),
              Number(pawn),
              levels,
              botIds,
            ),
            rules,
            advisorEnabled: advisorEnabled && this.configured,
          },
          this.random,
        ),
        { reset: true },
      );
      await this.persistNow({ replace: true });
    } catch (e) {
      this.error = e.message;
      if (this.screen !== "gameplay") this.localLease.release();
    } finally {
      this.pending = false;
      this.notify();
    }
  }
  async resume() {
    try {
      this.saved = (await this.load()) || this.saved;
      if (!this.saved?.room && !this.saved?.state) return;
      if (this.saved.room) {
        if (this.configStatus !== "ready") await this.refreshConfig();
        if (!this.auth) throw Error("Supabase belum tersedia.");
        await this.auth.token();
        if (this.saved.room.userId !== this.auth.session()?.user.id)
          throw Error("Masuk dengan akun pemilik kursi ini.");
        await this.roomOp("JOIN", { code: this.saved.room.code });
      } else {
        await this.localLease.acquire();
        this.saved = (await this.load()) || this.saved;
        const state = validateLocalState(this.saved.state);
        this.stopBot();
        this.room = null;
        this.online = null;
        this.localPaused = false;
        this.saveConflict = false;
        this.screen = "gameplay";
        this.epoch++;
        this.ingest(state, { reset: true });
        this.notify();
      }
    } catch (e) {
      this.error = e.message;
      if (this.screen !== "gameplay") this.localLease.release();
      this.notify();
    }
  }
  async restore(state) {
    if (this.pending || this.room)
      throw Error("Impor hanya untuk pertandingan lokal.");
    const next = validateLocalState(state);
    await this.localLease.acquire();
    try {
      await this.saveQueue?.catch(() => {});
      this.saved = (await this.load()) || this.saved;
      this.stopBot();
      if (this.state) await this.archive(this.state);
      const stored = await this.persist(
        { state: next, room: null },
        { expectedRevision: saveRevision(this.saved), replace: true },
      );
      this.screen = "gameplay";
      this.room = null;
      this.localPaused = false;
      this.covered = false;
      this.epoch++;
      this.ingest(next, { reset: true });
      this.saved =
        stored && typeof stored === "object"
          ? stored
          : { state: next, room: null };
      this.saveConflict = false;
      this.notify();
    } catch (error) {
      if (this.screen !== "gameplay") this.localLease.release();
      throw error;
    }
  }
  setCovered(value, { assets = false } = {}) {
    const panel = value && assets;
    if (this.covered === value && this.assetPanel === panel) return;
    this.covered = value;
    this.assetPanel = panel;
    if (!panel) {
      this.assetPresentation = null;
      this.stopAssetPlan("Panel ditutup; sisa pembangunan dibatalkan.");
    }
    if (value) {
      this.cancelTimer();
      this.stopBot();
    }
    this.notify();
  }
  stopAssetPlan(reason = "Sisa rencana dihentikan.") {
    clearTimeout(this.assetTimer);
    this.assetTimer = null;
    if (this.assetPlan?.status === "running") {
      this.assetPlan.status = "stopped";
      this.assetPlan.reason = reason;
    }
  }
  startBuilds(group, count) {
    if (
      this.busy ||
      !this.assetPanel ||
      !this.covered ||
      this.hidden ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 15
    )
      return false;
    const plan = buildPreview(this.state, this.seat, group, count);
    if (!plan.tiles.length) return false;
    this.assetPlan = {
      kind: "build",
      group,
      requested: count,
      completed: 0,
      seat: this.seat,
      match: this.state.matchId,
      version: this.state.version,
      phase: this.state.phase,
      status: "running",
      reason: "",
    };
    this.notify();
    return true;
  }
  startDebtPayment() {
    if (
      this.busy ||
      this.hidden ||
      this.state?.phase !== "debt" ||
      this.state.debt?.from !== this.seat ||
      this.state.players[this.seat]?.controller !== "human"
    )
      return false;
    const advice = debtAdvice(this.state, this.seat);
    if (!advice?.available) {
      this.error =
        "Dana dari aset belum cukup untuk melunasi. Kelola aset atau susun barter terlebih dahulu.";
      this.notify();
      return false;
    }
    this.setCovered(true, { assets: true });
    this.assetPlan = {
      kind: "debt",
      actions: advice.actions,
      requested: advice.actions.length + 1,
      completed: 0,
      seat: this.seat,
      match: this.state.matchId,
      version: this.state.version,
      phase: "debt",
      debt: JSON.stringify(this.state.debt),
      status: "running",
      reason: "",
    };
    this.notify();
    return true;
  }
  async stepDebtPayment(plan) {
    if (JSON.stringify(this.state.debt) !== plan.debt) {
      this.stopAssetPlan("Tagihan berubah. Periksa kembali sebelum melunasi.");
      return;
    }
    const paid = this.state.players[plan.seat].cash >= this.state.debt.amount;
    const action = paid ? { type: "PAY" } : plan.actions[plan.completed];
    if (
      !action ||
      (!paid &&
        assetPermission(this.state, plan.seat, action.tile, action.type))
    ) {
      this.stopAssetPlan(
        "Rencana tidak lagi memenuhi syarat. Hitung ulang dari kondisi terbaru.",
      );
      return;
    }
    const version = this.state.version;
    if (
      !(await this.act(
        action.type,
        action.tile === undefined ? {} : { tile: action.tile },
        plan.seat,
      ))
    ) {
      this.stopAssetPlan(this.error || "Pelunasan otomatis dihentikan.");
      return;
    }
    if (this.state.version !== version + 1) {
      this.stopAssetPlan("State berubah. Periksa kembali tagihan.");
      return;
    }
    plan.completed++;
    plan.version = this.state.version;
    if (paid) {
      plan.status = "complete";
      plan.reason = "Tagihan sudah dilunasi.";
    } else if (this.state.phase !== "debt")
      this.stopAssetPlan("Keputusan permainan berubah. Pelunasan dihentikan.");
  }
  async stepAssetPlan() {
    const plan = this.assetPlan;
    if (
      !plan ||
      plan.status !== "running" ||
      this.assetStepping ||
      this.pending ||
      this.head
    )
      return;
    this.assetStepping = true;
    try {
      if (
        this.hidden ||
        this.paused ||
        !this.assetPanel ||
        !this.covered ||
        this.state.matchId !== plan.match ||
        this.seat !== plan.seat ||
        this.state.version !== plan.version ||
        this.state.phase !== plan.phase
      ) {
        this.stopAssetPlan(
          "Kondisi berubah. Periksa aset sebelum membangun lagi.",
        );
        return;
      }
      if (plan.kind === "debt") {
        await this.stepDebtPayment(plan);
        return;
      }
      const type = "BUILD",
        tile = buildPreview(this.state, plan.seat, plan.group, 1).tiles[0];
      if (
        tile === undefined ||
        assetPermission(this.state, plan.seat, tile, type)
      ) {
        this.stopAssetPlan(
          "Saldo, stok, atau syarat bangunan tidak lagi mencukupi.",
        );
        return;
      }
      const version = this.state.version;
      if (!(await this.act(type, { tile }, plan.seat))) {
        this.stopAssetPlan(this.error || "Pembangunan belum dapat diteruskan.");
        return;
      }
      const built = this.state.log.some(
        (e) =>
          e.version === version + 1 &&
          e.finance?.some(
            (f) =>
              f.kind === "build" &&
              (f.from === plan.seat || f.to === plan.seat) &&
              f.tile === tile,
          ),
      );
      if (built) plan.completed++;
      plan.version = this.state.version;
      if (
        this.state.phase !== plan.phase ||
        this.state.version !== version + 1 ||
        !built
      ) {
        this.stopAssetPlan(
          "Pembangunan ditahan. Selesaikan keputusan stok atau perubahan papan.",
        );
        return;
      }
      if (plan.status === "running" && plan.completed >= plan.requested) {
        plan.status = "complete";
        plan.reason = "Pembangunan selesai.";
      }
    } finally {
      this.assetStepping = false;
      this.notify();
    }
  }
  markAssetPresentation(state, type) {
    if (!state) return;
    if (
      this.assetPanel &&
      type === "BUILD" &&
      this.state?.phase !== state.phase
    )
      this.assetInterruption = true;
    if (
      this.assetPanel &&
      this.covered &&
      ["BUILD", "SELL", "SELL_SET", "MORTGAGE", "REDEEM"].includes(type)
    )
      this.assetPresentation = {
        match: state.matchId,
        version: state.version,
        seat: this.seat,
      };
  }

  setPaused(value) {
    if (this.room || this.saveConflict) return;
    if (value)
      this.stopAssetPlan("Permainan dijeda. Sisa pembangunan dibatalkan.");
    this.localPaused = value;
    this.stopBot();
    this.resetPresentation();
    this.notify();
  }
  setVisible(value) {
    if (!value) {
      this.stopAssetPlan("Halaman tidak aktif. Sisa pembangunan dibatalkan.");
      this.stopBot();
      this.resetPresentation();
      this.hidden = true;
    } else {
      this.hidden = false;
      this.resetPresentation();
      if (this.room) void this.readRoom(true);
    }
    this.notify();
  }
  cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.remaining = Math.max(
        0,
        this.remaining - (this.clock() - this.timerStarted),
      );
      this.timer = null;
    }
  }
  schedule() {
    const head = this.head;
    if (this.timerId !== head?.id) {
      this.cancelTimer();
      this.timerId = head?.id || "";
      this.remaining = head ? stepDuration(head, this) : 0;
      if (head?.kind === "pawnMoving") this.remaining += 300;
      if (head?.event && !liveCardDecision(head.event, this.state, this.seat))
        this.remaining = Math.max(3200, this.remaining);
    }
    const interactive =
        head?.event && liveCardDecision(head.event, this.state, this.seat),
      settlement =
        head?.finance?.from === this.seat &&
        ["rent", "tax"].includes(head.finance.kind);
    if (
      head &&
      !this.timer &&
      !interactive &&
      !settlement &&
      (!this.covered || this.assetFeedback) &&
      !this.paused &&
      !this.hidden
    ) {
      const id = head.id;
      this.timerStarted = this.clock();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.complete(id);
      }, this.remaining);
    }
    if (this.assetPlan?.status === "running") {
      if (this.paused || this.hidden || !this.covered || !this.assetPanel)
        this.stopAssetPlan("Pembangunan dijeda; sisa rencana dibatalkan.");
      else if (
        !this.head &&
        !this.pending &&
        !this.assetStepping &&
        !this.assetTimer
      )
        this.assetTimer = setTimeout(() => {
          this.assetTimer = null;
          void this.stepAssetPlan();
        }, 0);
    }
    if (
      !this.head &&
      !this.covered &&
      !this.paused &&
      !this.hidden &&
      !this.pending &&
      !this.room &&
      this.screen === "gameplay" &&
      !this.botTimer &&
      !this.botThinking &&
      !this.botBlocked &&
      localBotActor(this.state) !== null
    )
      this.botTimer = setTimeout(
        () => {
          this.botTimer = null;
          void this.stepBot();
        },
        this.fast ? 150 : 480,
      );
  }
  complete(id) {
    if (
      !id ||
      !this.head ||
      this.head.id !== id ||
      this.paused ||
      (this.covered && !this.assetFeedback)
    )
      return;
    this.model = advanceTimeline(this.model, id);
    this.notify();
  }
  async act(type, data = {}, actor = this.seat) {
    if (this.pending || this.paused || !this.state) return false;
    const head = this.head,
      ack =
        type === "ACK" && liveCardDecision(head?.event, this.state, this.seat);
    if (head && !ack) return false;
    if (this.view.version !== this.state.version && !ack) return false;
    if (
      this.state.players[actor]?.controller !== "human" ||
      (this.room && actor !== this.room.seat)
    )
      return false;
    this.pending = true;
    this.error = "";
    this.notify();
    try {
      if (this.room) {
        const id = crypto.randomUUID(),
          result = await this.auth.request("", {
            type: "ACTION",
            code: this.room.code,
            clientId: this.clientId,
            requestId: id,
            action: { type, ...data, id, expectedVersion: this.state.version },
          });
        if (ack) this.model = advanceTimeline(this.model, head.id);
        this.markAssetPresentation(result.state, type);
        this.takeRoom(result);
      } else {
        const next = command(
          this.state,
          actor,
          {
            type,
            ...data,
            id: crypto.randomUUID(),
            expectedVersion: this.state.version,
          },
          this.random,
        );
        if (ack) this.model = advanceTimeline(this.model, head.id);
        this.markAssetPresentation(next, type);
        this.ingest(next);
        this.notify();
        await this.persistNow();
      }
      return true;
    } catch (e) {
      this.error = e.message;
      if (this.room) void this.readRoom();
      return false;
    } finally {
      this.pending = false;
      this.notify();
    }
  }
  async stepBot() {
    const actor = localBotActor(this.state);
    if (
      actor === null ||
      this.room ||
      this.busy ||
      this.covered ||
      this.screen !== "gameplay"
    )
      return;
    const generation = ++this.generation,
      version = this.state.version,
      match = this.state.matchId;
    this.botThinking = true;
    this.botAbort = new AbortController();
    this.notify();
    try {
      let plan;
      try {
        plan = await this.mind.decide(this.state, actor, {
          signal: this.botAbort.signal,
        });
      } catch {
        if (generation !== this.generation) return;
        plan = planDecision(this.state, actor);
        this.botStatus = "fallback";
      }
      if (!plan) {
        if (generation !== this.generation) return;
        plan = planDecision(this.state, actor);
      }
      let action = plan.action;
      this.botStatus = "local";
      if (this.state.advisorEnabled && this.configured && plan.shouldConsult) {
        this.botStatus = "consulting";
        this.notify();
        try {
          const advice = await requestJSON(
            "/api/bot",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                state: strategyView(this.state, actor),
                actor,
              }),
              signal: this.botAbort.signal,
            },
            this.transport,
          );
          if (
            advice.matchId === match &&
            advice.stateVersion === version &&
            advice.actor === actor
          ) {
            const gate = decisionGate(plan, advice.action?.actionId);
            if (gate.accepted) {
              action = gate.action;
              this.botStatus = advice.status;
            } else this.botStatus = "fallback";
          }
        } catch {
          this.botStatus = "fallback";
        }
      }
      if (
        generation !== this.generation ||
        this.state.version !== version ||
        this.state.matchId !== match ||
        this.covered ||
        this.paused ||
        this.screen !== "gameplay"
      )
        return;
      if (!action) throw Error("Bot belum mendapat tindakan legal.");
      const { actionId, ...intent } = action;
      this.ingest(
        command(
          this.state,
          actor,
          {
            ...intent,
            ...brokerIntentMetadata(this.state, actor, action),
            id: crypto.randomUUID(),
            expectedVersion: version,
          },
          this.random,
        ),
      );
      this.botFailures = 0;
      this.botBlocked = false;
      this.notify();
      await this.persistNow();
    } catch (e) {
      if (generation === this.generation) {
        this.botFailures++;
        this.botBlocked = this.botFailures >= 2;
        this.error = this.botBlocked
          ? "Bot belum dapat melanjutkan. Coba ulang dari menu; state tetap tersimpan."
          : "Bot mencoba lagi dengan state terbaru.";
      }
    } finally {
      if (generation === this.generation) {
        this.botThinking = false;
        this.botAbort = null;
        this.notify();
      }
    }
  }
  retryBot() {
    this.botBlocked = false;
    this.botFailures = 0;
    this.error = "";
    this.notify();
  }
  async lobby() {
    if (this.pending) return;
    this.pending = true;
    try {
      if (this.room) {
        try {
          await this.saveCurrent();
        } catch {
          this.error =
            "Progres online tetap tersimpan di server. Buka Main Online lalu Lanjutkan untuk menemukan room kembali.";
        }
      } else if (this.saveConflict) {
        this.saved = await this.load();
      } else await this.saveCurrent();
      this.stopBot();
      if (this.room && this.auth?.request) {
        try {
          await this.auth.request("", {
            type: "DISCONNECT",
            code: this.room.code,
            clientId: this.clientId,
            requestId: crypto.randomUUID(),
          });
        } catch {
          this.error =
            "Kembali ke lobi. Server belum menerima pelepasan koneksi; kursi tetap dapat dilanjutkan.";
        }
      }
      this.disconnect();
      if (this.room) {
        this.room = null;
        this.online = null;
        this.state = null;
        this.model = null;
        this.connected = false;
      }
      this.screen = "lobby";
      this.covered = false;
      this.cancelTimer();
      this.localLease.release();
      this.saveConflict = false;
    } catch (error) {
      this.error =
        error instanceof SaveConflictError
          ? error.message
          : "Simpanan belum berhasil. Ekspor cadangan sebelum keluar.";
      if (error instanceof SaveConflictError) {
        this.saveConflict = true;
        this.localPaused = true;
      }
    } finally {
      this.pending = false;
      this.notify();
    }
  }
  async renameLocalPlayer(value) {
    const name = requirePlayerName(value);
    if (this.room) throw Error("Gunakan sinkronisasi room untuk nama online.");
    if (!this.state) return;
    const state = {
      ...this.state,
      players: this.state.players.map((player, i) =>
        i === 0 ? { ...player, name } : player,
      ),
    };
    this.ingest(state, { reset: true });
    if (!(await this.persistNow()))
      throw Error(this.error || "Nama belum dapat disimpan.");
    this.notify();
  }
  async roomOp(type, data = {}) {
    if (this.pending) return false;
    this.pending = true;
    this.error = "";
    try {
      if (!this.auth)
        throw Error("Supabase belum dikonfigurasi. VS Bot tetap tersedia.");
      await this.auth.token();
      if (this.room && this.room.userId !== this.auth.session()?.user.id)
        throw Error("Identitas berubah. Masuk kembali dengan pemilik kursi.");
      const result = await this.auth.request("", {
        type,
        clientId: this.clientId,
        requestId: crypto.randomUUID(),
        ...(this.room ? { code: this.room.code } : {}),
        ...data,
      });
      if (result.left) {
        await this.exitOnline(result.code, {
          forget: true,
          message: "Anda sudah keluar dari room.",
        });
        return true;
      }
      this.takeRoom(result, { baseline: ["CREATE", "JOIN"].includes(type) });
      if (["CREATE", "JOIN"].includes(type)) {
        this.localLease.release();
        this.connectRoom();
      }
      return true;
    } catch (e) {
      if (e.code === "room_membership_ended")
        await this.exitOnline(this.room?.code || data.code, {
          forget: true,
          message: e.message,
        });
      this.error = e.message;
      return false;
    } finally {
      this.pending = false;
      this.notify();
    }
  }
  async exitOnline(code, { forget = false, message = "" } = {}) {
    const userId = this.room?.userId || this.auth?.session()?.user.id;
    this.stopBot();
    this.stopAssetPlan("Room ditutup.");
    this.disconnect();
    this.cancelTimer();
    this.room = null;
    this.online = null;
    this.state = null;
    this.model = null;
    this.connected = false;
    this.screen = "lobby";
    this.covered = false;
    this.assetPanel = false;
    this.epoch++;
    if (forget) {
      await this.saveQueue?.catch(() => {});
      try {
        const latest = (await this.load()) || this.saved;
        if (latest?.room?.code === code && latest.room.userId === userId) {
          const cleared = await this.persist(
            { state: null, room: null },
            { expectedRevision: saveRevision(latest) },
          );
          this.saved =
            cleared && typeof cleared === "object"
              ? cleared
              : { state: null, room: null };
        } else this.saved = latest;
      } catch {
        this.saved = null;
      }
    }
    this.error = message;
    this.dispatchEvent(new Event("roomexit"));
    this.notify();
  }
  takeRoom(result, { baseline = false } = {}) {
    if (this.room && !baseline && result.code !== this.room.code) return;
    if (
      this.room?.code === result.code &&
      !acceptRevision(this.online?.roomRevision ?? -1, result.roomRevision)
    )
      return;
    const old = this.room,
      oldVersion = this.state?.version,
      oldMatch = this.state?.matchId;
    this.room = {
      code: result.code,
      seat: result.seat,
      provider: "supabase",
      userId: this.auth.session()?.user.id,
    };
    this.online = {...result,worker:result.worker||this.online?.worker};
    this.connected = true;
    this.localPaused = false;
    if (result.state) {
      this.screen = "gameplay";
      if (
        baseline ||
        !old ||
        !this.state ||
        this.state.matchId !== result.state.matchId
      )
        this.epoch++;
      // Room metadata is authoritative for display names even if gameplay
      // state.version stayed unchanged during a profile-only rename.
      const merged = mergeState(this.state, result.state, baseline);
      const renamed = merged.players.some(
        (player, index) =>
          result.seats?.[index] && player.name !== result.seats[index].name,
      );
      const named = renamed
        ? {
            ...merged,
            players: merged.players.map((player, index) => ({
              ...player,
              name: result.seats?.[index]?.name ?? player.name,
            })),
          }
        : merged;
      this.ingest(named, { reset: baseline || renamed });
    } else {
      this.state = null;
      this.model = null;
      this.screen = "lobby";
    }
    if (
      !old ||
      old.code !== this.room.code ||
      oldVersion !== this.state?.version ||
      oldMatch !== this.state?.matchId
    )
      void this.persistNow();
    this.notify();
  }
  connectRoom() {
    this.disconnect();
    if (!this.room || !this.auth) return;
    const epoch = this.connectionEpoch,
      code = this.room.code;
    this.unsubscribe = subscribeRoom(
      this.config,
      code,
      () => this.auth.token(),
      () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => void this.readRoom(), 100);
      },
      () => {},
    );
    const pulse = async () => {
      if (epoch !== this.connectionEpoch) return;
      await this.readRoom(true);
      if (epoch === this.connectionEpoch)
        this.heartbeat = setTimeout(
          pulse,
          this.connected
            ? this.online?.status === "waiting"
              ? 10000
              : 20000
            : 5000,
        );
    };
    void pulse();
  }
  async readRoom(heartbeat = false) {
    if (!this.room || this.reading) return;
    this.reading = true;
    const code = this.room.code,
      epoch = this.connectionEpoch,
      user = this.auth?.session()?.user.id;
    try {
      if (user !== this.room.userId) throw Error("Identitas berubah.");
      const result = await this.auth.request(
        heartbeat ? "" : `?code=${encodeURIComponent(code)}`,
        heartbeat
          ? { type: "HEARTBEAT", code, clientId: this.clientId }
          : undefined,
      );
      if (epoch !== this.connectionEpoch || this.room?.code !== code) return;
      const reconnect = !this.connected;
      this.takeRoom(result, { baseline: reconnect });
    } catch (error) {
      if (epoch === this.connectionEpoch) {
        if (error.code === "room_membership_ended") {
          await this.exitOnline(code, { forget: true, message: error.message });
          return;
        }
        this.connected = false;
        this.resetPresentation();
        this.notify();
      }
    } finally {
      this.reading = false;
    }
  }
  disconnect() {
    this.connectionEpoch++;
    clearTimeout(this.heartbeat);
    clearTimeout(this.debounce);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
  dispose() {
    this.localLease.release();
    this.stopAssetPlan("Sesi ditutup.");
    this.stopBot();
    this.disconnect();
    this.cancelTimer();
    this.mind.dispose();
  }
}
