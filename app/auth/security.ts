export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const SESSION_COOKIE = "portal_admin_session";
export const CSRF_COOKIE = "portal_admin_csrf";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    maxAge: number;
    secure: boolean;
  },
) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    "SameSite=Strict",
  ];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearCookie(name: string, secure: boolean, httpOnly = false) {
  return serializeCookie(name, "", {
    httpOnly,
    maxAge: 0,
    secure,
  });
}

export function isSameOriginRequest(
  request: Request,
  expectedOrigin = new URL(request.url).origin,
) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export function safeReturnTo(value: unknown, fallback = "/kelola") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://portal.local");
    if (url.origin !== "https://portal.local") return fallback;
    if (
      url.pathname === "/kelola/masuk" ||
      url.pathname.startsWith("/api/auth/")
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
