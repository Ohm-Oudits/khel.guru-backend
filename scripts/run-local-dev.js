import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { MongoMemoryServer } from "mongodb-memory-server";

dotenv.config();

// Force io-only before any seed script runs. Child-only env left house
// cricket + The Odds API catalog in the in-memory DB on every boot.
Object.assign(process.env, {
  SPORTSBOOK_DEFAULT_PROVIDER: "odds-api-io",
  SPORTSBOOK_IO_ONLY: "true",
  SPORTSBOOK_SKIP_HOUSE_CRICKET_SEED: "true",
  SPORTSBOOK_SKIP_ODDS_SPORTS_SEED: "true",
  SPORTSBOOK_CRICKET_POLL_MS: "0",
  SPORTSBOOK_ODDS_POLL_LIVE_MS: "0",
  SPORTSBOOK_SCORES_POLL_MS: "0",
  SPORTSBOOK_LIVE_BOARD_PUSH_MS: "0",
  SPORTSBOOK_SIM_LIVE_ODDS: "false",
  SPORTSBOOK_ODDS_SIM_LIVE_MS: "3000",
  SPORTSBOOK_ODDS_IO_POLL_MS: "0",
  SPORTSBOOK_ODDS_IO_LIVE_STATE_MS:
    process.env.SPORTSBOOK_ODDS_IO_LIVE_STATE_MS || "15000",
  SPORTSBOOK_ODDS_IO_DISCOVER_MS:
    process.env.SPORTSBOOK_ODDS_IO_DISCOVER_MS || "300000",
  SPORTSBOOK_ODDS_IO_ODDS_MS: process.env.SPORTSBOOK_ODDS_IO_ODDS_MS || "15000",
  SPORTSBOOK_ODDS_IO_CATALOG_POLL_MS:
    process.env.SPORTSBOOK_ODDS_IO_CATALOG_POLL_MS || "900000",
  SPORTSBOOK_ODDS_IO_SPORT_BATCH: process.env.SPORTSBOOK_ODDS_IO_SPORT_BATCH || "4",
  SPORTSBOOK_ODDS_IO_SEED_SPORTS: process.env.SPORTSBOOK_ODDS_IO_SEED_SPORTS || "1",
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || "20000",
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  SPORTSBOOK_ODDS_IO_429_COOLDOWN_MS:
    process.env.SPORTSBOOK_ODDS_IO_429_COOLDOWN_MS || "180000",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const port = process.env.PORT || "8080";
const shouldSeedDevUser = process.env.KG_SKIP_DEV_SEED !== "1";

const runSeedScript = (script, mongoUri, label) =>
  new Promise((resolve, reject) => {
    const seedProcess = spawn("node", [script], {
      cwd: projectRoot,
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
      },
      stdio: "inherit",
    });

    seedProcess.on("error", reject);
    seedProcess.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} exited with code ${code ?? "unknown"}`));
    });
  });

const mongod = await MongoMemoryServer.create({
  instance: {
    dbName: "khelguru",
  },
});

const mongoUri = mongod.getUri();

console.log(`Local in-memory MongoDB started at ${mongoUri}`);
if (shouldSeedDevUser) {
  console.log("Seeding local dev user...");
  await runSeedScript("scripts/create-dev-user.js", mongoUri, "Dev user seed");
}
console.log("Seeding originals catalog...");
await runSeedScript("scripts/seed-games.js", mongoUri, "Games seed");
console.log("Seeding sandbox slots catalog...");
await runSeedScript("scripts/seed-slots.js", mongoUri, "Slots seed");
console.log("Seeding sandbox live tables...");
await runSeedScript("scripts/seed-live.js", mongoUri, "Live seed");
if (process.env.SPORTSBOOK_SKIP_HOUSE_CRICKET_SEED === "true") {
  console.log("Skipping house cricket seed (SPORTSBOOK_SKIP_HOUSE_CRICKET_SEED=true)");
} else {
  console.log("Seeding cricket live and upcoming fixtures...");
  await runSeedScript("scripts/seed-live-cricket.js", mongoUri, "Cricket seed");
}
if (process.env.SPORTSBOOK_SKIP_ODDS_SPORTS_SEED === "true") {
  console.log("Skipping The Odds API catalog seed (SPORTSBOOK_SKIP_ODDS_SPORTS_SEED=true)");
} else {
  console.log("Seeding Odds API sports catalogs...");
  await runSeedScript("scripts/seed-odds-sports.js", mongoUri, "Odds sports seed");
}
if (process.env.ODDS_API_IO_KEY) {
  console.log("Seeding odds-api.io live / upcoming / completed...");
  await runSeedScript(
    "scripts/seed-odds-api-io.js",
    mongoUri,
    "odds-api.io seed"
  );
}
console.log(`Starting backend on port ${port}`);

const child = spawn("node", ["index.js"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    MONGODB_URI: mongoUri,
    PORT: port,
    NODE_ENV: process.env.NODE_ENV || "development",
    SPORTSBOOK_SCHEDULER_ENABLED: "true",
  },
  stdio: "inherit",
});

const shutdown = async (signal = "SIGTERM") => {
  if (!child.killed) {
    child.kill(signal);
  }

  await mongod.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

child.on("exit", async (code) => {
  await mongod.stop();
  process.exit(code ?? 0);
});
