// Decorative image changes only. The authoritative pair enters this view at reveal time.
export const DICE_IMAGES = Object.freeze(
  Array.from({ length: 6 }, (_, i) => `/assets/dice/die-${i + 1}.png`),
);
export function pipFrame(id, tick) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const mix = (n) => {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  };
  return [1 + (mix(h + tick * 1597) % 6), 1 + (mix(h + tick * 1949 + 97) % 6)];
}
export class DiceView {
  constructor(
    element,
    {
      schedule = (fn, ms) => globalThis.setTimeout(fn, ms),
      cancel = (id) => globalThis.clearTimeout(id),
    } = {},
  ) {
    this.element = element;
    this.schedule = schedule;
    this.cancel = cancel;
    this.serial = 0;
    this.timer = null;
    this.key = "";
    this.tick = 0;
    // Six shared URLs are loaded once. Ticks only change two data attributes;
    // image decoding and DOM creation do not repeat during the shuffle.
    this.element.innerHTML = `<div class="dice-pair" aria-hidden="true">${[0, 1].map(() => '<div class="die" data-value="0">' + DICE_IMAGES.map((src, i) => `<img class="die-face" data-face="${i + 1}" src="${src}" width="192" height="192" alt="" decoding="async" draggable="false">`).join("") + "</div>").join("")}</div><small></small>`;
    this.faces = [...element.querySelectorAll(".die")];
  }
  paint(values) {
    for (let d = 0; d < 2; d++) {
      const value = values?.[d] || 0;
      if (this.faces[d].dataset.value !== String(value))
        this.faces[d].dataset.value = String(value);
    }
  }
  stop() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.serial++;
  }
  update(result, { id = "", paused = false, reduced = false } = {}) {
    const key =
      result.stage === "rolling"
        ? id
        : JSON.stringify([result.stage, result.values, result.label]);
    if (key !== this.key) {
      this.stop();
      this.key = key;
      this.tick = 0;
    }
    this.result = result;
    this.paused = paused || reduced;
    this.element.dataset.stage = result.stage;
    this.element.classList.toggle("rolling", result.stage === "rolling");
    this.element.setAttribute("aria-label", result.label);
    this.element.querySelector("small").textContent =
      result.stage === "rolling" ? "Mengacak…" : result.label;
    if (result.stage !== "rolling") {
      this.stop();
      this.paint(result.values || (result.stage === "idle" ? [1, 1] : null));
      return;
    }
    if (this.paused) {
      this.stop();
      if (reduced) this.paint(null);
      return;
    }
    if (this.timer !== null) return;
    const serial = this.serial;
    const frame = () => {
      if (
        serial !== this.serial ||
        this.paused ||
        this.result.stage !== "rolling"
      )
        return;
      this.paint(pipFrame(this.key, this.tick++));
      this.timer = this.schedule(
        () => {
          this.timer = null;
          frame();
        },
        Math.min(150, 75 + this.tick * 10),
      );
    };
    frame();
  }
  dispose() {
    this.stop();
  }
}
