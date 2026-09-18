import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import process from "node:process";
import { createDatabasePool } from "./database.mjs";

function argumentsMap(values) {
  const result = new Map();
  for (const value of values) {
    if (!value.startsWith("--")) continue;
    const [key, ...parts] = value.slice(2).split("=");
    result.set(key, parts.length > 0 ? parts.join("=") : true);
  }
  return result;
}

async function askVisible(question) {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) =>
    prompt.question(question, resolve),
  );
  prompt.close();
  return String(answer).trim();
}

async function main() {
  const args = argumentsMap(process.argv.slice(2));
  if (args.has("help")) {
    console.log(
      [
        "Buat atau atur ulang akun pengelola Portal Desa Cipeundeuy.",
        "",
        "pnpm admin:create -- --email=admin@cipeundeuy.desa.id --name=\"Admin Desa\"",
        "",
        "Database dipilih melalui DATABASE_URL atau variabel PG*. Perintah membuat kunci akses",
        "acak satu kali; simpan kunci itu di pengelola kata sandi.",
      ].join("\n"),
    );
    return;
  }

  const emailInput =
    typeof args.get("email") === "string"
      ? args.get("email")
      : await askVisible("Email pengelola: ");
  const displayNameInput =
    typeof args.get("name") === "string"
      ? args.get("name")
      : await askVisible("Nama pengelola: ");
  const email = String(emailInput).trim().toLowerCase();
  const displayName = String(displayNameInput).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Format email pengelola tidak valid.");
  }
  if (displayName.length < 2 || displayName.length > 100) {
    throw new Error("Nama pengelola harus berisi 2 sampai 100 karakter.");
  }

  const accessKey = randomBytes(32).toString("base64url");
  const accessKeyHash = createHash("sha256")
    .update(accessKey)
    .digest("base64url");
  const now = new Date();
  const pool = createDatabasePool(1);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        INSERT INTO admin_users (
          id, email, display_name, access_key_hash, role, active,
          created_at, updated_at, access_key_changed_at
        )
        VALUES ($1, $2, $3, $4, 'owner', TRUE, $5, $5, $5)
        ON CONFLICT (email) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          access_key_hash = EXCLUDED.access_key_hash,
          active = TRUE,
          updated_at = EXCLUDED.updated_at,
          access_key_changed_at = EXCLUDED.access_key_changed_at
        RETURNING id
      `,
      [randomUUID(), email, displayName, accessKeyHash, now],
    );
    const userId = result.rows[0]?.id;
    if (!userId) throw new Error("Database tidak mengembalikan ID pengelola.");
    await client.query("DELETE FROM admin_sessions WHERE user_id = $1", [
      userId,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log("");
  console.log("AKUN PENGELOLA BERHASIL DISIMPAN");
  console.log(`Email       : ${email}`);
  console.log(`Kunci akses: ${accessKey}`);
  console.log("");
  console.log(
    "Simpan kunci akses sekarang. Nilai ini tidak dapat ditampilkan kembali.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
