import mongoose from "mongoose";

const provablyFairSeedSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    clientSeed: {
      type: String,
      required: true,
      trim: true,
    },
    serverSeed: {
      type: String,
      required: true,
      trim: true,
    },
    serverSeedHash: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    nonce: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "revealed", "rotated"],
      default: "active",
      index: true,
    },
    revealedAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

provablyFairSeedSchema.index({ userId: 1, gameKey: 1, createdAt: -1 });

const ProvablyFairSeed = mongoose.model(
  "ProvablyFairSeed",
  provablyFairSeedSchema
);

export default ProvablyFairSeed;
