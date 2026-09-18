import { isIP } from "node:net";
import { hmacSha256Base64Url } from "@/app/auth/security-server";
import {
  getAnalyticsSalt,
  secureCookiesEnabled,
  trustProxyHeaders,
} from "@/app/server-config";

const VISITOR_COOKIE = "portal_visitor_id";
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return valueParts.join("=");
  }
  return null;
}

export function analyticsVisitor(request: Request) {
  const stored = readCookie(request, VISITOR_COOKIE);
  const visitorId =
    stored && /^[a-zA-Z0-9-]{16,80}$/.test(stored)
      ? stored
      : crypto.randomUUID();
  const secure = secureCookiesEnabled() ? "; Secure" : "";

  return {
    visitorId,
    setCookie:
      stored === visitorId
        ? null
        : `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly${secure}; SameSite=Lax`,
  };
}

export function jakartaDay(date = new Date()) {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function analyticsCutoffDay(days = 30) {
  return jakartaDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
}

export function requestNetwork(request: Request): string | null {
  if (!trustProxyHeaders()) return null;

  const forwarded = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => isIP(candidate));
  if (forwarded.length > 0) return forwarded.at(-1) || null;

  const realIp = request.headers.get("x-real-ip")?.trim() || "";
  return isIP(realIp) ? realIp : null;
}

export function analyticsHash(purpose: string, value: string) {
  return hmacSha256Base64Url(
    getAnalyticsSalt(),
    `${purpose}|${value}`,
  );
}
