interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const store = new Map<string, number[]>();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of store) {
    const valid = timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) {
      store.delete(ip);
    } else {
      store.set(ip, valid);
    }
  }
}, 60_000);

if (typeof cleanup === 'object' && 'unref' in cleanup) {
  cleanup.unref();
}

export const rateLimiter = {
  check(ip: string): RateLimitResult {
    const now = Date.now();
    const timestamps = (store.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_REQUESTS) {
      const oldest = timestamps[0]!;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: WINDOW_MS - (now - oldest),
      };
    }

    timestamps.push(now);
    store.set(ip, timestamps);

    return {
      allowed: true,
      remaining: MAX_REQUESTS - timestamps.length,
      retryAfterMs: null,
    };
  },
};
