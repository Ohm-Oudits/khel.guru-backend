import AuthSession from "../models/authSession.model.js";
import AuditLog from "../models/auditLog.model.js";
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

const createAuditLog = async (
  req,
  action,
  entityType,
  entityId,
  metadata = {}
) =>
  AuditLog.create({
    actorUserId: req.user._id,
    actorType: "user",
    action,
    entityType,
    entityId,
    severity: "info",
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    metadata,
  });

const parseDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getAgeYears = (dateOfBirth) => {
  if (!dateOfBirth) {
    return null;
  }

  const now = new Date();
  let years = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();

  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())
  ) {
    years -= 1;
  }

  return years;
};

const parseLimitWindow = (window = {}) =>
  ["daily", "weekly", "monthly"].reduce((result, key) => {
    const value = window[key];

    if (value === undefined || value === null || value === "") {
      result[key] = null;
      return result;
    }

    const parsed = Number(value);
    result[key] = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;

    return result;
  }, {});

const getActiveSelfExclusionQuery = (userId) => ({
  userId,
  status: "active",
  $or: [{ endsAt: null }, { endsAt: { $gt: new Date() } }],
});

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

export const getKycProfile = async (req, res, next) => {
  try {
    const kycProfile = await getOrCreateKycProfile(req.user._id);
    const ageYears = getAgeYears(kycProfile.dateOfBirth);

    res.json({
      kycProfile,
      ageYears,
      isOfLegalAge: ageYears === null ? null : ageYears >= 18,
    });
  } catch (error) {
    next(error);
  }
};

export const updateKycProfile = async (req, res, next) => {
  try {
    const dateOfBirth = parseDate(req.body.dateOfBirth);

    if (req.body.dateOfBirth && !dateOfBirth) {
      return res.status(400).json({ message: "Invalid date of birth" });
    }

    const profile = await getOrCreateKycProfile(req.user._id);
    const ageYears = getAgeYears(dateOfBirth || profile.dateOfBirth);
    const isOfLegalAge = ageYears === null ? null : ageYears >= 18;

    profile.fullName = req.body.fullName || profile.fullName;
    profile.dateOfBirth = dateOfBirth || profile.dateOfBirth;
    profile.countryCode = req.body.countryCode || profile.countryCode;
    profile.jurisdiction = req.body.jurisdiction || profile.jurisdiction;
    profile.documentStatus = "pending";

    if (isOfLegalAge === false) {
      profile.status = "rejected";
      profile.riskStatus = "restricted";
    } else if (profile.status === "unverified") {
      profile.status = "pending";
    }

    profile.metadata = {
      ...profile.metadata,
      submittedAt: new Date().toISOString(),
      ageYears,
      isOfLegalAge,
    };

    await profile.save();

    await createAuditLog(req, "account.kyc.updated", "KycProfile", profile._id, {
      status: profile.status,
      documentStatus: profile.documentStatus,
      ageYears,
      isOfLegalAge,
    });

    res.json({
      message: "KYC profile updated successfully",
      kycProfile: profile,
      ageYears,
      isOfLegalAge,
    });
  } catch (error) {
    next(error);
  }
};

export const getResponsibleGamingProfile = async (req, res, next) => {
  try {
    const [responsibleGaming, activeSelfExclusion] = await Promise.all([
      getOrCreateResponsibleGamingLimit(req.user._id),
      SelfExclusion.findOne(getActiveSelfExclusionQuery(req.user._id)).sort({
        createdAt: -1,
      }),
    ]);

    res.json({
      responsibleGaming,
      activeSelfExclusion,
    });
  } catch (error) {
    next(error);
  }
};

export const updateResponsibleGamingLimits = async (req, res, next) => {
  try {
    const responsibleGaming = await getOrCreateResponsibleGamingLimit(req.user._id);

    responsibleGaming.depositLimit = parseLimitWindow(req.body.depositLimit);
    responsibleGaming.lossLimit = parseLimitWindow(req.body.lossLimit);
    responsibleGaming.wagerLimit = parseLimitWindow(req.body.wagerLimit);

    if (
      req.body.sessionLimitMinutes !== undefined &&
      req.body.sessionLimitMinutes !== null &&
      req.body.sessionLimitMinutes !== ""
    ) {
      const parsedSessionLimit = Number(req.body.sessionLimitMinutes);

      if (!Number.isFinite(parsedSessionLimit) || parsedSessionLimit < 0) {
        return res.status(400).json({ message: "Invalid session limit" });
      }

      responsibleGaming.sessionLimitMinutes = parsedSessionLimit;
    }

    if (
      req.body.coolingOffHours !== undefined &&
      req.body.coolingOffHours !== null &&
      req.body.coolingOffHours !== ""
    ) {
      const parsedCoolingOffHours = Number(req.body.coolingOffHours);

      if (!Number.isFinite(parsedCoolingOffHours) || parsedCoolingOffHours < 0) {
        return res.status(400).json({ message: "Invalid cooling off hours" });
      }

      responsibleGaming.coolingOffUntil =
        parsedCoolingOffHours === 0
          ? null
          : new Date(Date.now() + parsedCoolingOffHours * 60 * 60 * 1000);
    }

    await responsibleGaming.save();

    await createAuditLog(
      req,
      "account.responsible_gaming.updated",
      "ResponsibleGamingLimit",
      responsibleGaming._id,
      {
        sessionLimitMinutes: responsibleGaming.sessionLimitMinutes,
        coolingOffUntil: responsibleGaming.coolingOffUntil,
      }
    );

    res.json({
      message: "Responsible gaming limits updated successfully",
      responsibleGaming,
    });
  } catch (error) {
    next(error);
  }
};

export const getSelfExclusions = async (req, res, next) => {
  try {
    const selfExclusions = await SelfExclusion.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.json({
      count: selfExclusions.length,
      selfExclusions,
    });
  } catch (error) {
    next(error);
  }
};

export const createSelfExclusion = async (req, res, next) => {
  try {
    const scope = ["casino", "sports", "all"].includes(req.body.scope)
      ? req.body.scope
      : "all";
    const durationDays =
      req.body.durationDays === undefined || req.body.durationDays === null
        ? null
        : Number(req.body.durationDays);

    if (
      durationDays !== null &&
      (!Number.isFinite(durationDays) || durationDays <= 0)
    ) {
      return res.status(400).json({ message: "Invalid self-exclusion duration" });
    }

    const selfExclusion = await SelfExclusion.create({
      userId: req.user._id,
      scope,
      reason: req.body.reason || "",
      startsAt: new Date(),
      endsAt:
        durationDays === null
          ? null
          : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
    });

    if (scope === "all") {
      req.user.accountStatus = "self_excluded";
      await req.user.save();
    }

    await createAuditLog(
      req,
      "account.self_exclusion.created",
      "SelfExclusion",
      selfExclusion._id,
      {
        scope,
        durationDays,
      }
    );

    res.status(201).json({
      message: "Self-exclusion created successfully",
      selfExclusion,
    });
  } catch (error) {
    next(error);
  }
};
