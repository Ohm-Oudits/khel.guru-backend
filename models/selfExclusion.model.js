import mongoose from "mongoose";

const selfExclusionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: ["casino", "sports", "all"],
      default: "all",
    },
    status: {
      type: String,
      enum: ["active", "expired", "revoked"],
      default: "active",
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    startsAt: {
      type: Date,
      default: Date.now,
    },
    endsAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

selfExclusionSchema.index({ userId: 1, status: 1, endsAt: -1 });

const SelfExclusion = mongoose.model("SelfExclusion", selfExclusionSchema);
export default SelfExclusion;
