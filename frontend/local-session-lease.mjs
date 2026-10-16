/** One local writer tab. Storage CAS also protects browsers without Web Locks. */
export class LocalSessionLease {
  constructor(locks = globalThis.navigator?.locks) {
    Object.assign(this, {
      locks,
      held: false,
      pending: null,
      releaseLock: null,
    });
  }
  async acquire() {
    if (this.held || !this.locks) return;
    if (this.pending) return this.pending;
    this.pending = new Promise((resolve, reject) => {
      this.locks
        .request("nusantara-local-autosave", { ifAvailable: true }, (lock) => {
          if (!lock) {
            reject(
              new Error(
                "Pertandingan lokal sedang dibuka di tab lain. Kembali ke lobby atau tutup tab tersebut, lalu coba lagi.",
              ),
            );
            return;
          }
          this.held = true;
          return new Promise((release) => {
            this.releaseLock = release;
            resolve();
          });
        })
        .catch(reject);
    }).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  release() {
    this.releaseLock?.();
    this.releaseLock = null;
    this.held = false;
  }
}
