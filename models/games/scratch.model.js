import mongoose from "mongoose";

const scratchGameSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    betAmount: {
      type: Number,
      required: true,
    },
    grid: [
      {
        revealed: {
          type: Boolean,
          default: false,
        },
        animating: {
          type: Boolean,
          default: false,
        },
        balloonColor: {
          type: String,
          required: true,
        },
        diamondColor: {
          type: String,
          required: true,
        },
      },
    ],
    diamondCounts: {
      type: Map,
      of: {
        count: Number,
        indices: [Number],
      },
      default: () => ({
        red: { count: 0, indices: [] },
        blue: { count: 0, indices: [] },
        green: { count: 0, indices: [] },
        yellow: { count: 0, indices: [] },
        purple: { count: 0, indices: [] },
      }),
    },
    isAutoBet: {
      type: Boolean,
      default: false,
    },
    remainingBets: {
      type: Number,
      default: 0,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    multiplier: {
      type: Number,
      default: 0,
    },
    winAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

scratchGameSchema.index({ userId: 1 });

const ScratchGame = mongoose.model("scratch", scratchGameSchema);

export default ScratchGame;
