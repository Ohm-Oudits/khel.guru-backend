import mongoose from "mongoose";

const kycProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      default: "",
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    countryCode: {
      type: String,
      default: "IN",
      uppercase: true,
      trim: true,
    },
    jurisdiction: {
      type: String,
      default: "IN",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["unverified", "pending", "review", "verified", "rejected"],
      default: "unverified",
    },
    documentStatus: {
      type: String,
      enum: ["not_submitted", "pending", "approved", "rejected"],
      default: "not_submitted",
    },
    riskStatus: {
      type: String,
      enum: ["clear", "review", "restricted"],
      default: "clear",
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

const KycProfile = mongoose.model("KycProfile", kycProfileSchema);
export default KycProfile;
