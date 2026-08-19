import mongoose from "mongoose";

const cryptoDepositAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountUid: {
      type: String,
      required: true,
      trim: true,
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
    address: {
      type: String,
      required: true,
      trim: true,
    },
    derivationIndex: {
      type: Number,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

cryptoDepositAddressSchema.index(
  { userId: 1, chain: 1, network: 1 },
  { unique: true }
);
cryptoDepositAddressSchema.index(
  { chain: 1, network: 1, address: 1 },
  { unique: true }
);

const CryptoDepositAddress = mongoose.model(
  "CryptoDepositAddress",
  cryptoDepositAddressSchema
);
export default CryptoDepositAddress;
