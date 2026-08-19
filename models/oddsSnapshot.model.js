import mongoose from "mongoose";

const outcomeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    priceDecimal: { type: Number, required: true },
    line: { type: Number, default: null },
  },
  { _id: false }
);

const oddsSnapshotSchema = new mongoose.Schema(
  {
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
    provider: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    bookmakerKey: {
      type: String,
      required: true,
      trim: true,
    },
    bookmakerTitle: {
      type: String,
      required: true,
      trim: true,
    },
    region: {
      type: String,
      default: "",
      trim: true,
    },
    capturedAt: {
      type: Date,
      required: true,
      index: true,
    },
    providerLastUpdate: {
      type: Date,
      default: null,
    },
    outcomes: {
      type: [outcomeSchema],
      default: [],
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

oddsSnapshotSchema.index(
  { eventId: 1, marketId: 1, bookmakerKey: 1, capturedAt: -1 },
  { unique: true }
);

const OddsSnapshot = mongoose.model("OddsSnapshot", oddsSnapshotSchema);
export default OddsSnapshot;
