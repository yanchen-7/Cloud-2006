import rateLimit from "express-rate-limit";

function toNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

export const apiRateLimiter = rateLimit({
  windowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  max: toNumber(process.env.RATE_LIMIT_MAX, 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

export const placesRateLimiter = rateLimit({
  windowMs: toNumber(process.env.PLACES_RATE_LIMIT_WINDOW_MS, 60_000),
  max: toNumber(process.env.PLACES_RATE_LIMIT_MAX, 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to /api/places. Please slow down." },
});
