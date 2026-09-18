import "server-only";

function validSecret(name: "AUTH_SECRET" | "ANALYTICS_SALT") {
  const value = process.env[name]?.trim();
  if (
    !value ||
    value.length < 32 ||
    value.toLowerCase().includes("ganti-dengan")
  ) {
    throw new Error(
      `${name} belum dikonfigurasi atau panjangnya kurang dari 32 karakter.`,
    );
  }
  return value;
}

export function getAuthSecret() {
  return validSecret("AUTH_SECRET");
}

export function getAnalyticsSalt() {
  return validSecret("ANALYTICS_SALT");
}

export function getAppUrl() {
  const raw = process.env.APP_URL?.trim() || "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL harus berupa URL http atau https yang valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_URL harus menggunakan protokol http atau https.");
  }
  return new URL(url.origin);
}

export function secureCookiesEnabled() {
  return getAppUrl().protocol === "https:";
}

export function trustProxyHeaders() {
  return process.env.TRUST_PROXY === "true";
}
