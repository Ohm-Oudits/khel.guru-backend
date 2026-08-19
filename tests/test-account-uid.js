import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import User from "../models/user.model.js";
import { generateAccountUid, ACCOUNT_UID_PATTERN } from "../utils/accountUid.js";

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

// Generator format and uniqueness sanity
for (let i = 0; i < 100; i += 1) {
  assert.match(generateAccountUid(), ACCOUNT_UID_PATTERN);
}
assert.notEqual(generateAccountUid(), generateAccountUid());
console.log("accountUid generator produces well-formed KG- Crockford ids");

// Assignment on create
const user = new User({
  username: "uidtester",
  email: "uid@test.local",
  password: "Test@123456",
});
await user.save();
assert.match(user.accountUid, ACCOUNT_UID_PATTERN);
console.log("pre-validate hook assigns accountUid on user creation");

// Stability across re-saves
const originalUid = user.accountUid;
user.email = "uid2@test.local";
await user.save();
assert.equal(user.accountUid, originalUid);
console.log("accountUid survives re-saves unchanged");

// Immutability against direct mutation
user.accountUid = "KG-000000000000";
await user.save();
const reloaded = await User.findById(user._id);
assert.equal(reloaded.accountUid, originalUid);
console.log("accountUid is immutable against direct mutation");

// Distinct users receive distinct ids
const second = new User({
  username: "uidtester2",
  email: "uid3@test.local",
  password: "Test@123456",
});
await second.save();
assert.notEqual(second.accountUid, originalUid);
console.log("distinct users receive distinct accountUids");

await mongoose.disconnect();
await mongod.stop();
