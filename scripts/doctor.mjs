import { constants } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createDatabasePool } from "./database.mjs";

const applicationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredDirectoryColumns = [
  "image_key",
  "image_mime",
  "image_bytes",
  "image_width",
  "image_height",
  "icon_key",
];
const requiredVillageColumns = [
  "office_phone",
  "office_email",
  "service_hours_mon_thu",
  "service_hours_friday",
  "profile_image_key",
  "profile_image_mime",
  "profile_image_bytes",
  "profile_image_width",
  "profile_image_height",
];

let failed = false;

function ok(message) {
  console.log(`[OK] ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`[GAGAL] ${message}`);
}

function errorCode(error) {
  let current = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "object" && typeof current.code === "string") {
      return current.code;
    }
    current = typeof current === "object" ? current.cause : null;
  }
  return "";
}

function databaseHint(error) {
  const code = errorCode(error);
  if (["42P01", "42703", "42704"].includes(code)) {
    return "Struktur PostgreSQL belum sesuai. Jalankan npm run db:migrate.";
  }
  if (code === "28P01") {
    return "Nama pengguna atau kata sandi PostgreSQL pada .env ditolak.";
  }
  if (code === "3D000") {
    return "Nama database PostgreSQL pada .env tidak ditemukan.";
  }
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].includes(code)) {
    return "Server PostgreSQL tidak dapat dijangkau. Periksa PGHOST dan PGPORT.";
  }
  return "Periksa PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, dan hak user database.";
}

const appUrl = process.env.APP_URL?.trim();
try {
  const url = new URL(appUrl || "");
  if (!/^https?:$/.test(url.protocol)) throw new Error();
  ok("APP_URL valid.");
} catch {
  fail("APP_URL pada .env belum berupa URL http/https yang valid.");
}

for (const key of ["AUTH_SECRET", "ANALYTICS_SALT"]) {
  const value = process.env[key]?.trim() || "";
  if (value.length >= 32 && !value.toLowerCase().includes("ganti-dengan")) {
    ok(`${key} tersedia.`);
  } else {
    fail(`${key} belum diisi atau kurang dari 32 karakter.`);
  }
}

let pool;
try {
  pool = createDatabasePool(1);
  await pool.query("SELECT 1");
  ok("Koneksi PostgreSQL berhasil.");

  const tables = await pool.query(
    `SELECT to_regclass('public.directory_entries') AS directory_entries,
            to_regclass('public.village_profile') AS village_profile,
            to_regclass('public.admin_login_rate_limits') AS rate_limits`,
  );
  const tableState = tables.rows[0] || {};
  const missingTables = Object.entries(tableState)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missingTables.length) {
    fail(`Tabel belum tersedia: ${missingTables.join(", ")}. Jalankan npm run db:migrate.`);
  } else {
    ok("Tabel utama portal tersedia.");
  }

  const columns = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('directory_entries', 'village_profile')`,
  );
  const byTable = new Map();
  for (const row of columns.rows) {
    const names = byTable.get(row.table_name) || new Set();
    names.add(row.column_name);
    byTable.set(row.table_name, names);
  }
  const missingColumns = [
    ...requiredDirectoryColumns
      .filter((name) => !byTable.get("directory_entries")?.has(name))
      .map((name) => `directory_entries.${name}`),
    ...requiredVillageColumns
      .filter((name) => !byTable.get("village_profile")?.has(name))
      .map((name) => `village_profile.${name}`),
  ];
  if (missingColumns.length) {
    fail(`Kolom Versi 88 belum lengkap: ${missingColumns.join(", ")}. Jalankan npm run db:migrate.`);
  } else {
    ok("Struktur PostgreSQL Versi 88 lengkap.");
  }
} catch (error) {
  fail(`PostgreSQL belum siap. ${databaseHint(error)}`);
} finally {
  await pool?.end().catch(() => undefined);
}

const configuredMediaDirectory = process.env.MEDIA_UPLOAD_DIR?.trim();
const mediaDirectory = configuredMediaDirectory
  ? isAbsolute(configuredMediaDirectory)
    ? configuredMediaDirectory
    : resolve(applicationRoot, configuredMediaDirectory)
  : resolve(applicationRoot, ".portal-desa-media");
const probe = resolve(mediaDirectory, `.write-test-${randomUUID()}`);
try {
  await mkdir(mediaDirectory, { recursive: true, mode: 0o750 });
  await access(mediaDirectory, constants.R_OK | constants.W_OK);
  await writeFile(probe, "ok", { encoding: "utf8", mode: 0o640 });
  await rm(probe, { force: true });
  ok("Folder media dapat ditulis oleh aplikasi.");
} catch {
  await rm(probe, { force: true }).catch(() => undefined);
  fail("Folder MEDIA_UPLOAD_DIR tidak dapat ditulis oleh aplikasi.");
}

if (failed) {
  console.error("\nPemeriksaan belum lulus. Perbaiki bagian [GAGAL], lalu jalankan kembali npm run db:doctor.");
  process.exitCode = 1;
} else {
  console.log("\nSemua pemeriksaan lulus. Restart aplikasi Passenger lalu buka /api/health.");
}
