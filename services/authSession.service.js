import AuthSession from "../models/authSession.model.js";

const DEFAULT_SESSION_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS || 7);
const REMEMBER_ME_SESSION_DAYS = Number(
  process.env.REMEMBER_ME_SESSION_DAYS || 30
);

const getSessionDurationMs = (rememberMe = false) => {
  const days = rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS;
  return days * 24 * 60 * 60 * 1000;
};

export const getSessionExpiryDate = (rememberMe = false) =>
  new Date(Date.now() + getSessionDurationMs(rememberMe));

export const createAuthSession = async ({
  user,
  req,
  authMethod = "password",
  rememberMe = false,
}) => {
  return AuthSession.create({
    userId: user._id,
    authMethod,
    rememberMe,
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    deviceLabel: req.get("X-Device-Name") || null,
    lastSeenAt: new Date(),
    expiresAt: getSessionExpiryDate(rememberMe),
  });
};

export const isSessionExpired = (session) =>
  !session || !session.expiresAt || session.expiresAt.getTime() <= Date.now();

export const touchAuthSession = async (sessionId) => {
  if (!sessionId) return;

  await AuthSession.findByIdAndUpdate(sessionId, {
    $set: { lastSeenAt: new Date() },
  });
};

export const revokeAuthSession = async (sessionId) => {
  if (!sessionId) return null;

  return AuthSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        status: "revoked",
        revokedAt: new Date(),
      },
    },
    { new: true }
  );
};
