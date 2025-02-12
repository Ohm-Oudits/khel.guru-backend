import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: [true, "Email is required"],
      match: [/.+@.+\..+/, "Please enter a valid email address"],
    },
    username: {
      type: String,
      required: [true, "Username is required"],
    },
    password: { type: String, required: [true, "Password is required"] },
    phno: {
      type: String,
      required: [true, "Phone number is required"],
      match: [/^\d{10}$/, "Phone number must be 10 digits"],
    },
    tokens: {
      type: [{ type: mongoose.Schema.ObjectId, ref: "Token" }],
      default: [],
    },
    followers: {
      type: [{ type: mongoose.Schema.ObjectId, ref: "User" }],
      default: [],
    },
    following: {
      type: [{ type: mongoose.Schema.ObjectId, ref: "User" }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", UserSchema);
export default User;
