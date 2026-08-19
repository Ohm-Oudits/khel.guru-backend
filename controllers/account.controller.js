import AuthSession from "../models/authSession.model.js";
import KycProfile from "../models/kycProfile.model.js";
import ResponsibleGamingLimit from "../models/responsibleGamingLimit.model.js";
import SelfExclusion from "../models/selfExclusion.model.js";
import { buildWalletOverview } from "../services/walletPlatform.service.js";

const sanitizeUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  emailVerified: user.emailVerified,
  phoneNumber: user.phoneNumber,
  phoneNumberVerified: user.phoneNumberVerified,
  preferredCurrency: user.preferredCurrency,
  accountStatus: user.accountStatus,
  roles: user.roles,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getOrCreateKycProfile = async (userId) =>
  KycProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

const getOrCreateResponsibleGamingLimit = async (userId) =>
  ResponsibleGamingLimit.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

export const getAccountOverview = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const [wallet, kycProfile, responsibleGaming, activeSelfExclusion, activeSessions] =
      await Promise.all([
        buildWalletOverview(userId),
        getOrCreateKycProfile(userId),
        getOrCreateResponsibleGamingLimit(userId),
        SelfExclusion.findOne({
          userId,
          status: "active",
          $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
        }).sort({ createdAt: -1 }),
        AuthSession.countDocuments({
          userId,
          status: "active",
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        }),
      ]);

    res.json({
      user: sanitizeUser(req.user),
      verification: {
        emailVerified: req.user.emailVerified,
        phoneNumberVerified: req.user.phoneNumberVerified,
        kycStatus: kycProfile.status,
        documentStatus: kycProfile.documentStatus,
        riskStatus: kycProfile.riskStatus,
      },
      wallet,
      security: {
        activeSessions,
        currentSessionId: req.authSession?._id || null,
      },
      responsibleGaming,
      selfExclusion: activeSelfExclusion,
    });
  } catch (error) {
    next(error);
  }
};
