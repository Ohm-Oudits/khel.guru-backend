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
    // Canonical grouping (cricket/football/tennis/badminton) so provider keys
    // like cricket_ipl and soccer_epl map onto frontend routes and socket rooms.
    sportGroup: {
      type: String,
      default: "",
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
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    nextSyncAt: {
      type: Date,
      default: null,
      index: true,
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
sportsEventSchema.index({ provider: 1, status: 1, nextSyncAt: 1 });

const SportsEvent = mongoose.model("SportsEvent", sportsEventSchema);
export default SportsEvent;
