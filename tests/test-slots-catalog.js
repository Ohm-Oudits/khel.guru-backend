import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import ProviderGame from "../models/providerGame.model.js";
import { SANDBOX_SLOTS, seedSlots } from "../scripts/seed-slots.js";
import {
  getSlot,
  launchSlot,
  listSlots,
  spinSlot,
} from "../services/slotsCatalog.service.js";

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const first = await seedSlots();
assert.equal(first.created, SANDBOX_SLOTS.length);
assert.equal(await ProviderGame.countDocuments(), SANDBOX_SLOTS.length);

const second = await seedSlots();
assert.equal(second.created, 0);
assert.equal(await ProviderGame.countDocuments(), SANDBOX_SLOTS.length);

const listed = await listSlots();
assert.equal(listed.length, SANDBOX_SLOTS.length);
assert.equal(listed[0].link.startsWith("/casino/slots/"), true);
assert.equal(listed[0].provider, "sandbox");
assert.equal(listed[0].engine, "house");
assert.equal(listed[0].playable, true);
assert.ok(listed[0].icon);

const missing = await getSlot("does-not-exist");
assert.equal(missing, null);

const launch = await launchSlot("neon-tiger");
assert.equal(launch.mode, "demo");
assert.equal(launch.slug, "neon-tiger");
assert.match(launch.sessionId, /^slot_sandbox_neon-tiger_/);
assert.equal(launch.embedUrl, null);
assert.equal(launch.engine, "house");

const guestSpin = await spinSlot("neon-tiger", { betAmount: 10 });
assert.equal(guestSpin.status, 401);
assert.equal(guestSpin.error, "Login to play");

const badBet = await spinSlot("neon-tiger", {
  betAmount: 0,
  userId: "000000000000000000000001",
});
assert.equal(badBet.error.includes("Bet must be"), true);

console.log(`slots catalog seeds ${SANDBOX_SLOTS.length} sandbox games and launches demo sessions`);

await mongoose.disconnect();
await mongod.stop();
