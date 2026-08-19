import mongoose from "mongoose";

const providerUsageSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
    },
    period: {
      // UTC month, e.g. "2026-08"
      type: String,
      required: true,
      trim: true,
    },
    creditsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedReported: {
      type: Number,
      default: null,
    },
    remainingReported: {
      type: Number,
      default: null,
    },
    lastRequestCost: {
      type: Number,
      default: null,
    },
    requestCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastRequestAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

providerUsageSchema.index({ provider: 1, period: 1 }, { unique: true });

const ProviderUsage = mongoose.model("ProviderUsage", providerUsageSchema);
export default ProviderUsage;
