import mongoose from "mongoose";

const ledgerEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    walletAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletAccount",
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["credit", "debit", "hold", "release"],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "deposit",
        "demo_topup",
        "withdrawal",
        "vault_transfer",
        "sports_bet",
        "sports_settlement",
        "sports_refund",
        "adjustment",
        "bonus",
        "manual_review",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "posted", "reversed", "failed"],
      default: "posted",
    },
    referenceType: {
      type: String,
      default: null,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ userId: 1, createdAt: -1 });

const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);
export default LedgerEntry;
