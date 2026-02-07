const buckets = new Map();
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
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt + 60000) { 
            buckets.delete(key);
        }
    }
}, 60000); 
module.exports = { checkRateLimit };
