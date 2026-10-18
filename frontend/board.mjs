import { BOARD, money } from "../lib/content.mjs";
import { tileRect, tileCenter, hitTile } from "../lib/board-camera.mjs";
import {
  fitCamera,
  centerCamera,
  zoomCamera,
  clampCamera,
} from "./board-camera.mjs";
import { pawnPlacement } from "../lib/pawn-layout.mjs";
import { pawnRoute, samplePawnRoute } from "../lib/pawn-animation.mjs";
import { stepDuration } from "../lib/presentation-timeline.mjs";
import { pawnFor } from "../lib/pawns.mjs";
import { colors, buildingArt } from "./art.mjs";
import { esc } from "./domain.mjs";
import { rentLabel } from "./property-display.mjs";
export function tileNameLines(name) {
  const words = name.split(" ");
  return words.length > 1
    ? [words.slice(0, -1).join(" "), words.at(-1)]
    : [name];
}
function labelWidth(text, font, max) {
  const units = [...text].reduce(
    (n, c) =>
      n +
      (/[ilItjf]/.test(c)
        ? 0.3
        : /[mwMW]/.test(c)
          ? 0.85
          : c === " "
            ? 0.3
            : /[A-Z]/.test(c)
              ? 0.67
              : 0.56),
    0,
  );
  return Math.min(max, units * font);
}
function band(r, side, owner = false) {
  const size = owner ? 8 : 22;
  if (side === 0)
    return { ...r, y: owner ? r.y + r.height - size : r.y, height: size };
  if (side === 1)
    return { ...r, x: owner ? r.x : r.x + r.width - size, width: size };
  if (side === 2)
    return { ...r, y: owner ? r.y : r.y + r.height - size, height: size };
  return { ...r, x: owner ? r.x + r.width - size : r.x, width: size };
}
export function pawnDisplayPoint(p) {
  const id = hitTile(p);
  if (id === null || id % 10 === 0) return { x: p.x, y: p.y };
  const angle = (tileRect(id).angle * Math.PI) / 180;
  return { x: p.x - 18 * Math.sin(angle), y: p.y + 18 * Math.cos(angle) };
}
// Every edge uses the same local face: group, name, pawn pocket, rent and owner.
// Rotate the entire face toward the board center, matching a classic physical board.
function tileFace(t, r, state) {
  const corner = t.id % 10 === 0,
    center = { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    names = tileNameLines(t.name),
    special = t.type !== "city";
  const symbol = {
    start: "start",
    jail: "jail",
    gojail: "gojail",
    parking: "parking",
    chance: "chance",
    community: "community",
    station: "station",
    tax: "tax",
    utility: t.id === 12 ? "electric" : "water",
  }[t.type];
  const font = corner ? 18 : special ? 14.5 : 16,
    width = corner ? 120 : 73,
    y = corner ? 34 : special ? -51 : names.length === 1 ? -24 : -30;
  const title = names
    .map(
      (line, i) =>
        `<text class="tile-name" x="0" y="${y + i * (font + 2)}" text-anchor="middle" font-size="${font}" font-weight="650" textLength="${labelWidth(line.toUpperCase(), font, width)}" lengthAdjust="spacingAndGlyphs">${esc(line.toUpperCase())}</text>`,
    )
    .join("");
  const icon = special
    ? `<image href="/assets/classic/${symbol}.png" x="${corner ? -29 : -25}" y="${corner ? -53 : -15}" width="${corner ? 58 : 50}" height="${corner ? 58 : 50}"/>`
    : "";
  const owner = state.assets[t.id]?.owner;
  const price = t.price
    ? rentLabel(state, t.id, { compact: true })
    : t.type === "tax"
      ? money(t.tax)
      : t.id === 0
        ? "AMBIL ₦ 200"
        : "";
  const rentFont = t.price ? 18 : corner ? 11 : 14;
  return `<g class="tile-face" data-angle="${corner ? 0 : r.angle}" transform="translate(${center.x} ${center.y}) rotate(${corner ? 0 : r.angle})" pointer-events="none">${title}${icon}${price ? `<text class="tile-price ${t.price ? "tile-rent" : ""}" x="0" y="${corner ? 62 : owner == null ? 58 : 51}" text-anchor="middle" font-size="${rentFont}" textLength="${labelWidth(price, rentFont, corner ? 120 : 70)}" lengthAdjust="spacingAndGlyphs" font-weight="${t.price ? 650 : 500}" fill="#244c3c">${esc(price)}</text>` : ""}</g>`;
}

const rect = (r, attributes) =>
  `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ${attributes}/>`;
function buildings(r, a) {
  if (!a?.level) return "";
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    hotel = a.level === 5,
    label = hotel ? "Hotel" : `${a.level} rumah`;
  const count = hotel ? 1 : a.level;
  const size = hotel ? 29 : 21;
  const spacing = 18;
  return `<g class="property-buildings ${hotel ? "has-hotel" : "has-houses"}" transform="translate(${center.x} ${center.y}) rotate(${r.angle})" pointer-events="none" role="img" aria-label="${label}">${Array.from({ length: count }, (_, i) => buildingArt(hotel ? "hotel" : "house", { size, x: (-(count - 1) * spacing) / 2 + i * spacing - size / 2, y: -59 - size / 2, board: true })).join("")}</g>`;
}

export function boardMarkup(s) {
  const tiles = BOARD.map((t) => {
    const r = tileRect(t.id),
      side = Math.floor(t.id / 10),
      a = s.assets[t.id],
      owner = a?.owner,
      center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const color = owner == null ? "" : colors[pawnFor(s.players[owner])];
    const ownership =
      owner == null
        ? ""
        : `${rect({ ...r, x: r.x + 4, y: r.y + 4, width: r.width - 8, height: r.height - 8 }, `class="tile-ownership" fill="${color}" fill-opacity=".09" stroke="${color}" stroke-width="3" pointer-events="none"`)}${rect(band(r, side, true), `fill="${color}" pointer-events="none"`)}`;
    return `<g data-tile="${t.id}" data-owner="${owner ?? ""}" tabindex="0" role="button" aria-label="${esc(t.name)}${owner != null ? ", milik " + esc(s.players[owner].name) + ", sewa " + esc(rentLabel(s, t.id)) : t.price ? ", belum dimiliki" : ""}">${rect(r, `class="tile-ground" fill="${a?.mortgaged ? "#d3d5d1" : "#dcebd8"}" stroke="#283e34" stroke-width="2.8"`)}${ownership}${t.type === "city" ? rect(band(r, side), `fill="${t.color}" stroke="#283e34" stroke-width="2"`) : ""}${tileFace(t, r, s)}${buildings(r, a)}${a?.mortgaged ? `<path d="M${r.x + 7} ${r.y + 7}l${r.width - 14} ${r.height - 14}" stroke="#92566e" stroke-width="3" pointer-events="none"/><g transform="translate(${center.x} ${center.y}) rotate(${r.angle})" pointer-events="none"><image class="mortgage-marker" href="/assets/classic/mortgage.svg" x="-33" y="-8" width="23" height="23" role="img" aria-label="GADAI"/></g>` : ""}</g>`;
  }).join("");
  const pawns = s.players
    .map((p) => {
      const slot = {
          ...pawnPlacement(s, p.id),
          ...pawnDisplayPoint(pawnPlacement(s, p.id)),
        },
        size = slot.size,
        token = pawnFor(p);
      return `<g data-pawn="${p.id}" transform="translate(${slot.x} ${slot.y})" class="board-pawn ${p.out ? "pawn-out" : ""}" pointer-events="none"><ellipse cy="${size * 0.25}" rx="${size * 0.42}" ry="${size * 0.17}" fill="${colors[pawnFor(p)]}" opacity=".4"/><svg x="${-size * 0.65}" y="${-size * 0.55}" width="${size * 1.3}" height="${size * 1.3}" viewBox="${(token % 3) * 100} ${Math.floor(token / 3) * 100} 100 100"><image href="/assets/pawns/pawn-tokens.png" width="300" height="200" preserveAspectRatio="none"/></svg></g>`;
    })
    .join("");
  return `<rect width="1000" height="1000" fill="#dcebd8"/><rect x="140" y="140" width="720" height="720" fill="#dcebd8" stroke="#283e34" stroke-width="3"/><g class="board-center" pointer-events="none"><text x="500" y="490" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="61" letter-spacing="3" fill="#294b42">NUSANTARA</text><text x="500" y="523" text-anchor="middle" font-size="14" letter-spacing="4" fill="#617d6b">JELAJAH · MILIKI · BANGUN</text></g>${tiles}<g class="board-pawns">${pawns}</g>`;
}
export class BoardView {
  constructor(container, onTile, onComplete) {
    this.container = container;
    this.onComplete = onComplete;
    this.onTile = onTile;
    this.svg = container.querySelector("svg");
    this.world = this.svg.querySelector("g");
    this.mode = "overview";
    this.points = new Map();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    container.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const t = e.target.closest("[data-tile]");
        if (t) {
          e.preventDefault();
          onTile(Number(t.dataset.tile));
        }
      }
    });
    container.addEventListener("pointerdown", (e) => this.down(e));
    container.addEventListener("pointermove", (e) => this.move(e));
    for (const type of ["pointerup", "pointercancel"])
      container.addEventListener(type, (e) => this.up(e));
    container.addEventListener(
      "wheel",
      (e) => {
        if (e.target.closest("[data-action]")) return;
        e.preventDefault();
        this.mode = "manual";
        this.camera = zoomCamera(
          this.camera,
          Math.exp(-e.deltaY * 0.002),
          this.point(e),
        );
        this.transform();
      },
      { passive: false },
    );
  }
  resize() {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    this.camera = fitCamera(rect.width, rect.height);
    this.applyMode();
  }
  point(e) {
    const r = this.container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  down(e) {
    if (e.target.closest("[data-action]")) return;
    this.dragged = false;
    this.downTile = e.target.closest("[data-tile]")?.dataset.tile;
    this.points.set(e.pointerId, this.point(e));
    this.container.setPointerCapture(e.pointerId);
    this.lastPinch = null;
  }
  move(e) {
    if (!this.points.has(e.pointerId) || !this.camera) return;
    const before = this.points.get(e.pointerId),
      point = this.point(e);
    this.points.set(e.pointerId, point);
    if (this.points.size === 2) {
      const [a, b] = [...this.points.values()],
        distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.lastPinch)
        this.camera = zoomCamera(this.camera, distance / this.lastPinch, {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        });
      this.lastPinch = distance;
      this.dragged = true;
    } else {
      const dx = point.x - before.x,
        dy = point.y - before.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true;
      this.camera = clampCamera({
        ...this.camera,
        x: this.camera.x + dx,
        y: this.camera.y + dy,
      });
    }
    if (this.dragged) this.mode = "manual";
    this.transform();
  }
  up(e) {
    const tap =
      e.type === "pointerup" &&
      !this.dragged &&
      this.points.size === 1 &&
      this.downTile !== undefined;
    this.points.delete(e.pointerId);
    this.lastPinch = null;
    if (this.container.hasPointerCapture(e.pointerId))
      this.container.releasePointerCapture(e.pointerId);
    if (tap) this.onTile(Number(this.downTile));
    this.downTile = undefined;
  }
  transform() {
    if (this.camera) {
      this.world.setAttribute(
        "transform",
        `translate(${this.camera.x} ${this.camera.y}) scale(${this.camera.scale})`,
      );
      // Anchor the readable HTML control to the empty board center, including
      // when panning/following. Never dock it over a property or pawn.
      const bank = this.container.querySelector(".bank-indicator");
      if (bank) {
        const x = this.camera.x + 500 * this.camera.scale,
          y = this.camera.y + 640 * this.camera.scale;
        const width = bank.offsetWidth || this.bankWidth || 140,
          height = bank.offsetHeight || 44;
        this.bankWidth = width;
        bank.style.left = `${x}px`;
        bank.style.top = `${y - height / 2}px`;
        bank.hidden =
          x - width / 2 < 0 ||
          x + width / 2 > this.camera.width ||
          y - height / 2 < 0 ||
          y + height / 2 > this.camera.height;
      }
    }
  }
  setMode(mode) {
    this.mode = mode;
    this.applyMode();
  }
  applyMode() {
    if (!this.camera) return;
    if (this.mode === "overview")
      this.camera = fitCamera(this.camera.width, this.camera.height);
    else if (this.mode === "follow" && this.state) {
      const c = fitCamera(this.camera.width, this.camera.height);
      this.camera = centerCamera(
        { ...c, scale: Math.min(0.9, c.scale * 1.8) },
        tileCenter(this.state.players[this.state.turn].pos),
      );
    }
    this.transform();
  }
  update(state, head, { paused = false, reduced = false, fast = false } = {}) {
    const previous = this.state;
    this.state = state;
    const key = JSON.stringify([
      state.matchId,
      state.version,
      head?.id,
      state.players.map((p) => [p.pos, p.inJail, p.out, pawnFor(p), p.name]),
      state.assets,
    ]);
    if (key !== this.key) {
      this.key = key;
      this.world.innerHTML = boardMarkup(state);
      if (!reduced && previous?.matchId === state.matchId) {
        for (const [tile, asset] of Object.entries(state.assets)) {
          if (
            asset.owner != null &&
            asset.owner !== previous.assets[tile]?.owner
          ) {
            const marker = this.world.querySelector(
              `[data-tile="${tile}"] .tile-ownership`,
            );
            marker?.animate(
              [
                { fillOpacity: 0.5, strokeWidth: 7 },
                { fillOpacity: 0.09, strokeWidth: 3 },
              ],
              { duration: fast ? 240 : 450, easing: "ease-out" },
            );
          }
        }
      }
      this.applyMode();
    }
    if (head?.kind !== "pawnMoving" || reduced) {
      this.cancelMove();
      return;
    }
    if (this.motion?.id !== head.id) {
      this.cancelMove();
      this.motion = {
        id: head.id,
        move: head.move,
        points: pawnRoute(head.move, state).map(pawnDisplayPoint),
        elapsed: 0,
        duration: stepDuration(head, { fast, reduced }),
      };
    }
    if (paused) {
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.motion.elapsed += performance.now() - this.started;
      }
      return;
    }
    if (this.raf) return;
    this.started = performance.now();
    const motion = this.motion;
    const frame = () => {
      if (this.motion !== motion) return;
      const elapsed = motion.elapsed + performance.now() - this.started,
        p = this.world.querySelector(`[data-pawn="${motion.move.player}"]`),
        sample = samplePawnRoute(
          motion.points,
          elapsed,
          motion.duration / Math.max(1, motion.points.length - 1),
        );
      if (p && sample)
        p.setAttribute("transform", `translate(${sample.x} ${sample.y})`);
      if (elapsed >= motion.duration) {
        this.raf = 0;
        this.onComplete(motion.id);
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    frame();
  }
  cancelMove() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.motion = null;
  }
  dispose() {
    this.cancelMove();
    this.observer.disconnect();
  }
}
