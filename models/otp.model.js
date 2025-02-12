import mongoose from "mongoose";

const OtpModel = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

const Otp = mongoose.model("Otp", OtpModel);
export default Otp;
