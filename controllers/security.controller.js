import AuthSession from "../models/authSession.model.js";
import { revokeAuthSession } from "../services/authSession.service.js";

const isSessionCurrentlyActive = (session) =>
  session.status === "active" &&
  !session.revokedAt &&
  session.expiresAt &&
  session.expiresAt.getTime() > Date.now();

const serializeSession = (session, currentSessionId) => ({
  id: session._id,
  authMethod: session.authMethod,
  status: session.status,
  rememberMe: session.rememberMe,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  revokedAt: session.revokedAt,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
  deviceLabel: session.deviceLabel,
  isCurrent: currentSessionId
    ? session._id.toString() === currentSessionId.toString()
    : false,
  isActive: isSessionCurrentlyActive(session),
});

export const getSecurityOverview = async (req, res, next) => {
  try {
    const sessions = await AuthSession.find({ userId: req.user._id })
      .sort({ lastSeenAt: -1 })
      .limit(10);

    res.json({
      verification: {
        emailVerified: req.user.emailVerified,
        phoneNumberVerified: req.user.phoneNumberVerified,
      },
      safeguards: {
        twoFactorEnabled: req.user.security?.twoFactorEnabled || false,
        passkeyEnabled: req.user.security?.passkeyEnabled || false,
        suspiciousLoginLocked:
          req.user.security?.suspiciousLoginLocked || false,
      },
      sessionSummary: {
        activeCount: sessions.filter(isSessionCurrentlyActive).length,
        currentSessionId: req.authSession?._id || null,
      },
      recentSessions: sessions.map((session) =>
        serializeSession(session, req.authSession?._id)
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const getSessions = async (req, res, next) => {
  try {
    const sessions = await AuthSession.find({ userId: req.user._id }).sort({
      lastSeenAt: -1,
    });

    res.json({
      sessions: sessions.map((session) =>
        serializeSession(session, req.authSession?._id)
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await AuthSession.findOne({
      _id: sessionId,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const revokedSession = await revokeAuthSession(session._id);

    res.json({
      message: "Session revoked successfully",
      session: serializeSession(revokedSession, req.authSession?._id),
    });
  } catch (error) {
    next(error);
  }
};
