import mongoose from "mongoose";

const ProviderGameSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      default: "sandbox",
    },
    studio: {
      type: String,
      default: "Khel Labs",
    },
    category: {
      type: String,
      default: "slots",
    },
    providerGameId: {
      type: String,
      required: true,
    },
    img: {
      type: String,
      default: "",
    },
    theme: {
      type: String,
      default: "#00D4AA",
    },
    rtp: {
      type: Number,
      default: 96,
    },
    volatility: {
      type: String,
      default: "medium",
    },
    demoEnabled: {
      type: Boolean,
      default: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    playPath: {
      type: String,
      default: "",
    },
    tableType: {
      type: String,
      default: "roulette",
    },
  },
  { timestamps: true }
);

export default mongoose.model("ProviderGame", ProviderGameSchema);
