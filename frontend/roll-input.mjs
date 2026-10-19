// Input gesture only. No entropy, dice values or hold durations enter a game action.
export class RollInput {
  constructor({
    document: doc,
    resolve,
    commit,
    changed = () => {},
    now = () => performance.now(),
  }) {
    Object.assign(this, { doc, resolve, commit, changed, now });
    this.serial = 0;
    this.listeners = [];
    const on = (target, type, fn) => {
      target.addEventListener(type, fn, true);
      this.listeners.push(() => target.removeEventListener(type, fn, true));
    };
    on(doc, "pointerdown", (e) => this.down(e));
    on(doc, "pointerup", (e) => this.up(e));
    on(doc, "pointercancel", () => this.cancel());
    on(doc, "lostpointercapture", (e) => {
      if (this.current?.pointer === e.pointerId) this.cancel();
    });
    on(doc, "click", (e) => this.click(e));
    on(doc, "keydown", (e) => this.keyDown(e));
    on(doc, "keyup", (e) => {
      if (this.current?.key === e.code) {
        e.preventDefault();
        this.finish();
      }
    });
    on(doc, "visibilitychange", () => {
      if (doc.hidden) this.cancel();
    });
    on(doc, "focusin", (e) => {
      if (this.current && !this.current.button.contains(e.target))
        this.cancel();
    });
    on(doc.defaultView, "blur", () => this.cancel());
    on(doc.defaultView, "pagehide", () => this.cancel());
  }
  get holding() {
    return !!this.current;
  }
  button(target) {
    return target?.closest?.("button[data-action]");
  }
  begin(button, source) {
    const intent = this.resolve(button);
    if (!intent) return false;
    button.focus?.({ preventScroll: true });
    this.current = { button, intent, id: `hold-${++this.serial}`, ...source };
    button.classList.add("holding-roll");
    this.changed();
    return true;
  }
  suppress(button) {
    this.blocked = { button, until: this.now() + 500, clickPending: true };
  }
  clear() {
    const current = this.current;
    if (!current) return;
    this.current = null;
    current.button.classList.remove("holding-roll");
    if (current.pointer !== undefined)
      try {
        current.button.releasePointerCapture(current.pointer);
      } catch {}
    this.suppress(current.button);
    return current;
  }
  cancel() {
    if (this.clear()) this.changed();
  }
  finish() {
    const current = this.clear();
    if (!current) return;
    const latest = this.resolve(current.button);
    if (latest?.token === current.intent.token)
      void this.commit(current.intent);
    this.changed();
  }
  sync() {
    const c = this.current;
    if (
      c &&
      (!c.button.isConnected ||
        this.doc.hidden ||
        this.resolve(c.button)?.token !== c.intent.token)
    )
      this.cancel();
    for (const b of this.doc.querySelectorAll(
      'button[data-action="primary"],button[data-action="command"][data-type="ROLL"],button[data-action="command"][data-type="START_ROLL"]',
    )) {
      if (this.resolve(b)) {
        b.dataset.rollReady = "true";
        b.setAttribute(
          "aria-description",
          "Tahan untuk mengocok, lepas untuk melempar. Ketukan singkat juga bisa.",
        );
      } else {
        delete b.dataset.rollReady;
        b.removeAttribute("aria-description");
      }
    }
  }
  down(e) {
    if (this.current) {
      if (this.current.pointer !== e.pointerId) this.cancel();
      return;
    }
    if (e.button !== 0 || e.isPrimary === false) return;
    const button = this.button(e.target);
    if (this.blocked?.button === button && this.now() >= this.blocked.until)
      this.blocked = null;
    if (button && this.begin(button, { pointer: e.pointerId })) {
      e.preventDefault();
      try {
        button.setPointerCapture(e.pointerId);
      } catch {}
    }
  }
  up(e) {
    const c = this.current;
    if (!c || c.pointer !== e.pointerId) return;
    e.preventDefault();
    const r = c.button.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      this.cancel();
    else this.finish();
  }
  click(e) {
    const button = this.button(e.target);
    if (!button) return;
    if (
      this.blocked?.button === button &&
      (this.now() < this.blocked.until ||
        (this.blocked.clickPending && e.detail > 0))
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.blocked.clickPending = false;
      return;
    }
    const intent = this.resolve(button);
    if (!intent) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.suppress(button);
    void this.commit(intent);
  }
  keyDown(e) {
    if (e.code === "Escape") {
      this.cancel();
      return;
    }
    if (!["Space", "Enter"].includes(e.code)) return;
    let button = this.button(e.target);
    if (
      !button &&
      e.code === "Space" &&
      !this.doc.querySelector("dialog[open]") &&
      !e.target.closest?.(
        'input,textarea,select,[contenteditable="true"],[role="listbox"]',
      )
    )
      button = this.doc.querySelector('[data-action="primary"]');
    if (this.current?.key === e.code) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (this.current) {
      this.cancel();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.repeat || !button) return;
    if (this.begin(button, { key: e.code })) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  dispose() {
    this.cancel();
    for (const off of this.listeners) off();
    this.listeners = [];
  }
}
