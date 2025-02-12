import mongoose from "mongoose";

const TokenModel = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    marketCap: {
      type: String,
      required: true,
    },
    desc: String,
    img: String,
    website: String,
    twitter: String,
    discord: String,
    telegram: String,
  },
  {
    timestamps: true,
  }
);

const Token = mongoose.model("Token", TokenModel);
export default Token;
