const buckets = new Map();

const defaultKey = (req) => `${req.ip || "unknown"}:${req.baseUrl || req.path}`;

export const createRateLimit = ({
  windowMs = 60 * 1000,
  max = 120,
  keyGenerator = defaultKey,
} = {}) => (req, res, next) => {
  const now = Date.now();
  const key = keyGenerator(req);
  const current = buckets.get(key);

  if (!current || now > current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= max) {
    const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, retryAfterSec)));
    return res.status(429).json({ success: false, message: "Too many requests. Please retry shortly." });
  }

  current.count += 1;
  buckets.set(key, current);
  return next();
};

