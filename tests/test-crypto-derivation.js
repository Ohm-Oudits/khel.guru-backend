import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { HDNodeWallet, Mnemonic } from "ethers";

import CryptoWalletProfile from "../models/cryptoWalletProfile.model.js";
import User from "../models/user.model.js";
import {
  deriveEthAddress,
  deriveSolAddress,
  getOrCreateWalletProfile,
} from "../services/cryptoWallet.service.js";

// Standard BIP39 test mnemonic — public knowledge, never funds-bearing.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const accountNode = HDNodeWallet.fromMnemonic(
  Mnemonic.fromPhrase(TEST_MNEMONIC),
  "m/44'/60'/0'"
);
const TEST_XPUB = accountNode.neuter().extendedKey;

// ETH determinism: same index → same address, watch-only from xpub alone.
const eth0a = deriveEthAddress(0, TEST_XPUB);
const eth0b = deriveEthAddress(0, TEST_XPUB);
const eth5 = deriveEthAddress(5, TEST_XPUB);
assert.equal(eth0a, eth0b);
assert.notEqual(eth0a, eth5);
assert.match(eth0a, /^0x[0-9a-fA-F]{40}$/);
// Known vector: first receive address of the standard test mnemonic.
assert.equal(eth0a, "0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
console.log("ETH xpub derivation is deterministic and matches the test vector");

// SOL determinism: same index → same address.
const sol0a = deriveSolAddress(0, TEST_MNEMONIC);
const sol0b = deriveSolAddress(0, TEST_MNEMONIC);
const sol5 = deriveSolAddress(5, TEST_MNEMONIC);
assert.equal(sol0a, sol0b);
assert.notEqual(sol0a, sol5);
assert.match(sol0a, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
console.log("SOL SLIP-0010 derivation is deterministic");

// Profile allocation on memory Mongo.
const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const user = new User({
  username: "cryptotester",
  email: "crypto@test.local",
  password: "Test@123456",
});
await user.save();

const profileA = await getOrCreateWalletProfile(user._id);
const profileB = await getOrCreateWalletProfile(user._id);
assert.equal(String(profileA._id), String(profileB._id));
assert.equal(profileA.derivationIndex, profileB.derivationIndex);
console.log("wallet profile allocation is idempotent per user");

const secondUser = new User({
  username: "cryptotester2",
  email: "crypto2@test.local",
  password: "Test@123456",
});
await secondUser.save();
const secondProfile = await getOrCreateWalletProfile(secondUser._id);
assert.notEqual(secondProfile.derivationIndex, profileA.derivationIndex);
console.log("distinct users receive distinct derivation indexes");

// Immutability of the derivation index.
const stored = await CryptoWalletProfile.findById(profileA._id);
stored.derivationIndex = 999999;
await stored.save();
const reloaded = await CryptoWalletProfile.findById(profileA._id);
assert.equal(reloaded.derivationIndex, profileA.derivationIndex);
console.log("derivationIndex is immutable once allocated");

await mongoose.disconnect();
await mongod.stop();
