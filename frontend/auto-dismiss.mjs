// Presentation time only: the callback acknowledges a displayed message, never a game action.
export class AutoDismiss {
  constructor({ clock = Date.now } = {}) {
    this.clock = clock;
    this.reset();
  }
  pause() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.remaining = Math.max(
      0,
      this.remaining - (this.clock() - this.started),
    );
  }
  reset() {
    clearTimeout(this.timer);
    this.timer = null;
    this.key = null;
    this.remaining = 0;
    this.displayed = false;
  }
  sync(key, duration, active, dismiss) {
    if (key !== this.key) {
      this.reset();
      this.key = key;
      this.remaining = duration;
    }
    if (!active) {
      this.pause();
      return;
    }
    if (!key || this.timer) return;
    this.displayed = true;
    this.started = this.clock();
    this.timer = setTimeout(() => {
      this.timer = null;
      // A superseded popup cannot dismiss the next message.
      if (this.key !== key) return;
      this.reset();
      dismiss(key);
    }, this.remaining);
  }
}
