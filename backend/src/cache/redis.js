import { createClient } from "redis";

let client;

function buildRedisUrl({ host, port, password, tls, url }) {
  if (url) return url;
  if (!host) return null;

  const safePassword = password ? `:${encodeURIComponent(password)}@` : "";
  const resolvedPort = port || 6379;
  return `redis://${safePassword}${host}:${resolvedPort}`;
}

async function connectClient(options = {}) {
  const redisUrl = buildRedisUrl(options);
  if (!redisUrl) {
    console.info("Redis disabled: REDIS_HOST or REDIS_URL not configured.");
    return null;
  }

  const socketConfig = {};
  if (options.tls) {
    socketConfig.tls = true;
  }

  const redisClient = createClient({
    url: redisUrl,
    socket: Object.keys(socketConfig).length ? socketConfig : undefined,
    password: options.password,
  });

  redisClient.on("error", (err) => {
    console.error("Redis client error:", err);
  });

  await redisClient.connect();
  console.log("Redis client connected.");
  return redisClient;
}

export async function initRedis(config = {}) {
  if (client && client.isOpen) {
    return client;
  }

  const {
    host = process.env.REDIS_HOST,
    port = process.env.REDIS_PORT,
    password = process.env.REDIS_PASSWORD || undefined,
    url = process.env.REDIS_URL,
    tls = process.env.REDIS_TLS === "true",
  } = config;

  try {
    client = await connectClient({ host, port, password, url, tls });
  } catch (err) {
    console.warn("Failed to initialize Redis:", err);
    client = null;
  }
  return client;
}

export function getRedisClient() {
  if (!client || !client.isOpen) {
    return null;
  }
  return client;
}

export async function getJson(key) {
  const redisClient = getRedisClient();
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to read cache key ${key}:`, err);
    return null;
  }
}

export async function setJson(key, value, ttlSeconds) {
  const redisClient = getRedisClient();
  if (!redisClient) return false;
  try {
    const payload = JSON.stringify(value);
    const ttl = Number.isFinite(ttlSeconds) ? Math.max(0, Math.floor(ttlSeconds)) : 0;
    if (ttl > 0) {
      await redisClient.set(key, payload, { EX: ttl });
    } else {
      await redisClient.set(key, payload);
    }
    return true;
  } catch (err) {
    console.warn(`Failed to set cache key ${key}:`, err);
    return false;
  }
}

export async function deleteCacheKeys(...keys) {
  const redisClient = getRedisClient();
  if (!redisClient || !keys.length) return 0;
  try {
    return await redisClient.del(keys);
  } catch (err) {
    console.warn(`Failed to delete cache keys ${keys.join(", ")}:`, err);
    return 0;
  }
}

export async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch (err) {
    console.warn("Failed to close Redis client:", err);
  } finally {
    client = null;
  }
}
