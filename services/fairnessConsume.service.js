import ProvablyFairSeed from "../models/provablyFairSeed.model.js";
import {
  createSeedRecordPayload,
  takeFairnessFloats,
} from "./provablyFair.service.js";

export const consumeGameFloats = async ({ userId, gameKey, count = 1 }) => {
  let seed = await ProvablyFairSeed.findOne({
    userId,
    gameKey,
    status: "active",
  }).sort({ createdAt: -1 });

  if (!seed) {
    seed = await ProvablyFairSeed.create({
      userId,
      ...createSeedRecordPayload({ gameKey }),
    });
  }

  const nonce = seed.nonce;
  const floats = takeFairnessFloats({
    serverSeed: seed.serverSeed,
    clientSeed: seed.clientSeed,
    nonce,
    count,
  });

  seed.nonce += 1;
  seed.lastUsedAt = new Date();
  await seed.save();

  return {
    floats,
    nonce,
    clientSeed: seed.clientSeed,
    serverSeedHash: seed.serverSeedHash,
  };
};
