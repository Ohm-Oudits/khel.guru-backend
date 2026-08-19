import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import User from "../models/user.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import { ensureDefaultWalletAccounts } from "../services/walletPlatform.service.js";
import {
  debitGameStake,
  creditGameWin,
  refundGameStake,
  getGameBalance,
  resolveGameWalletType,
} from "../services/casinoWallet.service.js";
import WalletAccount from "../models/walletAccount.model.js";

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

assert.equal(resolveGameWalletType("demo"), "demo");
assert.equal(resolveGameWalletType("cash"), "cash");
assert.equal(resolveGameWalletType("nonsense"), "demo");
assert.equal(resolveGameWalletType(undefined), "demo");

const user = await User.create({ username: "casinotester", password: "Test@123456" });
await ensureDefaultWalletAccounts(user._id);
// Fund the demo wallet.
await WalletAccount.findOneAndUpdate(
  { userId: user._id, walletType: "demo" },
  { $set: { availableBalance: 1000 } }
);

// Debit a stake.
const d1 = await debitGameStake(user._id, { gameKey: "dice", amount: 100 });
assert.equal(d1.balance, 900, "stake debit reduces demo balance");
assert.equal(await getGameBalance(user._id, "demo"), 900);

// Insufficient balance is rejected and mutates nothing.
const d2 = await debitGameStake(user._id, { gameKey: "dice", amount: 5000 });
assert.equal(d2.error, "Insufficient balance");
assert.equal(await getGameBalance(user._id, "demo"), 900, "rejected debit leaves balance intact");

// Credit a win (stake 100 at 2x → payout 200).
const c1 = await creditGameWin(user._id, { gameKey: "dice", amount: 200 });
assert.equal(c1.balance, 1100, "win credits payout");

// A losing round credits nothing.
const c2 = await creditGameWin(user._id, { gameKey: "dice", amount: 0 });
assert.equal(c2.balance, 1100, "zero payout is a no-op");

// Refund a stake (push).
const r1 = await refundGameStake(user._id, { gameKey: "blackjack", amount: 100 });
assert.equal(r1.balance, 1200, "refund returns the stake");

// Ledger reflects each movement under casino categories.
const entries = await LedgerEntry.find({ userId: user._id }).sort({ createdAt: 1 });
const cats = entries.map((e) => `${e.direction}:${e.category}`);
assert.ok(cats.includes("debit:casino_bet"), "bet debit ledgered");
assert.ok(cats.includes("credit:casino_win"), "win credit ledgered");
assert.ok(cats.includes("credit:casino_refund"), "refund ledgered");
assert.equal(entries.filter((e) => e.category === "casino_bet").length, 1, "no ledger entry for the rejected debit");

console.log("casino wallet helper: debit/credit/refund move demo balance and ledger correctly");

await mongoose.disconnect();
await mongod.stop();
