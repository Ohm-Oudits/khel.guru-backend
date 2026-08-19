import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import CryptoDeposit from "../models/cryptoDeposit.model.js";
import CryptoDepositAddress from "../models/cryptoDepositAddress.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import User from "../models/user.model.js";
import WalletAccount from "../models/walletAccount.model.js";
import {
  creditConfirmedDeposit,
  recoverStuckCredits,
} from "../services/cryptoDepositWatcher.service.js";
import { ensureDefaultWalletAccounts } from "../services/walletPlatform.service.js";

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

// Unique indexes must exist before duplicate-insert assertions.
await CryptoDeposit.init();
await CryptoDepositAddress.init();

const user = new User({
  username: "watchertester",
  email: "watcher@test.local",
  password: "Test@123456",
});
await user.save();
await ensureDefaultWalletAccounts(user._id);

const addressRecord = await CryptoDepositAddress.create({
  userId: user._id,
  accountUid: user.accountUid,
  chain: "eth",
  network: "sepolia",
  address: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  derivationIndex: 0,
});

const basePayload = {
  userId: user._id,
  depositAddressId: addressRecord._id,
  chain: "eth",
  network: "sepolia",
  txHash: "0xduplicate",
  address: addressRecord.address,
  amountBaseUnits: "10000000000000000",
  amountCrypto: 0.01,
  requiredConfirmations: 3,
  status: "pending",
};

// Duplicate transaction recording is idempotent via the unique index.
await CryptoDeposit.create(basePayload);
await assert.rejects(
  () => CryptoDeposit.create(basePayload),
  (error) => error.code === 11000
);
assert.equal(await CryptoDeposit.countDocuments({ txHash: "0xduplicate" }), 1);
console.log("duplicate on-chain transaction records exactly one deposit");

// Double crediting: sequential then concurrent, exactly one ledger entry.
const confirmed = await CryptoDeposit.create({
  ...basePayload,
  txHash: "0xconfirmed",
  status: "confirmed",
});

const firstResult = await creditConfirmedDeposit(confirmed._id);
const secondResult = await creditConfirmedDeposit(confirmed._id);
assert.equal(firstResult.credited, true);
assert.equal(secondResult.skipped, true);

const ledgerCount = await LedgerEntry.countDocuments({
  referenceType: "crypto_deposit",
  referenceId: confirmed._id,
});
assert.equal(ledgerCount, 1);

const cashAccount = await WalletAccount.findOne({
  userId: user._id,
  walletType: "cash",
});
const expectedCredit = firstResult.creditedAmount;
assert.equal(cashAccount.availableBalance, expectedCredit);
console.log("sequential double credit yields one ledger entry and one balance move");

const concurrent = await CryptoDeposit.create({
  ...basePayload,
  txHash: "0xconcurrent",
  status: "confirmed",
});
const results = await Promise.all([
  creditConfirmedDeposit(concurrent._id),
  creditConfirmedDeposit(concurrent._id),
]);
assert.equal(results.filter((result) => result.credited).length, 1);
assert.equal(
  await LedgerEntry.countDocuments({
    referenceType: "crypto_deposit",
    referenceId: concurrent._id,
  }),
  1
);
console.log("concurrent double credit yields exactly one ledger entry");

// Crash recovery: crediting row WITH a ledger entry finalizes...
const crashedCredited = await CryptoDeposit.create({
  ...basePayload,
  txHash: "0xcrashed-late",
  status: "crediting",
});
const account = await WalletAccount.findOne({
  userId: user._id,
  walletType: "cash",
});
await LedgerEntry.create({
  userId: user._id,
  walletAccountId: account._id,
  direction: "credit",
  category: "deposit",
  amount: 3000,
  balanceAfter: account.availableBalance,
  description: "test crash artifact",
  referenceType: "crypto_deposit",
  referenceId: crashedCredited._id,
  metadata: { fxRate: 300000 },
});

// ...and a crediting row WITHOUT a ledger entry resets to confirmed.
const crashedEarly = await CryptoDeposit.create({
  ...basePayload,
  txHash: "0xcrashed-early",
  status: "crediting",
});

await recoverStuckCredits();

assert.equal(
  (await CryptoDeposit.findById(crashedCredited._id)).status,
  "credited"
);
assert.equal(
  (await CryptoDeposit.findById(crashedEarly._id)).status,
  "confirmed"
);
console.log("crash recovery finalizes ledgered rows and resets unledgered rows");

await mongoose.disconnect();
await mongod.stop();
