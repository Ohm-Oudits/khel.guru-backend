import crypto from "crypto";

import AuditLog from "../models/auditLog.model.js";
import KycProfile from "../models/kycProfile.model.js";
import PaymentIntent from "../models/paymentIntent.model.js";
import PayoutRequest from "../models/payoutRequest.model.js";
import ResponsibleGamingLimit from "../models/responsibleGamingLimit.model.js";
import SelfExclusion from "../models/selfExclusion.model.js";
import Transaction from "../models/transaction.model.js";
import { getPaymentProvider } from "../services/paymentProviders/index.js";
import {
  emitPayoutRequestUpdate,
  expireStaleIntent,
  placeHold,
  releaseHold,
  serializePaymentIntent,
  serializePayoutRequest,
  settleDepositIntent,
} from "../services/paymentSettlement.service.js";
import {
  createLedgerEntry,
  ensureDefaultWalletAccounts,
  mapWalletAccountsByType,
  normalizeAmount,
  syncLegacyBalance,
} from "../services/walletPlatform.service.js";

const DEPOSIT_METHODS = ["upi", "bank_transfer", "card"];

const getMinDeposit = () => Number(process.env.PAYMENTS_MIN_DEPOSIT) || 10;
const getMaxDeposit = () => Number(process.env.PAYMENTS_MAX_DEPOSIT) || 100000;
const getIntentTtlMinutes = () =>
  Number(process.env.PAYMENTS_INTENT_TTL_MINUTES) || 15;

const createAuditLog = async (req, action, entityId, metadata = {}) =>
  AuditLog.create({
    actorUserId: req.user._id,
    actorType: "user",
    action,
    entityType: "PaymentIntent",
    entityId,
    severity: "info",
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    metadata,
  });

// Any active exclusion blocks cashier movement, regardless of scope — a
// casino-only exclusion still means no fresh money in.
const getActiveSelfExclusionQuery = (userId) => ({
  userId,
  status: "active",
  $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
});

export const assertCashierEligibility = async (req) => {
  if (req.user.accountStatus !== "active") {
    return {
      status: 403,
      body: { error: "Your account is not eligible for cashier actions right now" },
    };
  }

  const [activeSelfExclusion, responsibleGaming] = await Promise.all([
    SelfExclusion.findOne(getActiveSelfExclusionQuery(req.user._id)),
    ResponsibleGamingLimit.findOne({ userId: req.user._id }),
  ]);

  if (activeSelfExclusion) {
    return {
      status: 403,
      body: { error: "Cashier is disabled while self-exclusion is active" },
    };
  }

  if (
    responsibleGaming?.coolingOffUntil &&
    responsibleGaming.coolingOffUntil.getTime() > Date.now()
  ) {
    return {
      status: 403,
      body: {
        error: "Cooling off period is active for this account",
        coolingOffUntil: responsibleGaming.coolingOffUntil,
      },
    };
  }

  return { responsibleGaming };
};

const DEPOSIT_LIMIT_WINDOWS = [
  { window: "daily", ms: 24 * 60 * 60 * 1000 },
  { window: "weekly", ms: 7 * 24 * 60 * 60 * 1000 },
  { window: "monthly", ms: 30 * 24 * 60 * 60 * 1000 },
];

// Counting created/processing intents alongside succeeded ones prevents
// circumventing a limit with parallel unfinished intents.
export const assertDepositWithinLimits = async (
  userId,
  amount,
  responsibleGaming
) => {
  const depositLimit = responsibleGaming?.depositLimit;

  if (!depositLimit) {
    return null;
  }

  for (const { window, ms } of DEPOSIT_LIMIT_WINDOWS) {
    const limit = depositLimit[window];

    if (!Number.isFinite(limit) || limit === null) {
      continue;
    }

    const [aggregate] = await PaymentIntent.aggregate([
      {
        $match: {
          userId,
          status: { $in: ["created", "processing", "succeeded"] },
          createdAt: { $gte: new Date(Date.now() - ms) },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const existing = aggregate?.total || 0;

    if (existing + amount > limit) {
      return {
        code: "deposit_limit_exceeded",
        window,
        limit,
        remaining: Math.max(0, Number((limit - existing).toFixed(2))),
      };
    }
  }

  return null;
};

export const createDepositIntent = async (req, res, next) => {
  try {
    const eligibility = await assertCashierEligibility(req);
    if (eligibility.status) {
      return res.status(eligibility.status).json(eligibility.body);
    }

    const amount = normalizeAmount(req.body.amount);
    if (!amount) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (amount < getMinDeposit() || amount > getMaxDeposit()) {
      return res.status(400).json({
        error: `Deposit must be between ${getMinDeposit()} and ${getMaxDeposit()}`,
      });
    }

    const method = String(req.body.method || "upi").trim();
    if (!DEPOSIT_METHODS.includes(method)) {
      return res.status(400).json({ error: "Unsupported deposit method" });
    }

    const limitViolation = await assertDepositWithinLimits(
      req.user._id,
      amount,
      eligibility.responsibleGaming
    );

    if (limitViolation) {
      return res.status(403).json({
        error: "Deposit limit exceeded",
        ...limitViolation,
      });
    }

    const idempotencyKey =
      req.get("Idempotency-Key") ||
      String(req.body.idempotencyKey || "").trim() ||
      null;

    if (idempotencyKey) {
      const existing = await PaymentIntent.findOne({
        userId: req.user._id,
        idempotencyKey,
      });

      if (existing) {
        return res
          .status(200)
          .json({ intent: serializePaymentIntent(existing), replayed: true });
      }
    }

    let provider;
    try {
      provider = getPaymentProvider(req.body.provider);
    } catch (error) {
      return res
        .status(error.statusCode || 400)
        .json({ error: error.message });
    }

    const accounts = await ensureDefaultWalletAccounts(req.user._id);
    const cashAccount = mapWalletAccountsByType(accounts).cash;

    const intent = await PaymentIntent.create({
      userId: req.user._id,
      walletAccountId: cashAccount._id,
      amount,
      currency: cashAccount.currency,
      method,
      provider: provider.key,
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
      status: "created",
      expiresAt: new Date(Date.now() + getIntentTtlMinutes() * 60 * 1000),
    });

    let order;
    try {
      order = await provider.createDepositOrder({ intent, user: req.user });
    } catch (error) {
      await PaymentIntent.updateOne(
        { _id: intent._id, status: "created" },
        { $set: { status: "failed", failureReason: "provider_error" } }
      );

      return res
        .status(502)
        .json({ error: "Payment provider is unavailable, try again" });
    }

    const processingIntent = await PaymentIntent.findOneAndUpdate(
      { _id: intent._id, status: "created" },
      {
        $set: {
          providerRef: order.providerRef,
          status: "processing",
          upi: {
            payerVpa: "",
            payeeVpa: order.checkout.payeeVpa || "",
            intentUrl: order.checkout.intentUrl || "",
          },
        },
      },
      { new: true }
    );

    await createAuditLog(req, "cashier.deposit_intent.created", intent._id, {
      amount,
      method,
      provider: provider.key,
      providerRef: order.providerRef,
    });

    res.status(201).json({
      intent: serializePaymentIntent(processingIntent),
      checkout: order.checkout,
    });
  } catch (err) {
    next(err);
  }
};

export const listDepositIntents = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const intents = await PaymentIntent.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    const refreshed = await Promise.all(intents.map(expireStaleIntent));

    res.json({ intents: refreshed.map(serializePaymentIntent) });
  } catch (err) {
    next(err);
  }
};

export const getDepositIntent = async (req, res, next) => {
  try {
    const intent = await PaymentIntent.findOne({
      _id: req.params.intentId,
      userId: req.user._id,
    });

    if (!intent) {
      return res.status(404).json({ error: "Deposit intent not found" });
    }

    const refreshed = await expireStaleIntent(intent);

    res.json({ intent: serializePaymentIntent(refreshed) });
  } catch (err) {
    next(err);
  }
};

// Dev-only: stands in for the payer's UPI app plus the provider webhook.
// Runs the exact production settlement path.
export const simulateDepositIntent = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }

    const intent = await PaymentIntent.findOne({
      _id: req.params.intentId,
      userId: req.user._id,
    });

    if (!intent) {
      return res.status(404).json({ error: "Deposit intent not found" });
    }

    if (intent.provider !== "mock") {
      return res
        .status(400)
        .json({ error: "Simulation is only available for the mock provider" });
    }

    const refreshed = await expireStaleIntent(intent);
    if (refreshed.status === "expired") {
      return res.status(409).json({
        error: "Deposit intent has expired",
        intent: serializePaymentIntent(refreshed),
      });
    }

    const payerVpa = String(req.body.payerVpa || "").trim();
    const outcome =
      req.body.outcome === "failure" || payerVpa === "failure@mock"
        ? "failure"
        : "success";

    await PaymentIntent.updateOne(
      { _id: intent._id },
      { $set: { "upi.payerVpa": payerVpa } }
    );

    const result = await settleDepositIntent({
      provider: intent.provider,
      providerRef: intent.providerRef,
      providerPaymentId: `sim_${crypto.randomUUID()}`,
      outcome,
      source: "simulation",
    });

    res.json({
      intent: serializePaymentIntent(result.intent),
      ...(result.balance === undefined ? {} : { balance: result.balance }),
      ...(result.duplicate ? { duplicate: true } : {}),
    });
  } catch (err) {
    next(err);
  }
};

const VPA_PATTERN = /^[\w.\-]{2,64}@[a-z][a-z0-9]{1,31}$/i;
const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const getMinPayout = () => Number(process.env.PAYMENTS_MIN_DEPOSIT) || 10;
const getMaxPayout = () => Number(process.env.PAYMENTS_MAX_DEPOSIT) || 100000;

const validatePayoutDestination = (method, destination = {}) => {
  if (method === "upi") {
    if (!VPA_PATTERN.test(String(destination.vpa || "").trim())) {
      return "A valid UPI ID is required for UPI payouts";
    }
    return null;
  }

  if (!ACCOUNT_NUMBER_PATTERN.test(String(destination.accountNumber || "").trim())) {
    return "A valid bank account number is required";
  }
  if (!IFSC_PATTERN.test(String(destination.ifsc || "").trim().toUpperCase())) {
    return "A valid IFSC code is required";
  }
  return null;
};

export const createPayoutRequest = async (req, res, next) => {
  try {
    const eligibility = await assertCashierEligibility(req);
    if (eligibility.status) {
      return res.status(eligibility.status).json(eligibility.body);
    }

    // Payouts require verified identity before any hold is placed.
    const kycProfile = await KycProfile.findOne({ userId: req.user._id });
    if (kycProfile?.status !== "verified") {
      return res.status(403).json({
        error: "KYC verification is required before requesting a payout",
        code: "kyc_required",
      });
    }

    const amount = normalizeAmount(req.body.amount);
    if (!amount) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (amount < getMinPayout() || amount > getMaxPayout()) {
      return res.status(400).json({
        error: `Payout must be between ${getMinPayout()} and ${getMaxPayout()}`,
      });
    }

    const method = req.body.method === "bank_transfer" ? "bank_transfer" : "upi";
    const destination = req.body.destination || {};
    const destinationError = validatePayoutDestination(method, destination);
    if (destinationError) {
      return res.status(400).json({ error: destinationError });
    }

    const idempotencyKey =
      req.get("Idempotency-Key") ||
      String(req.body.idempotencyKey || "").trim() ||
      null;

    if (idempotencyKey) {
      const existing = await PayoutRequest.findOne({
        userId: req.user._id,
        idempotencyKey,
      });

      if (existing) {
        return res
          .status(200)
          .json({ payout: serializePayoutRequest(existing), replayed: true });
      }
    }

    const accounts = await ensureDefaultWalletAccounts(req.user._id);
    const cashAccount = mapWalletAccountsByType(accounts).cash;

    const heldAccount = await placeHold(cashAccount._id, amount);
    if (!heldAccount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    try {
      const payout = await PayoutRequest.create({
        userId: req.user._id,
        walletAccountId: cashAccount._id,
        amount,
        currency: cashAccount.currency,
        method,
        destination: {
          vpa: String(destination.vpa || "").trim(),
          accountNumber: String(destination.accountNumber || "").trim(),
          ifsc: String(destination.ifsc || "").trim().toUpperCase(),
          accountHolderName: String(destination.accountHolderName || "").trim(),
        },
        idempotencyKey: idempotencyKey || crypto.randomUUID(),
      });

      const transaction = await Transaction.create({
        userId: req.user._id,
        type: "withdraw",
        amount,
        status: "pending",
        meta: {
          walletAccountId: cashAccount._id,
          method,
          payoutRequestId: payout._id,
          source: "cashier_payout",
        },
      });

      const holdEntry = await createLedgerEntry({
        userId: req.user._id,
        walletAccountId: cashAccount._id,
        direction: "hold",
        category: "withdrawal",
        amount,
        balanceAfter: heldAccount.availableBalance,
        description: "Funds held pending payout review",
        referenceType: "PayoutRequest",
        referenceId: payout._id,
        metadata: {
          stage: "hold",
          lockedAfter: heldAccount.lockedBalance,
          transactionId: transaction._id,
        },
      });

      await PayoutRequest.updateOne(
        { _id: payout._id },
        { $set: { holdLedgerEntryId: holdEntry._id, transactionId: transaction._id } }
      );

      await syncLegacyBalance(req.user._id, heldAccount.availableBalance);
      await createAuditLog(req, "cashier.payout_request.created", payout._id, {
        amount,
        method,
      });

      res.status(201).json({
        payout: serializePayoutRequest(payout),
        balance: heldAccount.availableBalance,
      });
    } catch (creationError) {
      // Compensation: never leave funds locked for a payout that failed to
      // materialize.
      await releaseHold(cashAccount._id, amount);
      throw creationError;
    }
  } catch (err) {
    next(err);
  }
};

export const listPayoutRequests = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const payouts = await PayoutRequest.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ payouts: payouts.map(serializePayoutRequest) });
  } catch (err) {
    next(err);
  }
};

export const cancelPayoutRequest = async (req, res, next) => {
  try {
    const payout = await PayoutRequest.findOneAndUpdate(
      {
        _id: req.params.payoutId,
        userId: req.user._id,
        status: "requested",
      },
      { $set: { status: "rejected", rejectedReason: "cancelled_by_user" } },
      { new: true }
    );

    if (!payout) {
      return res.status(409).json({
        error: "Payout can no longer be cancelled",
      });
    }

    const account = await releaseHold(payout.walletAccountId, payout.amount);

    const releaseEntry = await createLedgerEntry({
      userId: req.user._id,
      walletAccountId: payout.walletAccountId,
      direction: "release",
      category: "withdrawal",
      amount: payout.amount,
      balanceAfter: account.availableBalance,
      description: "Payout hold released after cancellation",
      referenceType: "PayoutRequest",
      referenceId: payout._id,
      metadata: { stage: "release", lockedAfter: account.lockedBalance },
    });

    await PayoutRequest.updateOne(
      { _id: payout._id },
      { $set: { releaseLedgerEntryId: releaseEntry._id } }
    );

    if (payout.transactionId) {
      await Transaction.updateOne(
        { _id: payout.transactionId },
        { $set: { status: "failed", "meta.reason": "cancelled" } }
      );
    }

    await syncLegacyBalance(req.user._id, account.availableBalance);
    await createAuditLog(req, "cashier.payout_request.cancelled", payout._id, {
      amount: payout.amount,
    });
    emitPayoutRequestUpdate(payout, account.availableBalance);

    res.json({
      payout: serializePayoutRequest(payout),
      balance: account.availableBalance,
    });
  } catch (err) {
    next(err);
  }
};
