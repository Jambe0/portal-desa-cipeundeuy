import { getDatabasePool } from "@/db";
import { getAnalyticsSalt, getAppUrl, getAuthSecret } from "@/app/server-config";
import { classifyOperationalError } from "@/app/operational-errors";
import { PORTAL_RELEASE } from "@/app/release";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    // Pastikan tiga nilai wajib yang digunakan pendaftaran dan halaman
    // pengelola sudah tersedia sebelum health check menyatakan portal sehat.
    getAppUrl();
    getAuthSecret();
    getAnalyticsSalt();

    const database = getDatabasePool();
    // SELECT 1 saja tidak mendeteksi update aplikasi yang belum diikuti
    // migration. Cek tabel/kolom yang dipakai alur pendaftaran dan pengelola.
    await Promise.all([
      database.query("SELECT image_key, icon_key FROM directory_entries LIMIT 0"),
      database.query(
        "SELECT office_phone, office_email, service_hours_mon_thu, service_hours_friday, profile_image_key, profile_image_mime FROM village_profile LIMIT 0",
      ),
      database.query("SELECT bucket_key FROM admin_login_rate_limits LIMIT 0"),
    ]);
    return Response.json(
      { status: "ok", release: PORTAL_RELEASE },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("health check failed", error);
    return Response.json(
      {
        status: "unavailable",
        release: PORTAL_RELEASE,
        code: classifyOperationalError(error),
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
