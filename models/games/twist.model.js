import mongoose from "mongoose";

const twistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "settled"],
      default: "active",
      index: true,
    },
    green: { type: Number, default: 0 },
    orange: { type: Number, default: 0 },
    purple: { type: Number, default: 0 },
    betAmount: { type: Number, required: true },
    walletType: { type: String, enum: ["demo", "cash"], default: "demo" },
    lastOutcome: { type: String, default: null },
    lastFloat: { type: Number, default: null },
    nonce: { type: Number },
    clientSeed: { type: String },
    serverSeedHash: { type: String },
    lastPayout: { type: Number, default: 0 },
  },
  { timestamps: true }
);

twistSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const Twist = mongoose.model("Twist", twistSchema);

export default Twist;
