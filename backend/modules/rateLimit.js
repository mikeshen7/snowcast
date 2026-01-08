'use strict';

// Simple fixed-window IP rate limiter; supports dynamic limits via functions.
function createFixedWindowRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 30,
    getKey = (req) => req.ip || 'unknown',
  } = options;

  const buckets = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.reset <= now) {
        buckets.delete(key);
      }
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const resolvedWindowMs = typeof windowMs === 'function' ? Number(windowMs(req)) || 0 : windowMs;
    const resolvedMax = typeof max === 'function' ? Number(max(req)) || 0 : max;
    const winMs = resolvedWindowMs > 0 ? resolvedWindowMs : 60 * 1000;
    const limit = resolvedMax > 0 ? resolvedMax : Infinity;
    const key = getKey(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now || bucket.windowMs !== winMs) {
      bucket = { count: 0, reset: now + winMs, windowMs: winMs };
    }
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.reset - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).send('Too Many Requests');
    }

    // Opportunistic cleanup
    if (Math.random() < 0.01) cleanup();
    return next();
  };
}

module.exports = { createFixedWindowRateLimiter };
