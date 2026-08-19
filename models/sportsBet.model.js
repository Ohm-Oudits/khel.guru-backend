import mongoose from "mongoose";

const sportsBetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SportsEvent",
      required: true,
      index: true,
    },
    marketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Market",
      required: true,
      index: true,
    },
    walletAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletAccount",
      required: true,
    },
    selectionKey: {
      type: String,
      required: true,
      trim: true,
    },
    selectionName: {
      type: String,
      required: true,
      trim: true,
    },
    selectionLine: {
      type: Number,
      default: null,
    },
    stake: {
      type: Number,
      required: true,
      min: 0,
    },
    priceDecimal: {
      type: Number,
      required: true,
      min: 1,
    },
    potentialPayout: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "won", "lost", "void", "cashed_out", "rejected"],
      default: "pending",
      index: true,
    },
    settlementStatus: {
      type: String,
      enum: ["unsettled", "settled", "voided"],
      default: "unsettled",
    },
    oddsSource: {
      bookmakerKey: { type: String, default: "", trim: true },
      bookmakerTitle: { type: String, default: "", trim: true },
      capturedAt: { type: Date, default: null },
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

sportsBetSchema.index({ userId: 1, createdAt: -1 });

const SportsBet = mongoose.model("SportsBet", sportsBetSchema);
export default SportsBet;
