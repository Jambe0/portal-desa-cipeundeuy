import { and, eq, gt, lte } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { getAppUrl, getAuthSecret } from "@/app/server-config";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  isSameOriginRequest,
  readCookie,
} from "@/app/auth/security";
import {
  hmacSha256Base64Url,
  sha256Base64Url,
  timingSafeTextEqual,
} from "@/app/auth/security-server";

export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "editor";
};

type AdminSessionIdentity = AdminIdentity & {
  csrfHash: string;
  tokenHash: string;
};

async function findSessionByToken(
  token: string | null,
): Promise<AdminSessionIdentity | null> {
  if (!token || token.length < 32 || token.length > 256) return null;

  const tokenHash = await hmacSha256Base64Url(getAuthSecret(), token);
  const now = new Date();
  const rows = await getDb()
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      displayName: adminUsers.displayName,
      role: adminUsers.role,
      csrfHash: adminSessions.csrfHash,
      tokenHash: adminSessions.tokenHash,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        gt(adminSessions.expiresAt, now),
        eq(adminUsers.active, true),
        lte(adminUsers.accessKeyChangedAt, adminSessions.createdAt),
      ),
    )
    .limit(1);

  return rows[0] || null;
}

function publicIdentity(session: AdminSessionIdentity): AdminIdentity {
  return {
    id: session.id,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
  };
}

export async function currentAdmin(): Promise<AdminIdentity | null> {
  const cookieStore = await cookies();
  const session = await findSessionByToken(
    cookieStore.get(SESSION_COOKIE)?.value || null,
  );
  return session ? publicIdentity(session) : null;
}

export async function requestAdmin(
  request: Request,
): Promise<AdminIdentity | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = await findSessionByToken(token);
  return session ? publicIdentity(session) : null;
}

export async function requestAdminEmail(request: Request) {
  return (await requestAdmin(request))?.email || null;
}

export async function requestAdminMutation(
  request: Request,
): Promise<AdminIdentity | null> {
  if (!isSameOriginRequest(request, getAppUrl().origin)) return null;

  const cookieHeader = request.headers.get("cookie");
  const sessionToken = readCookie(cookieHeader, SESSION_COOKIE);
  const csrfCookie = readCookie(cookieHeader, CSRF_COOKIE);
  const csrfHeader = request.headers.get("x-csrf-token");
  if (
    !csrfCookie ||
    !csrfHeader ||
    !timingSafeTextEqual(csrfCookie, csrfHeader)
  ) {
    return null;
  }

  const session = await findSessionByToken(sessionToken);
  if (!session) return null;
  const csrfHash = await sha256Base64Url(csrfHeader);
  if (!timingSafeTextEqual(csrfHash, session.csrfHash)) return null;

  return publicIdentity(session);
}

export async function requestSessionTokenHash(request: Request) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  return token
    ? hmacSha256Base64Url(getAuthSecret(), token)
    : null;
}
