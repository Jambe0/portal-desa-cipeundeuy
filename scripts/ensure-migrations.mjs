import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabasePool } from "./database.mjs";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

// Angka tetap milik Portal Desa Cipeundeuy. Advisory lock mencegah dua worker
// Passenger menjalankan DDL pada saat bersamaan ketika aplikasi direstart.
const MIGRATION_LOCK_ID = 2_026_082_401;

export async function ensureDatabaseMigrations() {
  const pool = createDatabasePool(1);
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    locked = true;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
        .catch((error) => {
          console.error("Gagal melepas migration lock.", error);
        });
    }
    client.release();
    await pool.end();
  }
}
