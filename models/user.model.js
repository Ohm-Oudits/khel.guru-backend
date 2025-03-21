import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    password: {
      type: String,
      required: function () {
        return !this.googleId && !this.telegramId && !this.xId;
      },
    },
    phoneNumber: { type: String, unique: true, sparse: true },
    phoneNumberVerified: { type: Boolean, default: false },
    googleId: { type: String, unique: true, sparse: true },
    telegramId: { type: String, unique: true, sparse: true },
    xId: { type: String, unique: true, sparse: true },
    continuedGames: [{ type: mongoose.Schema.Types.ObjectId, ref: "Game" }],
    continuedSports: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sport" }],
  },
  { timestamps: true }
);
// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
export default mongoose.model("User", UserSchema);
