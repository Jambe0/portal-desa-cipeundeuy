import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  isSameOriginRequest,
  readCookie,
  safeReturnTo,
  serializeCookie,
} from "../app/auth/security.ts";
import {
  hmacSha256Base64Url,
  randomToken,
  sha256Base64Url,
  timingSafeTextEqual,
} from "../app/auth/security-server.ts";
import { classifyOperationalError } from "../app/operational-errors.ts";

test("operational errors classify nested PostgreSQL and filesystem failures", () => {
  const schemaCause = Object.assign(new Error("column image_key does not exist"), {
    code: "42703",
  });
  const wrappedSchemaError = new Error("query failed", { cause: schemaCause });
  assert.equal(
    classifyOperationalError(wrappedSchemaError),
    "DB_SCHEMA_OUTDATED",
  );

  const passwordError = Object.assign(new Error("authentication failed"), {
    code: "28P01",
  });
  assert.equal(
    classifyOperationalError(passwordError),
    "DB_CONNECTION_FAILED",
  );

  const storageError = Object.assign(new Error("permission denied"), {
    code: "EACCES",
  });
  assert.equal(
    classifyOperationalError(storageError),
    "MEDIA_STORAGE_UNAVAILABLE",
  );
});

test("generated access keys have 256 bits and match the CLI hash format", async () => {
  const accessKey = randomToken(32);
  const applicationHash = await sha256Base64Url(accessKey);
  const cliHash = createHash("sha256")
    .update(accessKey)
    .digest("base64url");

  assert.match(accessKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(applicationHash, cliHash);
  assert.notEqual(randomToken(32), accessKey);
});

test("session helpers produce strict cookies and deterministic token digests", async () => {
  const digest = await sha256Base64Url("token-contoh");
  assert.equal(digest, await sha256Base64Url("token-contoh"));
  assert.notEqual(digest, await sha256Base64Url("token-lain"));

  const sessionCookie = serializeCookie(SESSION_COOKIE, "token", {
    httpOnly: true,
    maxAge: 3600,
    secure: true,
  });
  const csrfCookie = serializeCookie(CSRF_COOKIE, "csrf", {
    maxAge: 3600,
    secure: true,
  });

  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=Strict/);
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
  assert.equal(
    readCookie(`${sessionCookie}; ${CSRF_COOKIE}=csrf`, CSRF_COOKIE),
    "csrf",
  );
});

test("return paths and mutation origins stay on the portal origin", () => {
  assert.equal(safeReturnTo("/kelola?tab=news"), "/kelola?tab=news");
  assert.equal(safeReturnTo("https://evil.example"), "/kelola");
  assert.equal(safeReturnTo("//evil.example"), "/kelola");
  assert.equal(safeReturnTo("/kelola/masuk"), "/kelola");
  assert.equal(safeReturnTo("/api/auth/logout"), "/kelola");

  const sameOrigin = new Request("https://desa.example/api/auth/login", {
    headers: { origin: "https://desa.example" },
  });
  const crossOrigin = new Request("https://desa.example/api/auth/login", {
    headers: { origin: "https://evil.example" },
  });
  assert.equal(isSameOriginRequest(sameOrigin), true);
  assert.equal(isSameOriginRequest(crossOrigin), false);
});

test("mutating routes enforce bounded JSON, trusted origins, rate limits, and safe caching", async () => {
  const [
    requestSecurity,
    rateLimiter,
    login,
    directory,
    click,
    adminAuth,
    adminContent,
    profileImage,
    publicContent,
  ] = await Promise.all(
    [
      "../app/request-security.ts",
      "../app/request-rate-limit.ts",
      "../app/api/auth/login/route.ts",
      "../app/api/directory/route.ts",
      "../app/api/directory/click/route.ts",
      "../app/admin-auth.ts",
      "../app/api/admin/content/route.ts",
      "../app/api/admin/content/profile-image/route.ts",
      "../app/api/content/route.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.match(requestSecurity, /content-type/);
  assert.match(requestSecurity, /content-length/);
  assert.match(requestSecurity, /receivedBytes > maximumBytes/);
  assert.match(requestSecurity, /jsonError\(413/);
  assert.match(requestSecurity, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(login, /readLimitedJsonObject\(request, 4 \* 1024\)/);
  assert.match(directory, /readLimitedJsonObject\(request, 16 \* 1024\)/);
  assert.match(directory, /readLimitedJsonObject\(request, 4 \* 1024\)/);
  assert.match(click, /readLimitedJsonObject\(request, 2 \* 1024\)/);
  assert.match(adminContent, /readLimitedJsonObject\(request, 16 \* 1024\)/);
  assert.match(profileImage, /requestAdminMutation\(request\)/);
  assert.match(profileImage, /MAX_PROFILE_IMAGE_REQUEST_BYTES/);
  assert.match(profileImage, /validateDirectoryImage\(image\)/);
  assert.match(profileImage, /MEDIA_STORAGE_UNAVAILABLE/);

  for (const mutationSource of [login, directory, click, adminAuth]) {
    assert.match(
      mutationSource,
      /isSameOriginRequest\(request, getAppUrl\(\)\.origin\)/,
    );
  }

  assert.match(rateLimiter, /ON CONFLICT \(bucket_key\) DO UPDATE/);
  assert.match(rateLimiter, /RETURNING attempt_count/);
  assert.match(rateLimiter, /status:\s*429/);
  assert.match(rateLimiter, /"retry-after"/);
  assert.match(rateLimiter, /"cache-control": "no-store"/);
  assert.match(login, /bucketKey: "login:global"/);
  assert.match(login, /bucketKey: `login:network:/);
  assert.match(login, /bucketKey: `login:pair:/);
  assert.match(login, /bucketKey: `login:account:/);
  assert.match(directory, /bucketKey: "directory-submit:global"/);
  assert.match(directory, /bucketKey: `directory-submit:actor:/);
  assert.match(click, /bucketKey: "directory-click:global"/);
  assert.match(click, /bucketKey: `directory-click:actor:/);

  assert.match(login, /"cache-control": "no-store"/);
  assert.match(click, /"cache-control": "no-store"/);
  assert.match(publicContent, /"cache-control": "no-store"/);
  assert.match(directory, /"cache-control": "no-store"/);
});

test("local session hashes depend on the auth secret and reject altered tokens", () => {
  const token = "session-token-contoh";
  const sessionHash = hmacSha256Base64Url("secret-lokal-pertama", token);
  const sameSessionHash = hmacSha256Base64Url("secret-lokal-pertama", token);
  const rotatedSecretHash = hmacSha256Base64Url("secret-lokal-kedua", token);
  const alteredTokenHash = hmacSha256Base64Url(
    "secret-lokal-pertama",
    `${token}-diubah`,
  );

  assert.equal(timingSafeTextEqual(sessionHash, sameSessionHash), true);
  assert.equal(timingSafeTextEqual(sessionHash, rotatedSecretHash), false);
  assert.equal(timingSafeTextEqual(sessionHash, alteredTokenHash), false);
  assert.equal(timingSafeTextEqual(sessionHash, sessionHash.slice(1)), false);
});
