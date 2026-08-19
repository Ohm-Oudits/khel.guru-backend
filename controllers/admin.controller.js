import AuthSession from "../models/authSession.model.js";
import KycProfile from "../models/kycProfile.model.js";
import LedgerEntry from "../models/ledgerEntry.model.js";
import ResponsibleGamingLimit from "../models/responsibleGamingLimit.model.js";
import SelfExclusion from "../models/selfExclusion.model.js";
import SupportTicket from "../models/supportTicket.model.js";
import User from "../models/user.model.js";
import WalletAccount from "../models/walletAccount.model.js";

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
