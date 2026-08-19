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

// Snapshots are insert-on-change history; current prices live on the Market
// document and bets copy oddsSource by value, so expiring old rows is safe.
const SNAPSHOT_TTL_DAYS = Number(process.env.SPORTSBOOK_SNAPSHOT_TTL_DAYS || 30);
oddsSnapshotSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: SNAPSHOT_TTL_DAYS * 86400 }
);

const OddsSnapshot = mongoose.model("OddsSnapshot", oddsSnapshotSchema);
export default OddsSnapshot;
