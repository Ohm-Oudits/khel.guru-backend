import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: false,
      sparse: true,
      trim: true,
    },
    emailVerified: { type: Boolean, default: false },
    password: {
      type: String,
      required: function () {
        return !this.googleId && !this.telegramId && !this.xId;
      },
    },
    phoneNumber: { type: String, unique: true, sparse: true },
    phoneNumberVerified: { type: Boolean, default: false },
    preferredCurrency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    accountStatus: {
      type: String,
      enum: ["active", "self_excluded", "suspended", "closed"],
      default: "active",
    },
    roles: {
      type: [String],
      default: ["player"],
    },
    security: {
      twoFactorEnabled: { type: Boolean, default: false },
      passkeyEnabled: { type: Boolean, default: false },
      suspiciousLoginLocked: { type: Boolean, default: false },
      lastPasswordChangedAt: { type: Date, default: null },
    },
    googleId: { type: String, unique: true, sparse: true },
    telegramId: { type: String, unique: true, sparse: true },
    xId: { type: String, unique: true, sparse: true },
    continuedGames: [{ type: mongoose.Schema.Types.ObjectId, ref: "Game" }],
    continuedSports: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sport" }],
    resetPasswordOTP: { type: String },
    resetPasswordOTPExpiry: { type: Date },
    phoneOTP: { type: String },
    phoneOTPExpiry: { type: Date },
    socketId: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.security.lastPasswordChangedAt = new Date();
  next();
});

export default mongoose.model("User", UserSchema);
