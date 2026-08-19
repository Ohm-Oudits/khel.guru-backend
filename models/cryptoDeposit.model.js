import mongoose from "mongoose";

const cryptoDepositSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    depositAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CryptoDepositAddress",
      required: true,
    },
    chain: {
      type: String,
      enum: ["eth", "sol"],
      required: true,
    },
    network: {
      type: String,
      enum: ["mainnet", "sepolia", "devnet"],
      required: true,
    },
    txHash: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    // Wei / lamports as a string so chain-native amounts never lose precision.
    amountBaseUnits: {
      type: String,
      required: true,
    },
    amountCrypto: {
      type: Number,
      required: true,
      min: 0,
    },
    fxRate: {
      type: Number,
      default: null,
    },
    creditedCurrency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    creditedAmount: {
      type: Number,
      default: null,
    },
    confirmations: {
      type: Number,
      default: 0,
    },
    requiredConfirmations: {
      type: Number,
      required: true,
    },
    blockRef: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "crediting", "credited", "failed"],
      default: "pending",
      index: true,
    },
    walletAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletAccount",
      default: null,
    },
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
    },
    paymentIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

cryptoDepositSchema.index(
  { chain: 1, network: 1, txHash: 1, address: 1 },
  { unique: true }
);
cryptoDepositSchema.index({ userId: 1, createdAt: -1 });
cryptoDepositSchema.index({ status: 1, chain: 1, network: 1 });

const CryptoDeposit = mongoose.model("CryptoDeposit", cryptoDepositSchema);
export default CryptoDeposit;
