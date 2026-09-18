type OperationalFailure =
  | "APP_CONFIG_INVALID"
  | "DB_CONNECTION_FAILED"
  | "DB_PERMISSION_DENIED"
  | "DB_SCHEMA_OUTDATED"
  | "MEDIA_STORAGE_UNAVAILABLE"
  | "SERVER_ERROR";

type ErrorDetails = {
  codes: Set<string>;
  message: string;
};

function collectErrorDetails(error: unknown): ErrorDetails {
  const codes = new Set<string>();
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current = error;

  for (let depth = 0; depth < 8 && current && !visited.has(current); depth += 1) {
    visited.add(current);
    if (current instanceof Error) messages.push(current.message);
    if (typeof current === "object") {
      const record = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (typeof record.code === "string") codes.add(record.code);
      if (!(current instanceof Error) && typeof record.message === "string") {
        messages.push(record.message);
      }
      current = record.cause;
    } else {
      if (typeof current === "string") messages.push(current);
      break;
    }
  }

  return { codes, message: messages.join("\n") };
}

export function classifyOperationalError(error: unknown): OperationalFailure {
  const { codes, message } = collectErrorDetails(error);

  if (
    ["42P01", "42703", "42704"].some((code) => codes.has(code)) ||
    /column .* does not exist|relation .* does not exist/i.test(message)
  ) {
    return "DB_SCHEMA_OUTDATED";
  }

  if (["28P01", "28000", "42501"].some((code) => codes.has(code))) {
    return codes.has("42501")
      ? "DB_PERMISSION_DENIED"
      : "DB_CONNECTION_FAILED";
  }

  if (
    [
      "3D000",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ECONNRESET",
      "EHOSTUNREACH",
    ].some((code) => codes.has(code)) ||
    [...codes].some((code) => code.startsWith("08")) ||
    ["53300", "57P01", "57P02", "57P03"].some((code) => codes.has(code)) ||
    message.includes("Database belum dikonfigurasi") ||
    message.includes("DATABASE_URL") ||
    message.includes("PGPORT harus")
  ) {
    return "DB_CONNECTION_FAILED";
  }

  if (
    message.includes("AUTH_SECRET belum dikonfigurasi") ||
    message.includes("ANALYTICS_SALT belum dikonfigurasi") ||
    message.includes("APP_URL harus")
  ) {
    return "APP_CONFIG_INVALID";
  }

  if (
    ["EACCES", "EPERM", "EROFS", "ENOSPC", "ENOENT"].some((code) =>
      codes.has(code),
    )
  ) {
    return "MEDIA_STORAGE_UNAVAILABLE";
  }

  return "SERVER_ERROR";
}
