import mongoose from "mongoose";

const towerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    grid: { type: Array, required: true },
    cols: { type: Number, required: true },
    betAmount: { type: Number, required: true },
    walletType: { type: String, enum: ["demo", "cash"], default: "demo" },
    settled: { type: Boolean, default: false },
    gameOver: { type: Boolean, default: false },
    gameWon: { type: Boolean, default: false },
    profit: { type: Number, default: 0 },
    loss: { type: Number, default: 0 },
    checkedOut: { type: Boolean, default: false },
    currentRow: { type: Number, required: true },
    difficulty: { type: String, required: true },
    selectedBoxes: { type: Array, default: [] },
    stepsCompleted: { type: Number, default: 0 },
    nonce: { type: Number },
    clientSeed: { type: String },
    serverSeedHash: { type: String },
  },
  {
    timestamps: true,
  }
);

const Tower = mongoose.model("Tower", towerSchema);

export default Tower;
