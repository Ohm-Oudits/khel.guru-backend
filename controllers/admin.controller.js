import AuthSession from "../models/authSession.model.js";
import AuditLog from "../models/auditLog.model.js";
import CryptoDeposit from "../models/cryptoDeposit.model.js";
import { recheckDeposit } from "../services/cryptoWallet.service.js";
import KycProfile from "../models/kycProfile.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import PayoutRequest from "../models/payoutRequest.model.js";
import Transaction from "../models/transaction.model.js";
import {
  debitLocked,
  emitPayoutRequestUpdate,
  releaseHold,
} from "../services/paymentSettlement.service.js";
import {
  createLedgerEntry,
  syncLegacyBalance,
} from "../services/walletPlatform.service.js";
import ResponsibleGamingLimit from "../models/responsibleGamingLimit.model.js";
import SelfExclusion from "../models/selfExclusion.model.js";
import SupportTicket from "../models/supportTicket.model.js";
import User from "../models/user.model.js";
import WalletAccount from "../models/walletAccount.model.js";

const createAdminAuditLog = async (
  req,
  action,
  entityType,
  entityId,
  metadata = {}
) =>
  AuditLog.create({
    actorUserId: req.user._id,
    actorType: "admin",
    action,
    entityType,
    entityId,
    severity: "info",
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    metadata,
  });

export const getAdminOverview = async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      activeSessions,
      walletAccounts,
      openTickets,
      pendingKycProfiles,
      selfExcludedUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ accountStatus: "active" }),
      AuthSession.countDocuments({
        status: "active",
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }),
      WalletAccount.countDocuments(),
      SupportTicket.countDocuments({ status: { $in: ["open", "in_review"] } }),
      KycProfile.countDocuments({ status: { $in: ["pending", "review"] } }),
      SelfExclusion.countDocuments({
        status: "active",
        $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
      }),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalUsers,
        activeUsers,
        activeSessions,
        walletAccounts,
        openTickets,
        pendingKycProfiles,
        selfExcludedUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminQueues = async (req, res, next) => {
  try {
    const [
      kycReviewQueue,
      responsibleGamingProfiles,
      recentHighPriorityTickets,
      recentLedgerEntries,
    ] = await Promise.all([
      KycProfile.find({ status: { $in: ["pending", "review"] } })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("userId status documentStatus riskStatus updatedAt"),
      ResponsibleGamingLimit.find({
        $or: [
          { sessionLimitMinutes: { $ne: null } },
          { coolingOffUntil: { $ne: null } },
        ],
      })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("userId sessionLimitMinutes coolingOffUntil updatedAt"),
      SupportTicket.find({ priority: "high", status: { $in: ["open", "in_review"] } })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("userId subject category status priority updatedAt"),
      LedgerEntry.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("userId walletAccountId direction category amount status createdAt"),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      queues: {
        kycReviewQueue,
        responsibleGamingProfiles,
        recentHighPriorityTickets,
        recentLedgerEntries,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getKycReviewQueue = async (req, res, next) => {
  try {
    const profiles = await KycProfile.find({
      status: { $in: ["pending", "review"] },
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate("userId", "username email phoneNumber accountStatus")
      .lean();

    res.json({
      count: profiles.length,
      profiles,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewKycProfile = async (req, res, next) => {
  try {
    const allowedStatuses = ["pending", "review", "verified", "rejected"];
    const allowedDocumentStatuses = [
      "not_submitted",
      "pending",
      "approved",
      "rejected",
    ];
    const allowedRiskStatuses = ["clear", "review", "restricted"];

    const profile = await KycProfile.findOne({ userId: req.params.userId });

    if (!profile) {
      return res.status(404).json({ message: "KYC profile not found" });
    }

    if (
      req.body.status &&
      !allowedStatuses.includes(req.body.status)
    ) {
      return res.status(400).json({ message: "Invalid KYC status" });
    }

    if (
      req.body.documentStatus &&
      !allowedDocumentStatuses.includes(req.body.documentStatus)
    ) {
      return res.status(400).json({ message: "Invalid document status" });
    }

    if (
      req.body.riskStatus &&
      !allowedRiskStatuses.includes(req.body.riskStatus)
    ) {
      return res.status(400).json({ message: "Invalid risk status" });
    }

    profile.status = req.body.status || profile.status;
    profile.documentStatus = req.body.documentStatus || profile.documentStatus;
    profile.riskStatus = req.body.riskStatus || profile.riskStatus;
    profile.metadata = {
      ...profile.metadata,
      reviewedAt: new Date().toISOString(),
      reviewedByUserId: req.user._id,
      reviewNotes: req.body.reviewNotes || "",
    };
    await profile.save();

    await createAdminAuditLog(req, "admin.kyc.reviewed", "KycProfile", profile._id, {
      userId: profile.userId,
      status: profile.status,
      documentStatus: profile.documentStatus,
      riskStatus: profile.riskStatus,
    });

    res.json({
      message: "KYC profile reviewed successfully",
      kycProfile: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveSelfExclusions = async (req, res, next) => {
  try {
    const selfExclusions = await SelfExclusion.find({
      status: "active",
      $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("userId", "username email phoneNumber accountStatus")
      .lean();

    res.json({
      count: selfExclusions.length,
      selfExclusions,
    });
  } catch (error) {
    next(error);
  }
};

export const listAllCryptoDeposits = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filters = {};

    if (req.query.status) {
      filters.status = String(req.query.status).trim();
    }

    if (req.query.chain) {
      filters.chain = String(req.query.chain).trim();
    }

    const deposits = await CryptoDeposit.find(filters)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "username email accountUid")
      .lean();

    res.json({
      count: deposits.length,
      deposits,
    });
  } catch (error) {
    next(error);
  }
};

export const recheckCryptoDeposit = async (req, res, next) => {
  try {
    const deposit = await CryptoDeposit.findById(req.params.depositId);

    if (!deposit) {
      return res.status(404).json({ error: "Crypto deposit not found" });
    }

    const result = await recheckDeposit(deposit);

    await createAdminAuditLog(
      req,
      "admin.crypto.deposit.rechecked",
      "CryptoDeposit",
      deposit._id,
      { statusBefore: deposit.status, statusAfter: result.status }
    );

    res.json({
      message: "Crypto deposit rechecked",
      deposit: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getPayoutQueue = async (req, res, next) => {
  try {
    const status = String(req.query.status || "requested").trim();
    const allowedStatuses = [
      "requested",
      "under_review",
      "approved",
      "paid",
      "rejected",
      "failed",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid payout status filter" });
    }

    const payouts = await PayoutRequest.find({ status })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate("userId", "username email accountUid");

    res.json({ status, count: payouts.length, payouts });
  } catch (err) {
    next(err);
  }
};

export const claimPayoutRequest = async (req, res, next) => {
  try {
    const payout = await PayoutRequest.findOneAndUpdate(
      { _id: req.params.payoutId, status: "requested" },
      {
        $set: {
          status: "under_review",
          "review.reviewedBy": req.user._id,
          "review.reviewedAt": new Date(),
        },
      },
      { new: true }
    );

    if (!payout) {
      return res
        .status(409)
        .json({ error: "Payout is not available to claim" });
    }

    await createAdminAuditLog(
      req,
      "admin.payout.claimed",
      "PayoutRequest",
      payout._id,
      { amount: payout.amount }
    );

    res.json({ payout });
  } catch (err) {
    next(err);
  }
};

export const approvePayoutRequest = async (req, res, next) => {
  try {
    const payout = await PayoutRequest.findOneAndUpdate(
      {
        _id: req.params.payoutId,
        status: { $in: ["requested", "under_review"] },
      },
      {
        $set: {
          status: "approved",
          "review.reviewedBy": req.user._id,
          "review.reviewedAt": new Date(),
          "review.notes": String(req.body.notes || "").trim(),
        },
      },
      { new: true }
    );

    if (!payout) {
      return res
        .status(409)
        .json({ error: "Payout is not in a reviewable state" });
    }

    const account = await debitLocked(payout.walletAccountId, payout.amount);

    if (!account) {
      // Locked funds did not cover the payout — ledger drift; surface loudly.
      await PayoutRequest.updateOne(
        { _id: payout._id, status: "approved" },
        { $set: { status: "failed", rejectedReason: "locked_balance_mismatch" } }
      );

      await createAdminAuditLog(
        req,
        "admin.payout.failed_locked_mismatch",
        "PayoutRequest",
        payout._id,
        { amount: payout.amount }
      );

      return res
        .status(500)
        .json({ error: "Locked balance mismatch, payout marked failed" });
    }

    const debitEntry = await createLedgerEntry({
      userId: payout.userId,
      walletAccountId: payout.walletAccountId,
      direction: "debit",
      category: "withdrawal",
      amount: payout.amount,
      balanceAfter: account.availableBalance,
      description: "Payout paid from held funds",
      referenceType: "PayoutRequest",
      referenceId: payout._id,
      metadata: { stage: "payout", lockedAfter: account.lockedBalance },
    });

    const paidPayout = await PayoutRequest.findOneAndUpdate(
      { _id: payout._id, status: "approved" },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
          debitLedgerEntryId: debitEntry._id,
        },
      },
      { new: true }
    );

    if (payout.transactionId) {
      await Transaction.updateOne(
        { _id: payout.transactionId },
        { $set: { status: "success" } }
      );
    }

    await createAdminAuditLog(
      req,
      "admin.payout.approved",
      "PayoutRequest",
      payout._id,
      { amount: payout.amount, debitLedgerEntryId: debitEntry._id }
    );
    emitPayoutRequestUpdate(paidPayout || payout);

    res.json({ payout: paidPayout || payout });
  } catch (err) {
    next(err);
  }
};

export const rejectPayoutRequest = async (req, res, next) => {
  try {
    const reason = String(req.body.reason || "").trim();

    if (!reason) {
      return res.status(400).json({ error: "A rejection reason is required" });
    }

    const payout = await PayoutRequest.findOneAndUpdate(
      {
        _id: req.params.payoutId,
        status: { $in: ["requested", "under_review"] },
      },
      {
        $set: {
          status: "rejected",
          rejectedReason: reason,
          "review.reviewedBy": req.user._id,
          "review.reviewedAt": new Date(),
        },
      },
      { new: true }
    );

    if (!payout) {
      return res
        .status(409)
        .json({ error: "Payout is not in a reviewable state" });
    }

    const account = await releaseHold(payout.walletAccountId, payout.amount);

    const releaseEntry = await createLedgerEntry({
      userId: payout.userId,
      walletAccountId: payout.walletAccountId,
      direction: "release",
      category: "withdrawal",
      amount: payout.amount,
      balanceAfter: account.availableBalance,
      description: "Payout hold released after rejection",
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
        { $set: { status: "failed", "meta.reason": "rejected" } }
      );
    }

    await syncLegacyBalance(payout.userId, account.availableBalance);
    await createAdminAuditLog(
      req,
      "admin.payout.rejected",
      "PayoutRequest",
      payout._id,
      { amount: payout.amount, reason }
    );
    emitPayoutRequestUpdate(payout, account.availableBalance);

    res.json({ payout });
  } catch (err) {
    next(err);
  }
};
