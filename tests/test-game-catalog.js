import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Game from "../models/game.model.js";
import { seedGames, ORIGINAL_GAMES } from "../scripts/seed-games.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.resolve(__dirname, "../socket/modules");

// Discover every game name the socket services look up via Game.findOne({ name: "..." }).
const referencedNames = new Set();
for (const dir of readdirSync(modulesDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const servicePath = path.join(modulesDir, dir.name, `${dir.name}.service.js`);
  let source;
  try {
    source = readFileSync(servicePath, "utf8");
  } catch {
    continue;
  }
  const matches = source.matchAll(/Game\.(?:findOne|findOneAndUpdate)\(\s*\{\s*name:\s*"([a-zA-Z]+)"/g);
  for (const m of matches) referencedNames.add(m[1]);
}

assert.ok(referencedNames.size >= 15, "expected many game services to look up Game by name");

const seededNames = new Set(ORIGINAL_GAMES.map((g) => g.name));
for (const name of referencedNames) {
  assert.ok(
    seededNames.has(name),
    `game "${name}" is looked up by a socket service but missing from the seed catalog`
  );
}
console.log(`game catalog seed covers all ${referencedNames.size} service-referenced games`);

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const first = await seedGames();
assert.equal(first.created, ORIGINAL_GAMES.length, "first seed creates every game");
const countAfterFirst = await Game.countDocuments();
assert.equal(countAfterFirst, ORIGINAL_GAMES.length);

// Idempotent re-run: no duplicates.
const second = await seedGames();
assert.equal(second.created, 0, "re-seeding creates nothing");
assert.equal(await Game.countDocuments(), ORIGINAL_GAMES.length, "re-seeding does not duplicate");

// Every service-referenced game resolves to exactly one document.
for (const name of referencedNames) {
  const doc = await Game.findOne({ name });
  assert.ok(doc, `seeded game "${name}" is queryable`);
}
console.log("game catalog seed is idempotent and queryable");

await mongoose.disconnect();
await mongod.stop();
