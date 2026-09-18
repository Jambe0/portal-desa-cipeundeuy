import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function hmacSha256Base64Url(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function timingSafeTextEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first, "utf8");
  const secondBuffer = Buffer.from(second, "utf8");
  if (firstBuffer.byteLength !== secondBuffer.byteLength) return false;
  return timingSafeEqual(firstBuffer, secondBuffer);
}
