import mongoose from "mongoose";

const HotKeysSchema = new mongoose.Schema(
  {
    desc: {
      type: String,
      required: true,
    },
    keys: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const GameSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    creator: {
      type: String,
      default: "Khel Guru",
    },
    img: {
      type: String,
      default: "https://images.meebuddy.com/products/no_image.jpg",
    },
    exclusive: {
      type: Boolean,
      default: false,
    },
    isNew: {
      type: Boolean,
      default: false,
    },
    description: {
      type: [String],
      default: [],
    },
    hotkeys: {
      type: [HotKeysSchema],
      default: [],
    },
    info: {
      type: [String],
      default: [],
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    gamesPlayedThisWeek: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Game", GameSchema);
