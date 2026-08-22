import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import ProviderGame from "../models/providerGame.model.js";
import { SANDBOX_LIVE, seedLive } from "../scripts/seed-live.js";
import {
  getLiveTable,
  launchLive,
  listLive,
  playLive,
} from "../services/liveCatalog.service.js";

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const first = await seedLive();
assert.equal(first.created, SANDBOX_LIVE.length);
assert.equal(await ProviderGame.countDocuments({ category: "live" }), SANDBOX_LIVE.length);

const second = await seedLive();
assert.equal(second.created, 0);

const listed = await listLive();
assert.equal(listed.length, SANDBOX_LIVE.length);
assert.equal(listed[0].link.startsWith("/casino/live/"), true);
assert.equal(listed[0].provider, "sandbox-live");
assert.equal(listed[0].engine, "live-studio");
assert.ok(listed[0].tableType);

const missing = await getLiveTable("does-not-exist");
assert.equal(missing, null);

const launch = await launchLive("lightning-roulette");
assert.equal(launch.mode, "demo");
assert.equal(launch.slug, "lightning-roulette");
assert.equal(launch.tableType, "roulette");
assert.equal(launch.embedUrl, null);

const guestPlay = await playLive("lightning-roulette", {
  betAmount: 10,
  selection: "red",
});
assert.equal(guestPlay.status, 401);

console.log(`live catalog seeds ${SANDBOX_LIVE.length} sandbox tables as live studios`);

await mongoose.disconnect();
await mongod.stop();
