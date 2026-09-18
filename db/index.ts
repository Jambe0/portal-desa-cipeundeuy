import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

type DatabaseGlobal = typeof globalThis & {
  portalDatabasePool?: Pool;
};

function databaseConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) return { connectionString };

  const database = process.env.PGDATABASE?.trim();
  const user = process.env.PGUSER?.trim();
  const host = process.env.PGHOST?.trim() || "127.0.0.1";
  const port = Number(process.env.PGPORT?.trim() || "5432");
  const password = process.env.PGPASSWORD;

  if (!database || !user) {
    throw new Error(
      "Database belum dikonfigurasi. Isi DATABASE_URL atau variabel PGHOST, PGPORT, PGDATABASE, PGUSER, dan PGPASSWORD.",
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PGPORT harus berupa nomor port PostgreSQL yang valid.");
  }

  // Jangan hanya mengandalkan default environment node-postgres. Dengan
  // konfigurasi eksplisit ini, nilai dari `.env` cPanel ikut dipakai secara
  // konsisten oleh Passenger dan oleh proses Next.js.
  return {
    host,
    port,
    database,
    user,
    ...(password ? { password } : {}),
  };
}

function poolMaximum() {
  const parsed = Number(process.env.PGPOOL_MAX || "3");
  return Number.isInteger(parsed) ? Math.min(5, Math.max(1, parsed)) : 3;
}

function getPool() {
  const shared = globalThis as DatabaseGlobal;
  if (!shared.portalDatabasePool) {
    shared.portalDatabasePool = new Pool({
      ...databaseConfig(),
      max: poolMaximum(),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return shared.portalDatabasePool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export function getDatabasePool() {
  return getPool();
}
