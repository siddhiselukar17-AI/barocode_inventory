import { ApiError } from "@/lib/api";

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fixed-window limiter. Per server instance only: on serverless/multi-instance
// hosting, replace with a shared store (Redis/Upstash) for strict global limits.
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
