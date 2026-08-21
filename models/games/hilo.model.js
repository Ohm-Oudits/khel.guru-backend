import mongoose from "mongoose";

const CardSchema = new mongoose.Schema(
  {
    value: {
      type: String,
      enum: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"],
      required: true,
    },
    suit: {
      type: String,
      enum: ["♦", "♥", "♠", "♣", "↑", "↓"],
      required: true,
    },
    color: {
      type: Boolean,
      required: true,
    },
    result: {
      type: String,
      enum: ["high-true", "high-false", "low-true", "low-false", null],
      default: null,
    },
  },
  { _id: false }
);

const HiloSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    currentCard: {
      type: CardSchema,
      required: true,
    },
    historyCards: {
      type: [CardSchema],
      required: true,
      default: [],
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
    // False while the start card is on the table but no stake has been taken.
    // Shuffle replaces this card; Bet locks it as the round's start card.
    stakeLocked: {
      type: Boolean,
      default: true,
    },
    // Wallet the stake was debited from; the cashout is credited back to it.
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
    multiplier: {
      type: Number,
      default: 1.0,
    },
    checkedOut: {
      type: Boolean,
      default: false,
    },
    shoe: {
      type: Array,
      default: [],
    },
    dealIndex: {
      type: Number,
      default: 0,
    },
    nonce: { type: Number },
    clientSeed: { type: String },
    serverSeedHash: { type: String },
  },
  { timestamps: true }
);

// Create a unique index on userId to ensure only one game per user
HiloSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model("Hilo", HiloSchema);
