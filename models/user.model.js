import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { generateAccountUid } from "../utils/accountUid.js";

const UserSchema = new mongoose.Schema(
  {
    accountUid: {
      type: String,
      unique: true,
      sparse: true,
      immutable: true,
      index: true,
      trim: true,
    },
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

// Assign the immutable account identifier exactly once per document lifetime.
// Covers every creation path (register, Google, Telegram, X, instant register,
// seed scripts) without controller changes. The unique index remains the final
// race arbiter; the pre-check loop is the collision backstop.
UserSchema.pre("validate", async function (next) {
  if (this.accountUid) return next();
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateAccountUid();
      const exists = await this.constructor.exists({ accountUid: candidate });
      if (!exists) {
        this.accountUid = candidate;
        return next();
      }
    }
    return next(new Error("Unable to allocate a unique accountUid"));
  } catch (error) {
    return next(error);
  }
});

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.security.lastPasswordChangedAt = new Date();
  next();
});

export default mongoose.model("User", UserSchema);
