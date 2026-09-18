import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";

const applicationRoot = dirname(fileURLToPath(import.meta.url));
process.chdir(applicationRoot);
loadEnvironment({
  path: resolve(applicationRoot, ".env"),
  override: false,
  quiet: true,
});

// Pembaruan schema Versi 88 dijalankan otomatis saat Passenger memulai ulang
// aplikasi. Advisory lock di ensure-migrations menjaga beberapa worker agar
// tidak melakukan migration bersamaan.
if (process.env.AUTO_MIGRATE !== "false") {
  try {
    const { ensureDatabaseMigrations } = await import(
      "./scripts/ensure-migrations.mjs"
    );
    await ensureDatabaseMigrations();
    console.log("Struktur PostgreSQL siap.");
  } catch (error) {
    // Beranda tetap dapat memakai data cadangan. /api/health dan db:doctor akan
    // menunjukkan bahwa bagian dinamis belum siap tanpa membocorkan rahasia.
    console.error("Pemeriksaan/migration PostgreSQL saat startup gagal.", error);
  }
}

const { default: next } = await import("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOST || "0.0.0.0";
const application = next({
  dev: false,
  dir: applicationRoot,
  hostname,
  port,
});
const handle = application.getRequestHandler();

await application.prepare();

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error("request handling failed", error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
    }
    response.end("Portal sedang mengalami kendala.");
  });
});

server.listen(port, hostname, () => {
  console.log(`Portal berjalan pada ${hostname}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} diterima, menghentikan portal.`);
  server.close((error) => {
    if (error) {
      console.error("graceful shutdown failed", error);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
