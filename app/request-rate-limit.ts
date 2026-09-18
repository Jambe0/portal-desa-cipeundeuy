import "server-only";
import { getDatabasePool } from "@/db";

type RateLimitOptions = {
  bucketKey: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Fixed-window limiter backed by PostgreSQL. The upsert is atomic across all
 * Passenger workers, unlike an in-memory counter on shared hosting.
 */
export async function consumeRateLimit({
  bucketKey,
  limit,
  windowSeconds,
}: RateLimitOptions) {
  if (
    !bucketKey ||
    bucketKey.length > 240 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 1 ||
    windowSeconds > 86_400
  ) {
    throw new Error("Konfigurasi rate limit tidak valid.");
  }

  const result = await getDatabasePool().query<{ attempt_count: number }>(
    `
      INSERT INTO admin_login_rate_limits
        (bucket_key, window_started_at, attempt_count, updated_at)
      VALUES ($1, NOW(), 1, NOW())
      ON CONFLICT (bucket_key) DO UPDATE SET
        attempt_count = CASE
          WHEN admin_login_rate_limits.window_started_at
            <= NOW() - ($2::integer * INTERVAL '1 second')
            THEN 1
          ELSE admin_login_rate_limits.attempt_count + 1
        END,
        window_started_at = CASE
          WHEN admin_login_rate_limits.window_started_at
            <= NOW() - ($2::integer * INTERVAL '1 second')
            THEN NOW()
          ELSE admin_login_rate_limits.window_started_at
        END,
        updated_at = NOW()
      RETURNING attempt_count
    `,
    [bucketKey, windowSeconds],
  );

  return Number(result.rows[0]?.attempt_count || 0) <= limit;
}

export function rateLimitResponse(message: string, retryAfterSeconds: number) {
  return Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}
