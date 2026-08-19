import AuditLog from "../models/auditLog.model.js";
import PaymentIntent from "../models/paymentIntent.model.js";
import Transaction from "../models/transaction.model.js";
import WalletAccount from "../models/walletAccount.model.js";
import { io } from "../socket/socket.js";
import {
  createLedgerEntry,
  normalizeAmount,
  syncLegacyBalance,
} from "./walletPlatform.service.js";

// Atomic wallet helpers. Every money mutation in the payments layer goes
// through these guarded single-document updates — never load-modify-save.
export const creditAvailable = async (walletAccountId, amount) =>
  WalletAccount.findOneAndUpdate(
    { _id: walletAccountId, status: "active" },
    { $inc: { availableBalance: amount } },
    { new: true }
  );

export const placeHold = async (walletAccountId, amount) =>
  WalletAccount.findOneAndUpdate(
    {
      _id: walletAccountId,
      status: "active",
      availableBalance: { $gte: amount },
    },
    { $inc: { availableBalance: -amount, lockedBalance: amount } },
    { new: true }
  );

export const releaseHold = async (walletAccountId, amount) =>
  WalletAccount.findOneAndUpdate(
    { _id: walletAccountId, lockedBalance: { $gte: amount } },
    { $inc: { lockedBalance: -amount, availableBalance: amount } },
    { new: true }
  );

export const debitLocked = async (walletAccountId, amount) =>
  WalletAccount.findOneAndUpdate(
    { _id: walletAccountId, lockedBalance: { $gte: amount } },
    { $inc: { lockedBalance: -amount } },
    { new: true }
  );

const createSystemAuditLog = async (action, entityId, metadata = {}, severity = "info") =>
  AuditLog.create({
    actorUserId: null,
    actorType: "system",
    action,
    entityType: "PaymentIntent",
    entityId,
    severity,
    metadata,
  });

const emitDepositIntentUpdate = (intent, balance = null) => {
  // io is a lazy live binding; absent in unit tests.
  if (!io) return;

  io.to(`user:${intent.userId}`).emit("wallet:deposit_intent", {
    intentId: intent._id,
    status: intent.status,
    amount: intent.amount,
    ...(balance === null ? {} : { balance }),
  });
};

export const serializePayoutRequest = (payout) => ({
  id: payout._id,
  amount: payout.amount,
  currency: payout.currency,
  method: payout.method,
  destination: payout.destination,
  status: payout.status,
  rejectedReason: payout.rejectedReason,
  paidAt: payout.paidAt,
  createdAt: payout.createdAt,
});

export const emitPayoutRequestUpdate = (payout, balance = null) => {
  if (!io) return;

  io.to(`user:${payout.userId}`).emit("wallet:payout_request", {
    payoutId: payout._id,
    status: payout.status,
    amount: payout.amount,
    ...(balance === null ? {} : { balance }),
  });
};

export const serializePaymentIntent = (intent) => ({
  id: intent._id,
  amount: intent.amount,
  currency: intent.currency,
  method: intent.method,
  provider: intent.provider,
  providerRef: intent.providerRef,
  status: intent.status,
  failureReason: intent.failureReason,
  expiresAt: intent.expiresAt,
  upi: intent.upi,
  creditedAt: intent.creditedAt,
  createdAt: intent.createdAt,
});

// Lazily expire an intent that outlived its TTL. CAS keeps this safe against
// a concurrent webhook settling the same intent.
export const expireStaleIntent = async (intent) => {
  if (
    !intent ||
    !["created", "processing"].includes(intent.status) ||
    intent.expiresAt.getTime() > Date.now()
  ) {
    return intent;
  }

  const expired = await PaymentIntent.findOneAndUpdate(
    {
      _id: intent._id,
      status: { $in: ["created", "processing"] },
      expiresAt: { $lt: new Date() },
    },
    { $set: { status: "expired", failureReason: "intent_expired" } },
    { new: true }
  );

  return expired || (await PaymentIntent.findById(intent._id));
};

// The single crediting choke point for deposits. Called by the webhook
// handler, the dev simulate endpoint, and any future reconcile sweep.
// Exactly-once is enforced by the status CAS claim in step one.
export const settleDepositIntent = async ({
  provider,
  providerRef,
  providerPaymentId = null,
  outcome,
  amountFromProvider = null,
  source = "webhook",
}) => {
  const existing = await PaymentIntent.findOne({ provider, providerRef });

  if (!existing) {
    return { unknown: true };
  }

  let targetStatus = outcome === "success" ? "succeeded" : "failed";
  let failureReason = outcome === "success" ? "" : "payment_failed";

  if (
    outcome === "success" &&
    amountFromProvider !== null &&
    normalizeAmount(amountFromProvider) !== existing.amount
  ) {
    targetStatus = "failed";
    failureReason = "amount_mismatch";
  }

  const intent = await PaymentIntent.findOneAndUpdate(
    {
      provider,
      providerRef,
      status: { $in: ["created", "processing"] },
    },
    {
      $set: {
        status: targetStatus,
        providerPaymentId,
        failureReason,
      },
    },
    { new: true }
  );

  if (!intent) {
    // Already terminal — a double-delivered webhook or a lost race.
    return { duplicate: true, intent: existing };
  }

  if (failureReason === "amount_mismatch") {
    await createSystemAuditLog(
      "cashier.deposit_intent.amount_mismatch",
      intent._id,
      { expectedAmount: intent.amount, amountFromProvider, source },
      "warn"
    );
    emitDepositIntentUpdate(intent);
    return { intent };
  }

  if (intent.status === "failed") {
    await createSystemAuditLog("cashier.deposit_intent.failed", intent._id, {
      failureReason,
      source,
    });
    emitDepositIntentUpdate(intent);
    return { intent };
  }

  // Credit path. The CAS above admits exactly one caller; transactionId acts
  // as the reconcile marker if the process dies mid-way.
  const transaction = await Transaction.create({
    userId: intent.userId,
    type: "deposit",
    amount: intent.amount,
    status: "success",
    meta: {
      walletAccountId: intent.walletAccountId,
      method: intent.method,
      provider: intent.provider,
      providerRef: intent.providerRef,
      paymentIntentId: intent._id,
      source: "cashier_intent",
    },
  });

  const account = await creditAvailable(intent.walletAccountId, intent.amount);
  await syncLegacyBalance(intent.userId, account.availableBalance);

  const ledgerEntry = await createLedgerEntry({
    userId: intent.userId,
    walletAccountId: intent.walletAccountId,
    direction: "credit",
    category: "deposit",
    amount: intent.amount,
    balanceAfter: account.availableBalance,
    description: `Deposit settled via ${intent.provider} (${intent.method})`,
    referenceType: "PaymentIntent",
    referenceId: intent._id,
    metadata: {
      transactionId: transaction._id,
      provider: intent.provider,
      providerRef: intent.providerRef,
      source,
    },
  });

  const finalized = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: "succeeded", transactionId: null },
    {
      $set: {
        transactionId: transaction._id,
        ledgerEntryId: ledgerEntry._id,
        creditedAt: new Date(),
      },
    },
    { new: true }
  );

  await createSystemAuditLog("cashier.deposit_intent.settled", intent._id, {
    amount: intent.amount,
    provider: intent.provider,
    providerRef: intent.providerRef,
    transactionId: transaction._id,
    ledgerEntryId: ledgerEntry._id,
    source,
  });

  const settledIntent = finalized || intent;
  emitDepositIntentUpdate(settledIntent, account.availableBalance);

  return { intent: settledIntent, balance: account.availableBalance };
};
