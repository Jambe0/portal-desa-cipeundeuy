import { ensureDatabaseMigrations } from "./ensure-migrations.mjs";

await ensureDatabaseMigrations();
console.log("Migration PostgreSQL selesai.");
