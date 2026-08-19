import mongoose from "mongoose";

const MAX_BIP32_INDEX = 2 ** 31 - 1;

const cryptoWalletProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    accountUid: {
      type: String,
      required: true,
      trim: true,
    },
    derivationIndex: {
      type: Number,
      required: true,
      unique: true,
      immutable: true,
      min: 0,
      max: MAX_BIP32_INDEX,
    },
  },
  { timestamps: true }
);

const CryptoWalletProfile = mongoose.model(
  "CryptoWalletProfile",
  cryptoWalletProfileSchema
);
export default CryptoWalletProfile;
