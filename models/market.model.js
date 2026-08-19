import mongoose from "mongoose";

const selectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    line: { type: Number, default: null },
    status: {
      type: String,
      enum: ["open", "suspended", "settled"],
      default: "open",
    },
  },
  { _id: false }
);

const marketSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SportsEvent",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    providerMarketKey: {
      type: String,
      required: true,
      trim: true,
    },
    marketType: {
      type: String,
      enum: ["h2h", "spreads", "totals", "outrights", "other"],
      default: "other",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["open", "suspended", "settled"],
      default: "open",
      index: true,
    },
    selections: {
      type: [selectionSchema],
      default: [],
    },
    bookmakerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    latestSnapshotAt: {
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

marketSchema.index({ eventId: 1, provider: 1, providerMarketKey: 1 }, { unique: true });

const Market = mongoose.model("Market", marketSchema);
export default Market;
