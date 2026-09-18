"use client";

import { CSRF_COOKIE, readCookie } from "@/app/auth/security";

export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const inputUrl =
    input instanceof Request
      ? new URL(input.url, window.location.href)
      : new URL(input.toString(), window.location.href);
  if (inputUrl.origin !== window.location.origin) {
    throw new Error("Permintaan pengelola harus menuju portal yang sama.");
  }

  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = readCookie(document.cookie, CSRF_COOKIE);
    if (csrfToken) headers.set("x-csrf-token", csrfToken);
  }

  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers,
  });

  if (response.status === 401 && window.location.pathname !== "/kelola/masuk") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      `/kelola/masuk?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  return response;
}
