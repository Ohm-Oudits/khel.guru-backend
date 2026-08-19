import mongoose from "mongoose";

const cryptoWatcherStateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. "eth:sepolia"
    lastBlock: { type: Number, default: null },
    lastSignature: { type: String, default: null },
  },
  { timestamps: true }
);

const CryptoWatcherState = mongoose.model(
  "CryptoWatcherState",
  cryptoWatcherStateSchema
);
export default CryptoWatcherState;
