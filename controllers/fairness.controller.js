import AuditLog from "../models/auditLog.model.js";
import ProvablyFairSeed from "../models/provablyFairSeed.model.js";
import {
  buildFairnessVerification,
  createSeedRecordPayload,
  getFairnessGameCatalog,
  isSupportedFairnessGame,
} from "../services/provablyFair.service.js";

const serializeSeed = (seed, { revealServerSeed = false } = {}) => ({
  id: seed._id,
  gameKey: seed.gameKey,
  clientSeed: seed.clientSeed,
  serverSeedHash: seed.serverSeedHash,
  serverSeed: revealServerSeed ? seed.serverSeed : undefined,
  nonce: seed.nonce,
  status: seed.status,
  revealedAt: seed.revealedAt,
  lastUsedAt: seed.lastUsedAt,
  createdAt: seed.createdAt,
  updatedAt: seed.updatedAt,
});

const createAuditLog = async (
  req,
  action,
  entityType,
  entityId,
  metadata = {}
) =>
  AuditLog.create({
    actorUserId: req.user?._id || null,
    actorType: req.user ? "user" : "system",
    action,
    entityType,
    entityId,
    severity: "info",
    ipAddress: req.ip,
    userAgent: req.get("User-Agent") || null,
    metadata,
  });

const getActiveSeed = async (userId, gameKey) =>
  ProvablyFairSeed.findOne({
    userId,
    gameKey,
    status: "active",
  }).sort({ createdAt: -1 });

const ensureSupportedGame = (gameKey) => isSupportedFairnessGame(gameKey);

const createActiveSeed = async ({ userId, gameKey, clientSeed = null }) => {
  const payload = createSeedRecordPayload({ gameKey, clientSeed });

  return ProvablyFairSeed.create({
    userId,
    ...payload,
  });
};

export const getFairnessOverview = async (req, res, next) => {
  try {
    res.json({
      generatedAt: new Date().toISOString(),
      games: getFairnessGameCatalog(),
      verificationSteps: [
        "Use the current server seed hash and your client seed before a round starts.",
        "Reveal the previous server seed by rotating to a new seed.",
        "Recompute the digest with server seed, client seed, and nonce to verify the result.",
      ],
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentFairnessSeed = async (req, res, next) => {
  try {
    const { gameKey } = req.params;

    if (!ensureSupportedGame(gameKey)) {
      return res.status(400).json({ message: "Unsupported fairness game" });
    }

    let seed = await getActiveSeed(req.user._id, gameKey);

    if (!seed) {
      seed = await createActiveSeed({
        userId: req.user._id,
        gameKey,
        clientSeed: req.body?.clientSeed || null,
      });
    }

    res.json({
      seed: serializeSeed(seed),
    });
  } catch (error) {
    next(error);
  }
};

export const getFairnessSeeds = async (req, res, next) => {
  try {
    const seeds = await ProvablyFairSeed.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({
      count: seeds.length,
      seeds: seeds.map((seed) =>
        serializeSeed(seed, { revealServerSeed: seed.status !== "active" })
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const rotateFairnessSeed = async (req, res, next) => {
  try {
    const { gameKey } = req.params;

    if (!ensureSupportedGame(gameKey)) {
      return res.status(400).json({ message: "Unsupported fairness game" });
    }

    let currentSeed = await getActiveSeed(req.user._id, gameKey);

    if (!currentSeed) {
      currentSeed = await createActiveSeed({
        userId: req.user._id,
        gameKey,
      });
    }

    currentSeed.status = "revealed";
    currentSeed.revealedAt = new Date();
    await currentSeed.save();

    const nextSeed = await createActiveSeed({
      userId: req.user._id,
      gameKey,
      clientSeed: req.body.clientSeed || null,
    });

    await createAuditLog(
      req,
      "casino.fairness.rotated",
      "ProvablyFairSeed",
      currentSeed._id,
      {
        gameKey,
        nextSeedId: nextSeed._id,
      }
    );

    res.json({
      message: "Provably fair seed rotated successfully",
      previousSeed: serializeSeed(currentSeed, { revealServerSeed: true }),
      nextSeed: serializeSeed(nextSeed),
    });
  } catch (error) {
    next(error);
  }
};

export const verifyFairness = async (req, res, next) => {
  try {
    const {
      gameKey,
      serverSeed,
      clientSeed,
      nonce,
      cursor,
      rows,
      difficulty,
      mineCount,
      length,
      risk,
      alt,
    } = req.body;

    if (!ensureSupportedGame(gameKey)) {
      return res.status(400).json({ message: "Unsupported fairness game" });
    }

    if (!serverSeed || !clientSeed) {
      return res.status(400).json({
        message: "serverSeed and clientSeed are required",
      });
    }

    const parsedNonce = Number.parseInt(nonce, 10);
    const parsedCursor = Number.parseInt(cursor || 0, 10);

    if (!Number.isFinite(parsedNonce) || parsedNonce < 0) {
      return res.status(400).json({ message: "nonce must be a non-negative integer" });
    }

    const verification = buildFairnessVerification({
      gameKey,
      serverSeed,
      clientSeed,
      nonce: parsedNonce,
      cursor: Number.isFinite(parsedCursor) && parsedCursor >= 0 ? parsedCursor : 0,
      rows: Number.parseInt(rows, 10) || 12,
      difficulty,
      mineCount: Number.parseInt(mineCount, 10) || 3,
      length: Number.parseInt(length, 10) || 10,
      risk,
      alt: Boolean(alt),
    });

    res.json({ verification });
  } catch (error) {
    next(error);
  }
};
