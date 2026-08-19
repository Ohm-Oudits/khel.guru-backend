import mongoose from "mongoose";

const walletAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    walletType: {
      type: String,
      enum: ["cash", "vault", "demo", "bonus"],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "frozen", "closed"],
      default: "active",
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

walletAccountSchema.index({ userId: 1, walletType: 1, currency: 1 }, { unique: true });

const WalletAccount = mongoose.model("WalletAccount", walletAccountSchema);
export default WalletAccount;
