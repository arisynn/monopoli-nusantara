const KEY = "nusantara-save-v1";
let clock = 0;
const writes = new Map<string, Promise<any>>();
export const SAVE_SLOTS = [
  "slot-1",
  "slot-2",
  "slot-3",
  "slot-4",
  "slot-5",
] as const;

export class SaveConflictError extends Error {
  constructor() {
    super(
      "Simpanan berubah di tab lain. Progres terbaru tetap aman. Kembali ke lobby lalu muat ulang simpanan terbaru.",
    );
    this.name = "SaveConflictError";
  }
}
interface SaveOptions {
  expectedRevision?: string | number | null;
  replace?: boolean;
}
export function saveRevision(value: any): string | number | null {
  return value?.saveRevision ?? value?.persistedAt ?? null;
}
function localRead(key: string): any {
  try {
    return JSON.parse(
      localStorage.getItem(key === "latest" ? KEY : KEY + ":" + key) || "null",
    );
  } catch {
    return null;
  }
}
function newest(local: any, indexed: any): any {
  return indexed &&
    (!local || (indexed.persistedAt || 0) >= (local.persistedAt || 0))
    ? indexed
    : local;
}
function guard(current: any, input: any, options: SaveOptions) {
  if (
    options.expectedRevision !== undefined &&
    saveRevision(current) !== options.expectedRevision
  )
    throw new SaveConflictError();
  if (
    !options.replace &&
    !current?.room &&
    !input.room &&
    current?.state?.matchId &&
    current.state.matchId === input.state?.matchId
  ) {
    if (current.state.version > input.state.version)
      throw new SaveConflictError();
    if (
      current.state.version === input.state.version &&
      JSON.stringify(current.state) !== JSON.stringify(input.state)
    )
      throw new SaveConflictError();
  }
}
function envelope(input: any, current: any) {
  return {
    ...input,
    persistedAt: (clock = Math.max(
      Date.now(),
      clock + 1,
      (current?.persistedAt || 0) + 1,
    )),
    saveRevision: crypto.randomUUID(),
  };
}
function write(key: string, input: any, options: SaveOptions = {}) {
  const snapshot = structuredClone(input);
  const commit = async () => {
    let db: IDBDatabase | undefined;
    let value: any;
    try {
      db = await open();
      // Read, compare and put in one transaction: atomic across browser tabs.
      value = await new Promise<any>((ok, bad) => {
        const tx = db!.transaction("saves", "readwrite");
        let result: any, conflict: unknown;
        tx.oncomplete = () => ok(result);
        tx.onerror = () => bad(conflict || tx.error);
        tx.onabort = () => bad(conflict || tx.error);
        const store = tx.objectStore("saves"),
          request = store.get(key);
        request.onsuccess = () => {
          try {
            const current = newest(localRead(key), request.result);
            if (key === "latest") guard(current, snapshot, options);
            result = envelope(snapshot, current);
            store.put(result, key);
          } catch (error) {
            conflict = error;
            tx.abort();
          }
        };
        request.onerror = () => bad(request.error);
      });
    } catch (error) {
      if (error instanceof SaveConflictError) throw error;
      // localStorage fallback requires a shared Web Lock in real browsers.
      if (
        key === "latest" &&
        typeof window !== "undefined" &&
        !globalThis.navigator?.locks
      ) {
        throw Error(
          "Penyimpanan aman tidak tersedia di browser ini. Gunakan ekspor cadangan atau browser yang mendukung IndexedDB.",
        );
      }
      const current = localRead(key);
      if (key === "latest") guard(current, snapshot, options);
      value = envelope(snapshot, current);
      try {
        localStorage.setItem(
          key === "latest" ? KEY : KEY + ":" + key,
          JSON.stringify(value),
        );
      } catch {
        throw Error("Penyimpanan perangkat tidak tersedia.");
      }
      return value;
    } finally {
      db?.close();
    }
    try {
      localStorage.setItem(
        key === "latest" ? KEY : KEY + ":" + key,
        JSON.stringify(value),
      );
    } catch {
      /* IndexedDB committed. */
    }
    return value;
  };
  const promise = (writes.get(key) || Promise.resolve())
    .catch(() => {})
    .then(() =>
      globalThis.navigator?.locks
        ? navigator.locks.request("nusantara-save:" + key, commit)
        : commit(),
    );
  writes.set(key, promise);
  promise
    .finally(() => {
      if (writes.get(key) === promise) writes.delete(key);
    })
    .catch(() => {});
  return promise;
}
async function read(key: string) {
  await writes.get(key)?.catch(() => {});
  const local = localRead(key);
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    const indexed = await new Promise<any>((ok, bad) => {
      const request = db!.transaction("saves").objectStore("saves").get(key);
      request.onsuccess = () => ok(request.result);
      request.onerror = () => bad(request.error);
    });
    return newest(local, indexed);
  } catch {
    return local;
  } finally {
    db?.close();
  }
}
export const saveGame = (value: any, options: SaveOptions = {}) =>
  write("latest", value, options);
export const loadGame = () => read("latest");
export function saveSlot(id: string, value: any, label: string) {
  if (!(SAVE_SLOTS as readonly string[]).includes(id))
    throw Error("Slot tidak dikenal.");
  if (value.room || !value.state)
    throw Error("Slot hanya untuk permainan lokal.");
  return write(id, {
    state: value.state,
    room: null,
    label: label.trim().slice(0, 48) || "Perjalanan tersimpan",
  });
}
export const savePrevious = (state: any) =>
  write("previous", { state, room: null, label: "Permainan sebelumnya" });
export async function listSaves() {
  return Promise.all(
    ["previous", ...SAVE_SLOTS].map(async (id) => ({
      id,
      ...(await read(id)),
    })),
  );
}
export function clearSlot(id: string) {
  if (!(["previous", ...SAVE_SLOTS] as string[]).includes(id))
    throw Error("Slot tidak dikenal.");
  return write(id, { state: null, room: null, label: null });
}
function open() {
  return new Promise<IDBDatabase>((ok, bad) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      bad(Error("Penyimpanan tidak merespons."));
    }, 3500);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open("monopoli-nusantara", 1);
    } catch (error) {
      clearTimeout(timer);
      bad(error);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("saves"))
        request.result.createObjectStore("saves");
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) request.result.close();
      else {
        settled = true;
        ok(request.result);
      }
    };
    request.onerror = () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        bad(request.error);
      }
    };
  });
}
