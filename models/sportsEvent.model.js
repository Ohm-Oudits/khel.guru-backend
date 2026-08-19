import mongoose from "mongoose";

const competitorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    shortName: { type: String, default: "", trim: true },
    role: {
      type: String,
      enum: ["home", "away", "player", "team", "draw"],
      default: "team",
    },
  },
  { _id: false }
);

const sportsEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    providerEventId: {
      type: String,
      required: true,
      trim: true,
    },
    sportKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    sportName: {
      type: String,
      required: true,
      trim: true,
    },
    leagueName: {
      type: String,
      default: "",
      trim: true,
    },
    countryCode: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["upcoming", "live", "suspended", "settled", "cancelled"],
      default: "upcoming",
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    competitors: {
      type: [competitorSchema],
      default: [],
    },
    scoreboard: {
      type: Object,
      default: {},
    },
    providerLastUpdate: {
      type: Date,
      default: null,
    },
    ingestVersion: {
      type: Number,
      default: 1,
    },
    metadata: {
      type: Object,
      default: {},
    },
    rawPayload: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

sportsEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });

const SportsEvent = mongoose.model("SportsEvent", sportsEventSchema);
export default SportsEvent;
