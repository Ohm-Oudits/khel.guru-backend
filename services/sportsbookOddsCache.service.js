import crypto from "crypto";

const memory = new Map();
let redis = null;
let redisTried = false;

const keyOf = (eventId) => `odds:event:${eventId}`;
const sportKeyOf = (sport, bucket) => `sport:${sport}:${bucket}`;

const digest = (value) =>
  crypto.createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex");

const connectRedis = async () => {
  if (redisTried) return redis;
  redisTried = true;
  const url = process.env.REDIS_URL || "";
  if (!url) return null;
  try {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    await redis.connect();
    console.log(`sportsbook Redis connected ${url}`);
    return redis;
  } catch (error) {
    console.warn(`sportsbook Redis unavailable, using memory cache: ${error.message}`);
    redis = null;
    return null;
  }
};

export const oddsHashOf = (payload) => digest(payload);

export const getCachedOdds = async (eventId) => {
  const key = keyOf(eventId);
  const client = await connectRedis();
  if (client) {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return memory.get(key) || null;
};

export const getCachedOddsHash = async (eventId) => {
  const cached = await getCachedOdds(eventId);
  return cached?.hash || null;
};

export const setCachedOdds = async (eventId, payload) => {
  const key = keyOf(eventId);
  const entry = {
    eventId: String(eventId),
    hash: oddsHashOf(payload),
    payload,
    updatedAt: new Date().toISOString(),
  };
  const client = await connectRedis();
  if (client) {
    await client.set(key, JSON.stringify(entry));
  } else {
    memory.set(key, entry);
  }
  return entry;
};

export const oddsPayloadChanged = async (eventId, payload) => {
  const nextHash = oddsHashOf(payload);
  const previous = await getCachedOddsHash(eventId);
  return previous !== nextHash;
};

export const setCachedSportBoard = async (sport, bucket, eventIds = []) => {
  const key = sportKeyOf(sport, bucket);
  const value = eventIds.map(String);
  const client = await connectRedis();
  if (client) {
    await client.set(key, JSON.stringify(value));
  } else {
    memory.set(key, value);
  }
};

export const getCachedSportBoard = async (sport, bucket) => {
  const key = sportKeyOf(sport, bucket);
  const client = await connectRedis();
  if (client) {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : [];
  }
  return memory.get(key) || [];
};

export const pingSportsbookCache = async () => {
  const client = await connectRedis();
  if (!client) return { backend: "memory" };
  const pong = await client.ping();
  return { backend: "redis", pong };
};

export const resetSportsbookOddsCache = async () => {
  memory.clear();
  const client = redis || (await connectRedis());
  if (client) {
    try {
      const keys = [
        ...(await client.keys("odds:event:*")),
        ...(await client.keys("sport:*")),
      ];
      if (keys.length) await client.del(...keys);
      await client.quit();
    } catch {
      // ignore
    }
  }
  redis = null;
  redisTried = false;
};
