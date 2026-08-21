import mongoose from "mongoose";

const TileSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["diamond", "bomb"],
      required: true,
    },
    revealed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const MinesSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    grid: {
      type: [TileSchema],
      required: true,
      validate: {
        validator: function (grid) {
          return grid.length === 25;
        },
        message: "Grid must have exactly 25 tiles",
      },
    },
    mines: {
      type: Number,
      required: true,
      min: 1,
      max: 24,
    },
    gems: {
      type: Number,
      required: true,
      min: 1,
      max: 24,
    },
    gameOver: {
      type: Boolean,
      default: false,
    },
    gameWon: {
      type: Boolean,
      default: false,
    },
    betAmount: {
      type: String,
      required: true,
    },
    // Wallet the stake was debited from; winnings settle back to the same one.
    walletType: {
      type: String,
      enum: ["demo", "cash"],
      default: "demo",
    },
    profit: {
      type: String,
      default: "0.000000",
    },
    loss: {
      type: String,
      default: "0.000000",
    },
    nonce: {
      type: Number,
      min: 0,
    },
    clientSeed: {
      type: String,
    },
    serverSeedHash: {
      type: String,
    },
  },
  { timestamps: true }
);

// Create a unique index on userId to ensure only one game per user
MinesSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model("Mines", MinesSchema);
