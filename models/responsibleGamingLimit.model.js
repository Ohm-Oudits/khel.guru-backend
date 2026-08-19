import mongoose from "mongoose";

const limitWindowSchema = new mongoose.Schema(
  {
    daily: { type: Number, default: null, min: 0 },
    weekly: { type: Number, default: null, min: 0 },
    monthly: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const responsibleGamingLimitSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    depositLimit: {
      type: limitWindowSchema,
      default: () => ({}),
    },
    lossLimit: {
      type: limitWindowSchema,
      default: () => ({}),
    },
    wagerLimit: {
      type: limitWindowSchema,
      default: () => ({}),
    },
    sessionLimitMinutes: {
      type: Number,
      default: null,
      min: 0,
    },
    coolingOffUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const ResponsibleGamingLimit = mongoose.model(
  "ResponsibleGamingLimit",
  responsibleGamingLimitSchema
);

export default ResponsibleGamingLimit;
