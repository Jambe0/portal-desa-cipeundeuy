import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { Pool } from "pg";

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Passenger tidak selalu memulai proses dengan current working directory yang
// sama dengan Application root. Muat .env dari lokasi proyek secara eksplisit
// agar perintah migration, doctor, dan proses aplikasi membaca konfigurasi yang
// sama.
loadEnvironment({
  path: resolve(applicationRoot, ".env"),
  override: false,
  quiet: true,
});

export function createDatabasePool(max = 2) {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    return new Pool({
      connectionString,
      max,
      connectionTimeoutMillis: 10_000,
    });
  }

  const database = process.env.PGDATABASE?.trim();
  const user = process.env.PGUSER?.trim();
  const host = process.env.PGHOST?.trim() || "127.0.0.1";
  const port = Number(process.env.PGPORT?.trim() || "5432");
  const password = process.env.PGPASSWORD;

  if (!database || !user) {
    throw new Error(
      "Isi DATABASE_URL atau variabel PGHOST, PGPORT, PGDATABASE, PGUSER, dan PGPASSWORD.",
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PGPORT harus berupa nomor port PostgreSQL yang valid.");
  }

  return new Pool({
    host,
    port,
    database,
    user,
    ...(password ? { password } : {}),
    max,
    connectionTimeoutMillis: 10_000,
  });
}
