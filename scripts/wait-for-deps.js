import mongoose from "mongoose";
import Redis from "ioredis";

const mongoUri = process.env.MONGODB_URI;
const redisUrl = process.env.REDIS_URL || "";
const attempts = Number.parseInt(process.env.DOCKER_WAIT_ATTEMPTS || "45", 10);
const delayMs = Number.parseInt(process.env.DOCKER_WAIT_DELAY_MS || "2000", 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForMongo = async () => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(mongoUri);
      await mongoose.disconnect();
      console.log("MongoDB is ready");
      return;
    } catch (error) {
      console.log(
        `Waiting for MongoDB (${attempt}/${attempts}): ${error.message}`
      );
      await sleep(delayMs);
    }
  }

  throw new Error("MongoDB did not become ready in time");
};

const waitForRedis = async () => {
  if (!redisUrl) {
    console.log("REDIS_URL unset; skipping Redis wait");
    return;
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
      await redis.ping();
      await redis.quit();
      console.log("Redis is ready");
      return;
    } catch (error) {
      try {
        await redis.quit();
      } catch {
        // ignore
      }
      console.log(`Waiting for Redis (${attempt}/${attempts}): ${error.message}`);
      await sleep(delayMs);
    }
  }

  throw new Error("Redis did not become ready in time");
};

await waitForMongo();
await waitForRedis();
