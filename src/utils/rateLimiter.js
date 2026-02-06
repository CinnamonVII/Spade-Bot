const buckets = new Map();

/**
 * Rate limiter with sliding window implementation
 * SECURITY FIX: Enhanced to prevent command spam and abuse (VULN-010)
 */
function checkRateLimit(key, windowMs, limit) {
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > limit) {
        return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
    }

    return { ok: true, retryAfterMs: 0 };
}

/**
 * Clean up old rate limit data periodically to prevent memory leaks
 * SECURITY FIX: Automatic cleanup (VULN-010)
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt + 60000) { // Clean up 1 minute after reset
            buckets.delete(key);
        }
    }
}, 60000); // Clean up every minute

module.exports = { checkRateLimit };
