import mongoose from "mongoose";

const towerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    grid: { type: Array, required: true },
    betAmount: { type: Number, required: true },
    // Wallet the stake was debited from; the payout is credited back to it.
    walletType: { type: String, enum: ["demo", "cash"], default: "demo" },
    // Set atomically when the round's payout is settled, so a win/cashout is
    // credited exactly once even if reveal/checkout race each other.
    settled: { type: Boolean, default: false },
    gameOver: { type: Boolean, default: false },
    gameWon: { type: Boolean, default: false },
    profit: { type: Number, default: 0 },
    loss: { type: Number, default: 0 },
    checkedOut: { type: Boolean, default: false },
    currentRow: { type: Number, required: true },
    difficulty: { type: String, required: true },
    selectedBoxes: { type: Array, default: [] },
  },
  {
    timestamps: true,
  }
);

const Tower = mongoose.model("Tower", towerSchema);

export default Tower;
