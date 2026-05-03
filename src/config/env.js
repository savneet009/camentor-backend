import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitCsv = (value = "") =>
  String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const requiredEnv = ["MONGO_URI", "JWT_SECRET"];

export const validateEnv = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 8000),
  mongoUri: process.env.MONGO_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  allowedOrigins: splitCsv(process.env.ALLOWED_ORIGINS),
  jsonLimit: process.env.JSON_LIMIT || "20mb",
  rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: toNumber(process.env.RATE_LIMIT_MAX, 180),
  trustProxy:
    process.env.TRUST_PROXY === undefined
      ? 1
      : process.env.TRUST_PROXY === "true"
        ? true
        : process.env.TRUST_PROXY === "false"
          ? false
          : process.env.TRUST_PROXY,
};
