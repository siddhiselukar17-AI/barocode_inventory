import { ApiError } from "@/lib/api";
import { execute, query } from "@/lib/db";

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fixed-window limiter. Per server instance only: fine for authenticated, low-risk
// endpoints. Login uses rateLimitShared() below, which is stored in MySQL and so is global.
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${retryAfter}s.`);
  }
}

/**
 * Fixed-window limiter backed by MySQL (table `rate_limits`), so the limit holds across all
 * serverless instances. The upsert is atomic, so concurrent attempts cannot slip past the limit.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  await execute(
    `INSERT INTO rate_limits (rl_key, hits, reset_at) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE
       hits = IF(reset_at <= ?, 1, hits + 1),
       reset_at = IF(reset_at <= ?, VALUES(reset_at), reset_at)`,
    [key.slice(0, 190), resetAt, now, now],
  );
  const [row] = await query<{ hits: number; reset_at: Date } & import("mysql2/promise").RowDataPacket>(
    "SELECT hits, reset_at FROM rate_limits WHERE rl_key = ?",
    [key.slice(0, 190)],
  );
  if (Math.random() < 0.02) {
    // Housekeeping: drop long-expired windows.
    await execute("DELETE FROM rate_limits WHERE reset_at < ?", [new Date(now.getTime() - 24 * 3600 * 1000)]).catch(() => undefined);
  }
  if (row && row.hits > limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - now.getTime()) / 1000));
    throw new ApiError(429, "RATE_LIMITED", `Too many attempts. Try again in ${retryAfter}s.`);
  }
}
