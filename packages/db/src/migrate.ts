import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, prepare: false });
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
await migrate(drizzle(sql), { migrationsFolder: dir });
console.log("[db] migrations applied from", dir);
await sql.end();
