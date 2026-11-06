import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

/** postgres-js over Neon's pooler; one connection per process is plenty for the hackathon. */
export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 4, prepare: false, idle_timeout: 20, connect_timeout: 15 });
  return drizzle(sql, { schema });
}

let cached: Db | null = null;
export function dbFromEnv(env: NodeJS.ProcessEnv = process.env): Db {
  if (cached) return cached;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  cached = createDb(env.DATABASE_URL);
  return cached;
}
