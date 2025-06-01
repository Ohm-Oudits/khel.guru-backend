import mongoose from "mongoose";

const blackjackGameSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // Ensure only one active game per user
    index: true,
  },
  deck: [
    {
      suit: String,
      value: String,
      id: String,
      flipped: Boolean,
    },
  ],
  userCards: [
    {
      suit: String,
      value: String,
      id: String,
      flipped: Boolean,
    },
  ],
  dealerCards: [
    {
      suit: String,
      value: String,
      id: String,
      flipped: Boolean,
    },
  ],
  userValue: {
    type: Number,
    default: 0,
  },
  dealerValue: {
    type: Number,
    default: 0,
  },
  bet: {
    type: Number,
    default: 0,
  },
  gameState: {
    type: String,
    enum: ["betting", "playing", "dealer", "complete"],
    default: "betting",
  },
  result: {
    type: String,
    enum: ["win", "lose", "draw", null],
    default: null,
  },
  isSplit: {
    type: Boolean,
    default: false,
  },
  splitHands: {
    type: [
      [
        {
          suit: String,
          value: String,
          id: String,
          flipped: Boolean,
        },
      ],
    ],
    default: [[], []],
  },
  splitValues: {
    type: [Number],
    default: [0, 0],
  },
  splitBets: {
    type: [Number],
    default: [0, 0],
  },
  splitResults: {
    type: [String],
    enum: ["win", "lose", "draw", null],
    default: [null, null],
  },
  activeHand: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600, // Automatically delete documents after 1 hour
  },
});

blackjackGameSchema.index({ userId: 1, gameState: 1 });

const BlackjackGame = mongoose.model("blackjacks", blackjackGameSchema);

export default BlackjackGame;
