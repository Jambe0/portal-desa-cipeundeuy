import { eq } from "drizzle-orm";
import {
  requestAdminMutation,
  requestSessionTokenHash,
} from "@/app/admin-auth";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearCookie,
} from "@/app/auth/security";
import { secureCookiesEnabled } from "@/app/server-config";
import { getDb } from "@/db";
import { adminSessions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secure = secureCookiesEnabled();
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append(
    "set-cookie",
    clearCookie(SESSION_COOKIE, secure, true),
  );
  headers.append("set-cookie", clearCookie(CSRF_COOKIE, secure));

  try {
    const admin = await requestAdminMutation(request);
    const tokenHash = await requestSessionTokenHash(request);
    if (admin && tokenHash) {
      await getDb()
        .delete(adminSessions)
        .where(eq(adminSessions.tokenHash, tokenHash));
    }
  } catch (error) {
    console.error("admin logout failed", error);
  }

  return new Response(null, { status: 204, headers });
}
