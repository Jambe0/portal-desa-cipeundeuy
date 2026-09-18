import { eq, lt } from "drizzle-orm";
import {
  getAppUrl,
  getAuthSecret,
  secureCookiesEnabled,
} from "@/app/server-config";
import {
  analyticsHash,
  requestNetwork,
} from "@/app/directory-analytics";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  isSameOriginRequest,
  normalizeEmail,
  safeReturnTo,
  serializeCookie,
} from "@/app/auth/security";
import {
  hmacSha256Base64Url,
  randomToken,
  sha256Base64Url,
  timingSafeTextEqual,
} from "@/app/auth/security-server";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/app/request-rate-limit";
import { readLimitedJsonObject } from "@/app/request-security";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";

export const dynamic = "force-dynamic";

const ACCESS_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DUMMY_ACCESS_KEY_HASH =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function loginError(status = 401) {
  return Response.json(
    { error: "Email atau kunci akses tidak sesuai." },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

async function withinLoginLimit(request: Request, email: string) {
  const globalAllowed = await consumeRateLimit({
    bucketKey: "login:global",
    limit: 100,
    windowSeconds: 60,
  });
  if (!globalAllowed) return false;

  const network = requestNetwork(request) || "untrusted-proxy";
  const networkKey = await analyticsHash("login-network", network);
  const accountKey = await analyticsHash(
    "login-account",
    `${network}|${email || "invalid"}`,
  );
  const accountOnlyKey = await analyticsHash(
    "login-account-global",
    email || "invalid",
  );
  const networkAllowed = await consumeRateLimit({
    bucketKey: `login:network:${networkKey}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!networkAllowed) return false;
  const pairAllowed = await consumeRateLimit({
    bucketKey: `login:pair:${accountKey}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!pairAllowed) return false;
  return consumeRateLimit({
    bucketKey: `login:account:${accountOnlyKey}`,
    limit: 15,
    windowSeconds: 60,
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request, getAppUrl().origin)) {
    return Response.json(
      { error: "Permintaan login tidak valid." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const bodyResult = await readLimitedJsonObject(request, 4 * 1024);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.value;

  try {
    const email = normalizeEmail(
      typeof body.email === "string" ? body.email.slice(0, 160) : "",
    );
    const accessKey =
      typeof body.accessKey === "string" ? body.accessKey.slice(0, 128) : "";
    const returnTo = safeReturnTo(body.returnTo);

    if (!(await withinLoginLimit(request, email))) {
      return rateLimitResponse(
        "Terlalu banyak percobaan login. Tunggu satu menit lalu coba kembali.",
        60,
      );
    }

    if (!email || !ACCESS_KEY_PATTERN.test(accessKey)) return loginError();

    const now = new Date();
    const db = getDb();
    const users = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);
    const user = users[0];
    const presentedHash = await sha256Base64Url(accessKey);
    const keyValid = timingSafeTextEqual(
      presentedHash,
      user?.accessKeyHash || DUMMY_ACCESS_KEY_HASH,
    );

    if (!user || !user.active || !keyValid) return loginError();

    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(
      now.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
    );
    await db
      .delete(adminSessions)
      .where(lt(adminSessions.expiresAt, now));
    await db.insert(adminSessions).values({
      tokenHash: await hmacSha256Base64Url(
        getAuthSecret(),
        sessionToken,
      ),
      userId: user.id,
      csrfHash: await sha256Base64Url(csrfToken),
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    });

    const secure = secureCookiesEnabled();
    const headers = new Headers({
      "cache-control": "no-store",
    });
    headers.append(
      "set-cookie",
      serializeCookie(SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        maxAge: SESSION_MAX_AGE_SECONDS,
        secure,
      }),
    );
    headers.append(
      "set-cookie",
      serializeCookie(CSRF_COOKIE, csrfToken, {
        maxAge: SESSION_MAX_AGE_SECONDS,
        secure,
      }),
    );

    return Response.json(
      {
        ok: true,
        redirectTo: returnTo,
        admin: {
          displayName: user.displayName,
          email: user.email,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("admin login failed", error);
    return Response.json(
      { error: "Login pengelola sedang tidak tersedia." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
