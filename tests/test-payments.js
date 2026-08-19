import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.MOCK_PAYMENTS_WEBHOOK_SECRET = "test-mock-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-razorpay-secret";

const { default: User } = await import("../models/user.model.js");
const { default: PaymentIntent } = await import("../models/paymentIntent.model.js");
const { default: Transaction } = await import("../models/transaction.model.js");
const { default: LedgerEntry } = await import("../models/ledgerEntry.model.js");
const { default: ResponsibleGamingLimit } = await import(
  "../models/responsibleGamingLimit.model.js"
);
const {
  default: mockUpiProvider,
  buildSignedMockWebhook,
} = await import("../services/paymentProviders/mockUpiProvider.js");
const { default: razorpayProvider } = await import(
  "../services/paymentProviders/razorpayProvider.js"
);
const { settleDepositIntent } = await import(
  "../services/paymentSettlement.service.js"
);
const { assertDepositWithinLimits } = await import(
  "../controllers/cashier.controller.js"
);
const {
  ensureDefaultWalletAccounts,
  mapWalletAccountsByType,
} = await import("../services/walletPlatform.service.js");
const { default: WalletAccount } = await import("../models/walletAccount.model.js");

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
await Promise.all([PaymentIntent.init(), WalletAccount.init()]);

const user = await new User({
  username: "paytester",
  email: "pay@test.local",
  password: "Test@123456",
}).save();

const accounts = await ensureDefaultWalletAccounts(user._id);
const cashAccount = mapWalletAccountsByType(accounts).cash;

const createProcessingIntent = async (amount, refSuffix) =>
  PaymentIntent.create({
    userId: user._id,
    walletAccountId: cashAccount._id,
    amount,
    currency: "INR",
    method: "upi",
    provider: "mock",
    providerRef: `mockpay_test_${refSuffix}`,
    idempotencyKey: crypto.randomUUID(),
    status: "processing",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

// --- Webhook idempotency: sequential double delivery ---
const intentA = await createProcessingIntent(500, "seq");
const first = await settleDepositIntent({
  provider: "mock",
  providerRef: intentA.providerRef,
  outcome: "success",
  source: "test",
});
const second = await settleDepositIntent({
  provider: "mock",
  providerRef: intentA.providerRef,
  outcome: "success",
  source: "test",
});

assert.equal(first.intent.status, "succeeded");
assert.equal(second.duplicate, true);
assert.equal(await Transaction.countDocuments({ userId: user._id }), 1);
assert.equal(
  await LedgerEntry.countDocuments({
    userId: user._id,
    referenceType: "PaymentIntent",
  }),
  1
);
let account = await WalletAccount.findById(cashAccount._id);
assert.equal(account.availableBalance, 500);
const settledA = await PaymentIntent.findById(intentA._id);
assert.ok(settledA.transactionId);
console.log("sequential double webhook settles exactly once");

// --- Webhook idempotency: concurrent double delivery ---
const intentB = await createProcessingIntent(300, "conc");
const results = await Promise.all([
  settleDepositIntent({
    provider: "mock",
    providerRef: intentB.providerRef,
    outcome: "success",
    source: "test",
  }),
  settleDepositIntent({
    provider: "mock",
    providerRef: intentB.providerRef,
    outcome: "success",
    source: "test",
  }),
]);

assert.equal(results.filter((result) => result.duplicate).length, 1);
assert.equal(await Transaction.countDocuments({ userId: user._id }), 2);
account = await WalletAccount.findById(cashAccount._id);
assert.equal(account.availableBalance, 800);
console.log("concurrent double webhook settles exactly once");

// --- Amount mismatch guard ---
const intentC = await createProcessingIntent(100, "mismatch");
const mismatch = await settleDepositIntent({
  provider: "mock",
  providerRef: intentC.providerRef,
  outcome: "success",
  amountFromProvider: 999,
  source: "test",
});
assert.equal(mismatch.intent.status, "failed");
assert.equal(mismatch.intent.failureReason, "amount_mismatch");
account = await WalletAccount.findById(cashAccount._id);
assert.equal(account.availableBalance, 800);
console.log("amount mismatch fails the intent without crediting");

// --- Signature verification (pure) ---
const signed = buildSignedMockWebhook({
  providerRef: "mockpay_sig",
  outcome: "success",
  amount: 42,
});
assert.equal(
  mockUpiProvider.verifyWebhook({
    rawBody: Buffer.from(signed.body),
    headers: { "x-mock-signature": signed.signature },
  }),
  true
);
assert.equal(
  mockUpiProvider.verifyWebhook({
    rawBody: Buffer.from(signed.body.replace("42", "43")),
    headers: { "x-mock-signature": signed.signature },
  }),
  false
);

const razorpayBody = JSON.stringify({
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 4200 } } },
});
const razorpaySignature = crypto
  .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
  .update(razorpayBody)
  .digest("hex");
assert.equal(
  razorpayProvider.verifyWebhook({
    rawBody: Buffer.from(razorpayBody),
    headers: { "x-razorpay-signature": razorpaySignature },
  }),
  true
);
assert.equal(
  razorpayProvider.verifyWebhook({
    rawBody: Buffer.from(razorpayBody.replace("4200", "9900")),
    headers: { "x-razorpay-signature": razorpaySignature },
  }),
  false
);
const parsed = razorpayProvider.parseWebhookEvent(JSON.parse(razorpayBody));
assert.equal(parsed.type, "payment.succeeded");
assert.equal(parsed.amount, 42);
console.log("webhook signatures verify and tampered payloads fail");

// --- Deposit limit enforcement ---
const responsibleGaming = await ResponsibleGamingLimit.create({
  userId: user._id,
  depositLimit: { daily: 1000 },
});

// 900 already counted in the daily window (500 + 300 succeeded, 100 failed
// intents do not count).
const violation = await assertDepositWithinLimits(
  user._id,
  300,
  responsibleGaming
);
assert.ok(violation);
assert.equal(violation.code, "deposit_limit_exceeded");
assert.equal(violation.window, "daily");
assert.equal(violation.remaining, 200);

const allowed = await assertDepositWithinLimits(user._id, 200, responsibleGaming);
assert.equal(allowed, null);
console.log("deposit limits block over-limit intents and allow within-limit ones");

await mongoose.disconnect();
await mongod.stop();
