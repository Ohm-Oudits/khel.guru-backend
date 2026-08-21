import mongoose from "mongoose";

const baccaratSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ["waiting", "betting", "dealing", "completed"],
    default: "waiting",
  },
  currentRound: {
    type: Number,
    default: 1,
  },
  deck: [
    {
      suit: {
        type: String,
        enum: ["♦", "♥", "♠", "♣"],
        required: true,
      },
      value: {
        type: String,
        enum: [
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "J",
          "Q",
          "K",
          "A",
        ],
        required: true,
      },
    },
  ],
  playerCards: [
    {
      suit: String,
      value: String,
    },
  ],
  bankerCards: [
    {
      suit: String,
      value: String,
    },
  ],
  playerScore: {
    type: Number,
    default: 0,
  },
  bankerScore: {
    type: Number,
    default: 0,
  },
  winner: {
    type: String,
    enum: ["player", "banker", "tie", null],
    default: null,
  },
  bets: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      type: {
        type: String,
        enum: ["player", "banker", "tie"],
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      // Wallet this stake was debited from; a win pays back into it.
      walletType: {
        type: String,
        enum: ["demo", "cash"],
        default: "demo",
      },
      status: {
        type: String,
        enum: ["pending", "won", "lost"],
        default: "pending",
      },
      payout: {
        type: Number,
        default: 0,
      },
    },
  ],
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  nonce: { type: Number },
  clientSeed: { type: String },
  serverSeedHash: { type: String },
  serverSeed: { type: String },
});

// Update timestamps on save
baccaratSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate scores
baccaratSchema.methods.calculateScores = function () {
  const calculateHandScore = (cards) => {
    let score = 0;
    for (const card of cards) {
      if (["J", "Q", "K", "10"].includes(card.value)) score += 0;
      else if (card.value === "A") score += 1;
      else score += parseInt(card.value);
    }
    return score % 10;
  };

  this.playerScore = calculateHandScore(this.playerCards);
  this.bankerScore = calculateHandScore(this.bankerCards);
};

// Determine winner
baccaratSchema.methods.determineWinner = function () {
  if (this.playerScore > this.bankerScore) {
    this.winner = "player";
  } else if (this.bankerScore > this.playerScore) {
    this.winner = "banker";
  } else {
    this.winner = "tie";
  }
};

// Process payouts
baccaratSchema.methods.processPayouts = function () {
  const payouts = {
    player: 2, // 2x for player win
    banker: 1.95, // 1.95x for banker win (5% commission)
    tie: 8, // 8x for tie
  };

  for (const bet of this.bets) {
    if (bet.type === this.winner) {
      bet.status = "won";
      bet.payout = bet.amount * payouts[bet.type];
    } else {
      bet.status = "lost";
      bet.payout = 0;
    }
  }
};

// Create new deck
baccaratSchema.methods.createNewDeck = function () {
  const suits = ["♦", "♥", "♠", "♣"];
  const values = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  this.deck = [];

  for (const suit of suits) {
    for (const value of values) {
      this.deck.push({ suit, value });
    }
  }

  // Shuffle deck
  for (let i = this.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
  }
};

const Baccarat = mongoose.model("Baccarat", baccaratSchema);

export default Baccarat;
