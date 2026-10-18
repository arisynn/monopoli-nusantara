// Active runtime is Node.js / Vercel; multiplayer uses Supabase.
// Current multiplayer uses Supabase exclusively. This nullable legacy contract
// remains for the old handler, but Node/Vercel never activates a Redis store.
interface LegacyRoomRow {
  code: string;
  data: string;
  revision: number;
  leaseUntil?: number;
}
interface LegacyStore {
  get(code: string): Promise<LegacyRoomRow | null>;
  create(room: unknown): Promise<boolean>;
  commit(row: LegacyRoomRow, room: unknown): Promise<boolean>;
  quota(key: string): Promise<number>;
  acquire(row: LegacyRoomRow, owner: string): Promise<boolean>;
  release(row: LegacyRoomRow, owner: string): Promise<void>;
}
export function getRuntime() {
  const env = process.env;
  return {
    env,
    store: null as LegacyStore | null,
    hosting: "vercel",
    creatorId(request: Request) {
      // On Vercel this header is supplied by the platform. Never trust ChatGPT headers here.
      const address =
        env.VERCEL === "1"
          ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
          : null;
      return `guest:${address || "local-or-unidentified"}`;
    },
  };
}
