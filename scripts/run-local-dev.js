import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { MongoMemoryServer } from "mongodb-memory-server";

dotenv.config();

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
console.log(`Starting backend on port ${port}`);

const child = spawn("node", ["index.js"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    MONGODB_URI: mongoUri,
    PORT: port,
    NODE_ENV: process.env.NODE_ENV || "development",
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
